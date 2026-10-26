import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { MULTIPLAYER_PROFILE_FEATURE } from "@bannerlord/core/common";
import {
  IPersistenceLoadOrderEntry,
  VortexLoadOrderEntry,
  VortexLoadOrderStorage,
} from "@bannerlord/core/types";
import { IStagedModule } from "@bannerlord/core/vortex/stagedModules";
import { ISaveGame } from "./views/types";
import { actionsSave } from "./actions";
import {
  applySaveLoadOrderAsync,
  createProfileForSaveAsync,
  loadOrderMatchesSave,
} from "./fromSave";

const mocks = vi.hoisted(() => ({
  activeProfile: vi.fn<() => unknown>(),
  getAllModulesAsync: vi.fn<() => Promise<unknown>>(),
  readStagedModulesAsync: vi.fn<() => Promise<unknown>>(),
  blseMod: vi.fn<() => unknown>(),
  enableModsAsync: vi.fn<(...args: unknown[]) => Promise<void>>(),
  ensureModsDeployedAsync: vi.fn<() => Promise<void>>(),
  readProfileLoadOrderOrThrowAsync: vi.fn<() => Promise<unknown>>(),
  writeProfileLoadOrderAsync: vi.fn<(...args: unknown[]) => Promise<void>>(),
  reloadLoadOrderAsync: vi.fn<() => Promise<void>>(),
  createProfileAsync: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  switchProfileAsync: vi.fn<(...args: unknown[]) => Promise<void>>(),
  getSaveDetailsByNameAsync: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  class UserCanceled extends Error {}
  return {
    ...original,
    selectors: {
      activeProfile: mocks.activeProfile,
      installPathForGame: () => "staging",
    },
    util: { UserCanceled },
  };
});

vi.mock("@butr/vortexextensionnative", () => {
  type Version = { major: number; minor: number; revision: number };
  return {
    types: {
      ApplicationVersionType: {
        Alpha: "Alpha",
        Beta: "Beta",
        EarlyAccess: "EarlyAccess",
        Release: "Release",
        Development: "Development",
        Invalid: "Invalid",
      },
    },
    BannerlordModuleManager: {
      compareVersions: (x: Version, y: Version): number =>
        Math.sign(x.major - y.major) ||
        Math.sign(x.minor - y.minor) ||
        Math.sign(x.revision - y.revision),
    },
  };
});

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      localize: (template: string, values: Record<string, string> = {}) =>
        template.replace(
          /\{\{(\w+)\}\}/g,
          (all, key: string) => values[key] ?? all,
        ),
    }),
  },
}));

vi.mock("@bannerlord/core/launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({ getAllModulesAsync: mocks.getAllModulesAsync }),
  },
}));

vi.mock("@bannerlord/core/selectors", () => ({
  bselectors: { bannerlordMods: () => ({}), blseMod: mocks.blseMod },
}));

vi.mock("@bannerlord/core/vortex/stagedModules", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readStagedModulesAsync: mocks.readStagedModulesAsync,
}));

vi.mock("@bannerlord/core/vortex/deploy", () => ({
  enableModsAsync: mocks.enableModsAsync,
  ensureModsDeployedAsync: mocks.ensureModsDeployedAsync,
}));

vi.mock("@bannerlord/core/loadOrder/persistence", () => ({
  readProfileLoadOrderOrThrowAsync: mocks.readProfileLoadOrderOrThrowAsync,
  writeProfileLoadOrderAsync: mocks.writeProfileLoadOrderAsync,
}));

vi.mock("@bannerlord/core/loadOrder/gameMode", () => ({
  reloadLoadOrderAsync: mocks.reloadLoadOrderAsync,
}));

vi.mock("@bannerlord/core/vortex/profiles", () => ({
  createProfileAsync: mocks.createProfileAsync,
  switchProfileAsync: mocks.switchProfileAsync,
}));

