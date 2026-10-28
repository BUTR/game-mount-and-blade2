import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFromServerAsync } from "./http";
import {
  normalizeModuleVersion,
  parseServerExtensionInfo,
  queryServerExtensionAsync,
  SERVER_EXTENSION_PATH,
  toSafeUrl,
} from "./extension";

vi.mock("./http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http")>()),
  getFromServerAsync: vi.fn(),
}));

const SERVER = { address: "203.0.113.7", port: 7210 };
const OPTIONS = { userAgent: "Test Agent" };

const parse = (payload: Record<string, unknown>) =>
  parseServerExtensionInfo(JSON.stringify({ schemaVersion: 1, ...payload }));

beforeEach(() => {
  vi.mocked(getFromServerAsync).mockReset();
});

describe("normalizeModuleVersion", () => {
  it.each([
    ["v1.2.3", "v1.2.3.0"],
    ["v1.2.3.4", "v1.2.3.4"],
    ["e1.02.003", "e1.2.3.0"],
    [" b0.1.0 ", "b0.1.0.0"],
    ["d10.20.30.40", "d10.20.30.40"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeModuleVersion(input)).toBe(expected);
  });

  it.each([["1.2.3"], ["v1.2"], ["x1.2.3"], ["V1.2.3"], ["v1.2.3.4.5"], [""]])(
    "rejects %s",
    (input) => {
      expect(normalizeModuleVersion(input)).toBeNull();
    },
  );

  it("rejects non-strings", () => {
    expect(normalizeModuleVersion(123)).toBeNull();
    expect(normalizeModuleVersion(null)).toBeNull();
  });
});

