import { types } from 'vortex-api';
import path from 'path';
import { isModTypeModule } from './modType';
import { GAME_ID, SUBMODULE_FILE } from '../common';
import { VortexLauncherManager } from '../launcher/manager';
import { LocalizationManager } from '../localization';

const languageFileRegex = /ModuleData[\\/]+Languages[\\/]+([^\\/]+)[\\/]+language_data\.xml$/i;

// Utility: find all language codes present in the file list
function detectLanguageCodes(files: string[]): string[] {
  const set = new Set<string>();
  for (const f of files) {
    const m = f.match(languageFileRegex);
    if (m?.[1] !== undefined) set.add(m[1]);
  }
  return [...set];
}

// Utility: files that belong to the translation payload
// Must include a language key subfolder: ModuleData/Languages/<lang>/...
function isTranslationPayload(p: string): boolean {
  return /ModuleData[\\/]+Languages[\\/]+[^\\/]+[\\/]+/i.test(p);
}

// Normalize archive-relative path: remove leading ./ or .\ , convert backslashes to '/', remove trailing slashes
function normalizeArchivePath(p: string): string {
  return p
    .replace(/^[.][\\/]+/, '')
    .replace(/\\+/g, '/')
    .replace(/\/+$/, '');
}

export const isModTranslationArchive = (files: string[], gameId: string): Promise<types.ISupportedResult> => {
  if (gameId !== GAME_ID) {
    return Promise.resolve({
      supported: false,
      requiredFiles: [],
    });
  }

  const submoduleLower = SUBMODULE_FILE.toLowerCase();
  const hasSubmoduleFile = files.some((file) => file.replace(/\\/g, '/').toLowerCase().endsWith(submoduleLower));

  const languageFiles = files.filter((file) => languageFileRegex.test(file)).map(normalizeArchivePath);
  const hasLanguageFile = languageFiles.length > 0;

  return Promise.resolve({
    supported: !hasSubmoduleFile && hasLanguageFile,
    requiredFiles: languageFiles,
  });
};

