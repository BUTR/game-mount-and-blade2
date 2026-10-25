import { get } from "http";
import { IServerEntry } from "./types";

// The game client waits up to 1.8s for the map list before proceeding to join regardless.
const REQUEST_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export type ServerHttpResult =
  | { kind: "ok"; body: string; responseTimeMs: number }
  | { kind: "status"; statusCode: number; responseTimeMs: number }
  | { kind: "failed"; error: string; responseTimeMs: number | null };

/**
 * Sends an HTTP GET request to the embedded web server running on the dedicated server's game port (TCP).
 * Never rejects.
 */
export const getFromServerAsync = (
  server: Pick<IServerEntry, "address" | "port">,
  path: string,
): Promise<ServerHttpResult> =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    let responseTimeMs: number | null = null;
    let settled = false;
    // The socket timeout only covers inactivity, a server trickling bytes would keep the request open forever
    const deadline = setTimeout(() => {
      fail(new Error("The server did not respond in time"));
      request.destroy();
    }, REQUEST_TIMEOUT_MS);
    const finish = (result: ServerHttpResult): void => {
      if (!settled) {
        settled = true;
        clearTimeout(deadline);
        resolve(result);
      }
    };
    const fail = (err: Error): void => {
      finish({ kind: "failed", error: err.message, responseTimeMs });
    };

    const request = get(
      {
        host: server.address,
        port: server.port,
        path,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: "application/json",
          "User-Agent": `Vortex BUTR Extension v${__EXTENSION_VERSION__}`,
        },
      },
      (response) => {
        const elapsed = Date.now() - startedAt;
        responseTimeMs = elapsed;

        if (response.statusCode !== 200) {
          response.resume();
          finish({
            kind: "status",
            statusCode: response.statusCode ?? 0,
            responseTimeMs: elapsed,
          });
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        // Once the response stream has started, aborting the request emits errors on the response stream.
        response
          .on("data", (chunk: Buffer) => {
            if (settled) {
              return;
            }
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              fail(new Error("The response is too large"));
              request.destroy();
              return;
            }
            chunks.push(chunk);
          })
          .on("end", () => {
            finish({
              kind: "ok",
              body: Buffer.concat(chunks).toString("utf8"),
              responseTimeMs: elapsed,
            });
          })
          .on("error", fail)
          .on("close", () => {
            fail(new Error("The server closed the connection early"));
          });
      },
    );

    request.on("timeout", () => {
      fail(new Error("The server did not respond in time"));
      request.destroy();
    });
    request.on("error", fail);
  });

/**
 * Parses JSON response text, handling double-encoded strings from ASP.NET controllers that pre-serialize response payloads.
 */
export const parseJsonBody = (text: string): unknown => {
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
