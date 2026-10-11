import { selectors, types } from "vortex-api";
import { GAME_ID } from "../common";

const callbacks: (() => void)[] = [];
let observer: MutationObserver | undefined;
let watching = false;
let scheduled = false;

const runCallbacks = (): void => {
  scheduled = false;
  for (const callback of callbacks) {
    callback();
  }
};

const schedule = (): void => {
  if (scheduled) {
    return;
  }
  scheduled = true;
  requestAnimationFrame(runCallbacks);
};

/**
 * Runs the callbacks once in the next frame, while the document is watched
 */
export const scheduleDocumentCallbacks = (): void => {
  if (watching) {
    schedule();
  }
};

/**
 * Calls back after the window's elements or classes change, coalesced to once a frame for every callback, while the
 * document is watched. Classes are watched for layout changes like collapsing the menu. Data attributes aren't
 * watched, so callbacks can set them without observing themselves
 */
export const onDocumentChange = (callback: () => void): void => {
  callbacks.push(callback);
  observer ??= new MutationObserver(schedule);
};

const setWatching = (value: boolean): void => {
  if (value === watching || observer === undefined) {
    return;
  }
  watching = value;
  if (value) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  } else {
    observer.disconnect();
  }
  // Tags the document now, or once more to remove the tags
  schedule();
};

/**
 * Watches the document only while Bannerlord is the active game. The extension runs for every game Vortex manages,
 * the others get no work from it. Call after the callbacks are registered
 */
export const watchDocumentWhileActive = (api: types.IExtensionApi): void => {
  const update = (): void =>
    setWatching(selectors.activeGameId(api.getState()) === GAME_ID);
  update();
  api.onStateChange?.(["settings", "profiles", "activeProfileId"], update);
};
