import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchBannerlordVersion } from "@butr/vortexextensionnative";
import { getBuildVersionAsync as getRegistryVersionAsync } from "@bannerlord/build-versions";
import { getBuildVersionAsync, getInstalledVersion } from "./buildVersions";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  util: { getVortexPath: () => path.join("C:", "Vortex") },
}));
vi.mock("@butr/vortexextensionnative", () => ({
  FetchBannerlordVersion: {
    getVersion: vi.fn(),
    getChangeSet: vi.fn(),
  },
}));
vi.mock("@bannerlord/build-versions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBuildVersionAsync: vi.fn(() => Promise.resolve("v1.4.8.119303")),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getBuildVersionAsync", () => {
  it("looks Steam and GOG builds up in the registry kept in Vortex's data", async () => {
    expect(await getBuildVersionAsync("steam", "19012345")).toBe(
      "v1.4.8.119303",
    );
    expect(await getBuildVersionAsync("gog", "5555")).toBe("v1.4.8.119303");

    const cachePath = path.join(
      "C:",
      "Vortex",
      "mountandblade2bannerlord",
      "build-versions.json",
    );
    expect(getRegistryVersionAsync).toHaveBeenNthCalledWith(
      1,
      "steam",
      "19012345",
      {
        cachePath,
      },
    );
    expect(getRegistryVersionAsync).toHaveBeenNthCalledWith(2, "gog", "5555", {
      cachePath,
    });
  });

  it("doesn't look Epic and Xbox builds up, the registry doesn't have them", async () => {
    expect(await getBuildVersionAsync("epic", "1.2.3.4")).toBe(undefined);
    expect(await getBuildVersionAsync("xbox", "1.0.51.0")).toBe(undefined);
    expect(getRegistryVersionAsync).not.toHaveBeenCalled();
  });
});

describe("getInstalledVersion", () => {
  it("reads the version and changeset of the game's library", () => {
    vi.mocked(FetchBannerlordVersion.getVersion).mockReturnValue("v1.4.8");
    vi.mocked(FetchBannerlordVersion.getChangeSet).mockReturnValue(119303);

    expect(getInstalledVersion("C:\\Game")).toBe("v1.4.8.119303");
    expect(FetchBannerlordVersion.getVersion).toHaveBeenCalledWith(
      "C:\\Game",
      "TaleWorlds.Library.dll",
    );
  });

  it("is undefined when the library doesn't tell it", () => {
    vi.mocked(FetchBannerlordVersion.getVersion).mockReturnValue("");
    vi.mocked(FetchBannerlordVersion.getChangeSet).mockReturnValue(119303);
    expect(getInstalledVersion("C:\\Game")).toBe(undefined);

    vi.mocked(FetchBannerlordVersion.getVersion).mockReturnValue("v1.4.8");
    vi.mocked(FetchBannerlordVersion.getChangeSet).mockReturnValue(0);
    expect(getInstalledVersion("C:\\Game")).toBe(undefined);
  });

  it("is undefined when the library can't be read", () => {
    vi.mocked(FetchBannerlordVersion.getVersion).mockImplementation(() => {
      throw new Error("not found");
    });

    expect(getInstalledVersion("C:\\Game")).toBe(undefined);
  });
});
