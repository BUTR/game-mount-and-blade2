import { types, util } from "@nexusmods/vortex-api";
import { Utils } from "@butr/vortexextensionnative";
import localizationFiles from "virtual:localization";
import { Localize, TranslateValues } from "./types";
import { languageMap } from "./utils";
import { I18N_NAMESPACE } from "../common";

export class LocalizationManager {
  private static instance: LocalizationManager | undefined;

  public static getInstance(api: types.IExtensionApi): LocalizationManager {
    if (!LocalizationManager.instance) {
      LocalizationManager.instance = new LocalizationManager(api);
    }

    return LocalizationManager.instance;
  }

  private readonly api: types.IExtensionApi;
  private initializedLocalization = false;

  constructor(api: types.IExtensionApi) {
    this.api = api;
  }

  public localize: Localize = (
    template: string,
    values: TranslateValues = {},
  ): string => {
    if (template.startsWith("{=")) {
      if (!this.initializedLocalization) {
        this.initializeLocalization();
        this.initializedLocalization = true;
      }

      return Utils.localizeString(template, values as Record<string, string>);
    }
    return this.api.translate(template, {
      ns: I18N_NAMESPACE,
      ...values,
    });
  };

  private initializeLocalization = (): void => {
    // Bundled at build time, not read from the extension's folder
    for (const content of localizationFiles) {
      Utils.loadLocalization(content);
    }
    Utils.setLanguage(languageMap.getNameFromCode(util.getCurrentLanguage()));
  };
}
