import path from "path";
import { pathToFileURL } from "url";
import { IWorkerRequest, WorkerResponse } from "./protocol";

/**
 * Starts the worker script next to the bundle (see rolldown.config.mjs), undefined when it can't be started, like
 * unbundled or outside a renderer
 */
const startWorker = (workerFile: string): Worker | undefined => {
  if (typeof Worker === "undefined") {
    return undefined;
  }
  try {
    // A file URL: Vortex's Content Security Policy blocks workers from blob URLs
    return new Worker(pathToFileURL(path.join(__dirname, workerFile)).href);
  } catch {
    return undefined;
  }
};

/**
 * Runs a job in a Web Worker of the renderer, started for it and closed after: work the renderer would otherwise do
 * while it renders. A job that throws rejects with its message. On the calling thread with `fallback` when the
 * worker can't run
 */
export const runInWorkerAsync = <TRequest, TResult>(
  workerFile: string,
  request: TRequest,
  fallback: (request: TRequest) => Promise<TResult>,
): Promise<TResult> => {
  const worker = startWorker(workerFile);
  if (worker === undefined) {
    return fallback(request);
  }
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse<TResult>>) => {
      worker.terminate();
      if ("result" in event.data) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error));
      }
    };
    // The script is missing or failed to load, a job failing is a message
    worker.onerror = () => {
      worker.terminate();
      resolve(fallback(request));
    };
    worker.postMessage({ id: 0, request } satisfies IWorkerRequest<TRequest>);
  });
};

/**
 * A Web Worker kept for the jobs sent to it, for jobs whose caches make the next ones cheap. It's started with the
 * first job and closed after `idleMs` without one, which frees what it cached. When it can't run, the jobs run on
 * the calling thread with `fallback`
 */
export interface IWorkerClient<TRequest, TResult> {
  run: (request: TRequest) => Promise<TResult>;
  /**
   * Closes the worker now, dropping what it cached. Jobs still running reject, the next job starts a new worker
   */
  terminate: () => void;
}

export const createWorkerClient = <TRequest, TResult>(
  workerFile: string,
  fallback: (request: TRequest) => Promise<TResult>,
  idleMs: number,
): IWorkerClient<TRequest, TResult> => {
  let worker: Worker | undefined;
  // Once a worker failed to load its script, the next ones would too
  let unavailable = false;
  let nextId = 1;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<
    number,
    {
      request: TRequest;
      resolve: (result: TResult | Promise<TResult>) => void;
      reject: (err: Error) => void;
    }
  >();

  const close = (): void => {
    worker?.terminate();
    worker = undefined;
  };
  const scheduleClose = (): void => {
    clearTimeout(idleTimer);
    if (pending.size === 0) {
      idleTimer = setTimeout(close, idleMs);
    }
  };

  const getWorker = (): Worker | undefined => {
    if (worker !== undefined || unavailable) {
      return worker;
    }
    worker = startWorker(workerFile);
    if (worker === undefined) {
      unavailable = true;
      return undefined;
    }
    worker.onmessage = (event: MessageEvent<WorkerResponse<TResult>>) => {
      const job = pending.get(event.data.id);
      pending.delete(event.data.id);
      if ("result" in event.data) {
        job?.resolve(event.data.result);
      } else {
        job?.reject(new Error(event.data.error));
      }
      scheduleClose();
    };
    // The script is missing or failed to load: the jobs sent to it run here
    worker.onerror = () => {
      close();
      unavailable = true;
      for (const job of pending.values()) {
        job.resolve(fallback(job.request));
      }
      pending.clear();
    };
    return worker;
  };

  return {
    run: (request) => {
      const current = getWorker();
      if (current === undefined) {
        return fallback(request);
      }
      clearTimeout(idleTimer);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { request, resolve, reject });
        current.postMessage({
          id,
          request,
        } satisfies IWorkerRequest<TRequest>);
      });
    },
    terminate: () => {
      clearTimeout(idleTimer);
      close();
      for (const job of pending.values()) {
        job.reject(new WorkerTerminatedError());
      }
      pending.clear();
    },
  };
};

/**
 * A job of a worker closed by terminate, its result isn't wanted anymore
 */
export class WorkerTerminatedError extends Error {
  public constructor() {
    super("The worker was closed before the job finished");
  }
}
