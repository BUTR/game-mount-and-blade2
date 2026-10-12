import { types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";
import { LocalizationManager } from "../localization/manager";
import { onDocumentChange, scheduleDocumentCallbacks } from "./documentWatcher";
// Not the servers index, which reaches the views
import {
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "../servers/profiles";

const TYPE_ATTRIBUTE = "bannerlordType";
const SERVER_ATTRIBUTE = "bannerlordServer";
const SERVER_LABEL_ATTRIBUTE = "bannerlordServerLabel";

const setAttribute = (
  element: HTMLElement,
  name: string,
  value: string | undefined,
): void => {
  if (value === undefined) {
    delete element.dataset[name];
  } else if (element.dataset[name] !== value) {
    element.dataset[name] = value;
  }
};

/**
 * Tags the Profiles page's cards, which the stylesheet shows: the profile's type as a badge, and for the profiles
 * made for servers, the server's address as one more row of the card's details. Its name is the profile's description.
 *
 * Vortex has no per-profile hook on its cards: they all have the same classes and the type feature is only a
 * "yes"/"no" text. Each card lists its profile id in its ID row though, so the cards are matched by that text and
 * get data attributes. React doesn't manage the attributes, so they stay across renders, and the observer tags
 * recreated cards again. If Vortex changes the cards the badge and the row are just missing.
 *
 * The server isn't a profile feature Vortex shows: it would be an editable text in Vortex's profile editor, also when
 * creating any other profile, and changing it would tie the profile to another server
 */
export const watchProfileCards = (api: types.IExtensionApi): void => {
  const tagCards = (): void => {
    const cards = document.querySelectorAll<HTMLElement>(".profile-item");
    if (cards.length === 0) {
      return;
    }

    const state = api.getState<IStateWithBannerlord>();
    const profiles = state.persistent.profiles;
    const { localize: t } = LocalizationManager.getInstance(api);
    for (const card of Array.from(cards)) {
      const profileId = Array.from(
        card.querySelectorAll(".profile-feature-value"),
      )
        .map((value) => value.textContent?.trim() ?? "")
        .find((text) => profiles[text] !== undefined);
      const profile =
        profileId !== undefined && profiles[profileId]?.gameId === GAME_ID
          ? profiles[profileId]
          : undefined;

      setAttribute(
        card,
        TYPE_ATTRIBUTE,
        profile !== undefined
          ? bselectors.gameModeForProfile(state, profile.id)
          : undefined,
      );

      // On the details themselves, the stylesheet reads them with attr() into their pseudo-elements
      const details = card.querySelector<HTMLElement>(".profile-details");
      if (details === null) {
        continue;
      }
      // The server's address, its name is the profile's description
      const serverId = profile?.features?.[SERVER_PROFILE_FEATURE];
      const isNoMods = profile?.features?.[NO_MODS_PROFILE_FEATURE] === true;
      setAttribute(
        details,
        SERVER_LABEL_ATTRIBUTE,
        typeof serverId === "string"
          ? t("Address")
          : isNoMods
            ? t("Servers")
            : undefined,
      );
      setAttribute(
        details,
        SERVER_ATTRIBUTE,
        typeof serverId === "string"
          ? serverId
          : isNoMods
            ? t("Without mods")
            : undefined,
      );
    }
  };

  onDocumentChange(tagCards);
  api.onStateChange?.(["persistent", "profiles"], scheduleDocumentCallbacks);
};
