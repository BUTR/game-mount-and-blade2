import { types, util } from 'vortex-api';
import { Utils } from '@butr/vortexextensionnative';
import { Dirent, readdirSync, readFileSync } from 'fs';
import { TranslateValues } from './types';
import { i18nToBannerlord } from './utils';
import { I18N_NAMESPACE } from '../common';

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

  public localize = (template: string, values: TranslateValues = {}): string => {
    if (template.startsWith('{=')) {
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
    readdirSync(__dirname, { withFileTypes: true }).forEach((d: Dirent) => {
      if (d.isFile() && d.name.startsWith('localization_') && d.name.endsWith('.xml')) {
        const content: string = readFileSync(`${__dirname}/${d.name}`, {
          encoding: 'utf8',
        });
        Utils.loadLocalization(content);
      }
    });
    Utils.setLanguage(i18nToBannerlord(util.getCurrentLanguage()));
  };
}
