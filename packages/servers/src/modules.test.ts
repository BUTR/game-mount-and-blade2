import { describe, expect, it, vi } from "vitest";
import { types as vetypes } from "@butr/vortexextensionnative";
import { ILobbyModule } from "@bannerlord/lobby";
import { IServerExtensionInfo } from "@bannerlord/server-query/extension";
import { IModuleCache } from "@bannerlord/core/types";
import {
  checkClientModules,
  getClientModuleRequirements,
  getNexusModsUrl,
  IClientModuleRequirement,
  isOptionalLobbyModule,
} from "./modules";

vi.mock("@butr/vortexextensionnative", () => ({
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
}));

const VERSION_TYPES: Record<string, string> = {
  a: "Alpha",
  b: "Beta",
  e: "EarlyAccess",
  v: "Release",
  d: "Development",
};

/**
 * "v1.2.3.4" as the native module describes it
 */
const version = (text: string): vetypes.ApplicationVersion => {
  const [major = 0, minor = 0, revision = 0, changeSet = 0] = text
    .slice(1)
    .split(".")
    .map(Number);
  return {
    applicationVersionType: VERSION_TYPES[
      text[0] ?? "v"
    ] as vetypes.ApplicationVersionType,
    major,
    minor,
    revision,
    changeSet,
  };
};

const installed = (modules: Record<string, string>): IModuleCache =>
  Object.fromEntries(
    Object.entries(modules).map(([id, text]) => [
      id,
      { id, name: id, version: version(text) },
    ]),
  ) as unknown as IModuleCache;

const staged = (modules: Record<string, string[]>) => ({
  get: (id: string) =>
    modules[id]?.map((text) => ({ module: { version: version(text) } })),
});

const lobbyModule = (
  Id: string,
  Version: string,
  options: { Name?: string; Category?: number } = {},
): ILobbyModule => ({
  Id,
  Name: options.Name ?? "",
  Version,
  Category: options.Category ?? 0,
});

const extension = (
  clientModules: Partial<IServerExtensionInfo["clientModules"][number]>[],
): IServerExtensionInfo => ({
  schemaVersion: 1,
  description: null,
  links: [],
  serverModules: [],
  clientModules: clientModules.map((module) => ({
    id: "",
    name: null,
    version: null,
    required: true,
    nexusMods: null,
    url: null,
    ...module,
  })),
  collection: null,
});

const requirement = (
  id: string,
  requiredVersion: string | null,
): IClientModuleRequirement => ({
  id,
  name: id,
  version: requiredVersion,
  required: true,
  fromLobby: true,
  nexusMods: null,
  url: null,
});

describe("getNexusModsUrl", () => {
  it("links the mod page, or its file when the file is known", () => {
    expect(getNexusModsUrl({ modId: 2006, fileId: null })).toBe(
      "https://www.nexusmods.com/mountandblade2bannerlord/mods/2006",
    );
    expect(getNexusModsUrl({ modId: 2006, fileId: 77 })).toBe(
      "https://www.nexusmods.com/mountandblade2bannerlord/mods/2006?tab=files&file_id=77",
    );
  });
});

describe("isOptionalLobbyModule", () => {
  it("is optional only for the MultiplayerOptional category", () => {
    expect(
      isOptionalLobbyModule(lobbyModule("A", "v1.0.0.0", { Category: 2 })),
    ).toBe(true);
    expect(
      isOptionalLobbyModule(lobbyModule("A", "v1.0.0.0", { Category: 1 })),
    ).toBe(false);
  });
});

