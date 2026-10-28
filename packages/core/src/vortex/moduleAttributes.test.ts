import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  fillModuleAttributesAsync,
  getRequiredDependencyIds,
  getStoredModuleInfos,
  readModModulesAsync,
} from "./moduleAttributes";
import { GAME_ID, SUB_MODS_INFO_SCHEMA } from "../common";
import { IBannerlordMod } from "../types";

const vortex = vi.hoisted(() => ({
  installPath: undefined as string | undefined,
  dispatched: [] as unknown[][],
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    installPathForGame: () => vortex.installPath,
  });
  Object.assign(api.actions, {
    setModAttribute: (
      gameId: string,
      modId: string,
      key: string,
      value: unknown,
    ) => ({ type: "SET_MOD_ATTRIBUTE", gameId, modId, key, value }),
  });
  Object.assign(api.util, {
    batchDispatch: (_dispatch: unknown, actions: unknown[]) => {
      vortex.dispatched.push(actions);
    },
  });
  return api;
});

// A file in a folder named Unreadable fails to read, like one locked by another program
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readFile: ((file: string, ...rest: [BufferEncoding]) =>
      file.includes("Unreadable")
        ? Promise.reject(new Error("EBUSY"))
        : fs.readFile(file, ...rest)) as typeof fs.readFile,
  };
});

vi.mock("@butr/vortexextensionnative", () => ({
  types: {
    LoadType: {
      None: "None",
      LoadAfterThis: "LoadAfterThis",
      LoadBeforeThis: "LoadBeforeThis",
    },
  },
  BannerlordModuleManager: {
    // The tests' SubModule.xml is only the module id, "invalid" for one the library can't read and
    // "throws" for one it fails on
    getModuleInfo: (xml: string) => {
      if (xml === "throws") {
        throw new Error("corrupt");
      }
      return xml === "invalid"
        ? undefined
        : { id: xml, name: `${xml} name`, version: { major: 1 } };
    },
    getDependenciesAll: (module: { dependencies?: unknown[] }) =>
      module.dependencies ?? [],
  },
}));

const dependency = (
  id: string,
  options: {
    isOptional?: boolean;
    isIncompatible?: boolean;
    loadType?: string;
  },
) => ({
  id,
  isOptional: options.isOptional ?? false,
  isIncompatible: options.isIncompatible ?? false,
  loadType: options.loadType ?? "LoadBeforeThis",
});

describe("getRequiredDependencyIds", () => {
  it("keeps only the modules that have to load with it", () => {
    const module = {
      id: "Mod",
      dependencies: [
        dependency("Bannerlord.Harmony", {}),
        dependency("Native", { loadType: "None" }),
        dependency("Optional", { isOptional: true }),
        dependency("Incompatible", { isIncompatible: true }),
        dependency("LoadsAfter", { loadType: "LoadAfterThis" }),
      ],
    } as unknown as vetypes.ModuleInfoExtended;

    expect(getRequiredDependencyIds(module)).toEqual([
      "Bannerlord.Harmony",
      "Native",
    ]);
  });
});

const mod = (
  id: string,
  attributes?: Record<string, unknown>,
  options: { state?: string; installationPath?: string } = {},
): IBannerlordMod =>
  ({
    id,
    type: "",
    state: options.state ?? "installed",
    installationPath: options.installationPath ?? id,
    ...(attributes !== undefined && { attributes }),
  }) as unknown as IBannerlordMod;

const storedInfo = (ids: string[], schema = SUB_MODS_INFO_SCHEMA) => ({
  schema,
  modules: ids.map((id) => ({
    id,
    name: id,
    version: { major: 1 },
    requiredDependencyIds: [],
  })),
});

describe("getStoredModuleInfos", () => {
  it("gives the stored entries only when they are in the current shape", () => {
    const info = storedInfo(["A"]);

    expect(getStoredModuleInfos(mod("m", { subModsInfo: info }))).toBe(
      info.modules,
    );
    expect(
      getStoredModuleInfos(
        mod("m", { subModsInfo: storedInfo(["A"], SUB_MODS_INFO_SCHEMA - 1) }),
      ),
    ).toBeUndefined();
    expect(getStoredModuleInfos(mod("m", {}))).toBeUndefined();
    expect(getStoredModuleInfos(mod("m"))).toBeUndefined();
  });
});

