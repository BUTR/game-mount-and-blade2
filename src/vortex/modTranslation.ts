import { log, types } from "vortex-api";
import path from "path";
import { readFile } from "node:fs/promises";
import { isModTypeModule } from "./modType";
import { GAME_ID, SUBMODULE_FILE } from "../common";
import { VortexLauncherManager } from "../launcher/manager";
import { languageMap, LocalizationManager } from "../localization";

// Constants
const languageFileRegex =
  /ModuleData[\\/]+Languages[\\/]+([^\\/]+)[\\/]+language_data\.xml$/i;
const MIN_TOKEN_MATCHES_FOR_MODULE_INFERENCE = 3;

// Utility: files that belong to the translation payload
// Must include a language key subfolder: ModuleData/Languages/<lang>/...
const isTranslationPayload = (p: string): boolean => {
  return /ModuleData[\\/]+Languages[\\/]+[^\\/]+[\\/]+/i.test(p);
};

// Normalize archive-relative path: remove leading ./ or .\ , convert backslashes to '/', remove trailing slashes
const normalizeArchivePath = (p: string): string => {
  return p
    .replace(/^[.][\\/]+/, "")
    .replace(/\\+/g, "/")
    .replace(/\/+$/, "");
};

export const isModTranslationArchive = (
  files: string[],
  gameId: string,
): Promise<types.ISupportedResult> => {
  if (gameId !== GAME_ID) {
    return Promise.resolve({
      supported: false,
      requiredFiles: [],
    });
  }

  const submoduleLower = SUBMODULE_FILE.toLowerCase();
  const hasSubmoduleFile = files.some((file) =>
    file.replace(/\\/g, "/").toLowerCase().endsWith(submoduleLower),
  );

  const languageFiles = files
    .filter((file) => languageFileRegex.test(file))
    .map(normalizeArchivePath);
  const hasLanguageFile = languageFiles.length > 0;

  return Promise.resolve({
    supported: !hasSubmoduleFile && hasLanguageFile,
    requiredFiles: languageFiles,
  });
};