vi.mock("./details", () => ({
  getSaveDetailsByNameAsync: mocks.getSaveDetailsByNameAsync,
}));

const v = (
  major: number,
  minor = 0,
  revision = 0,
): vetypes.ApplicationVersion =>
  ({
    applicationVersionType: "Release",
    major,
    minor,
    revision,
    changeSet: 0,
  }) as unknown as vetypes.ApplicationVersion;

const save = (
  modules: Record<string, vetypes.ApplicationVersion>,
  options: Partial<ISaveGame> = {},
): ISaveGame => ({ index: 1, name: "Campaign", ...options, modules });

const staged = (
  modId: string,
  id: string,
  version: vetypes.ApplicationVersion,
  name = id,
): IStagedModule => ({
  modId,
  module: { id, name, version, requiredDependencyIds: [] },
});

const stagedMap = (
  ...modules: IStagedModule[]
): Map<string, IStagedModule[]> => {
  const map = new Map<string, IStagedModule[]>();
  for (const module of modules) {
    map.set(module.module.id, [...(map.get(module.module.id) ?? []), module]);
  }
  return map;
};

const gameModule = (
  id: string,
  version: vetypes.ApplicationVersion,
  name = id,
) => ({
  id,
  name,
  version,
});

const entry = (
  id: string,
  index: number,
  isSelected = true,
): IPersistenceLoadOrderEntry => ({
  id,
  name: id,
  isSelected,
  isDisabled: false,
  index,
});

interface IDialog {
  text: string;
  input?: { id: string; value: string }[];
  condition?: (content: {
    input?: { id: string; value: string }[];
  }) => unknown[];
}

const createApi = (
  action: string | undefined,
  input: Record<string, string> = {},
) => {
  const showDialog = vi.fn(
    (_type: string, _title: string, _content: IDialog, _actions: unknown) =>
      Promise.resolve({ action, input }),
  );
  const api = {
    getState: () => ({}),
    showDialog,
    showErrorNotification: vi.fn(),
    store: { dispatch: vi.fn() },
  };
  return {
    api: api as unknown as types.IExtensionApi,
    showDialog,
    showErrorNotification: api.showErrorNotification,
    dispatch: api.store.dispatch,
    dialog: (): IDialog => showDialog.mock.calls[0]![2],
  };
};

const profile = (modState: Record<string, { enabled: boolean }> = {}) => ({
  id: "profile1",
  name: "Main",
  gameId: "mountandblade2bannerlord",
  modState,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.activeProfile.mockReturnValue(profile());
  mocks.getAllModulesAsync.mockResolvedValue({});
  mocks.readStagedModulesAsync.mockResolvedValue(new Map());
  mocks.readProfileLoadOrderOrThrowAsync.mockResolvedValue([]);
  mocks.getSaveDetailsByNameAsync.mockResolvedValue({});
  mocks.createProfileAsync.mockResolvedValue({ id: "new-profile" });
  mocks.blseMod.mockReturnValue(undefined);
});

describe("loadOrderMatchesSave", () => {
  const lo = (
    ...entries: [id: string, enabled: boolean, name?: string][]
  ): VortexLoadOrderStorage =>
    entries.map(
      ([id, enabled, name]) =>
        ({
          id,
          name: id,
          enabled,
          data: { moduleInfoExtended: { id, name: name ?? id } },
        }) as unknown as VortexLoadOrderEntry,
    );

  it("matches the enabled modules in the save's order", () => {
    expect(
      loadOrderMatchesSave(
        lo(["Native", true], ["Disabled", false], ["Harmony", true]),
        save({ Native: v(1), Harmony: v(2) }),
      ),
    ).toBe(true);
  });

  it("matches modules a save lists by name", () => {
    expect(
      loadOrderMatchesSave(
        lo(["Bannerlord.Harmony", true, "Harmony"]),
        save({ Harmony: v(2) }),
      ),
    ).toBe(true);
  });

  it("doesn't match another order", () => {
    expect(
      loadOrderMatchesSave(
        lo(["Harmony", true], ["Native", true]),
        save({ Native: v(1), Harmony: v(2) }),
      ),
    ).toBe(false);
  });

  it("doesn't match an extra or a missing enabled module", () => {
    expect(
      loadOrderMatchesSave(
        lo(["Native", true], ["Harmony", true]),
        save({ Native: v(1) }),
      ),
    ).toBe(false);
    expect(
      loadOrderMatchesSave(
        lo(["Native", true], ["Harmony", false]),
        save({ Native: v(1), Harmony: v(2) }),
      ),
    ).toBe(false);
  });
});

