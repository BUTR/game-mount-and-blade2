import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";
import { LocalizationManager } from "../localization/manager";
import { onDocumentChange, scheduleDocumentCallbacks } from "./documentWatcher";

const BADGE_ATTRIBUTE = "bannerlordBadge";
const COLLAPSED_ATTRIBUTE = "bannerlordCollapsed";
// Marks a tooltip set here, so only those are removed again
const TITLE_ATTRIBUTE = "bannerlordTitle";

// Vortex's menu buttons, the same classes in 2.0.0-beta.2 and later
const MENU_BUTTON_SELECTOR = "button.h-10.rounded-lg";
// Narrower than this the menu is collapsed to icons, the badge goes in the icon's corner
const COLLAPSED_WIDTH = 64;

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
 * Sets the button's tooltip, or removes the one set here. Vortex's own, of a collapsed menu, is set again whenever
 * the menu changes
 */
const setTooltip = (button: HTMLElement, title: string | undefined): void => {
  if (title !== undefined) {
    setAttribute(button, TITLE_ATTRIBUTE, "");
    if (button.title !== title) {
      button.title = title;
    }
  } else if (button.dataset[TITLE_ATTRIBUTE] !== undefined) {
    setAttribute(button, TITLE_ATTRIBUTE, undefined);
    button.removeAttribute("title");
  }
};

/**
 * Tags Vortex's menu items, which the stylesheet styles:
 * - the Profiles page's item gets the active profile's type as a badge, its tooltip says where the type is changed
 *
 * Vortex's menu items have no per-page hook, and the Profiles page is Vortex's, so its item is matched by its
 * translated title. If Vortex changes the menu the badge is just missing
 */
export const watchMenuItems = (api: types.IExtensionApi): void => {
  const tagMenu = (): void => {
    const buttons =
      document.querySelectorAll<HTMLButtonElement>(MENU_BUTTON_SELECTOR);
    if (buttons.length === 0) {
      return;
    }

    const state = api.getState<IStateWithBannerlord>();
    const isMB2 = selectors.activeGameId(state) === GAME_ID;
    const isMultiplayer = bselectors.activeGameMode(state) === "multiplayer";
    const badge = isMB2 ? (isMultiplayer ? "MP" : "SP") : undefined;
    const profilesTitles = new Set(["Profiles", api.translate("Profiles")]);
    const { localize: t } = LocalizationManager.getInstance(api);

    for (const button of Array.from(buttons)) {
      const title = button.querySelector("span")?.textContent?.trim() ?? "";
      const value = profilesTitles.has(title) ? badge : undefined;
      // Layout is only read for the badged item, and before the writes below change it
      const collapsed =
        value !== undefined && button.offsetWidth < COLLAPSED_WIDTH;
      setAttribute(button, BADGE_ATTRIBUTE, value);
      setAttribute(button, COLLAPSED_ATTRIBUTE, collapsed ? "" : undefined);

      const tooltip =
        value !== undefined
          ? isMultiplayer
            ? t(
                "The active profile is set to Multiplayer. You can change a profile's mode on the Profiles page.",
              )
            : t(
                "The active profile is set to Singleplayer. You can change a profile's mode on the Profiles page.",
              )
          : undefined;
      // A collapsed menu shows only icons, the tooltip names the page first as Vortex's does
      setTooltip(
        button,
        tooltip !== undefined && collapsed ? `${title}\n${tooltip}` : tooltip,
      );
    }
  };

  onDocumentChange(tagMenu);
  // The type changes with the profile, or when it is changed
  api.onStateChange?.(["persistent", "profiles"], scheduleDocumentCallbacks);
  api.onStateChange?.(
    ["settings", "profiles", "activeProfileId"],
    scheduleDocumentCallbacks,
  );
};
