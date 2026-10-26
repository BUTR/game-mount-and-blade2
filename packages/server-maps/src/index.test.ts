import { EventEmitter } from "events";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "http";
import { IServerMap } from "@bannerlord/server-query/types";
import {
  downloadServerMapAsync,
  getDownloadedMaps,
  getDownloadedMapsPath,
  getFolderSizeAsync,
  getServerMapStatuses,
  ILocalScene,
  IMapArchiveEntry,
  IMapArchiver,
  IMapDownloadProgress,
  InvalidMapError,
  isValidMapName,
  LocalScenes,
  matchesServerMap,
  NotDownloadedMapError,
  parseSceneHeader,
  readDownloadedScenesAsync,
  readLocalScenesAsync,
  removeDownloadedMapAsync,
  withDownloadedScenes,
} from "./index";

vi.mock("http", () => ({ get: vi.fn() }));

const SERVER = { address: "203.0.113.7", port: 7210 };

const serverMap = (
  name: string,
  uniqueToken: string | null = null,
  revision: string | null = null,
): IServerMap => ({ name, uniqueToken, revision });

const scene = (
  name: string,
  module: string,
  uniqueToken: string | null = null,
  revision: string | null = null,
): ILocalScene => ({
  name,
  module,
  path: path.join("C:\\Game\\Modules", module, "SceneObj", name),
  uniqueToken,
  revision,
});

const scenesOf = (...scenes: ILocalScene[]): LocalScenes => {
  const map: LocalScenes = new Map();
  for (const entry of scenes) {
    const key = entry.name.toLowerCase();
    map.set(key, [...(map.get(key) ?? []), entry]);
  }
  return map;
};

