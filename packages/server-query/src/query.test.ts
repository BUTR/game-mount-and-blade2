import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFromServerAsync, ServerHttpResult } from "./http";
import {
  createPendingResult,
  parseMapList,
  queryLobbyServerAsync,
  queryServerAsync,
} from "./query";
import { IServerAddress } from "./address";

vi.mock("./http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http")>()),
  getFromServerAsync: vi.fn(),
}));

const OPTIONS = { userAgent: "Test Agent" };
const PUBLIC = { address: "203.0.113.7", port: 7210 };

const ok = (body: unknown): ServerHttpResult => ({
  kind: "ok",
  body: JSON.stringify(body),
  responseTimeMs: 12,
});
const unreachable: ServerHttpResult = {
  kind: "failed",
  error: "connect ETIMEDOUT",
  responseTimeMs: null,
};

/**
 * Answers each address with its own response, by "host:port"
 */
const respondByAddress = (
  responses: Record<string, ServerHttpResult>,
): void => {
  vi.mocked(getFromServerAsync).mockImplementation(
    async (server: IServerAddress) =>
      responses[`${server.address}:${server.port}`] ?? unreachable,
  );
};

beforeEach(() => {
  vi.mocked(getFromServerAsync).mockReset();
});

describe("parseMapList", () => {
  it("reads the maps and the map being played", () => {
    expect(
      parseMapList(
        JSON.stringify({
          currentlyPlaying: "mp_skirmish_map_001",
          maps: [
            { name: "mp_skirmish_map_001", uniqueToken: null, revision: null },
            { name: "custom_map", uniqueToken: "abc", revision: "3" },
          ],
        }),
      ),
    ).toEqual({
      currentlyPlaying: "mp_skirmish_map_001",
      maps: [
        { name: "mp_skirmish_map_001", uniqueToken: null, revision: null },
        { name: "custom_map", uniqueToken: "abc", revision: "3" },
      ],
    });
  });

  it("reads a list the server serialized twice", () => {
    const body = JSON.stringify(JSON.stringify({ maps: [{ name: "a" }] }));

    expect(parseMapList(body).maps).toEqual([
      { name: "a", uniqueToken: null, revision: null },
    ]);
  });

  it("drops entries without a name and treats empty identifiers as none", () => {
    const list = parseMapList(
      JSON.stringify({
        currentlyPlaying: "",
        maps: [
          null,
          "scene",
          { uniqueToken: "x" },
          { name: 5 },
          { name: "kept", uniqueToken: "", revision: 7 },
        ],
      }),
    );

    expect(list).toEqual({
      currentlyPlaying: null,
      maps: [{ name: "kept", uniqueToken: null, revision: null }],
    });
  });

  it.each([
    ["an array", "[]"],
    ["an object without maps", "{}"],
    ["maps that aren't a list", '{"maps":{}}'],
  ])("rejects %s", (_, body) => {
    expect(() => parseMapList(body)).toThrow(
      "The response is not a Bannerlord map list",
    );
  });
});

describe("queryServerAsync", () => {
  it("asks for /maps/list and is online with the parsed list", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue(
      ok({ currentlyPlaying: "m", maps: [] }),
    );

    const result = await queryServerAsync(PUBLIC, OPTIONS);

    expect(getFromServerAsync).toHaveBeenCalledWith(
      PUBLIC,
      "/maps/list",
      OPTIONS,
    );
    expect(result).toMatchObject({
      state: "online",
      endpoint: PUBLIC,
      withLobby: false,
      responseTimeMs: 12,
      mapList: { currentlyPlaying: "m", maps: [] },
      error: null,
    });
    expect(result.checkedAt).toEqual(expect.any(Number));
  });

  it("is invalid when a 200 response isn't a map list", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue({
      kind: "ok",
      body: "<html>login</html>",
      responseTimeMs: 5,
    });

    const result = await queryServerAsync(PUBLIC, OPTIONS);

    expect(result.state).toBe("invalid");
    expect(result.mapList).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });

  it("is invalid on an HTTP error status", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue({
      kind: "status",
      statusCode: 404,
      responseTimeMs: 5,
    });

    expect(await queryServerAsync(PUBLIC, OPTIONS)).toMatchObject({
      state: "invalid",
      error: "The server responded with HTTP 404",
    });
  });

  it("is unreachable when nothing answered", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue(unreachable);

    expect(await queryServerAsync(PUBLIC, OPTIONS)).toMatchObject({
      state: "unreachable",
      responseTimeMs: null,
      error: "connect ETIMEDOUT",
    });
  });

  it("is invalid, not unreachable, when it failed after the server answered", async () => {
    vi.mocked(getFromServerAsync).mockResolvedValue({
      kind: "failed",
      error: "The server closed the connection early",
      responseTimeMs: 40,
    });

    expect(await queryServerAsync(PUBLIC, OPTIONS)).toMatchObject({
      state: "invalid",
      responseTimeMs: 40,
    });
  });
});

