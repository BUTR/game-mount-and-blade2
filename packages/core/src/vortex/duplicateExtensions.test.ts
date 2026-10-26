import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import path from "node:path";
import { warnAboutOtherCopies } from "./duplicateExtensions";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.actions, {
    removeExtension: (extId: string) => ({ type: "REMOVE_EXTENSION", extId }),
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      localize: (template: string, replace?: Record<string, string>) =>
        template.replace(
          /{{(\w+)}}/g,
          (match, key: string) => replace?.[key] ?? match,
        ),
    }),
  },
}));

interface Loaded {
  name?: string | undefined;
  version?: string | undefined;
  path?: string | undefined;
}

const OTHER_FOLDER = path.join("C:", "Vortex", "plugins", "bannerlord-old");

const makeApi = (
  loaded: Loaded[],
  extensions: Record<string, { path?: string }> = {},
) => {
  const api = {
    getLoadedExtensions: () =>
      loaded.map(({ path: extensionPath, ...info }) => ({
        path: extensionPath,
        info,
      })),
    getState: () => ({ app: { extensions } }),
    store: { dispatch: vi.fn() },
    sendNotification: vi.fn(),
    events: { emit: vi.fn() },
  };
  return { api: api as unknown as types.IExtensionApi, ...api };
};

const notification = (sendNotification: ReturnType<typeof vi.fn>) =>
  sendNotification.mock.calls.find(
    ([sent]) => (sent as types.INotification).id === "bannerlord-other-copies",
  )?.[0] as types.INotification | undefined;

const actionTitles = (sent: types.INotification | undefined) =>
  sent?.actions?.map((action) => action.title);

beforeEach(() => {
  vi.stubGlobal("__EXTENSION_VERSION__", "1.2.3");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warnAboutOtherCopies", () => {
  it("warns about an older copy loaded from another folder, offering to remove it", () => {
    const { api, sendNotification, store, events } = makeApi(
      [{ name: __EXTENSION_NAME__, version: "1.0.0", path: OTHER_FOLDER }],
      // Vortex's entry may spell the folder differently
      { old: { path: OTHER_FOLDER.toUpperCase() + path.sep } },
    );

    warnAboutOtherCopies(api);

    const sent = notification(sendNotification);
    expect(sent).toMatchObject({ type: "warning" });
    expect(sent?.message).toContain("1.0.0");
    expect(sent?.message).toContain("1.2.3");
    expect(actionTitles(sent)).toEqual(["Remove", "Open Extensions"]);

    const dismiss = vi.fn();
    sent?.actions?.[0]?.action(dismiss);
    expect(store.dispatch).toHaveBeenCalledWith({
      type: "REMOVE_EXTENSION",
      extId: "old",
    });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "bannerlord-other-copies-removed" }),
    );

    sent?.actions?.[1]?.action(dismiss);
    expect(events.emit).toHaveBeenCalledWith("show-main-page", "extensions");
  });

  it("can only open the Extensions page for a copy Vortex has no entry for", () => {
    const { api, sendNotification, store } = makeApi(
      [{ name: __EXTENSION_NAME__, version: "1.0.0", path: OTHER_FOLDER }],
      { unrelated: { path: "C:\\Vortex\\plugins\\other" } },
    );

    warnAboutOtherCopies(api);

    expect(actionTitles(notification(sendNotification))).toEqual([
      "Open Extensions",
    ]);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it("lists every older copy in the warning", () => {
    const { api, sendNotification } = makeApi([
      { name: __EXTENSION_NAME__, version: "1.0.0", path: OTHER_FOLDER },
      { name: __EXTENSION_NAME__, version: "v1.1.0", path: "C:\\other" },
    ]);

    warnAboutOtherCopies(api);

    expect(notification(sendNotification)?.message).toContain("1.0.0, v1.1.0");
  });

  it("ignores this copy, copies that aren't older, unversioned ones and other extensions", () => {
    const { api, sendNotification } = makeApi([
      { name: __EXTENSION_NAME__, version: "1.0.0", path: __dirname },
      { name: __EXTENSION_NAME__, version: "1.2.3", path: OTHER_FOLDER },
      { name: __EXTENSION_NAME__, version: "1.2.4", path: OTHER_FOLDER },
      { name: __EXTENSION_NAME__, version: "2.0.0", path: OTHER_FOLDER },
      { name: __EXTENSION_NAME__, version: undefined, path: OTHER_FOLDER },
      { name: __EXTENSION_NAME__, version: "garbage", path: OTHER_FOLDER },
      { name: __EXTENSION_NAME__, version: "1.0.0", path: undefined },
      { name: "Skyrim Support", version: "1.0.0", path: OTHER_FOLDER },
    ]);

    warnAboutOtherCopies(api);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("compares the version numbers, not their text", () => {
    vi.stubGlobal("__EXTENSION_VERSION__", "1.10.0");
    const older = makeApi([
      { name: __EXTENSION_NAME__, version: "1.9.0", path: OTHER_FOLDER },
    ]);
    const newer = makeApi([
      { name: __EXTENSION_NAME__, version: "1.100.0", path: OTHER_FOLDER },
    ]);

    warnAboutOtherCopies(older.api);
    warnAboutOtherCopies(newer.api);

    expect(older.sendNotification).toHaveBeenCalledTimes(1);
    expect(newer.sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing on a Vortex that can't list its extensions", () => {
    const { api, sendNotification } = makeApi([]);
    (api as { getLoadedExtensions?: unknown }).getLoadedExtensions = undefined;

    warnAboutOtherCopies(api);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never stops the extension from starting when the check fails", () => {
    const { api, sendNotification } = makeApi([]);
    (api as { getLoadedExtensions: () => unknown }).getLoadedExtensions =
      () => {
        throw new Error("not ready");
      };

    expect(() => warnAboutOtherCopies(api)).not.toThrow();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
