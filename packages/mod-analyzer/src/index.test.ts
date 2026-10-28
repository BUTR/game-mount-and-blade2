import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUTR_HOST,
  getCompatibilityScoresAsync,
  IModAnalyzerRequestQuery,
} from "./index";

class FakeResponse extends EventEmitter {
  public complete = false;
  public resume = vi.fn();
  public constructor(public statusCode: number) {
    super();
  }
}

class FakeRequest extends EventEmitter {
  public body: string | undefined;
  public end = vi.fn((body: string) => {
    this.body = body;
  });
  public destroy = vi.fn((error: Error) => {
    this.emit("error", error);
    this.emit("close");
  });
  public constructor(
    public options: Record<string, unknown>,
    public respond: (response: FakeResponse) => void,
  ) {
    super();
  }
}

const requests = vi.hoisted(() => [] as unknown[]);

vi.mock("https", () => ({
  request: (
    options: Record<string, unknown>,
    callback: (response: unknown) => void,
  ) => {
    const req = new FakeRequest(options, callback);
    requests.push(req);
    return req;
  },
}));

const query: IModAnalyzerRequestQuery = {
  gameVersion: "v1.2.9",
  modules: [{ moduleId: "Bannerlord.Harmony", moduleVersion: "v2.3.0" }],
};

const lastRequest = (): FakeRequest =>
  requests[requests.length - 1] as FakeRequest;

const respond = (statusCode: number, chunks: string[]): FakeResponse => {
  const req = lastRequest();
  const res = new FakeResponse(statusCode);
  req.respond(res);
  for (const chunk of chunks) {
    res.emit("data", Buffer.from(chunk, "utf8"));
  }
  res.complete = true;
  res.emit("end");
  res.emit("close");
  req.emit("close");
  return res;
};

describe("getCompatibilityScoresAsync", () => {
  beforeEach(() => {
    requests.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts the query to BUTR's ModAnalyzer for Bannerlord", async () => {
    const promise = getCompatibilityScoresAsync(query, {
      userAgent: "Test/1.0",
    });
    respond(200, ['{"modules":[]}']);
    await promise;

    const req = lastRequest();
    expect(req.options).toMatchObject({
      host: BUTR_HOST,
      method: "POST",
      protocol: "https:",
      path: "/api/v1/ModsAnalyzer/GetCompatibilityScore",
      headers: {
        Tenant: "1",
        "Content-Type": "application/json",
        "User-Agent": "Test/1.0",
      },
    });
    expect(JSON.parse(req.body!)).toEqual(query);
  });

  it("resolves with the result read from every chunk", async () => {
    const result = {
      modules: [
        {
          moduleId: "Bannerlord.Harmony",
          compatibility: 97.5,
          recommendedCompatibility: null,
          recommendedModuleVersion: null,
        },
      ],
    };
    const json = JSON.stringify(result);
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    respond(200, [json.slice(0, 10), json.slice(10)]);

    await expect(promise).resolves.toEqual(result);
  });

  it("rejects another status than 200 and drains the response", async () => {
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    const res = respond(503, ["Service Unavailable"]);

    await expect(promise).rejects.toThrow(
      "The BUTR server responded with HTTP 503",
    );
    expect(res.resume).toHaveBeenCalled();
  });

  it("rejects a response that isn't JSON", async () => {
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    respond(200, ["<html>"]);

    await expect(promise).rejects.toThrow(SyntaxError);
  });

  it("rejects a response cut short", async () => {
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    const req = lastRequest();
    const res = new FakeResponse(200);
    req.respond(res);
    res.emit("data", Buffer.from('{"modu', "utf8"));
    res.emit("close");

    await expect(promise).rejects.toThrow(
      "The BUTR server closed the connection early",
    );
  });

  it("rejects when the connection fails", async () => {
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    lastRequest().emit("error", new Error("ECONNREFUSED"));

    await expect(promise).rejects.toThrow("ECONNREFUSED");
  });

  it("rejects when the response fails while it's read", async () => {
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    const res = new FakeResponse(200);
    lastRequest().respond(res);
    res.emit("data", Buffer.from('{"modu', "utf8"));
    res.emit("error", new Error("ECONNRESET"));

    await expect(promise).rejects.toThrow("ECONNRESET");
  });

  it("gives up on a server that doesn't respond in 30 seconds", async () => {
    vi.useFakeTimers();
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    const assertion = expect(promise).rejects.toThrow(
      "The BUTR server did not respond in time",
    );

    vi.advanceTimersByTime(29_999);
    expect(lastRequest().destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    await assertion;
    expect(lastRequest().destroy).toHaveBeenCalledTimes(1);
  });

  it("stops the deadline once the request is done", async () => {
    vi.useFakeTimers();
    const promise = getCompatibilityScoresAsync(query, { userAgent: "Test" });
    respond(200, ['{"modules":[]}']);
    await promise;

    vi.advanceTimersByTime(60_000);

    expect(lastRequest().destroy).not.toHaveBeenCalled();
  });
});
