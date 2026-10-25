import { types } from "@nexusmods/vortex-api";
import { request, RequestOptions } from "https";
import { BUTR_HOST } from "./const";
import { IModAnalyzerRequestQuery, IModAnalyzerResult } from "./types";
import { LocalizationManager } from "../localization/manager";

const REQUEST_TIMEOUT_MS = 30_000;

export class ModAnalyzerProxy {
  private options: RequestOptions;
  constructor() {
    this.options = {
      host: BUTR_HOST,
      method: "POST",
      protocol: "https:",
      path: "/api/v1/ModsAnalyzer/GetCompatibilityScore",
      headers: {
        Tenant: "1", // Bannerlord
        "Content-Type": "application/json",
        "User-Agent": `Vortex BUTR Extension v${__EXTENSION_VERSION__}`,
      },
    };
  }

  /**
   * Reports a failure to the user before rejecting, callers can ignore the rejection
   */
  public async analyzeAsync(
    api: types.IExtensionApi,
    query: IModAnalyzerRequestQuery,
  ): Promise<IModAnalyzerResult> {
    try {
      return await this.requestAsync(query);
    } catch (err) {
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(
        t("Failed to get compatibility scores!"),
        err,
        {
          allowReport: false,
        },
      );
      throw err;
    }
  }

  private requestAsync(
    query: IModAnalyzerRequestQuery,
  ): Promise<IModAnalyzerResult> {
    return new Promise((resolve, reject) => {
      const req = request(this.options, (res) => {
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
      });
      // An absolute deadline, a socket timeout would only catch inactivity
      const deadline = setTimeout(
        () => req.destroy(new Error("The BUTR server did not respond in time")),
        REQUEST_TIMEOUT_MS,
      );
      req.on("error", reject).on("close", () => clearTimeout(deadline));
      req.end(JSON.stringify(query));
    });
  }
}
