import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serveWorker } from "./host";

type Scope = { onmessage: ((event: MessageEvent) => void) | null };

const postMessage = vi.fn();

const send = (data: unknown): void => {
  (globalThis as unknown as Scope).onmessage?.({ data } as MessageEvent);
};

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  postMessage.mockReset();
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("postMessage", postMessage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("serveWorker", () => {
  it("sends back the job's result under the request's id", async () => {
    serveWorker((request: { value: number }) =>
      Promise.resolve(request.value + 1),
    );

    send({ id: 7, request: { value: 1 } });
    await flush();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ id: 7, result: 2 });
  });

  it("sends back the message of an Error the job threw", async () => {
    serveWorker(() => Promise.reject(new Error("corrupt save")));

    send({ id: 3, request: null });
    await flush();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 3,
      error: "corrupt save",
    });
  });

  it("sends back the error of a job that throws before returning its promise", async () => {
    serveWorker((): Promise<number> => {
      throw new Error("bad request");
    });

    send({ id: 4, request: null });
    await flush();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 4,
      error: "bad request",
    });
  });

  it("sends back a non-Error rejection as a string", async () => {
    serveWorker(() => Promise.reject(404));

    send({ id: 1, request: null });
    await flush();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 1,
      error: "404",
    });
  });

  it("serves requests concurrently, answering each as its job finishes", async () => {
    serveWorker(
      (delay: number) =>
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(delay), delay),
        ),
    );

    send({ id: 1, request: 20 });
    send({ id: 2, request: 1 });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(
      postMessage.mock.calls.map(([message]: unknown[]) => message),
    ).toEqual([
      { id: 2, result: 1 },
      { id: 1, result: 20 },
    ]);
  });
});
