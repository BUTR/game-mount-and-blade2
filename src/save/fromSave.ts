import { selectors, types, util } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { actionsSave } from "./actions";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { versionToString } from "../butr/version";
import { VortexLauncherManager } from "../launcher/manager";
import { LocalizationManager } from "../localization/manager";
import { bselectors } from "../selectors";
import {
  IPersistenceLoadOrderEntry,
  IStateWithBannerlord,
  VortexLoadOrderStorage,
} from "../types";
import { ISaveGame } from "../views/Saves/types";
// Not the indexes, which reach the views
import {
  readProfileLoadOrderOrThrowAsync,
  writeProfileLoadOrderAsync,
} from "../loadOrder/persistence";
import { reloadLoadOrderAsync } from "../loadOrder/gameMode";
import {
  createProfileAsync,
  IStagedModule,
  pickStagedModule,
  readStagedModulesAsync,
  switchProfileAsync,
} from "../servers/profiles";
import { enableModsAsync, ensureModsDeployedAsync } from "../vortex/deploy";
import { getSaveDetailsByNameAsync } from "./details";

const PROFILE_NAME_LIMIT = 64;

interface ISaveLoadOrderPlan {
  /**
   * The save's modules found, in the save's order
   */
  modules: { id: string; name: string }[];
  /**
   * The Vortex mods providing them, to enable
   */
  modIds: string[];
  /**
   * The save's modules neither the game nor Vortex has
   */
  missing: string[];
  /**
   * The save's modules found in another version than the save's, described for the player
   */
  mismatched: string[];
}

/**
 * Finds the save's modules, which it lists by id, older saves by name. A module of a Vortex mod is preferred, it can
 * be enabled: one already enabled in the profile, so two mods never provide the same module, then the save's version,
 * then the latest. Otherwise the game's own, official or installed outside Vortex
 */
const planSaveLoadOrderAsync = async (
  api: types.IExtensionApi,
  save: ISaveGame,
  profile: types.IProfile | undefined,
): Promise<ISaveLoadOrderPlan> => {
  const state = api.getState<IStateWithBannerlord>();
  const known =
    await VortexLauncherManager.getInstance(api).getAllModulesAsync();
  const knownByName = new Map(
    Object.values(known).map((module) => [module.name, module]),
  );

  const stagingPath = selectors.installPathForGame(state, GAME_ID);
  const staged =
    stagingPath !== undefined
      ? await readStagedModulesAsync(
          stagingPath,
          bselectors.bannerlordMods(state),
        )
      : new Map<string, IStagedModule[]>();
  const stagedByName = new Map<string, IStagedModule[]>();
  for (const candidates of staged.values()) {
    for (const candidate of candidates) {
      const entries = stagedByName.get(candidate.module.name) ?? [];
      entries.push(candidate);
      stagedByName.set(candidate.module.name, entries);
    }
  }

  const plan: ISaveLoadOrderPlan = {
    modules: [],
    modIds: [],
    missing: [],
    mismatched: [],
  };
  const noteVersion = (
    module: { name: string; version: vetypes.ApplicationVersion },
    version: vetypes.ApplicationVersion,
  ): void => {
    if (
      BannerlordModuleManager.compareVersions(module.version, version) !== 0
    ) {
      plan.mismatched.push(
        `${module.name} (${versionToString(version)} -> ${versionToString(module.version)})`,
      );
    }
  };
  for (const [key, version] of Object.entries(save.modules)) {
    const candidates = staged.get(key) ?? stagedByName.get(key) ?? [];
    const pick =
      candidates.find(
        (candidate) => profile?.modState?.[candidate.modId]?.enabled === true,
      ) ??
      pickStagedModule(candidates, versionToString(version)) ??
      pickStagedModule(candidates, null);
    if (pick !== undefined) {
      plan.modules.push({ id: pick.module.id, name: pick.module.name });
      if (!plan.modIds.includes(pick.modId)) {
        plan.modIds.push(pick.modId);
      }
      noteVersion(pick.module, version);
      continue;
    }
    const module = known[key] ?? knownByName.get(key);
    if (module !== undefined) {
      plan.modules.push({ id: module.id, name: module.name });
      noteVersion(module, version);
    } else {
      plan.missing.push(key);
    }
  }
  return plan;
};

/**
 * The save's modules turned on in its order, then the profile's others turned off in theirs
 */
const toSaveLoadOrder = (
  plan: ISaveLoadOrderPlan,
  existing: readonly IPersistenceLoadOrderEntry[],
): IPersistenceLoadOrderEntry[] => {
  const ids = new Set(plan.modules.map((module) => module.id));
  return [
    ...plan.modules.map((module) => ({
      id: module.id,
      name: module.name,
      isSelected: true,
      isDisabled: false,
    })),
    ...[...existing]
      .sort((lhs, rhs) => lhs.index - rhs.index)
      .filter((entry) => !ids.has(entry.id))
      .map((entry) => ({ ...entry, isSelected: false })),
  ].map((entry, index) => ({ ...entry, index }));
};

/**
 * Whether the load order turns on exactly the save's modules, in its order
 */
export const loadOrderMatchesSave = (
  loadOrder: VortexLoadOrderStorage,
  save: ISaveGame,
): boolean => {
  // Saves list modules by id, older ones by name
  const enabled = [...loadOrder].filter((entry) => entry.enabled);
  const saved = Object.keys(save.modules);
  return (
    enabled.length === saved.length &&
    enabled.every(
      (entry, index) =>
        saved[index] === entry.id ||
        saved[index] === entry.data?.moduleInfoExtended.name,
    )
  );
};

/**
 * Warns about what keeps the load order from being the save's, the game may refuse to load the save or break it
 */