describe("toSafeUrl", () => {
  it("keeps http and https links", () => {
    expect(toSafeUrl("https://discord.gg/abc")).toBe("https://discord.gg/abc");
    expect(toSafeUrl("http://example.com")).toBe("http://example.com/");
  });

  it.each([
    ["javascript:alert(1)"],
    ["file:///C:/Windows/System32/calc.exe"],
    ["nxm://mountandblade2bannerlord/mods/1/files/2"],
    ["not a url"],
    [""],
  ])("rejects %s", (input) => {
    expect(toSafeUrl(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(toSafeUrl({ href: "https://example.com" })).toBeNull();
  });
});

describe("parseServerExtensionInfo", () => {
  it("requires a numeric schema version", () => {
    expect(() => parseServerExtensionInfo("{}")).toThrow(
      "The response is not BUTR server information",
    );
    expect(() => parseServerExtensionInfo('{"schemaVersion":"1"}')).toThrow();
    expect(() => parseServerExtensionInfo("[1]")).toThrow();
  });

  it("gives empty defaults for a minimal payload", () => {
    expect(parse({})).toEqual({
      schemaVersion: 1,
      description: null,
      links: [],
      serverModules: [],
      clientModules: [],
      collection: null,
    });
  });

  it("keeps a newer schema version and ignores unknown fields", () => {
    const info = parseServerExtensionInfo(
      JSON.stringify({ schemaVersion: 7, futureField: { a: 1 } }),
    );

    expect(info.schemaVersion).toBe(7);
    expect(info).not.toHaveProperty("futureField");
  });

  it("keeps line breaks in the description but strips other control characters", () => {
    const info = parse({
      description: "  Line one\r\nLine\u0007 two\rLine three\t  ",
    });

    expect(info.description).toBe("Line one\nLine two\nLine three");
  });

  it("has no description when it is only control characters or blank", () => {
    expect(parse({ description: " \u0000\u0007 " }).description).toBeNull();
    expect(parse({ description: "\n\n" }).description).toBeNull();
    expect(parse({ description: 42 }).description).toBeNull();
  });

  it("caps the description length", () => {
    expect(parse({ description: "x".repeat(5000) }).description).toHaveLength(
      4000,
    );
  });

  it("keeps only safe links, labelling unnamed ones with their url", () => {
    const info = parse({
      links: [
        { label: "Discord", url: "https://discord.gg/abc" },
        { url: "https://example.com/rules" },
        { label: "Bad", url: "javascript:alert(1)" },
        "https://example.com",
      ],
    });

    expect(info.links).toEqual([
      { label: "Discord", url: "https://discord.gg/abc" },
      { label: "https://example.com/rules", url: "https://example.com/rules" },
    ]);
  });

  it("cleans link labels and trims link urls", () => {
    const info = parse({
      links: [
        { label: " Dis\u0000cord ", url: " https://discord.gg/abc " },
        { label: "\u0007", url: "https://example.com/rules" },
      ],
    });

    expect(info.links).toEqual([
      { label: "Dis cord", url: "https://discord.gg/abc" },
      { label: "https://example.com/rules", url: "https://example.com/rules" },
    ]);
  });

  it("limits the number of links", () => {
    const links = Array.from({ length: 15 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));

    expect(parse({ links }).links).toHaveLength(10);
  });

  it("reads client modules, required unless the server says otherwise", () => {
    const info = parse({
      clientModules: [
        {
          id: "Bannerlord.Harmony",
          name: "Harmony",
          version: "v2.3.3",
          nexusMods: { modId: 2006, fileId: 12345 },
          url: "https://www.nexusmods.com/mountandblade2bannerlord/mods/2006",
        },
        { id: "Optional.Mod", required: false },
        { id: "Required.Falsy", required: 0 },
      ],
    });

    expect(info.clientModules).toEqual([
      {
        id: "Bannerlord.Harmony",
        name: "Harmony",
        version: "v2.3.3.0",
        required: true,
        nexusMods: { modId: 2006, fileId: 12345 },
        url: "https://www.nexusmods.com/mountandblade2bannerlord/mods/2006",
      },
      {
        id: "Optional.Mod",
        name: null,
        version: null,
        required: false,
        nexusMods: null,
        url: null,
      },
      {
        id: "Required.Falsy",
        name: null,
        version: null,
        required: true,
        nexusMods: null,
        url: null,
      },
    ]);
  });

  it.each([
    [{ modId: 0 }],
    [{ modId: -5 }],
    [{ modId: 1.5 }],
    [{ modId: "2006" }],
    [{ modId: 100_000_000 }],
    [{ fileId: 3 }],
  ])("drops an invalid Nexus Mods reference %j", (nexusMods) => {
    const [module] = parse({
      clientModules: [{ id: "A", nexusMods }],
    }).clientModules;

    expect(module?.nexusMods).toBeNull();
  });

  it("keeps the mod id when only the file id is invalid", () => {
    const [module] = parse({
      clientModules: [{ id: "A", nexusMods: { modId: 5, fileId: -1 } }],
    }).clientModules;

    expect(module?.nexusMods).toEqual({ modId: 5, fileId: null });
  });

  it("drops modules without an id and keeps the first of duplicates", () => {
    const info = parse({
      serverModules: [
        { name: "No id" },
        { id: "   " },
        { id: "A", version: "v1.0.0" },
        { id: "A", version: "v2.0.0" },
        { id: "B" },
      ],
    });

    expect(info.serverModules).toEqual([
      { id: "A", name: null, version: "v1.0.0.0" },
      { id: "B", name: null, version: null },
    ]);
  });

  it("limits the number of modules", () => {
    const serverModules = Array.from({ length: 300 }, (_, i) => ({
      id: `M${i}`,
    }));

    expect(parse({ serverModules }).serverModules).toHaveLength(256);
  });

  it("reads the collection nested under nexusMods before a legacy root one", () => {
    const info = parse({
      nexusMods: {
        collection: { slug: "  AbCd1234 ", revision: 3, required: false },
      },
      collection: { slug: "legacy00" },
    });

    expect(info.collection).toEqual({
      slug: "abcd1234",
      revision: 3,
      required: false,
    });
  });

  it("falls back to the legacy root collection only when nexusMods names none", () => {
    expect(
      parse({ nexusMods: { modId: 1 }, collection: { slug: "legacy00" } })
        .collection,
    ).toEqual({ slug: "legacy00", revision: null, required: true });
    expect(
      parse({
        nexusMods: { collection: { slug: "abc" } },
        collection: { slug: "legacy00" },
      }).collection,
    ).toBeNull();
  });

  it("reads a legacy collection at the root, latest revision when none is valid", () => {
    expect(
      parse({ collection: { slug: "legacy00", revision: 0 } }).collection,
    ).toEqual({ slug: "legacy00", revision: null, required: true });
  });

  it.each([["abc"], ["has-dash"], ["a".repeat(33)], ["../../x"]])(
    "rejects the collection slug %s",
    (slug) => {
      expect(parse({ collection: { slug } }).collection).toBeNull();
    },
  );
});

describe("queryServerExtensionAsync", () => {
  it("asks for the BUTR endpoint and is available with the parsed info", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue({
      kind: "ok",
      body: JSON.stringify({ schemaVersion: 1, description: "Hi" }),
      responseTimeMs: 3,
    });

    const result = await queryServerExtensionAsync(SERVER, OPTIONS);

    expect(getFromServerAsync).toHaveBeenCalledWith(
      SERVER,
      SERVER_EXTENSION_PATH,
      OPTIONS,
    );
    expect(result).toMatchObject({
      state: "available",
      info: { description: "Hi" },
      error: null,
    });
  });

  it.each([[404], [401], [403], [301], [302], [399]])(
    "treats HTTP %i as a server without the extension",
    async (statusCode) => {
      vi.mocked(getFromServerAsync).mockResolvedValue({
        kind: "status",
        statusCode,
        responseTimeMs: 3,
      });

      expect(await queryServerExtensionAsync(SERVER, OPTIONS)).toMatchObject({
        state: "absent",
        info: null,
        error: null,
      });
    },
  );

  it.each([[500], [400], [204]])(
    "treats HTTP %i as an invalid response",
    async (statusCode) => {
      vi.mocked(getFromServerAsync).mockResolvedValue({
        kind: "status",
        statusCode,
        responseTimeMs: 3,
      });

      expect(await queryServerExtensionAsync(SERVER, OPTIONS)).toMatchObject({
        state: "invalid",
        error: `The server responded with HTTP ${statusCode}`,
      });
    },
  );

  it("is invalid when the body isn't BUTR server information", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue({
      kind: "ok",
      body: '{"maps":[]}',
      responseTimeMs: 3,
    });

    expect(await queryServerExtensionAsync(SERVER, OPTIONS)).toMatchObject({
      state: "invalid",
      info: null,
      error: "The response is not BUTR server information",
    });
  });

  it("is unreachable when nothing answered and invalid when it broke off", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValueOnce({
      kind: "failed",
      error: "connect ECONNREFUSED",
      responseTimeMs: null,
    });
    vi.mocked(getFromServerAsync).mockResolvedValueOnce({
      kind: "failed",
      error: "The server closed the connection early",
      responseTimeMs: 9,
    });

    expect((await queryServerExtensionAsync(SERVER, OPTIONS)).state).toBe(
      "unreachable",
    );
    expect((await queryServerExtensionAsync(SERVER, OPTIONS)).state).toBe(
      "invalid",
    );
  });
});