describe("getClientModuleRequirements", () => {
  it("is empty when neither the lobby nor the extension lists modules", () => {
    expect(getClientModuleRequirements(null, null)).toEqual([]);
  });

  it("takes the lobby's modules with normalized versions", () => {
    expect(
      getClientModuleRequirements(
        [
          lobbyModule("Bannerlord.Harmony", "v2.3.3", { Name: "Harmony" }),
          lobbyModule("Odd.Version", "1.0-beta"),
          lobbyModule("Optional.Mod", "v1.0.0.0", { Category: 2 }),
        ],
        null,
      ),
    ).toEqual([
      {
        id: "Bannerlord.Harmony",
        name: "Harmony",
        version: "v2.3.3.0",
        required: true,
        fromLobby: true,
        nexusMods: null,
        url: null,
      },
      {
        id: "Odd.Version",
        name: "Odd.Version",
        version: "1.0-beta",
        required: true,
        fromLobby: true,
        nexusMods: null,
        url: null,
      },
      {
        id: "Optional.Mod",
        name: "Optional.Mod",
        version: "v1.0.0.0",
        required: false,
        fromLobby: true,
        nexusMods: null,
        url: null,
      },
    ]);
  });

  it("keeps the lobby's version and requirement over the extension's, adding its download links", () => {
    const [harmony] = getClientModuleRequirements(
      [lobbyModule("Bannerlord.Harmony", "v2.3.3.0", { Category: 2 })],
      extension([
        {
          id: "Bannerlord.Harmony",
          name: "Harmony",
          version: "v9.9.9.0",
          required: true,
          nexusMods: { modId: 2006, fileId: null },
          url: "https://example.com/harmony",
        },
      ]),
    );

    expect(harmony).toEqual({
      id: "Bannerlord.Harmony",
      name: "Harmony",
      version: "v2.3.3.0",
      required: false,
      fromLobby: true,
      nexusMods: { modId: 2006, fileId: null },
      url: "https://example.com/harmony",
    });
  });

  it("adds the modules only the extension lists, after the lobby's", () => {
    const requirements = getClientModuleRequirements(
      [lobbyModule("A", "v1.0.0.0")],
      extension([
        { id: "ClientOnly", version: "v1.1.0.0", required: false },
        { id: "A" },
        { id: "Unnamed" },
      ]),
    );

    expect(
      requirements.map(({ id, name, version, required, fromLobby }) => ({
        id,
        name,
        version,
        required,
        fromLobby,
      })),
    ).toEqual([
      {
        id: "A",
        name: "A",
        version: "v1.0.0.0",
        required: true,
        fromLobby: true,
      },
      {
        id: "ClientOnly",
        name: "ClientOnly",
        version: "v1.1.0.0",
        required: false,
        fromLobby: false,
      },
      {
        id: "Unnamed",
        name: "Unnamed",
        version: null,
        required: true,
        fromLobby: false,
      },
    ]);
  });
});

describe("checkClientModules", () => {
  it("is installed when the deployed module has the exact version", () => {
    const [status] = checkClientModules(
      [requirement("A", "v1.2.3.0")],
      installed({ A: "v1.2.3.0" }),
    );

    expect(status).toMatchObject({
      state: "installed",
      localVersion: "v1.2.3.0",
    });
  });

  it("accepts any version when the server names none", () => {
    expect(
      checkClientModules(
        [requirement("A", null)],
        installed({ A: "e0.0.1.0" }),
      )[0]?.state,
    ).toBe("installed");
  });

  it("compares the version type too", () => {
    expect(
      checkClientModules(
        [requirement("A", "v1.2.3.0")],
        installed({ A: "e1.2.3.0" }),
      )[0],
    ).toMatchObject({ state: "different-version", localVersion: "e1.2.3.0" });
  });

  it("is in Vortex when a mod not deployed has the version", () => {
    const [status] = checkClientModules(
      [requirement("A", "v1.2.3.0")],
      installed({ A: "v1.0.0.0" }),
      staged({ A: ["v1.1.0.0", "v1.2.3.0"] }),
    );

    expect(status).toMatchObject({
      state: "in-vortex",
      localVersion: "v1.0.0.0",
    });
  });

  it("is a different version when Vortex has none in the version either", () => {
    expect(
      checkClientModules(
        [requirement("A", "v1.2.3.0")],
        installed({ A: "v1.0.0.0" }),
        staged({ A: ["v1.1.0.0"] }),
      )[0]?.state,
    ).toBe("different-version");
  });

  it("is missing when neither the game nor Vortex has it", () => {
    expect(
      checkClientModules(
        [requirement("A", "v1.0.0.0")],
        installed({}),
        staged({}),
      )[0],
    ).toMatchObject({ state: "missing", localVersion: null });
    expect(
      checkClientModules(
        [requirement("A", "v1.0.0.0")],
        installed({}),
        staged({ A: ["v1.0.0.0"] }),
      )[0]?.state,
    ).toBe("in-vortex");
  });

  it("treats modules Vortex has but doesn't deploy as missing without the staged modules", () => {
    expect(
      checkClientModules([requirement("A", "v1.0.0.0")], installed({}))[0]
        ?.state,
    ).toBe("missing");
  });
});
