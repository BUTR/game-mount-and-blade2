import { fs, types, util } from 'vortex-api';
import { Utils } from '@butr/vortexextensionnative';
import { Dirent } from 'fs';
import { I18N_NAMESPACE } from '../../common';

export type TranslateValues = {
  [value: string]: string;
};

export const i18nToBannerlord = (languageCode: string) => {
  switch (languageCode) {
    case 'pt-BR':
      return 'Português (BR)';
    case 'by': // Not present
      return 'Беларуская';
    //case 'byl': // Not present, no idea how to represent this one
    //  return 'Biełaruskaja';
    case 'zh':
      return '简体中文';
    //case 'zh-Hant': // Since there's no distiction, better to use the simplified one?
    //  return '繁體中文';
    //  break;
    case 'de':
      return 'Deutsch';
    case 'en':
      return 'English';
    case 'fr':
      return 'Français';
    case 'it':
      return 'Italiano';
    case 'ja':
      return '日本語';
    case 'ko':
      return '한국어';
    case 'pl':
      return 'Polski';
    case 'ro': // Not present
      return 'Română';
    case 'ru':
      return 'Русский';
    case 'es':
      return 'Español (LA)';
    case 'tr':
      return 'Türkçe';
    case 'uk':
      return 'Українська';
    default:
      return 'English';
  }
};

export class LocalizationManager {
  private static instance: LocalizationManager;

  public static getInstance(api?: types.IExtensionApi): LocalizationManager {
    if (!LocalizationManager.instance) {
      if (api === undefined) {
        throw new Error('IniStructure is not context aware');
      }
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

      return Utils.localizeString(template, {
        ns: I18N_NAMESPACE,
        ...values,
      });
    }
    this.api.translate('', {});
    return this.api.translate(template, values);
  };

  private initializeLocalization = () => {
    fs.readdirSync(__dirname, { withFileTypes: true }).forEach((d: Dirent) => {
      if (d.isFile() && d.name.startsWith('localization_') && d.name.endsWith('.xml')) {
        const content: string = fs.readFileSync(`${__dirname}/${d.name}`, {
          encoding: 'utf8',
        });
        Utils.loadLocalization(content);
      }
    });
    Utils.setLanguage(i18nToBannerlord(util.getCurrentLanguage()));
  };
}
