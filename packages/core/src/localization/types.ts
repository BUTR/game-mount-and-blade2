export type TranslateValues = Readonly<Record<string, string | object>>;

/**
 * LocalizationManager's localize, as components and column helpers take it: `t`
 */
export type Localize = (template: string, values?: TranslateValues) => string;
