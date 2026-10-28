import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  getUnmanagedModules,
  IStagedModule,
  pickStagedModule,
  readStagedModulesAsync,
} from "./stagedModules";
import { SUB_MODS_INFO_SCHEMA } from "../common";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IModuleCache,
  IStagedModuleInfo,
} from "../types";

vi.mock("@butr/vortexextensionnative", () => {
  type Version = {
    major: number;
    minor: number;
    revision: number;
    changeSet: number;
  };
  const parts = (v: Version): number[] => [
    v.major,
    v.minor,
    v.revision,
    v.changeSet,
  ];
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
      LoadType: { LoadAfterThis: "LoadAfterThis" },
    },
    BannerlordModuleManager: {
      // The tests' SubModule.xml is "<id>@<major>"
      getModuleInfo: (xml: string) => {
        const [id, major] = xml.split("@");
        return {
          id,
          name: id,
          version: {
            applicationVersionType: "Release",
            major: Number(major ?? 1),
            minor: 0,
            revision: 0,
            changeSet: 0,
          },
        };
      },
      getDependenciesAll: () => [],
      compareVersions: (x: Version, y: Version): number => {
        const a = parts(x);
        const b = parts(y);
        const i = a.findIndex((part, index) => part !== b[index]);
        return i === -1 ? 0 : Math.sign(a[i]! - b[i]!);
      },
    },
  };
});

const version = (major: number, minor = 0, revision = 0) => ({
  applicationVersionType: "Release",
  major,
  minor,
  revision,
  changeSet: 0,
});

const info = (id: string, major = 1, minor = 0): IStagedModuleInfo =>
  ({
    id,
    name: id,
    version: version(major, minor),
    requiredDependencyIds: [],
  }) as unknown as IStagedModuleInfo;

const mod = (
  id: string,
  attributes: Record<string, unknown>,
  state = "installed",
): IBannerlordMod =>
  ({
    id,
    type: "",
    state,
    installationPath: id,
    attributes,
  }) as unknown as IBannerlordMod;

const ids = (staged: Map<string, IStagedModule[]>) =>
  Object.fromEntries(
    [...staged].map(([moduleId, entries]) => [
      moduleId,
      entries.map((entry) => entry.modId),
    ]),
  );

describe("readStagedModulesAsync", () => {
  let staging: string;

  beforeEach(async () => {
    staging = await mkdtemp(path.join(os.tmpdir(), "bannerlord-staged-"));
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

  it("uses the stored module entries of the mod's module ids", async () => {
    const mods: IBannerlordModStorage = {
      harmony: mod("harmony", {
        subModsIds: ["Bannerlord.Harmony"],
        subModsInfo: {
          schema: SUB_MODS_INFO_SCHEMA,
          modules: [info("Bannerlord.Harmony"), info("Stale")],
        },
      }),
    };

    const staged = await readStagedModulesAsync(staging, mods);

    expect(ids(staged)).toEqual({ "Bannerlord.Harmony": ["harmony"] });
  });

  it("lists every mod that provides a module", async () => {
    const stored = (id: string, major: number) =>
      mod(id, {
        subModsIds: ["Bannerlord.Harmony"],
        subModsInfo: {
          schema: SUB_MODS_INFO_SCHEMA,
          modules: [info("Bannerlord.Harmony", major)],
        },
      });

    const staged = await readStagedModulesAsync(staging, {
      old: stored("old", 2),
      new: stored("new", 3),
    });

    expect(ids(staged)).toEqual({ "Bannerlord.Harmony": ["old", "new"] });
  });

  it("skips mods that aren't installed or have no modules", async () => {
    const stored = {
      schema: SUB_MODS_INFO_SCHEMA,
      modules: [info("A")],
    };

    const staged = await readStagedModulesAsync(staging, {
      installing: mod(
        "installing",
        { subModsIds: ["A"], subModsInfo: stored },
        "installing",
      ),
      blse: mod("blse", { subModsInfo: stored }),
    });

    expect(staged.size).toBe(0);
  });

  it("reads the staging folder for mods without stored entries, keeping only their module ids", async () => {
    await writeSubModule("pack", "A", "A@1");
    await writeSubModule("pack", "Extra", "Extra@1");

    const staged = await readStagedModulesAsync(staging, {
      pack: mod("pack", { subModsIds: ["A"] }),
    });

    expect(ids(staged)).toEqual({ A: ["pack"] });
    expect(staged.get("A")?.[0]?.module.version).toMatchObject({ major: 1 });
  });

  it("reads the staging folder for stored entries in an older shape", async () => {
    await writeSubModule("pack", "A", "A@2");

    const staged = await readStagedModulesAsync(staging, {
      pack: mod("pack", {
        subModsIds: ["A"],
        subModsInfo: {
          schema: SUB_MODS_INFO_SCHEMA - 1,
          modules: [info("A", 1)],
        },
      }),
    });

    expect(ids(staged)).toEqual({ A: ["pack"] });
    expect(staged.get("A")?.[0]?.module.version.major).toBe(2);
  });

  it("reads a mod's folder again once it is installed again", async () => {
    await writeSubModule("reinstalled", "A", "A@1");
    const first = await readStagedModulesAsync(staging, {
      reinstalled: mod("reinstalled", { subModsIds: ["A"], installTime: 1 }),
    });
    await writeSubModule("reinstalled", "A", "A@2");

    const cached = await readStagedModulesAsync(staging, {
      reinstalled: mod("reinstalled", { subModsIds: ["A"], installTime: 1 }),
    });
    const reread = await readStagedModulesAsync(staging, {
      reinstalled: mod("reinstalled", { subModsIds: ["A"], installTime: 2 }),
    });

    expect(first.get("A")?.[0]?.module.version.major).toBe(1);
    expect(cached.get("A")?.[0]?.module.version.major).toBe(1);
    expect(reread.get("A")?.[0]?.module.version.major).toBe(2);
  });
});

describe("getUnmanagedModules", () => {
  it("keeps the deployed modules no mod provides", () => {
    const deployed = {
      Native: { id: "Native" },
      "Bannerlord.Harmony": { id: "Bannerlord.Harmony" },
      ManualMod: { id: "ManualMod" },
    } as unknown as IModuleCache;
    const mods = {
      harmony: mod("harmony", { subModsIds: ["Bannerlord.Harmony"] }),
      disabled: mod("disabled", { subModsIds: ["Other"] }),
      noIds: mod("noIds", {}),
    };

    expect(Object.keys(getUnmanagedModules(deployed, mods))).toEqual([
      "Native",
      "ManualMod",
    ]);
  });
});

describe("pickStagedModule", () => {
  const candidate = (modId: string, major: number, minor = 0) => ({
    modId,
    module: info("Bannerlord.Harmony", major, minor),
  });

  it("picks the mod with the version asked for", () => {
    const candidates = [candidate("a", 2, 3), candidate("b", 2, 4)];

    expect(pickStagedModule(candidates, "v2.3.0.0")?.modId).toBe("a");
    expect(pickStagedModule(candidates, "v9.0.0.0")).toBeUndefined();
  });

  it("picks the newest version when any version does", () => {
    const candidates = [
      candidate("old", 2, 3),
      candidate("newest", 2, 10),
      candidate("middle", 2, 4),
    ];

    expect(pickStagedModule(candidates, null)?.modId).toBe("newest");
  });

  it("keeps the first of equal versions", () => {
    expect(
      pickStagedModule([candidate("first", 1), candidate("second", 1)], null)
        ?.modId,
    ).toBe("first");
  });

  it("finds nothing without candidates", () => {
    expect(pickStagedModule([], null)).toBeUndefined();
  });
});
