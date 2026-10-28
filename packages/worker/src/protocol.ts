/**
 * A request to a worker. The id pairs it with its response, a long-lived worker has several in flight
 */
export interface IWorkerRequest<TRequest> {
  id: number;
  request: TRequest;
}

/**
 * What a worker sends back: its result, or the message of what it threw
 */
export type WorkerResponse<TResult> = { id: number } & (
  | { result: TResult }
  | { error: string }
);
