import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { getCompatibilityScoresAsync } from "@bannerlord/mod-analyzer";
import { ModAnalyzerProxy } from "./modAnalyzerProxy";
import { USER_AGENT } from "../common";

vi.mock("@bannerlord/mod-analyzer", () => ({
  getCompatibilityScoresAsync: vi.fn(),
}));

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const query = { gameVersion: "v1.2.12.0", modules: [] };

const createApi = (): types.IExtensionApi =>
  ({ showErrorNotification: vi.fn() }) as unknown as types.IExtensionApi;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModAnalyzerProxy.analyzeAsync", () => {
  it("queries the analyzer as the extension", async () => {
    const result = { modules: [] };
    vi.mocked(getCompatibilityScoresAsync).mockResolvedValue(result);
    const api = createApi();

    expect(await new ModAnalyzerProxy().analyzeAsync(api, query)).toBe(result);

    expect(getCompatibilityScoresAsync).toHaveBeenCalledWith(query, {
      userAgent: USER_AGENT,
    });
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it("reports a failure without a report button, then rejects with it", async () => {
    const failure = new Error("503");
    vi.mocked(getCompatibilityScoresAsync).mockRejectedValue(failure);
    const api = createApi();

    await expect(new ModAnalyzerProxy().analyzeAsync(api, query)).rejects.toBe(
      failure,
    );

    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Failed to get compatibility scores!",
      failure,
      { allowReport: false },
    );
  });
});