const warningNote = (
  t: (key: string, values?: Record<string, string>) => string,
  plan: ISaveLoadOrderPlan,
): string => {
  // A heading, then one module per line
  const list = (heading: string, modules: string[]): string[] =>
    modules.length > 0
      ? [`${heading}\n${modules.map((module) => `- ${module}`).join("\n")}`]
      : [];
  const notes = [
    ...list(t("Not installed, so left out:"), plan.missing),
    ...list(t("In other versions than the save's:"), plan.mismatched),
  ];
  if (notes.length === 0) {
    return "";
  }
  const warning = t(
    "Warning: not every mod is available as the save was made with it. The game may refuse to load the save, or it may break.",
  );
  return `\n\n${warning}\n\n${notes.join("\n\n")}`;
};

/**
 * Sets the active profile's load order to the save's: enables the mods its modules come from, deploys them, and turns
 * on the save's modules in its order, the others off. No mod is disabled
 */
export const applySaveLoadOrderAsync = async (
  api: types.IExtensionApi,
  save: ISaveGame,
): Promise<boolean> => {
  const { localize: t } = LocalizationManager.getInstance(api);
  const profile = selectors.activeProfile(api.getState());
  if (profile === undefined) {
    return false;
  }

  const plan = await planSaveLoadOrderAsync(api, save, profile);
  const confirmLabel = t("Use Load Order");
  const result = await api.showDialog?.(
    "question",
    t("Use This Save's Load Order?"),
    {
      text:
        t(
          "Vortex will enable the mods '{{save}}' was made with in '{{profile}}', and set its load order to the save's: " +
            "the save's modules first in its order, the others turned off. No mod is disabled.",
          { save: save.name, profile: profile.name },
        ) + warningNote(t, plan),
    },
    [{ label: t("Cancel") }, { label: confirmLabel, default: true }],
  );
  if (result?.action !== confirmLabel) {
    return false;
  }

  try {
    await enableModsAsync(api, profile.id, plan.modIds);
    // The newly enabled mods' modules have to be in the game for the load order to list them
    await ensureModsDeployedAsync(api);
    const existing = await readProfileLoadOrderOrThrowAsync(
      api,
      profile.id,
      "singleplayer",
    );
    await writeProfileLoadOrderAsync(
      api,
      profile.id,
      "singleplayer",
      toSaveLoadOrder(plan, existing),
    );
    await reloadLoadOrderAsync(api);
    return true;
  } catch (err) {
    api.showErrorNotification?.(t("Failed to use the save's load order"), err);
    return false;
  }
};

/**
 * Creates a Singleplayer profile with only the mods the save was made with, BLSE when the active profile uses it, the
 * save's load order, and the save loaded on launch, then switches to it
 */
export const createProfileForSaveAsync = async (
  api: types.IExtensionApi,
  save: ISaveGame,
): Promise<boolean> => {
  const { localize: t } = LocalizationManager.getInstance(api);
  const state = api.getState<IStateWithBannerlord>();
  const current = selectors.activeProfile(state);

  const plan = await planSaveLoadOrderAsync(api, save, undefined);
  // "Name of Clan", the clan's name is read from the save itself
  const { clanName } = await getSaveDetailsByNameAsync(api, save.name);
  const hero =
    save.characterName !== undefined && save.characterName !== ""
      ? save.characterName
      : undefined;
  const defaultName = (
    hero !== undefined && clanName !== undefined
      ? t("{{name}} of {{clan}}", { name: hero, clan: clanName })
      : (hero ?? save.name)
  ).slice(0, PROFILE_NAME_LIMIT);
  const nameInput = "bannerlord-save-profile-name";
  const createLabel = t("Create Profile");
  const result = await api.showDialog?.(
    "question",
    t("Create a Profile for This Save?"),
    {
      text:
        t(
          "Vortex will create a Singleplayer profile with only the mods '{{save}}' was made with, in the save's load " +
            "order, set it to load the save on launch, and switch to it. Your current profile is not changed.",
          { save: save.name },
        ) + warningNote(t, plan),
      input: [
        { id: nameInput, label: t("Name of the profile"), value: defaultName },
      ],
      condition: (content) =>
        (
          content.input?.find((input) => input.id === nameInput)?.value ?? ""
        ).trim().length === 0
          ? [
              {
                id: nameInput,
                actions: [createLabel],
                errorText: t("The profile needs a name"),
              },
            ]
          : [],
    },
    [{ label: t("Cancel") }, { label: createLabel, default: true }],
  );
  if (result?.action !== createLabel) {
    return false;
  }
  const name = String(
    (result.input as Record<string, unknown>)[nameInput] ?? defaultName,
  ).trim();

  // BLSE is what Play launches singleplayer with, a profile without it would start the game without
  const blse = bselectors.blseMod(state);
  const modIds =
    blse !== undefined && current?.modState?.[blse.id]?.enabled === true
      ? [...plan.modIds, blse.id]
      : plan.modIds;

  try {
    const profile = await createProfileAsync(api, name, {
      [MULTIPLAYER_PROFILE_FEATURE]: false,
    });
    await enableModsAsync(api, profile.id, modIds);
    await writeProfileLoadOrderAsync(
      api,
      profile.id,
      "singleplayer",
      toSaveLoadOrder(plan, []),
    );
    api.store?.dispatch(actionsSave.setCurrentSave(profile.id, save.name));
    await switchProfileAsync(api, profile.id);
    return true;
  } catch (err) {
    if (!(err instanceof util.UserCanceled)) {
      api.showErrorNotification?.(
        t("Failed to create a profile for the save"),
        err,
      );
    }
    return false;
  }
};