describe("queryLobbyServerAsync", () => {
  it("uses the public address when it answers", async () => {
    respondByAddress({
      "203.0.113.7:7210": ok({ currentlyPlaying: "m", maps: [] }),
    });

    const result = await queryLobbyServerAsync(PUBLIC, "m", OPTIONS);

    expect(result).toMatchObject({
      state: "online",
      endpoint: PUBLIC,
      withLobby: true,
    });
    expect(getFromServerAsync).toHaveBeenCalledTimes(1);
  });

  it("falls back to loopback on the same port for a self-hosted server playing the listed map", async () => {
    respondByAddress({
      "127.0.0.1:7210": ok({ currentlyPlaying: "my_map", maps: [] }),
    });

    const result = await queryLobbyServerAsync(PUBLIC, "my_map", OPTIONS);

    expect(result).toMatchObject({
      state: "online",
      endpoint: { address: "127.0.0.1", port: 7210 },
      withLobby: true,
    });
  });

  it("ignores a local server that plays a different map", async () => {
    respondByAddress({
      "127.0.0.1:7210": ok({ currentlyPlaying: "other_map", maps: [] }),
    });

    const result = await queryLobbyServerAsync(PUBLIC, "my_map", OPTIONS);

    expect(result).toMatchObject({
      state: "unreachable",
      endpoint: PUBLIC,
      withLobby: true,
    });
  });

  it("ignores a local server that answers with something invalid", async () => {
    respondByAddress({
      "127.0.0.1:7210": { kind: "status", statusCode: 401, responseTimeMs: 1 },
    });

    const result = await queryLobbyServerAsync(PUBLIC, "my_map", OPTIONS);

    expect(result).toMatchObject({
      state: "unreachable",
      endpoint: PUBLIC,
      error: "connect ETIMEDOUT",
    });
  });

  it("keeps the public result when loopback doesn't answer either", async () => {
    respondByAddress({});

    const result = await queryLobbyServerAsync(PUBLIC, "my_map", OPTIONS);

    expect(result).toMatchObject({ state: "unreachable", endpoint: PUBLIC });
    expect(getFromServerAsync).toHaveBeenCalledTimes(2);
  });

  it("doesn't fall back when the public address answered with something invalid", async () => {
    respondByAddress({
      "203.0.113.7:7210": {
        kind: "status",
        statusCode: 500,
        responseTimeMs: 1,
      },
      "127.0.0.1:7210": ok({ currentlyPlaying: "my_map", maps: [] }),
    });

    const result = await queryLobbyServerAsync(PUBLIC, "my_map", OPTIONS);

    expect(result).toMatchObject({ state: "invalid", endpoint: PUBLIC });
    expect(getFromServerAsync).toHaveBeenCalledTimes(1);
  });

  it("doesn't query loopback twice for a server listed at loopback", async () => {
    respondByAddress({});

    await queryLobbyServerAsync(
      { address: "127.0.0.1", port: 7210 },
      "my_map",
      OPTIONS,
    );

    expect(getFromServerAsync).toHaveBeenCalledTimes(1);
  });
});

describe("createPendingResult", () => {
  it("is pending with nothing known", () => {
    expect(createPendingResult()).toEqual({
      state: "pending",
      endpoint: null,
      withLobby: false,
      responseTimeMs: null,
      mapList: null,
      error: null,
      checkedAt: null,
    });
  });
});