async function inferModuleIdFromDownload(api: types.IExtensionApi, archivePath?: string): Promise<string | undefined> {
  try {
    if (archivePath === undefined) return undefined;

    const state = api.getState();
    const downloads = state.persistent.downloads.files ?? {};
    const archiveName = path.basename(archivePath);

    const entries: any[] = Object.values(downloads ?? {});
    const entry = entries.find((d) => {
      try {
        const gameMatches = Array.isArray(d?.game) ? d.game.includes(GAME_ID) : false;
        const localPath: string | undefined = d?.localPath;
        const fileName: string | undefined = d?.fileName ?? d?.logicalFileName;
        const pathMatches =
          (typeof localPath === 'string' && localPath.toLowerCase().endsWith(archiveName.toLowerCase())) ||
          (typeof fileName === 'string' && fileName.toLowerCase() === archiveName.toLowerCase());
        return gameMatches && pathMatches;
      } catch {
        return false;
      }
    });

    const nexusInfo = entry?.modInfo?.['nexus']?.modInfo;
    const nexusModName: string | undefined = nexusInfo?.name;
    if (nexusModName === null || nexusModName === undefined) return undefined;

    const launcher = VortexLauncherManager.getInstance(api);
    const modules = await launcher.getAllModulesAsync();

    const norm = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const tokens = norm(nexusModName)
      .split(' ')
      .filter((x) => x.length > 1);

    let bestId: string | undefined;
    let bestScore = 0;
    for (const [id, m] of Object.entries(modules)) {
      const idNorm = norm(id);
      const nameNorm = norm((m as any).name ?? '');
      const hay = `${idNorm} ${nameNorm}`;
      // Score: number of tokens present in id/name
      const score = tokens.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    // Require at least 3 token matches to avoid weak guesses
    if (bestScore >= 3) return bestId;

    return undefined;
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function modTranslationInstaller(
  api: types.IExtensionApi,
  files: string[],
  destinationPath: string,
  gameId: string,
  _progressDelegate: types.ProgressDelegate,
  _choices?: unknown,
  _unattended?: boolean,
  archivePath?: string
) {
  if (gameId !== GAME_ID) {
    return undefined!;
  }

  // 1) Determine language codes (for logging / sanity)
  const languageCodes = detectLanguageCodes(files);
  // Normalize for display/storage: trim, uppercase, unique, sorted
  const languageCodesNorm = Array.from(
    new Set(
      languageCodes
        .map((x) => (x ?? '').toString().trim())
        .filter((x) => x.length > 0)
        .map((x) => x.toUpperCase())
    )
  ).sort((a, b) => a.localeCompare(b));

  // 2) Build copy instructions
  //    - Only take translation payload (ModuleData/Languages/**)
  //    - Preserve relative structure
  const instructions: types.IInstruction[] = [];

  // Prefer only translation payload files; fall back to all files if none matched.
  const payloadFiles = files.filter(isTranslationPayload);
  const candidates = (payloadFiles.length > 0 ? payloadFiles : files)
    // drop directory-like entries (trailing slash/backslash)
    .filter((f) => !/[\\/]+$/.test(f));

  let warnedMissingTarget = false;
  let inferredTargetUsed: string | undefined = undefined;

  for (const file of candidates) {
    const normalized = normalizeArchivePath(file);

    // If archive contains a mod folder somewhere before ModuleData (e.g.
    // "I Dont Care RU 2.8.1/IDontCare/ModuleData/..."), capture the segment
    // immediately before ModuleData and install under "Modules/<modname>/ModuleData/..."
    let destination = normalized;
    const topLevelModMatch = normalized.match(/(?:^|.*\/)([^/]+)\/(ModuleData\/.*)$/i);
    if (topLevelModMatch && !normalized.toLowerCase().startsWith('modules/')) {
      destination = `Modules/${topLevelModMatch[1]}/${topLevelModMatch[2]}`;
    } else if (!normalized.toLowerCase().startsWith('modules/') && /^moduledata\//i.test(normalized)) {
      // If path starts directly with ModuleData/... and no folder was found before it,
      // only try to infer the module id when an archive file context is provided
      if (archivePath !== undefined && archivePath.length > 0) {
        const inferredModuleId = await inferModuleIdFromDownload(api, archivePath);
        if (inferredModuleId !== undefined) {
          destination = `Modules/${inferredModuleId}/${normalized}`;
          inferredTargetUsed = inferredModuleId;
        } else {
          warnedMissingTarget = true;
        }
      } else {
        warnedMissingTarget = true;
      }
    }

    // Use normalized archive-relative path for source; destination is adjusted above.
    instructions.push({
      type: 'copy',
      source: normalized,
      destination,
    });
  }

  // Persist detected languages as mod attributes for Details panel
  if (languageCodesNorm.length > 0) {
    // Machine-readable array attribute
    instructions.push({
      type: 'attribute',
      key: 'translationLanguages',
      value: languageCodesNorm,
    });
    // Human-friendly display string
    instructions.push({
      type: 'attribute',
      key: 'translationLanguagesText',
      value: languageCodesNorm.join(', '),
    });
  }

  const result: types.IInstallResult = {
    instructions,
  };

  if (inferredTargetUsed !== undefined) {
    const { localize: t } = LocalizationManager.getInstance(api);
    const archiveBase = path.basename(archivePath!);
    const title = `${t('Inferred Translation Target')} - ${archiveBase}`;
    api.sendNotification?.({
      id: 'translation-inferred-target',
      type: 'warning',
      title,
      message: `${t('Using inferred module for translation files')}: ${inferredTargetUsed}. ${t(
        'The archive did not include a module folder.'
      )}`,
    });
  }

  if (warnedMissingTarget) {
    const { localize: t } = LocalizationManager.getInstance(api);
    const archiveBase = archivePath !== undefined ? path.basename(archivePath) : '';
    const title = archiveBase
      ? `${t('Cannot Determine Target Module')} - ${archiveBase}`
      : t('Cannot Determine Target Module');
    api.showErrorNotification?.(
      title,
      t(
        'Could not identify the target Bannerlord module for translation files. The archive lacks a module folder and Nexus metadata did not help. Files will be placed under ModuleData/ and may not work. Consider repacking as Modules/<ModuleId>/ModuleData or <ModuleId>/ModuleData.'
      )
    );
  }

  return result;
}

export const isModTypeTranslation = (instructions: types.IInstruction[]): boolean => {
  const languageFileRegex = /ModuleData[\\/]+Languages[\\/]+[^\\/]+[\\/]+language_data\.xml$/i;

  const hasLanguageFile = instructions.some(
    (instr) => instr.type === 'copy' && languageFileRegex.test(instr.destination ?? '')
  );
  const hasSubmoduleFile = isModTypeModule(instructions);
  return hasLanguageFile && !hasSubmoduleFile;
};
