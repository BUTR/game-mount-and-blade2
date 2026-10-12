import { actions, selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";

/**
 * Vortex filters the menu's pages only when the active game or a few settings change, not when a page's visible()
 * would answer differently. Saves and Servers depend on the profile's type, so a type change re-filters the menu by
 * changing the Profiles visibility, one of those settings, and back.
 *
 * It is changed to an equal value, 1 for true and 0 for false: the menu sees a change, while Vortex only ever reads
 * the setting as truthy, so the Profiles page doesn't hide or show and its open page isn't closed
 */
export const watchGameModeMenu = (api: types.IExtensionApi): void => {
  const getState = (): IStateWithBannerlord =>
    api.getState<IStateWithBannerlord>();

  let gameMode = bselectors.activeGameMode(getState());

  const refilterMenu = (): void => {
    const profilesVisible = Boolean(
      getState().settings.interface.profilesVisible,
    );
    // Typed as a boolean, the reducer stores whatever it gets
    api.store?.dispatch(
      actions.setProfilesVisible(
        (profilesVisible ? 1 : 0) as unknown as boolean,
      ),
    );
    // The menu has to render the changed value once, otherwise it never re-filters
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        api.store?.dispatch(actions.setProfilesVisible(profilesVisible)),
      ),
    );
  };

  const onGameModeMaybeChanged = (): void => {
    const state = getState();
    if (selectors.activeGameId(state) !== GAME_ID) {
      return;
    }
    const current = bselectors.activeGameMode(state);
    if (current === gameMode) {
      return;
    }
    gameMode = current;
    refilterMenu();
  };

  // Changing the profile's type, and switching to a profile of the other type
  api.onStateChange?.(["persistent", "profiles"], onGameModeMaybeChanged);
  api.onStateChange?.(
    ["settings", "profiles", "activeProfileId"],
    onGameModeMaybeChanged,
  );
};
