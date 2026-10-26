import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkerClient,
  runInWorkerAsync,
  WorkerTerminatedError,
} from "./client";
import { serveWorker } from "./host";
import { IWorkerRequest, WorkerResponse } from "./protocol";

type Request = { value: number };

class FakeWorker {
  public static instances: FakeWorker[] = [];

  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public readonly posted: IWorkerRequest<Request>[] = [];
  public terminated = false;

  public constructor(public readonly url: string) {
    FakeWorker.instances.push(this);
  }

  public postMessage(message: IWorkerRequest<Request>): void {
    this.posted.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public respond(data: WorkerResponse<number>): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  public fail(): void {
    this.onerror?.({} as Event);
  }
}

const lastWorker = (): FakeWorker => {
  const worker = FakeWorker.instances.at(-1);
  if (worker === undefined) {
    throw new Error("No worker was started");
  }
  return worker;
};

const fallback = vi.fn((request: Request) => Promise.resolve(-request.value));

beforeEach(() => {
  FakeWorker.instances = [];
  fallback.mockClear();
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runInWorkerAsync", () => {
  it("runs the job on the calling thread when there are no Web Workers", async () => {
    vi.stubGlobal("Worker", undefined);

    await expect(
      runInWorkerAsync("job.js", { value: 2 }, fallback),
    ).resolves.toBe(-2);
    expect(fallback).toHaveBeenCalledWith({ value: 2 });
  });

  it("runs the job on the calling thread when the worker can't be created", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        public constructor() {
          throw new Error("CSP");
        }
      },
    );

    await expect(
      runInWorkerAsync("job.js", { value: 3 }, fallback),
    ).resolves.toBe(-3);
  });

  it("starts the worker from a file URL of the script and sends it the request", () => {
    void runInWorkerAsync("job.js", { value: 1 }, fallback);

    const worker = lastWorker();
    expect(worker.url).toMatch(/^file:\/\/.*\/job\.js$/);
    expect(worker.posted).toEqual([{ id: 0, request: { value: 1 } }]);
  });

  it("resolves with the worker's result and closes the worker", async () => {
    const promise = runInWorkerAsync("job.js", { value: 1 }, fallback);
    const worker = lastWorker();

    worker.respond({ id: 0, result: 42 });

    await expect(promise).resolves.toBe(42);
    expect(worker.terminated).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("rejects with the message of what the job threw and closes the worker", async () => {
    const promise = runInWorkerAsync("job.js", { value: 1 }, fallback);
    const worker = lastWorker();

    worker.respond({ id: 0, error: "boom" });

    await expect(promise).rejects.toThrow(new Error("boom"));
    expect(worker.terminated).toBe(true);
  });

  it("runs the job on the calling thread when the worker script fails to load", async () => {
    const promise = runInWorkerAsync("job.js", { value: 5 }, fallback);
    const worker = lastWorker();

    worker.fail();

    await expect(promise).resolves.toBe(-5);
    expect(worker.terminated).toBe(true);
  });
});

