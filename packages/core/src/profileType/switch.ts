import { selectors, types, util } from "@nexusmods/vortex-api";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { LocalizationManager } from "../localization/manager";
import { bselectors } from "../selectors";
import { GameMode } from "../settings/types";
import { IStateWithBannerlord } from "../types";
import { createProfileAsync, switchProfileAsync } from "../vortex/profiles";

const NEW_PROFILE = "bannerlord-new-profile";
const NEW_PROFILE_NAME = "bannerlord-new-profile-name";
const COPY_MODS = "bannerlord-copy-mods";

const modeName = (gameMode: GameMode): string =>
  gameMode === "multiplayer" ? "Multiplayer" : "Singleplayer";

/**
 * The game's profiles of the type, the most recently used first
 */
export const profilesOfGameMode = (
  state: IStateWithBannerlord,
  gameMode: GameMode,
): types.IProfile[] =>
  Object.values(state.persistent.profiles)
    .filter(
      (profile) =>
        profile.gameId === GAME_ID &&
        profile.pendingRemove !== true &&
        bselectors.gameModeForProfile(state, profile.id) === gameMode,
    )
    .sort((lhs, rhs) => (rhs.lastActivated ?? 0) - (lhs.lastActivated ?? 0));

interface ISwitchTarget {
  profileId?: string;
  newProfile?: { name: string; copyMods: boolean };
}

/**
 * Asks which profile of the type to switch to, offering to create one
 */
const askSwitchTargetAsync = async (
  api: types.IExtensionApi,
  gameMode: GameMode,
  current: types.IProfile,
  candidates: types.IProfile[],
): Promise<ISwitchTarget | undefined> => {
  const { localize: t } = LocalizationManager.getInstance(api);
  const mode = t(modeName(gameMode));

  const result = await api.showDialog?.(
    "question",
    t("Switch to {{mode}}", { mode }),
    {
      text:
        candidates.length > 0
          ? t(
              "Singleplayer and Multiplayer use separate profiles. Select a {{mode}} profile to switch to, or create a new one.",
              { mode },
            )
          : t(
              "Singleplayer and Multiplayer use separate profiles, and you don't have a {{mode}} profile yet. Create one to switch to {{mode}}.",
              { mode },
            ),
      choices: [
        ...candidates.map((profile, index) => ({
          id: profile.id,
          text: profile.name,
          value: index === 0,
        })),
        {
          id: NEW_PROFILE,
          text: t("Create a new {{mode}} profile", { mode }),
          value: candidates.length === 0,
        },
      ],
      input: [
        {
          id: NEW_PROFILE_NAME,
          label: t("Name of the new profile"),
          value: mode,
        },
      ],
      checkboxes: [
        {
          id: COPY_MODS,
          text: t('Copy the enabled mods from "{{profile}}"', {
            profile: current.name,
          }),
          value: false,
        },
      ],
      condition: (content) => {
        const creating =
          content.choices?.find((choice) => choice.id === NEW_PROFILE)
            ?.value === true;
        const name =
          content.input?.find((input) => input.id === NEW_PROFILE_NAME)
            ?.value ?? "";
        return creating && name.trim().length === 0
          ? [
              {
                id: NEW_PROFILE_NAME,
                actions: ["Switch"],
                errorText: t("The new profile needs a name"),
              },
            ]
          : [];
      },
    },
    [{ label: "Cancel" }, { label: "Switch", default: true }],
  );
  if (result === undefined || result.action !== "Switch") {
    return undefined;
  }

  const input = result.input as Record<string, unknown>;
  const chosen = candidates.find((profile) => input[profile.id] === true);
  if (chosen !== undefined) {
    return { profileId: chosen.id };
  }
  return {
    newProfile: {
      name: String(input[NEW_PROFILE_NAME] ?? mode).trim(),
      copyMods: input[COPY_MODS] === true,
    },
  };
};

/**
 * Switches to a profile of the other type. With a single such profile it is switched to directly,
 * otherwise a dialog picks one or creates a new one
 */
export const switchGameModeAsync = async (
  api: types.IExtensionApi,
  gameMode: GameMode,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  const current = selectors.activeProfile(state);
  if (
    current === undefined ||
    current.gameId !== GAME_ID ||
    bselectors.gameModeForProfile(state, current.id) === gameMode
  ) {
    return;
  }

  const candidates = profilesOfGameMode(state, gameMode);
  const target: ISwitchTarget | undefined =
    candidates.length === 1
      ? { profileId: candidates[0]!.id }
      : await askSwitchTargetAsync(api, gameMode, current, candidates);
  if (target === undefined) {
    return;
  }

  const { localize: t } = LocalizationManager.getInstance(api);
  try {
    let profileId = target.profileId;
    if (target.newProfile !== undefined) {
      const { name, copyMods } = target.newProfile;
      const profile = await createProfileAsync(
        api,
        name,
        { [MULTIPLAYER_PROFILE_FEATURE]: gameMode === "multiplayer" },
        copyMods ? { ...current.modState } : {},
      );
      profileId = profile.id;
    }
    if (profileId !== undefined) {
      await switchProfileAsync(api, profileId);
    }
  } catch (err) {
    if (err instanceof util.UserCanceled) {
      return;
    }
    api.showErrorNotification?.(t("Failed to switch the profile"), err);
  }
};
