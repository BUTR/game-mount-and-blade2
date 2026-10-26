import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type BuildVersions = typeof import("./index");

const REGISTRY = {
  builds: [
    { version: "v1.2.12", changeSet: 98765, steam: [15000000], gog: ["5555"] },
    {
      version: "v1.4.8",
      changeSet: 119303,
      steam: [19012345, 19012346],
      gog: ["7777"],
    },
  ],
};

const NEWER_REGISTRY = {
  builds: [
    ...REGISTRY.builds,
    { version: "v1.5.0", changeSet: 120000, steam: [20000000] },
  ],
};

const respond = (body: unknown, ok = true): Response =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

describe("formatVersion", () => {
  it("appends the changeset to the version", async () => {
    const { formatVersion } = await import("./index");

    expect(formatVersion("v1.4.8", 119303)).toBe("v1.4.8.119303");
  });
});

describe("getBuildVersionAsync", () => {
  let root: string;
  let cachePath: string;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  // Fresh per test, the registry is kept in the module
  let buildVersions: BuildVersions;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "build-versions-"));
    cachePath = path.join(root, "cache", "build-versions.json");
    fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond(REGISTRY)));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    buildVersions = await import("./index");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeCacheAsync = async (content: unknown): Promise<void> => {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(
      cachePath,
      typeof content === "string" ? content : JSON.stringify(content),
    );
  };

  it("finds a Steam build by its numeric id in the cache, without downloading", async () => {
    await writeCacheAsync(REGISTRY);

    expect(
      await buildVersions.getBuildVersionAsync("steam", "19012346", {
        cachePath,
      }),
    ).toBe("v1.4.8.119303");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds a GOG build by its id", async () => {
    await writeCacheAsync(REGISTRY);

    expect(
      await buildVersions.getBuildVersionAsync("gog", "5555", { cachePath }),
    ).toBe("v1.2.12.98765");
  });

  it("doesn't match a build id of another store", async () => {
    await writeCacheAsync(REGISTRY);
    fetchMock.mockResolvedValue(respond(REGISTRY));

    expect(
      await buildVersions.getBuildVersionAsync("gog", "19012345", {
        cachePath,
      }),
    ).toBe(undefined);
    expect(
      await buildVersions.getBuildVersionAsync("steam", "5555", { cachePath }),
    ).toBe(undefined);
  });

  it("downloads the registry for a build the cache doesn't have, and keeps it in the cache", async () => {
    await writeCacheAsync(REGISTRY);
    fetchMock.mockResolvedValue(respond(NEWER_REGISTRY));

    expect(
      await buildVersions.getBuildVersionAsync("steam", "20000000", {
        cachePath,
      }),
    ).toBe("v1.5.0.120000");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/BUTR\//,
    );
    expect(JSON.parse(await fs.readFile(cachePath, "utf8"))).toEqual(
      NEWER_REGISTRY,
    );
  });

  it("downloads the registry without a cache file", async () => {
    expect(
      await buildVersions.getBuildVersionAsync("steam", "15000000", {
        cachePath,
      }),
    ).toBe("v1.2.12.98765");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a broken cache file", async () => {
    await writeCacheAsync("{ broken");

    expect(
      await buildVersions.getBuildVersionAsync("steam", "15000000", {
        cachePath,
      }),
    ).toBe("v1.2.12.98765");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a cache file of another shape", async () => {
    await writeCacheAsync({ links: [] });

    await buildVersions.getBuildVersionAsync("steam", "15000000", {
      cachePath,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks GitHub again for an unknown build only after a while", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000_000);
    await writeCacheAsync(REGISTRY);

    const lookUp = (): Promise<string | undefined> =>
      buildVersions.getBuildVersionAsync("steam", "99999999", { cachePath });

    expect(await lookUp()).toBe(undefined);
    expect(await lookUp()).toBe(undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.mockReturnValue(10_000_000 + 5 * 60 * 1000 + 1);
    fetchMock.mockResolvedValue(
      respond({
        builds: [{ version: "v9", changeSet: 1, steam: [99999999] }],
      }),
    );

    expect(await lookUp()).toBe("v9.1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("downloads once for lookups at the same time", async () => {
    await writeCacheAsync(REGISTRY);
    fetchMock.mockResolvedValue(respond(NEWER_REGISTRY));

    const results = await Promise.all([
      buildVersions.getBuildVersionAsync("steam", "20000000", { cachePath }),
      buildVersions.getBuildVersionAsync("steam", "20000000", { cachePath }),
    ]);

    expect(results).toEqual(["v1.5.0.120000", "v1.5.0.120000"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached registry when the download fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000_000);
    await writeCacheAsync(REGISTRY);
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    expect(
      await buildVersions.getBuildVersionAsync("steam", "20000000", {
        cachePath,
      }),
    ).toBe(undefined);
    expect(
      await buildVersions.getBuildVersionAsync("steam", "15000000", {
        cachePath,
      }),
    ).toBe("v1.2.12.98765");
    expect(JSON.parse(await fs.readFile(cachePath, "utf8"))).toEqual(REGISTRY);
  });

  it("doesn't cache a failed or malformed response", async () => {
    fetchMock.mockResolvedValueOnce(respond(REGISTRY, false));

    expect(
      await buildVersions.getBuildVersionAsync("steam", "15000000", {
        cachePath,
      }),
    ).toBe(undefined);

    vi.resetModules();
    buildVersions = await import("./index");
    fetchMock.mockResolvedValueOnce(respond({ builds: "nope" }));

    expect(
      await buildVersions.getBuildVersionAsync("steam", "15000000", {
        cachePath,
      }),
    ).toBe(undefined);
    await expect(fs.access(cachePath)).rejects.toThrow();
  });
});
