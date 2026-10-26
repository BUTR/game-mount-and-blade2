import { IWorkerRequest, WorkerResponse } from "./protocol";

/**
 * A Web Worker of the renderer, Vortex enables Node in them
 */
interface IWorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
}

/**
 * The worker's side of runInWorkerAsync and createWorkerClient: runs the job of each request and sends back its
 * result or its error
 */
export const serveWorker = <TRequest, TResult>(
  job: (request: TRequest) => Promise<TResult>,
): void => {
  const scope = globalThis as unknown as IWorkerScope;
  scope.onmessage = (event) => {
    const { id, request } = event.data as IWorkerRequest<TRequest>;
    // A job that throws before returning its promise is answered too, uncaught it would read as the worker failing
    void new Promise<TResult>((resolve) => resolve(job(request))).then(
      (result): void =>
        scope.postMessage({ id, result } satisfies WorkerResponse<TResult>),
      (err: unknown): void =>
        scope.postMessage({
          id,
          error: err instanceof Error ? err.message : String(err),
        } satisfies WorkerResponse<TResult>),
    );
  };
};