describe("createWorkerClient", () => {
  it("pairs each response with its request by id, in any order", async () => {
    const client = createWorkerClient("job.js", fallback, 1000);
    const first = client.run({ value: 1 });
    const second = client.run({ value: 2 });
    const worker = lastWorker();
    const [firstRequest, secondRequest] = worker.posted;

    worker.respond({ id: secondRequest!.id, result: 20 });
    worker.respond({ id: firstRequest!.id, result: 10 });

    await expect(first).resolves.toBe(10);
    await expect(second).resolves.toBe(20);
    expect(firstRequest!.id).not.toBe(secondRequest!.id);
    expect(worker.posted.map((x) => x.request)).toEqual([
      { value: 1 },
      { value: 2 },
    ]);
  });

  it("keeps one worker for the jobs sent to it", async () => {
    const client = createWorkerClient("job.js", fallback, 1000);

    const first = client.run({ value: 1 });
    lastWorker().respond({ id: lastWorker().posted[0]!.id, result: 1 });
    await first;
    const second = client.run({ value: 2 });
    lastWorker().respond({ id: lastWorker().posted[1]!.id, result: 2 });
    await second;

    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("rejects only the job that failed", async () => {
    const client = createWorkerClient("job.js", fallback, 1000);
    const failing = client.run({ value: 1 });
    const passing = client.run({ value: 2 });
    const worker = lastWorker();

    worker.respond({ id: worker.posted[0]!.id, error: "bad save" });
    worker.respond({ id: worker.posted[1]!.id, result: 2 });

    await expect(failing).rejects.toThrow("bad save");
    await expect(passing).resolves.toBe(2);
  });

  it("ignores a response for a job it doesn't have, like one of a closed worker", async () => {
    const client = createWorkerClient("job.js", fallback, 1000);
    const job = client.run({ value: 1 });
    const worker = lastWorker();

    worker.respond({ id: 999, result: 5 });
    worker.respond({ id: 999, error: "late" });
    worker.respond({ id: worker.posted[0]!.id, result: 1 });

    await expect(job).resolves.toBe(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("closes the worker after idleMs without a job and starts a new one for the next job", async () => {
    vi.useFakeTimers();
    const client = createWorkerClient("job.js", fallback, 1000);
    const job = client.run({ value: 1 });
    const worker = lastWorker();
    worker.respond({ id: worker.posted[0]!.id, result: 1 });
    await job;

    vi.advanceTimersByTime(999);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(worker.terminated).toBe(true);

    void client.run({ value: 2 });
    expect(FakeWorker.instances).toHaveLength(2);
    expect(lastWorker()).not.toBe(worker);
  });

  it("doesn't close the worker while a job is running", () => {
    vi.useFakeTimers();
    const client = createWorkerClient("job.js", fallback, 1000);
    void client.run({ value: 1 });
    void client.run({ value: 2 });
    const worker = lastWorker();

    worker.respond({ id: worker.posted[0]!.id, result: 1 });
    vi.advanceTimersByTime(5000);

    expect(worker.terminated).toBe(false);
  });

  it("a job sent before idleMs elapses keeps the worker open", async () => {
    vi.useFakeTimers();
    const client = createWorkerClient("job.js", fallback, 1000);
    const first = client.run({ value: 1 });
    const worker = lastWorker();
    worker.respond({ id: worker.posted[0]!.id, result: 1 });
    await first;

    vi.advanceTimersByTime(500);
    void client.run({ value: 2 });
    vi.advanceTimersByTime(5000);

    expect(worker.terminated).toBe(false);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("runs the jobs sent to a worker that failed to load on the calling thread, and the next ones too", async () => {
    const client = createWorkerClient("job.js", fallback, 1000);
    const first = client.run({ value: 1 });
    const second = client.run({ value: 2 });
    const worker = lastWorker();

    worker.fail();

    await expect(first).resolves.toBe(-1);
    await expect(second).resolves.toBe(-2);
    expect(worker.terminated).toBe(true);

    await expect(client.run({ value: 3 })).resolves.toBe(-3);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("tries to create the worker only once when it can't be created", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "Worker",
      class {
        public constructor() {
          attempts++;
          throw new Error("CSP");
        }
      },
    );
    const client = createWorkerClient("job.js", fallback, 1000);

    await expect(client.run({ value: 1 })).resolves.toBe(-1);
    await expect(client.run({ value: 2 })).resolves.toBe(-2);

    expect(attempts).toBe(1);
  });

  it("terminate rejects the running jobs and the next job starts a new worker", async () => {
    const client = createWorkerClient("job.js", fallback, 1000);
    const running = client.run({ value: 1 });
    const worker = lastWorker();

    client.terminate();

    await expect(running).rejects.toBeInstanceOf(WorkerTerminatedError);
    expect(worker.terminated).toBe(true);

    const next = client.run({ value: 2 });
    const newWorker = lastWorker();
    expect(newWorker).not.toBe(worker);
    newWorker.respond({ id: newWorker.posted[0]!.id, result: 2 });
    await expect(next).resolves.toBe(2);
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("client and host", () => {
  // A worker whose scope is this thread's globalThis, where serveWorker listens
  class LoopbackWorker {
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;

    public constructor() {
      vi.stubGlobal("postMessage", (data: unknown) => {
        setTimeout(() => this.onmessage?.({ data } as MessageEvent), 0);
      });
    }

    public postMessage(data: unknown): void {
      const scope = globalThis as unknown as {
        onmessage: (event: MessageEvent) => void;
      };
      setTimeout(() => scope.onmessage({ data } as MessageEvent), 0);
    }

    public terminate(): void {}
  }

  it("round-trips concurrent jobs with results and errors through serveWorker", async () => {
    vi.stubGlobal("onmessage", null);
    vi.stubGlobal("Worker", LoopbackWorker);
    serveWorker<Request, number>(async ({ value }) => {
      await new Promise((resolve) => setTimeout(resolve, 10 - value));
      if (value < 0) {
        throw new Error(`negative ${value}`);
      }
      return value * 10;
    });
    const client = createWorkerClient("job.js", fallback, 1000);

    const results = await Promise.allSettled([
      client.run({ value: 1 }),
      client.run({ value: -1 }),
      client.run({ value: 3 }),
    ]);

    expect(results).toEqual([
      { status: "fulfilled", value: 10 },
      { status: "rejected", reason: new Error("negative -1") },
      { status: "fulfilled", value: 30 },
    ]);
    expect(fallback).not.toHaveBeenCalled();
    client.terminate();
  });
});