describe("applySaveLoadOrderAsync", () => {
  it("does nothing without an active profile", async () => {
    mocks.activeProfile.mockReturnValue(undefined);
    const { api, showDialog } = createApi("Use Load Order");

    expect(await applySaveLoadOrderAsync(api, save({ Native: v(1) }))).toBe(
      false,
    );
    expect(showDialog).not.toHaveBeenCalled();
  });

  it("changes nothing when the player cancels", async () => {
    const { api } = createApi("Cancel");

    expect(await applySaveLoadOrderAsync(api, save({ Native: v(1) }))).toBe(
      false,
    );
    expect(mocks.enableModsAsync).not.toHaveBeenCalled();
    expect(mocks.writeProfileLoadOrderAsync).not.toHaveBeenCalled();
  });

  it("picks the mod providing each of the save's modules", async () => {
    mocks.activeProfile.mockReturnValue(
      profile({ "a-enabled": { enabled: true } }),
    );
    mocks.readStagedModulesAsync.mockResolvedValue(
      stagedMap(
        // An enabled mod wins over the save's version
        staged("a-save-version", "A", v(1)),
        staged("a-enabled", "A", v(2)),
        // The save's version wins over the latest
        staged("b-latest", "B", v(3)),
        staged("b-save-version", "B", v(1)),
        // The latest without the save's version
        staged("c-old", "C", v(1)),
        staged("c-latest", "C", v(3)),
        // Found by the name the older save lists
        staged("d-mod", "D", v(1), "D Name"),
        // Another module of a mod already picked
        staged("a-enabled", "E", v(1)),
      ),
    );
    mocks.getAllModulesAsync.mockResolvedValue({
      Native: gameModule("Native", v(1)),
      "Game.Module": gameModule("Game.Module", v(1), "Game Module Name"),
    });
    const { api } = createApi("Use Load Order");

    const result = await applySaveLoadOrderAsync(
      api,
      save({
        Native: v(1),
        A: v(1),
        B: v(1),
        C: v(2),
        "D Name": v(1),
        E: v(1),
        "Game Module Name": v(1),
        Gone: v(1),
      }),
    );

    expect(result).toBe(true);
    expect(mocks.enableModsAsync).toHaveBeenCalledWith(api, "profile1", [
      "a-enabled",
      "b-save-version",
      "c-latest",
      "d-mod",
    ]);
    const written = mocks.writeProfileLoadOrderAsync.mock
      .calls[0]![3] as IPersistenceLoadOrderEntry[];
    expect(written.map((e) => e.id)).toEqual([
      "Native",
      "A",
      "B",
      "C",
      "D",
      "E",
      "Game.Module",
    ]);
  });

  it("warns about missing modules and other versions than the save's", async () => {
    mocks.readStagedModulesAsync.mockResolvedValue(
      stagedMap(staged("a-mod", "A", v(2, 1))),
    );
    mocks.getAllModulesAsync.mockResolvedValue({
      Native: gameModule("Native", v(1, 3)),
    });
    const { api, dialog } = createApi("Cancel");

    await applySaveLoadOrderAsync(
      api,
      save({ Native: v(1, 2), A: v(2), Gone: v(1), "Also Gone": v(1) }),
    );

    const { text } = dialog();
    expect(text).toContain("Warning: not every mod is available");
    expect(text).toContain("Not installed, so left out:\n- Gone\n- Also Gone");
    expect(text).toContain(
      "In other versions than the save's:\n- Native (v1.2.0.0 -> v1.3.0.0)\n- A (v2.0.0.0 -> v2.1.0.0)",
    );
  });

  it("doesn't warn when every module is available in the save's version", async () => {
    mocks.getAllModulesAsync.mockResolvedValue({
      Native: gameModule("Native", v(1)),
    });
    const { api, dialog } = createApi("Cancel");

    await applySaveLoadOrderAsync(
      api,
      save({ Native: v(1) }, { name: "My Save" }),
    );

    expect(dialog().text).not.toContain("Warning");
    expect(dialog().text).toContain("'My Save'");
    expect(dialog().text).toContain("'Main'");
  });

  it("turns on the save's modules first and turns off the profile's others in their order", async () => {
    mocks.getAllModulesAsync.mockResolvedValue({
      Native: gameModule("Native", v(1)),
      Harmony: gameModule("Harmony", v(1)),
    });
    mocks.readProfileLoadOrderOrThrowAsync.mockResolvedValue([
      entry("Other2", 2),
      entry("Harmony", 0, false),
      entry("Other1", 1),
      entry("Native", 3),
    ]);
    const { api } = createApi("Use Load Order");

    await applySaveLoadOrderAsync(api, save({ Harmony: v(1), Native: v(1) }));

    expect(mocks.readProfileLoadOrderOrThrowAsync).toHaveBeenCalledWith(
      api,
      "profile1",
      "singleplayer",
    );
    expect(mocks.writeProfileLoadOrderAsync).toHaveBeenCalledWith(
      api,
      "profile1",
      "singleplayer",
      [
        entry("Harmony", 0),
        entry("Native", 1),
        entry("Other1", 2, false),
        entry("Other2", 3, false),
      ],
    );
    expect(mocks.ensureModsDeployedAsync).toHaveBeenCalledBefore(
      mocks.readProfileLoadOrderOrThrowAsync,
    );
    expect(mocks.reloadLoadOrderAsync).toHaveBeenCalledWith(api);
  });

  it("notifies and fails when the mods can't be enabled", async () => {
    const error = new Error("boom");
    mocks.enableModsAsync.mockRejectedValue(error);
    const { api, showErrorNotification } = createApi("Use Load Order");

    expect(await applySaveLoadOrderAsync(api, save({ Native: v(1) }))).toBe(
      false,
    );
    expect(showErrorNotification).toHaveBeenCalledWith(
      "Failed to use the save's load order",
      error,
    );
    expect(mocks.writeProfileLoadOrderAsync).not.toHaveBeenCalled();
  });
});

