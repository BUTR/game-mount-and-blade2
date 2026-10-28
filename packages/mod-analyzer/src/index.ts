import { request } from "https";

export const BUTR_HOST = "sitenexusmods.butr.link";

const REQUEST_TIMEOUT_MS = 30_000;

export interface IModAnalyzerRequestModule {
  moduleId: string;
  moduleVersion?: string;
}

export interface IModAnalyzerRequestQuery {
  gameVersion: string;
  modules: IModAnalyzerRequestModule[];
}

export interface IModAnalyzerResultModule {
  moduleId: string;
  compatibility: number;
  recommendedCompatibility: number | null;
  recommendedModuleVersion: string | null;
}

export interface IModAnalyzerResult {
  modules: IModAnalyzerResultModule[];
}

export interface IModAnalyzerOptions {
  /**
   * Sent as the User-Agent header
   */
  userAgent: string;
}

/**
 * Asks BUTR's ModAnalyzer how compatible the modules are with the game version
 */
export const getCompatibilityScoresAsync = (
  query: IModAnalyzerRequestQuery,
  options: IModAnalyzerOptions,
): Promise<IModAnalyzerResult> =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: BUTR_HOST,
        method: "POST",
        protocol: "https:",
        path: "/api/v1/ModsAnalyzer/GetCompatibilityScore",
        headers: {
          Tenant: "1", // Bannerlord
          "Content-Type": "application/json",
          "User-Agent": options.userAgent,
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(`The BUTR server responded with HTTP ${res.statusCode}`),
          );
          return;
        }
        const chunks: Buffer[] = [];
        res
          .on("error", reject)
          .on("data", (chunk: Buffer) => chunks.push(chunk))
          .on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (err) {
              reject(err);
            }
          })
          .on("close", () => {
            if (!res.complete) {
              reject(new Error("The BUTR server closed the connection early"));
            }
          });
      },
    );
    // An absolute deadline, a socket timeout would only catch inactivity
    const deadline = setTimeout(
      () => req.destroy(new Error("The BUTR server did not respond in time")),
      REQUEST_TIMEOUT_MS,
    );
    req.on("error", reject).on("close", () => clearTimeout(deadline));
    req.end(JSON.stringify(query));
  });
