import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { Utils } from "@butr/vortexextensionnative";
import { LocalizationManager } from "./manager";
import { I18N_NAMESPACE } from "../common";

vi.mock("@nexusmods/vortex-api", () => ({
  util: { getCurrentLanguage: () => "pt-BR" },
}));

vi.mock("@butr/vortexextensionnative", () => ({
  Utils: {
    loadLocalization: vi.fn(),
    setLanguage: vi.fn(),
    localizeString: vi.fn(
      (template: string, values: Record<string, string>) =>
        `localized:${template}:${JSON.stringify(values)}`,
    ),
  },
}));

const createApi = (): types.IExtensionApi =>
  ({
    translate: vi.fn(
      (template: string, options: object) =>
        `translated:${template}:${JSON.stringify(options)}`,
    ),
  }) as unknown as types.IExtensionApi;

describe("LocalizationManager.localize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders game-style {=id} templates with the native localization", () => {
    const manager = new LocalizationManager(createApi());

    const result = manager.localize("{=abc}Hello {NAME}", { NAME: "Calradia" });

    expect(result).toBe('localized:{=abc}Hello {NAME}:{"NAME":"Calradia"}');
  });

  it("loads the bundled localization and the game's name of Vortex's language once", () => {
    const manager = new LocalizationManager(createApi());

    manager.localize("{=a}A");
    manager.localize("{=b}B");

    expect(Utils.setLanguage).toHaveBeenCalledTimes(1);
    expect(Utils.setLanguage).toHaveBeenCalledWith("Português (BR)");
    const loads = vi.mocked(Utils.loadLocalization).mock.calls.length;
    expect(loads).toBeGreaterThan(0);
    manager.localize("{=c}C");
    expect(Utils.loadLocalization).toHaveBeenCalledTimes(loads);
  });

  it("sends other strings to Vortex's translation in the extension's namespace", () => {
    const api = createApi();
    const manager = new LocalizationManager(api);

    manager.localize("Failed to read load order", { replace: { a: "b" } });

    expect(api.translate).toHaveBeenCalledWith("Failed to read load order", {
      ns: I18N_NAMESPACE,
      replace: { a: "b" },
    });
    expect(Utils.localizeString).not.toHaveBeenCalled();
    expect(Utils.setLanguage).not.toHaveBeenCalled();
  });
});