describe("staging folder", () => {
  let staging: string;

  beforeEach(async () => {
    staging = await mkdtemp(path.join(os.tmpdir(), "bannerlord-staging-"));
    vortex.installPath = staging;
    vortex.dispatched = [];
  });

  afterEach(async () => {
    await rm(staging, { recursive: true, force: true });
  });

  const writeSubModule = async (
    modFolder: string,
    moduleFolder: string,
    content: string,
  ): Promise<void> => {
    const folder = path.join(staging, modFolder, "Modules", moduleFolder);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "SubModule.xml"), content);
  };

  describe("readModModulesAsync", () => {
    it("reads every module of the mod once", async () => {
      await writeSubModule("pack", "A", "A");
      await writeSubModule("pack", "B", "B");
      await writeSubModule("pack", "ACopy", "A");
      await writeSubModule("pack", "Broken", "invalid");

      const { modules, complete } = await readModModulesAsync(
        staging,
        mod("pack"),
      );

      expect(modules.map((module) => module.id).sort()).toEqual(["A", "B"]);
      expect(complete).toBe(true);
    });

    it("is incomplete when a SubModule.xml can't be read", async () => {
      await writeSubModule("pack", "A", "A");
      await writeSubModule("pack", "Unreadable", "B");

      const { modules, complete } = await readModModulesAsync(
        staging,
        mod("pack"),
      );

      expect(complete).toBe(false);
      expect(modules.map((module) => module.id)).toEqual(["A"]);
    });

    it("finds nothing for a mod without a folder", async () => {
      expect(await readModModulesAsync(staging, mod("missing"))).toEqual({
        modules: [],
        complete: true,
      });
    });
  });

  describe("fillModuleAttributesAsync", () => {
    const apiWith = (mods: Record<string, IBannerlordMod>) =>
      ({
        getState: () => ({ persistent: { mods: { [GAME_ID]: mods } } }),
        store: { dispatch: () => undefined },
      }) as unknown as types.IExtensionApi;

    const updates = () =>
      vortex.dispatched.flat() as {
        modId: string;
        key: string;
        value: unknown;
      }[];

    it("records the module ids and entries of a mod installed without them", async () => {
      await writeSubModule("fomod", "A", "A");
      await writeSubModule("fomod", "B", "B");

      await fillModuleAttributesAsync(apiWith({ fomod: mod("fomod", {}) }));

      expect(vortex.dispatched).toHaveLength(1);
      const [ids, info] = updates();
      expect(ids).toMatchObject({ modId: "fomod", key: "subModsIds" });
      expect((ids?.value as string[]).sort()).toEqual(["A", "B"]);
      expect(info).toMatchObject({ modId: "fomod", key: "subModsInfo" });
      expect(info?.value).toMatchObject({ schema: SUB_MODS_INFO_SCHEMA });
    });

    it("keeps the recorded ids and stores entries only for those modules", async () => {
      await writeSubModule("mod", "A", "A");
      await writeSubModule("mod", "Extra", "Extra");

      await fillModuleAttributesAsync(
        apiWith({ mod: mod("mod", { subModsIds: ["A"] }) }),
      );

      const [info, ...rest] = updates();
      expect(rest).toEqual([]);
      expect(info?.key).toBe("subModsInfo");
      expect(
        (info?.value as { modules: { id: string }[] }).modules.map(
          (module) => module.id,
        ),
      ).toEqual(["A"]);
    });

    it("stores empty entries for a mod without modules, so it isn't read again", async () => {
      await mkdir(path.join(staging, "blse", "bin"), { recursive: true });

      await fillModuleAttributesAsync(apiWith({ blse: mod("blse", {}) }));

      expect(updates()).toEqual([
        expect.objectContaining({
          key: "subModsInfo",
          value: { schema: SUB_MODS_INFO_SCHEMA, modules: [] },
        }),
      ]);
    });

    it("skips mods that are complete, not installed, or without a folder", async () => {
      await writeSubModule("done", "A", "A");
      await writeSubModule("installing", "B", "B");

      await fillModuleAttributesAsync(
        apiWith({
          done: mod("done", {
            subModsIds: ["A"],
            subModsInfo: storedInfo(["A"]),
          }),
          installing: mod("installing", {}, { state: "installing" }),
          noFolder: mod("noFolder", {}, { installationPath: "" }),
        }),
      );

      expect(vortex.dispatched).toEqual([]);
    });

    it("with idsOnly, reads only mods without module ids", async () => {
      await writeSubModule("withIds", "A", "A");
      await writeSubModule("withoutIds", "B", "B");

      await fillModuleAttributesAsync(
        apiWith({
          withIds: mod("withIds", { subModsIds: ["A"] }),
          withoutIds: mod("withoutIds", {}),
        }),
        { idsOnly: true },
      );

      expect(new Set(updates().map((update) => update.modId))).toEqual(
        new Set(["withoutIds"]),
      );
    });

    it("reads only the mods asked for", async () => {
      await writeSubModule("a", "A", "A");
      await writeSubModule("b", "B", "B");

      await fillModuleAttributesAsync(
        apiWith({ a: mod("a", {}), b: mod("b", {}) }),
        { modIds: ["b"] },
      );

      expect(new Set(updates().map((update) => update.modId))).toEqual(
        new Set(["b"]),
      );
    });

    it("keeps nothing for a mod with a SubModule.xml it couldn't read", async () => {
      await writeSubModule("mod", "A", "A");
      await writeSubModule("mod", "Unreadable", "B");

      await fillModuleAttributesAsync(apiWith({ mod: mod("mod", {}) }));

      expect(vortex.dispatched).toEqual([]);
    });

    it("keeps reading the other mods when one of them fails to read", async () => {
      await writeSubModule("corrupt", "A", "throws");
      await writeSubModule("fine", "B", "B");

      await fillModuleAttributesAsync(
        apiWith({ corrupt: mod("corrupt", {}), fine: mod("fine", {}) }),
      );

      expect(new Set(updates().map((update) => update.modId))).toEqual(
        new Set(["fine"]),
      );
    });

    it("does nothing without a staging folder", async () => {
      vortex.installPath = undefined;

      await fillModuleAttributesAsync(apiWith({ mod: mod("mod", {}) }));

      expect(vortex.dispatched).toEqual([]);
    });
  });
});