const inferModuleIdFromDownload = async (
  api: types.IExtensionApi,
  archivePath?: string,
): Promise<string | undefined> => {
  try {
    if (archivePath === undefined) return undefined;

    const state = api.getState();
    const downloads = state.persistent.downloads.files ?? {};
    const archiveName = path.basename(archivePath);

    const entries = Object.values(downloads);
    const entry = entries.find((d) => {
      try {
        const gameMatches = Array.isArray(d?.game)
          ? d.game.includes(GAME_ID)
          : false;
        const localPath: string | undefined = d?.localPath;
        const fileName: string | undefined =
          d?.modInfo?.["fileName"] ?? d?.modInfo?.["logicalFileName"];
        const pathMatches =
          (typeof localPath === "string" &&
            localPath.toLowerCase().endsWith(archiveName.toLowerCase())) ||
          (typeof fileName === "string" &&
            fileName.toLowerCase() === archiveName.toLowerCase());
        return gameMatches && pathMatches;
      } catch (err) {
        log("error", "Error matching download entry:", err);
        return false;
      }
    });

    const nexusInfo = entry?.modInfo?.["nexus"]?.["modInfo"];
    const nexusModName: string | undefined = nexusInfo?.name;
    if (!nexusModName) return undefined;

    const launcher = VortexLauncherManager.getInstance(api);
    const modules = await launcher.getAllModulesAsync();

    const norm = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const tokens = norm(nexusModName)
      .split(" ")
      .filter((x) => x.length > 1);

    let bestId: string | undefined;
    let bestScore = 0;
    for (const [id, m] of Object.entries(modules)) {
      const idNorm = norm(id);
      const nameNorm = norm(m.name ?? "");
      const hay = `${idNorm} ${nameNorm}`;
      // Score: number of tokens present in id/name
      const score = tokens.reduce(
        (acc, t) => (hay.includes(t) ? acc + 1 : acc),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    // Require at least minimum token matches to avoid weak guesses
    if (bestScore >= MIN_TOKEN_MATCHES_FOR_MODULE_INFERENCE) return bestId;

    return undefined;
  } catch (err) {
    log("error", "Error inferring module ID from download:", err);
    return undefined;
  }
};

export const modTranslationInstaller = async (
  api: types.IExtensionApi,
  files: string[],
  _destinationPath: string,
  gameId: string,
  _progressDelegate: types.ProgressDelegate,
  _choices?: unknown,
  _unattended?: boolean,
  archivePath?: string,
): Promise<types.IInstallResult | undefined> => {
  if (gameId !== GAME_ID) {
    return undefined;
  }

  // 1) Build copy instructions
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
    const topLevelModMatch = normalized.match(
      /(?:^|.*\/)([^/]+)\/(ModuleData\/.*)$/i,
    );
    if (topLevelModMatch && !normalized.toLowerCase().startsWith("modules/")) {
      destination = `Modules/${topLevelModMatch[1]}/${topLevelModMatch[2]}`;
    } else if (
      !normalized.toLowerCase().startsWith("modules/") &&
      /^moduledata\//i.test(normalized)
    ) {
      // If path starts directly with ModuleData/... and no folder was found before it,
      // only try to infer the module id when an archive file context is provided
      if (archivePath !== undefined && archivePath.length > 0) {
        const inferredModuleId = await inferModuleIdFromDownload(
          api,
          archivePath,
        );
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
      type: "copy",
      source: normalized,
      destination,
    });
  }

  // Persist detected languages as mod attributes for Details panel
  const languageCodesNorm = await getAvailableTranslationLanguages(
    instructions,
    _destinationPath,
  );
  pushTranslationLanguageAttributes(instructions, languageCodesNorm);

  const result: types.IInstallResult = {
    instructions,
  };

  if (inferredTargetUsed !== undefined) {
    const { localize: t } = LocalizationManager.getInstance(api);
    const archiveBase = path.basename(archivePath!);
    const title = `${t("Inferred Translation Target")} - ${archiveBase}`;
    api.sendNotification?.({
      id: "translation-inferred-target",
      type: "warning",
      title,
      message: `${t("Using inferred module for translation files")}: ${inferredTargetUsed}. ${t(
        "The archive did not include a module folder.",
      )}`,
    });
  }

  if (warnedMissingTarget) {
    const { localize: t } = LocalizationManager.getInstance(api);
    const archiveBase =
      archivePath !== undefined ? path.basename(archivePath) : "";
    const title = archiveBase
      ? `${t("Cannot Determine Target Module")} - ${archiveBase}`
      : t("Cannot Determine Target Module");
    api.showErrorNotification?.(
      title,
      t(
        "Could not identify the target Bannerlord module for translation files. The archive lacks a module folder and Nexus metadata did not help. Files will be placed under ModuleData/ and may not work. Consider repacking as Modules/<ModuleId>/ModuleData or <ModuleId>/ModuleData.",
      ),
    );
  }

  return result;
};

/**
 * Extract language name from language_data.xml file content.
 * Parses the XML to find the 'name' attribute from the LanguageData element.
 * @param xmlContent - The XML file content as string
 * @returns The language name, or undefined if not found
 */
const extractLanguageName = (xmlContent: string): string | undefined => {
  try {
    // Match the name attribute in the LanguageData element
    // Example: <LanguageData ... name="Français" ...>
    const nameMatch = xmlContent.match(
      /<LanguageData[^>]*\sname=["']([^"']+)["']/i,
    );
    return nameMatch?.[1];
  } catch (err) {
    log("error", "Error extracting language name from XML:", err);
    return undefined;
  }
};

/**
 * Helper to get language code or fallback to uppercase code from match.
 * @param languageCode - The language code from the path match
 * @returns The uppercase language code
 */
const getFallbackLanguageCode = (languageCode: string): string => {
  const code = languageCode.toString().trim();
  return code.length > 0 ? code.toUpperCase() : "";
};

/**
 * Extract all available translation languages from the instruction list.
 * Scans copy instructions for language_data.xml files in ModuleData/Languages/<lang>/ paths,
 * reads the XML files to extract the language names from the 'name' attribute.
 * @param instructions - The installation instructions to scan
 * @param destinationPath - The temporary extraction path where files are available during installation
 * @returns Array of language names, sorted alphabetically
 */
export const getAvailableTranslationLanguages = async (
  instructions: types.IInstruction[],
  destinationPath: string,
): Promise<string[]> => {
  const languageNames = new Set<string>();

  for (const instr of instructions) {
    if (instr.type !== "copy") continue;
    const dest = instr.destination ?? "";
    const match = dest.match(languageFileRegex);
    if (match?.[1] !== undefined) {
      // Try to read the language_data.xml file
      try {
        const source = instr.source ?? "";
        const filePath = path.join(destinationPath, source);
        const xmlContent = await readFile(filePath, { encoding: "utf-8" });
        const languageName = extractLanguageName(xmlContent);
        if (languageName !== undefined && languageName.length > 0) {
          languageNames.add(languageName);
        } else {
          // Fallback to language code if name not found
          const fallbackCode = getFallbackLanguageCode(match[1]);
          if (fallbackCode) {
            languageNames.add(fallbackCode);
          }
        }
      } catch (err) {
        // Fallback to language code if file read fails
        log("error", "Error reading language_data.xml file:", err);
        const fallbackCode = getFallbackLanguageCode(match[1]);
        if (fallbackCode) {
          languageNames.add(fallbackCode);
        }
      }
    }
  }

  return Array.from(languageNames).sort((a, b) => a.localeCompare(b));
};

/**
 * Push translation language attribute instructions to the instruction list.
 * Adds both a machine-readable array attribute and a human-friendly display string.
 * @param instructions - The instruction list to append to
 * @param languages - Array of language codes to persist as attributes
 */
export const pushTranslationLanguageAttributes = (
  instructions: types.IInstruction[],
  languages: string[],
): void => {
  if (languages.length === 0) return;

  const i18nLanguages = languages
    .map((lang) => languageMap.getCodeFromName(lang.trim()))
    .filter((lang) => lang && lang.length > 0);
  // Machine-readable array attribute
  instructions.push({
    type: "attribute",
    key: "translationLanguages",
    value: i18nLanguages,
  });

  // Human-friendly display string
  instructions.push({
    type: "attribute",
    key: "translationLanguagesText",
    value: languages.join(", "),
  });
};

export const isModTypeTranslation = (
  instructions: types.IInstruction[],
): boolean => {
  const hasLanguageFile = instructions.some(
    (instr) =>
      instr.type === "copy" && languageFileRegex.test(instr.destination ?? ""),
  );
  const hasSubmoduleFile = isModTypeModule(instructions);
  return hasLanguageFile && !hasSubmoduleFile;
};