const sceneXml = (attributes: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<scene ${attributes}>\n  <entities />\n</scene>`;

describe("isValidMapName", () => {
  it("accepts the names the map server accepts", () => {
    expect(isValidMapName("mp_custom_Map_01")).toBe(true);
    expect(isValidMapName("a".repeat(64))).toBe(true);
  });

  it.each([[""], ["a".repeat(65)], ["../evil"], ["map name"], ["map.zip"]])(
    "rejects %j",
    (name) => {
      expect(isValidMapName(name)).toBe(false);
    },
  );
});

describe("parseSceneHeader", () => {
  it("reads the identifiers on the root scene element", () => {
    expect(
      parseSceneHeader(
        sceneXml('name="my_map" unique_token="abc-123" revision="7"'),
      ),
    ).toEqual({ uniqueToken: "abc-123", revision: "7" });
  });

  it("gives null identifiers for an official scene without them", () => {
    expect(parseSceneHeader(sceneXml('name="mp_battle_map_001"'))).toEqual({
      uniqueToken: null,
      revision: null,
    });
  });

  it("doesn't mistake attributes that only end with the name", () => {
    expect(
      parseSceneHeader(sceneXml('old_revision="1" xunique_token="t"')),
    ).toEqual({ uniqueToken: null, revision: null });
  });

  it("ignores elements that only start with scene", () => {
    expect(parseSceneHeader('<scene_obj unique_token="t">')).toBeNull();
    expect(parseSceneHeader("not a scene")).toBeNull();
  });
});

describe("matchesServerMap", () => {
  it("matches by name alone when the server's map has no token", () => {
    expect(
      matchesServerMap(serverMap("m"), { uniqueToken: "x", revision: "1" }),
    ).toBe(true);
  });

  it("needs both token and revision to match otherwise", () => {
    const map = serverMap("m", "token", "2");

    expect(matchesServerMap(map, { uniqueToken: "token", revision: "2" })).toBe(
      true,
    );
    expect(matchesServerMap(map, { uniqueToken: "token", revision: "1" })).toBe(
      false,
    );
    expect(matchesServerMap(map, { uniqueToken: null, revision: null })).toBe(
      false,
    );
  });
});

describe("getServerMapStatuses", () => {
  it("is missing without a local scene of that name", () => {
    expect(getServerMapStatuses([serverMap("m")], null)).toEqual([
      { map: serverMap("m"), state: "missing", local: [] },
    ]);
    expect(
      getServerMapStatuses(
        [serverMap("m")],
        scenesOf(scene("other", "Native")),
      )[0]?.state,
    ).toBe("missing");
  });

  it("looks scenes up case-insensitively, as the game does", () => {
    const local = scenesOf(scene("My_Map", "Multiplayer", "t", "1"));

    expect(
      getServerMapStatuses([serverMap("my_map", "t", "1")], local)[0]?.state,
    ).toBe("installed");
  });

  it("is installed when any local copy matches", () => {
    const local = scenesOf(
      scene("m", "SomeMod", "t", "1"),
      scene("m", "Multiplayer", "t", "2"),
    );

    expect(
      getServerMapStatuses([serverMap("m", "t", "2")], local)[0]?.state,
    ).toBe("installed");
  });

  it("is outdated when only a downloaded copy differs", () => {
    const local = scenesOf(scene("m", "Multiplayer", "t", "1"));

    expect(
      getServerMapStatuses([serverMap("m", "t", "2")], local)[0]?.state,
    ).toBe("outdated");
  });

  it("is a conflict when another module provides a different version", () => {
    const local = scenesOf(
      scene("m", "Multiplayer", "t", "1"),
      scene("m", "SomeMod", "t", "1"),
    );

    expect(
      getServerMapStatuses([serverMap("m", "t", "2")], local)[0]?.state,
    ).toBe("conflict");
  });
});

describe("withDownloadedScenes", () => {
  it("replaces the downloaded scenes and keeps the other modules' scenes", () => {
    const local = scenesOf(
      scene("old", "Multiplayer"),
      scene("shared", "Multiplayer"),
      scene("shared", "Native"),
    );

    const result = withDownloadedScenes(local, [scene("new", "Multiplayer")]);

    expect([...result.keys()].sort()).toEqual(["new", "shared"]);
    expect(result.get("shared")?.map((x) => x.module)).toEqual(["Native"]);
    expect(local.has("old")).toBe(true);
  });

  it("works before the local scenes were read", () => {
    expect(
      withDownloadedScenes(null, [scene("A", "Multiplayer")]).get("a"),
    ).toHaveLength(1);
  });
});

describe("getDownloadedMaps", () => {
  it("lists only the download cache's scenes, sorted by name", () => {
    const local = scenesOf(
      scene("zeta", "Multiplayer"),
      scene("alpha", "multiplayer"),
      scene("beta", "Native"),
    );

    expect(getDownloadedMaps(local).map((x) => x.name)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(getDownloadedMaps(null)).toEqual([]);
  });
});

describe("with a game folder", () => {
  let gamePath: string;

  beforeEach(async () => {
    gamePath = await fs.mkdtemp(path.join(os.tmpdir(), "bl-server-maps-"));
  });

  afterEach(async () => {
    await fs.rm(gamePath, { recursive: true, force: true });
  });

  const writeScene = async (
    module: string,
    name: string,
    content: string | null,
  ): Promise<string> => {
    const folder = path.join(gamePath, "Modules", module, "SceneObj", name);
    await fs.mkdir(folder, { recursive: true });
    if (content !== null) {
      await fs.writeFile(path.join(folder, "scene.xscene"), content);
    }
    return folder;
  };

  describe("readDownloadedScenesAsync", () => {
    it("reads the download cache's scenes, skipping unfinished downloads and folders without a scene", async () => {
      const folder = await writeScene(
        "Multiplayer",
        "my_map",
        sceneXml('name="my_map" unique_token="t" revision="3"'),
      );
      await writeScene("Multiplayer", "temp_abc123", sceneXml('name="x"'));
      await writeScene("Multiplayer", "empty", null);
      await writeScene("Multiplayer", "broken", "not xml");
      await fs.writeFile(
        path.join(getDownloadedMapsPath(gamePath), "stray.txt"),
        "",
      );

      expect(await readDownloadedScenesAsync(gamePath)).toEqual([
        {
          name: "my_map",
          module: "Multiplayer",
          path: folder,
          uniqueToken: "t",
          revision: "3",
        },
      ]);
    });

    it("is empty when the game has no download cache", async () => {
      expect(await readDownloadedScenesAsync(gamePath)).toEqual([]);
    });
  });

  describe("readLocalScenesAsync", () => {
    it("collects scenes from every module by lowercase name", async () => {
      await writeScene("Native", "MP_Arena", sceneXml('name="MP_Arena"'));
      await writeScene("Native", "temp_scene", sceneXml('name="temp_scene"'));
      await writeScene(
        "Multiplayer",
        "mp_arena",
        sceneXml('name="mp_arena" unique_token="t" revision="1"'),
      );

      const scenes = await readLocalScenesAsync(gamePath);

      expect(
        scenes
          .get("mp_arena")
          ?.map((x) => x.module)
          .sort(),
      ).toEqual(["Multiplayer", "Native"]);
      expect(scenes.has("temp_scene")).toBe(true);
    });

    it("uses the given download cache scenes instead of reading them again", async () => {
      await writeScene("Multiplayer", "on_disk", sceneXml('name="on_disk"'));
      const downloaded = [scene("given", "Multiplayer")];

      const scenes = await readLocalScenesAsync(gamePath, downloaded);

      expect([...scenes.keys()]).toEqual(["given"]);
    });
  });

  describe("getFolderSizeAsync", () => {
    it("adds up the files in nested folders", async () => {
      const folder = await writeScene("Multiplayer", "m", "12345");
      await fs.mkdir(path.join(folder, "nested"));
      await fs.writeFile(path.join(folder, "nested", "a.bin"), "123");

      expect(await getFolderSizeAsync(folder)).toBe(8);
    });

    it("is zero for a folder that doesn't exist", async () => {
      expect(await getFolderSizeAsync(path.join(gamePath, "nope"))).toBe(0);
    });
  });

  describe("removeDownloadedMapAsync", () => {
    it("removes a downloaded map", async () => {
      const folder = await writeScene("Multiplayer", "m", sceneXml('name="m"'));

      await removeDownloadedMapAsync(gamePath, {
        ...scene("m", "Multiplayer"),
        path: folder,
      });

      await expect(fs.access(folder)).rejects.toThrow();
    });

    it("refuses a scene another module provides", async () => {
      const folder = await writeScene("Native", "m", sceneXml('name="m"'));

      await expect(
        removeDownloadedMapAsync(gamePath, {
          ...scene("m", "Native"),
          path: folder,
        }),
      ).rejects.toBeInstanceOf(NotDownloadedMapError);
      await expect(fs.access(folder)).resolves.toBeUndefined();
    });

    it("compares the cache path without regard to case", async () => {
      const folder = await writeScene("Multiplayer", "m", sceneXml('name="m"'));

      await removeDownloadedMapAsync(gamePath, {
        ...scene("m", "multiplayer"),
        path: folder.toUpperCase(),
      });

      await expect(fs.access(folder)).rejects.toThrow();
    });

    it("refuses a path outside the download cache", async () => {
      const folder = await writeScene("Native", "m", sceneXml('name="m"'));
      const escaping = path.join(
        getDownloadedMapsPath(gamePath),
        "..",
        "..",
        "Native",
        "SceneObj",
        "m",
      );

      await expect(
        removeDownloadedMapAsync(gamePath, {
          ...scene("m", "Multiplayer"),
          path: escaping,
        }),
      ).rejects.toBeInstanceOf(NotDownloadedMapError);
      await expect(fs.access(folder)).resolves.toBeUndefined();
    });
  });

  describe("downloadServerMapAsync", () => {
    class FakeRequest extends EventEmitter {
      public destroy = vi.fn(() => this);
      public setTimeout = vi.fn(() => this);
    }

    type FakeResponse = PassThrough & {
      statusCode: number;
      headers: Record<string, string>;
      complete: boolean;
    };

    interface IFakeCall {
      options: Record<string, unknown>;
      request: FakeRequest;
      respond: (response: FakeResponse) => void;
    }

    let calls: IFakeCall[];
    let serve: (call: IFakeCall) => void;

    const respond = (
      call: IFakeCall,
      statusCode: number,
      body: Buffer | null = null,
      headers: Record<string, string> = {},
    ): void => {
      const response = Object.assign(new PassThrough(), {
        statusCode,
        headers,
        complete: false,
      });
      call.respond(response);
      if (body !== null) {
        response.write(body);
      }
      response.complete = true;
      response.end();
    };

    const ARCHIVE_BODY = Buffer.from("PK zip bytes");

    /**
     * An archiver that lists the given entries and extracts a scene.xscene with the given content
     */
    const fakeArchiver = (
      entries: IMapArchiveEntry[],
      sceneContent: string | null,
    ): IMapArchiver & { archives: string[]; contents: Buffer[] } => {
      const archives: string[] = [];
      const contents: Buffer[] = [];
      return {
        archives,
        contents,
        list: vi.fn(async (archive, onEntries) => {
          archives.push(archive);
          contents.push(await fs.readFile(archive));
          onEntries(entries);
        }),
        extractFull: vi.fn(async (_archive, target) => {
          await fs.mkdir(target, { recursive: true });
          if (sceneContent !== null) {
            await fs.writeFile(path.join(target, "scene.xscene"), sceneContent);
          }
        }),
      };
    };

    const mapFolderEntries = async (): Promise<string[]> =>
      (
        await fs.readdir(getDownloadedMapsPath(gamePath)).catch(() => [])
      ).sort();

    const leftoverArchives = async (mapName: string): Promise<string[]> =>
      (await fs.readdir(os.tmpdir())).filter((name) =>
        name.startsWith(`BL_map_dl_${mapName}_`),
      );

    beforeEach(() => {
      calls = [];
      serve = (call) =>
        respond(call, 200, ARCHIVE_BODY, {
          "content-length": String(ARCHIVE_BODY.length),
        });
      vi.mocked(get).mockReset();
      vi.mocked(get).mockImplementation(((
        options: Record<string, unknown>,
        callback: (response: FakeResponse) => void,
      ) => {
        const call = { options, request: new FakeRequest(), respond: callback };
        calls.push(call);
        setImmediate(() => serve(call));
        return call.request;
      }) as unknown as typeof get);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("downloads, checks and installs the map under its scene name", async () => {
      const archiver = fakeArchiver(
        [{ name: "scene.xscene", size: 100 }],
        sceneXml('name="Custom_Map" unique_token="t" revision="2"'),
      );
      const progress: IMapDownloadProgress[] = [];

      const target = await downloadServerMapAsync(
        gamePath,
        SERVER,
        serverMap("custom_map", "t", "2"),
        {
          userAgent: "Test Agent",
          archiver,
          onProgress: (p) => progress.push(p),
        },
      );

      expect(calls[0]?.options).toMatchObject({
        host: SERVER.address,
        port: SERVER.port,
        path: "/maps/list/custom_map",
        headers: { "User-Agent": "Test Agent" },
      });
      expect(archiver.contents[0]).toEqual(ARCHIVE_BODY);
      expect(target).toBe(
        path.join(getDownloadedMapsPath(gamePath), "Custom_Map"),
      );
      expect(
        parseSceneHeader(
          await fs.readFile(path.join(target, "scene.xscene"), "utf8"),
        ),
      ).toEqual({ uniqueToken: "t", revision: "2" });
      expect(await mapFolderEntries()).toEqual(["Custom_Map"]);
      expect(await leftoverArchives("custom_map")).toEqual([]);
      expect(progress[0]?.stage).toBe("preparing");
      expect(progress.at(-1)?.stage).toBe("installing");
      expect(progress).toContainEqual({
        stage: "downloading",
        receivedBytes: ARCHIVE_BODY.length,
        totalBytes: ARCHIVE_BODY.length,
      });
    });

    it("replaces an older downloaded version of the map", async () => {
      const old = await writeScene(
        "Multiplayer",
        "replaced_map",
        sceneXml('name="replaced_map" revision="1"'),
      );
      await fs.writeFile(path.join(old, "stale.bin"), "old");

      await downloadServerMapAsync(
        gamePath,
        SERVER,
        serverMap("replaced_map"),
        {
          userAgent: "Test Agent",
          archiver: fakeArchiver(
            [{ name: "scene.xscene", size: 1 }],
            sceneXml('name="replaced_map" revision="2"'),
          ),
        },
      );

      expect(await fs.readdir(old)).toEqual(["scene.xscene"]);
    });

    it("refuses a map name the server shouldn't send, before downloading", async () => {
      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("../../bin"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver([], null),
        }),
      ).rejects.toBeInstanceOf(InvalidMapError);
      expect(get).not.toHaveBeenCalled();
    });

    it.each<[string, IMapArchiveEntry, RegExp]>([
      ["a parent path", { name: "../../bin/evil.dll", size: 1 }, /outside/],
      [
        "a nested parent path",
        { name: "a\\..\\..\\evil.dll", size: 1 },
        /outside/,
      ],
      [
        "an absolute path",
        { name: "C:\\Windows\\evil.dll", size: 1 },
        /outside/,
      ],
      ["a text symlink", { name: "link", size: 1, attr: "lrwxrwxrwx" }, /link/],
      [
        "a hex symlink",
        { name: "link", size: 1, attr: "A1FF0000" },
        /is a link/,
      ],
      ["an entry without a size", { name: "scene.xscene" }, /no size/],
    ])("doesn't extract an archive with %s", async (_, entry, message) => {
      const archiver = fakeArchiver(
        [{ name: "scene.xscene", size: 1 }, entry],
        sceneXml('name="bad_entry_map"'),
      );

      const promise = downloadServerMapAsync(
        gamePath,
        SERVER,
        serverMap("bad_entry_map"),
        { userAgent: "Test Agent", archiver },
      );

      await expect(promise).rejects.toBeInstanceOf(InvalidMapError);
      await expect(promise).rejects.toThrow(message);
      expect(archiver.extractFull).not.toHaveBeenCalled();
      expect(await mapFolderEntries()).toEqual([]);
      expect(await leftoverArchives("bad_entry_map")).toEqual([]);
    });

    it("keeps an ordinary file whose attributes aren't a link", async () => {
      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("plain_attr_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver(
            [
              { name: "scene.xscene", size: 1, attr: "-rw-r--r--" },
              { name: "a.bin", size: 1, attr: "81A40000" },
              { name: "b.bin", size: 1, attr: "A" },
            ],
            sceneXml('name="plain_attr_map"'),
          ),
        }),
      ).resolves.toBe(
        path.join(getDownloadedMapsPath(gamePath), "plain_attr_map"),
      );
    });

    it("doesn't extract an archive that unpacks to more than 16 GiB", async () => {
      const archiver = fakeArchiver(
        [
          { name: "a.bin", size: 8 * 1024 ** 3 },
          { name: "b.bin", size: 8 * 1024 ** 3 + 1 },
        ],
        null,
      );

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("bomb_map"), {
          userAgent: "Test Agent",
          archiver,
        }),
      ).rejects.toThrow(/unpacks to 16\.00 GB, more than a map needs/);
      expect(archiver.extractFull).not.toHaveBeenCalled();
    });

    it("doesn't extract an archive with more files than a map needs", async () => {
      const entries: IMapArchiveEntry[] = Array.from(
        { length: 100_001 },
        (_, i) => ({ name: `f${i}`, size: 1 }),
      );
      const archiver = fakeArchiver(entries, sceneXml('name="many_map"'));

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("many_map"), {
          userAgent: "Test Agent",
          archiver,
        }),
      ).rejects.toThrow(/has 100001 files, more than a map needs/);
      expect(archiver.extractFull).not.toHaveBeenCalled();
    });

    it("doesn't extract a map the game drive has no room for", async () => {
      const statfs = vi
        .spyOn(fs, "statfs")
        .mockResolvedValue({ bavail: 1024, bsize: 1024 } as Awaited<
          ReturnType<typeof fs.statfs>
        >);
      const archiver = fakeArchiver(
        [{ name: "scene.xscene", size: 1 }],
        sceneXml('name="no_room_map"'),
      );

      try {
        await expect(
          downloadServerMapAsync(gamePath, SERVER, serverMap("no_room_map"), {
            userAgent: "Test Agent",
            archiver,
          }),
        ).rejects.toThrow(/not enough free space/);
      } finally {
        statfs.mockRestore();
      }
      expect(archiver.extractFull).not.toHaveBeenCalled();
      expect(await mapFolderEntries()).toEqual([]);
    });

    it("doesn't install an archive without a valid scene", async () => {
      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("no_scene_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver([{ name: "readme.txt", size: 1 }], null),
        }),
      ).rejects.toBeInstanceOf(InvalidMapError);

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("bad_name_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver(
            [{ name: "scene.xscene", size: 1 }],
            sceneXml('name="..\\..\\Native"'),
          ),
        }),
      ).rejects.toBeInstanceOf(InvalidMapError);
      expect(await mapFolderEntries()).toEqual([]);
    });

    it("reports an HTTP error and leaves nothing behind", async () => {
      serve = (call) => respond(call, 404);
      const archiver = fakeArchiver([], null);

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("not_found_map"), {
          userAgent: "Test Agent",
          archiver,
        }),
      ).rejects.toThrow("The server responded with HTTP 404");
      expect(archiver.list).not.toHaveBeenCalled();
      expect(await leftoverArchives("not_found_map")).toEqual([]);
    });

    it("fails when fewer bytes arrive than the server announced", async () => {
      serve = (call) =>
        respond(call, 200, ARCHIVE_BODY, {
          "content-length": String(ARCHIVE_BODY.length + 10),
        });

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("short_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver([], null),
        }),
      ).rejects.toThrow(
        "The server closed the connection before the map was complete",
      );
      expect(await leftoverArchives("short_map")).toEqual([]);
    });

    it("gives up when the server takes too long to answer", async () => {
      serve = (call) => call.request.emit("timeout");

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("slow_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver([], null),
        }),
      ).rejects.toThrow("The server took too long to prepare the map");
      expect(await leftoverArchives("slow_map")).toEqual([]);
    });

    it("gives up when the server stops sending the map, after allowing 60s between chunks", async () => {
      serve = (call) => {
        const response = Object.assign(new PassThrough(), {
          statusCode: 200,
          headers: {},
          complete: false,
        });
        call.respond(response);
        response.write(Buffer.from("PK"));
        setImmediate(() => call.request.emit("timeout"));
      };

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("stalled_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver([], null),
        }),
      ).rejects.toThrow("The server stopped sending the map");
      expect(calls[0]?.request.setTimeout).toHaveBeenCalledWith(60_000);
      expect(await leftoverArchives("stalled_map")).toEqual([]);
    });

    it("refuses a map announced as larger than 4 GiB", async () => {
      serve = (call) =>
        respond(call, 200, null, {
          "content-length": String(4 * 1024 ** 3 + 1),
        });

      await expect(
        downloadServerMapAsync(gamePath, SERVER, serverMap("huge_map"), {
          userAgent: "Test Agent",
          archiver: fakeArchiver([], null),
        }),
      ).rejects.toThrow("The map is too large");
    });

    it("waits and asks again while the server is still zipping the map", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      serve = (call) =>
        calls.length === 1
          ? respond(call, 409)
          : respond(call, 200, ARCHIVE_BODY);

      const promise = downloadServerMapAsync(
        gamePath,
        SERVER,
        serverMap("busy_map"),
        {
          userAgent: "Test Agent",
          archiver: fakeArchiver(
            [{ name: "scene.xscene", size: 1 }],
            sceneXml('name="busy_map"'),
          ),
        },
      );
      const startedAt = Date.now();
      while (calls.length < 2 && Date.now() - startedAt < 2000) {
        await new Promise((resolve) => setImmediate(resolve));
        vi.advanceTimersByTime(100);
      }

      await expect(promise).resolves.toBe(
        path.join(getDownloadedMapsPath(gamePath), "busy_map"),
      );
      expect(calls).toHaveLength(2);
    });

    it("stops asking after three minutes of the server zipping the map", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      serve = (call) => respond(call, 409);

      const promise = downloadServerMapAsync(
        gamePath,
        SERVER,
        serverMap("forever_busy_map"),
        { userAgent: "Test Agent", archiver: fakeArchiver([], null) },
      );
      let settled = false;
      const rejection = expect(promise)
        .rejects.toThrow(
          "The server is still preparing this map, try again in a moment",
        )
        .finally(() => {
          settled = true;
        });
      // Lets each request be answered, and skips the wait before the next one
      for (let turn = 0; turn < 10_000 && !settled; turn++) {
        await new Promise((resolve) => setImmediate(resolve));
        if (vi.getTimerCount() > 0) {
          vi.advanceTimersByTime(3_000);
        }
      }

      await rejection;
      expect(calls).toHaveLength(61);
    });
  });
});
