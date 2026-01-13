/**
 * Bidirectional map for language code <-> language name conversions
 */
class LanguageMap {
  private codeToName: Map<string, string>;
  private nameToCode: Map<string, string>;

  constructor() {
    this.codeToName = new Map<string, string>();
    this.nameToCode = new Map<string, string>();
    this.initialize();
  }

  private initialize(): void {
    const mappings: Array<[string, string]> = [
      ["pt-BR", "Português (BR)"],
      ["by", "Беларуская"],
      ["zh", "简体中文"],
      ["de", "Deutsch"],
      ["en", "English"],
      ["fr", "Français"],
      ["it", "Italiano"],
      ["ja", "日本語"],
      ["ko", "한국어"],
      ["pl", "Polski"],
      ["ro", "Română"],
      ["ru", "Русский"],
      ["es", "Español (LA)"],
      ["tr", "Türkçe"],
      ["uk", "Українська"],
    ];

    for (const [code, name] of mappings) {
      this.codeToName.set(code.toLowerCase(), name);
      this.nameToCode.set(name, code);
    }
  }

  /**
   * Convert language code to language name
   * @param code - Language code (e.g., "en", "fr", "de")
   * @returns Language name (e.g., "English", "Français", "Deutsch"), or the code in uppercase if not found
   */
  public getNameFromCode(code: string): string {
    const normalized = code.toLowerCase();
    return this.codeToName.get(normalized) ?? code.toUpperCase();
  }

  /**
   * Convert language name to language code
   * @param name - Language name (e.g., "English", "Français", "Deutsch")
   * @returns Language code (e.g., "en", "fr", "de"), or undefined if not found
   */
  public getCodeFromName(name: string): string | undefined {
    return this.nameToCode.get(name);
  }

  /**
   * Check if a language code exists in the map
   * @param code - Language code to check
   * @returns true if the code exists
   */
  public hasCode(code: string): boolean {
    return this.codeToName.has(code.toLowerCase());
  }

  /**
   * Check if a language name exists in the map
   * @param name - Language name to check
   * @returns true if the name exists
   */
  public hasName(name: string): boolean {
    return this.nameToCode.has(name);
  }

  /**
   * Get all language codes
   * @returns Array of all language codes
   */
  public getAllCodes(): string[] {
    return Array.from(this.codeToName.keys());
  }

  /**
   * Get all language names
   * @returns Array of all language names
   */
  public getAllNames(): string[] {
    return Array.from(this.nameToCode.keys());
  }
}

// Export singleton instance
export const languageMap = new LanguageMap();

/**
 * @deprecated Use languageMap.getNameFromCode() instead
 */
export const i18nToBannerlord = (languageCode: string): string => {
  return languageMap.getNameFromCode(languageCode);
};