describe("createProfileForSaveAsync", () => {
  const defaultName = async (
    options: Partial<ISaveGame>,
    clanName?: string,
  ): Promise<string | undefined> => {
    mocks.getSaveDetailsByNameAsync.mockResolvedValue(
      clanName !== undefined ? { clanName } : {},
    );
    const { api, dialog } = createApi("Cancel");
    await createProfileForSaveAsync(api, save({}, options));
    return dialog().input?.[0]?.value;
  };

  it("names the profile after the hero and the clan read from the save", async () => {
    expect(await defaultName({ characterName: "Arwa" }, "Galend")).toBe(
      "Arwa of Galend",
    );
  });

  it("names the profile after the hero when the clan can't be read", async () => {
    expect(await defaultName({ characterName: "Arwa" })).toBe("Arwa");
  });

  it("names the profile after the save without a hero", async () => {
    expect(
      await defaultName({ name: "Quick", characterName: "" }, "Galend"),
    ).toBe("Quick");
  });

  it("keeps the default name within the profile name limit", async () => {
    expect(await defaultName({ name: "x".repeat(100) })).toBe("x".repeat(64));
  });

  it("asks for a name when it's left empty", async () => {
    const { api, dialog } = createApi("Cancel");
    await createProfileForSaveAsync(api, save({}));
    const { condition, input } = dialog();
    const id = input![0]!.id;

    expect(condition!({ input: [{ id, value: "  " }] })).toHaveLength(1);
    expect(condition!({ input: [{ id, value: "Name" }] })).toEqual([]);
  });

  it("creates nothing when the player cancels", async () => {
    const { api } = createApi("Cancel");

    expect(await createProfileForSaveAsync(api, save({}))).toBe(false);
    expect(mocks.createProfileAsync).not.toHaveBeenCalled();
  });

  it("creates a singleplayer profile with the save's mods and load order, then switches to it", async () => {
    mocks.readStagedModulesAsync.mockResolvedValue(
      stagedMap(staged("harmony-mod", "Harmony", v(1))),
    );
    mocks.getAllModulesAsync.mockResolvedValue({
      Native: gameModule("Native", v(1)),
    });
    mocks.blseMod.mockReturnValue({ id: "blse-mod" });
    mocks.activeProfile.mockReturnValue(
      profile({ "blse-mod": { enabled: true } }),
    );
    const { api, showDialog, dispatch } = createApi("Create Profile");
    showDialog.mockImplementation((_type, _title, content) =>
      Promise.resolve({
        action: "Create Profile",
        input: { [content.input![0]!.id]: "  New Profile  " },
      }),
    );

    const result = await createProfileForSaveAsync(
      api,
      save({ Native: v(1), Harmony: v(1) }, { name: "Campaign" }),
    );

    expect(result).toBe(true);
    expect(mocks.createProfileAsync).toHaveBeenCalledWith(api, "New Profile", {
      [MULTIPLAYER_PROFILE_FEATURE]: false,
    });
    expect(mocks.enableModsAsync).toHaveBeenCalledWith(api, "new-profile", [
      "harmony-mod",
      "blse-mod",
    ]);
    expect(mocks.writeProfileLoadOrderAsync).toHaveBeenCalledWith(
      api,
      "new-profile",
      "singleplayer",
      [entry("Native", 0), entry("Harmony", 1)],
    );
    expect(dispatch).toHaveBeenCalledWith(
      actionsSave.setCurrentSave("new-profile", "Campaign"),
    );
    expect(mocks.switchProfileAsync).toHaveBeenCalledWith(api, "new-profile");
  });

  it("leaves BLSE out when the active profile doesn't use it", async () => {
    mocks.blseMod.mockReturnValue({ id: "blse-mod" });
    mocks.activeProfile.mockReturnValue(
      profile({ "blse-mod": { enabled: false } }),
    );
    const { api } = createApi("Create Profile");

    await createProfileForSaveAsync(api, save({}));

    expect(mocks.enableModsAsync).toHaveBeenCalledWith(api, "new-profile", []);
  });

  it("doesn't notify when the player cancels the profile's creation", async () => {
    const { util } = await import("@nexusmods/vortex-api");
    mocks.createProfileAsync.mockRejectedValue(new util.UserCanceled());
    const { api, showErrorNotification } = createApi("Create Profile");

    expect(await createProfileForSaveAsync(api, save({}))).toBe(false);
    expect(showErrorNotification).not.toHaveBeenCalled();
  });

  it("notifies when the profile can't be created", async () => {
    const error = new Error("boom");
    mocks.createProfileAsync.mockRejectedValue(error);
    const { api, showErrorNotification } = createApi("Create Profile");

    expect(await createProfileForSaveAsync(api, save({}))).toBe(false);
    expect(showErrorNotification).toHaveBeenCalledWith(
      "Failed to create a profile for the save",
      error,
    );
    expect(mocks.switchProfileAsync).not.toHaveBeenCalled();
  });
});
