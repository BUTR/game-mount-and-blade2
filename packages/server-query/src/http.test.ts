import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "http";
import {
  getFromServerAsync,
  isRecord,
  parseJsonBody,
  ServerHttpResult,
} from "./http";

vi.mock("http", () => ({ get: vi.fn() }));

class FakeRequest extends EventEmitter {
  public destroy = vi.fn(() => this);
}

type FakeResponse = PassThrough & { statusCode: number };

const fakeResponse = (statusCode: number): FakeResponse =>
  Object.assign(new PassThrough(), { statusCode });

interface IFakeGet {
  request: FakeRequest;
  options: Record<string, unknown>;
  respond: (response: FakeResponse) => void;
}

const SERVER = { address: "10.0.0.5", port: 7210 };
const OPTIONS = { userAgent: "Test Agent" };

let calls: IFakeGet[] = [];

beforeEach(() => {
  calls = [];
  vi.mocked(get).mockImplementation(((
    options: Record<string, unknown>,
    callback: (response: FakeResponse) => void,
  ) => {
    const request = new FakeRequest();
    calls.push({ request, options, respond: callback });
    return request;
  }) as unknown as typeof get);
});

afterEach(() => {
  vi.useRealTimers();
});

const lastCall = (): IFakeGet => {
  const call = calls.at(-1);
  if (call === undefined) {
    throw new Error("get was not called");
  }
  return call;
};

const settledWithin = async (
  promise: Promise<ServerHttpResult>,
): Promise<ServerHttpResult | "pending"> =>
  Promise.race([
    promise,
    new Promise<"pending">((resolve) => setImmediate(() => resolve("pending"))),
  ]);

describe("getFromServerAsync", () => {
  it("requests the path on the server's game port with JSON and the user agent", () => {
    void getFromServerAsync(SERVER, "/maps/list", OPTIONS);

    expect(lastCall().options).toMatchObject({
      host: "10.0.0.5",
      port: 7210,
      path: "/maps/list",
      headers: { Accept: "application/json", "User-Agent": "Test Agent" },
    });
  });

  it("returns the whole body of a 200 response, across chunks", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    const response = fakeResponse(200);
    lastCall().respond(response);
    response.write(Buffer.from('{"maps":'));
    response.end(Buffer.from("[]}"));

    const result = await promise;

    expect(result).toMatchObject({ kind: "ok", body: '{"maps":[]}' });
    expect(result.responseTimeMs).toEqual(expect.any(Number));
  });

  it("reports a non-200 status without reading the body", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    lastCall().respond(fakeResponse(404));

    expect(await promise).toMatchObject({ kind: "status", statusCode: 404 });
  });

  it("fails without a response time when the connection fails", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    lastCall().request.emit("error", new Error("connect ECONNREFUSED"));

    expect(await promise).toEqual({
      kind: "failed",
      error: "connect ECONNREFUSED",
      responseTimeMs: null,
    });
  });

  it("fails with a response time when the server closes mid-body", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    const response = fakeResponse(200);
    lastCall().respond(response);
    response.write("{");
    response.destroy();

    const result = await promise;

    expect(result).toMatchObject({
      kind: "failed",
      error: "The server closed the connection early",
    });
    expect(result.responseTimeMs).not.toBeNull();
  });

  it("stops reading a response over 1 MiB", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    const response = fakeResponse(200);
    const call = lastCall();
    call.respond(response);
    response.write(Buffer.alloc(1024 * 1024));
    response.write(Buffer.alloc(1));

    expect(await promise).toMatchObject({
      kind: "failed",
      error: "The response is too large",
    });
    expect(call.request.destroy).toHaveBeenCalled();
  });

  it("keeps a response of exactly 1 MiB", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    const response = fakeResponse(200);
    lastCall().respond(response);
    response.end(Buffer.alloc(1024 * 1024, "x"));

    const result = await promise;

    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.body.length).toBe(1024 * 1024);
  });

  it("gives up after 3s even when the socket keeps trickling", async () => {
    vi.useFakeTimers();
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    const call = lastCall();

    await vi.advanceTimersByTimeAsync(2999);
    expect(call.request.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await promise).toMatchObject({
      kind: "failed",
      error: "The server did not respond in time",
    });
    expect(call.request.destroy).toHaveBeenCalled();
  });

  it("settles once, with the first outcome", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);
    const call = lastCall();
    call.request.emit("timeout");
    call.request.emit("error", new Error("socket hang up"));

    expect(await promise).toMatchObject({
      kind: "failed",
      error: "The server did not respond in time",
    });
  });

  it("stays pending until the server answers", async () => {
    const promise = getFromServerAsync(SERVER, "/maps/list", OPTIONS);

    expect(await settledWithin(promise)).toBe("pending");
    lastCall().respond(fakeResponse(500));
    expect(await settledWithin(promise)).toMatchObject({ statusCode: 500 });
  });
});

describe("parseJsonBody", () => {
  it("parses plain JSON", () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps JSON that the server serialized twice", () => {
    expect(parseJsonBody(JSON.stringify(JSON.stringify({ a: 1 })))).toEqual({
      a: 1,
    });
  });

  it("throws on text that isn't JSON", () => {
    expect(() => parseJsonBody("<html>")).toThrow(SyntaxError);
  });
});

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("text")).toBe(false);
  });
});
