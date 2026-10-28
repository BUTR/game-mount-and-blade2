import { describe, expect, it } from "vitest";
import { mapInOrderAsync } from "./index";

const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("mapInOrderAsync", () => {
  it("keeps the items' order when the calls complete in another", async () => {
    const calls = Array.from({ length: 10 }, () => deferred<number>());
    const result = mapInOrderAsync(calls, (call) => call.promise, 10);

    for (const [index, call] of [...calls.entries()].reverse()) {
      call.resolve(index * 2);
    }

    await expect(result).resolves.toEqual(
      Array.from({ length: 10 }, (_, index) => index * 2),
    );
  });

  it("has at most the limit in flight, and starts the next as one completes", async () => {
    const calls = Array.from({ length: 5 }, () => deferred<void>());
    let inFlight = 0;
    let mostInFlight = 0;
    const started: number[] = [];
    const result = mapInOrderAsync(
      calls,
      async (call, index) => {
        started.push(index);
        inFlight++;
        mostInFlight = Math.max(mostInFlight, inFlight);
        await call.promise;
        inFlight--;
      },
      2,
    );

    await flushAsync();
    expect(started).toEqual([0, 1]);
    calls[1]!.resolve();
    await flushAsync();
    expect(started).toEqual([0, 1, 2]);
    for (const call of calls) {
      call.resolve();
    }
    await result;

    expect(mostInFlight).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });

  it("rejects with the first failure and starts no call after it", async () => {
    const calls = Array.from({ length: 5 }, () => deferred<void>());
    const started: number[] = [];
    const result = mapInOrderAsync(
      calls,
      (call, index) => {
        started.push(index);
        return call.promise;
      },
      2,
    );

    await flushAsync();
    calls[0]!.reject(new Error("read failed"));
    await expect(result).rejects.toThrow("read failed");
    calls[1]!.resolve();
    await flushAsync();

    expect(started).toEqual([0, 1]);
  });

  it("returns an empty list for no items", async () => {
    await expect(
      mapInOrderAsync([], () => Promise.resolve(1)),
    ).resolves.toEqual([]);
  });
});
