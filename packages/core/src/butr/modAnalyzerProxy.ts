import { types } from "@nexusmods/vortex-api";
import {
  getCompatibilityScoresAsync,
  IModAnalyzerRequestQuery,
  IModAnalyzerResult,
} from "@bannerlord/mod-analyzer";
import { USER_AGENT } from "../common";
import { LocalizationManager } from "../localization/manager";

export class ModAnalyzerProxy {
  /**
   * Reports a failure to the user before rejecting, callers can ignore the rejection
   */
  public async analyzeAsync(
    api: types.IExtensionApi,
    query: IModAnalyzerRequestQuery,
  ): Promise<IModAnalyzerResult> {
    try {
      return await getCompatibilityScoresAsync(query, {
        userAgent: USER_AGENT,
      });
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
}
