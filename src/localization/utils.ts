export const i18nToBannerlord = (languageCode: string): string => {
  switch (languageCode) {
    case "pt-BR":
      return "Português (BR)";
    case "by": // Not present
      return "Беларуская";
    //case 'byl': // Not present, no idea how to represent this one
    //  return 'Biełaruskaja';
    case "zh":
      return "简体中文";
    //case 'zh-Hant': // Since there's no distiction, better to use the simplified one?
    //  return '繁體中文';
    //  break;
    case "de":
      return "Deutsch";
    case "en":
      return "English";
    case "fr":
      return "Français";
    case "it":
      return "Italiano";
    case "ja":
      return "日本語";
    case "ko":
      return "한국어";
    case "pl":
      return "Polski";
    case "ro": // Not present
      return "Română";
    case "ru":
      return "Русский";
    case "es":
      return "Español (LA)";
    case "tr":
      return "Türkçe";
    case "uk":
      return "Українська";
    default:
      return "English";
  }
};
