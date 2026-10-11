import { log, types } from "@nexusmods/vortex-api";
import path from "path";
import { readFile } from "node:fs/promises";
import { languageMap } from "../localization/utils";

export const languageFileRegex =
  /ModuleData[\\/]+Languages[\\/]+([^\\/]+)[\\/]+language_data\.xml$/i;

/**
 * Extract language name from language_data.xml file content.
 * Parses the XML to find the 'name' attribute from the LanguageData element.
 * @param xmlContent - The XML file content as string
 * @returns The language name, or undefined if not found
 */
const extractLanguageName = (xmlContent: string): string | undefined => {
  try {
    // Match the name attribute in the LanguageData element
    // Example: <LanguageData ... name="Français" ...>
    const nameMatch = xmlContent.match(
      /<LanguageData[^>]*\sname=["']([^"']+)["']/i,
    );
    return nameMatch?.[1];
  } catch (err) {
    log("error", "Error extracting language name from XML:", err);
    return undefined;
  }
};

/**
 * Helper to get language code or fallback to uppercase code from match.
 * @param languageCode - The language code from the path match
 * @returns The uppercase language code
 */
const getFallbackLanguageCode = (languageCode: string): string => {
  const code = languageCode.toString().trim();
  return code.length > 0 ? code.toUpperCase() : "";
};

/**
 * Extract all available translation languages from the instruction list.
 * Scans copy instructions for language_data.xml files in ModuleData/Languages/<lang>/ paths,
 * reads the XML files to extract the language names from the 'name' attribute.
 * @param instructions - The installation instructions to scan
 * @param destinationPath - The temporary extraction path where files are available during installation
 * @returns Array of language names, sorted alphabetically
 */
export const getAvailableTranslationLanguages = async (
  instructions: types.IInstruction[],
  destinationPath: string,
): Promise<string[]> => {
  const languageNames = new Set<string>();

  for (const instr of instructions) {
    if (instr.type !== "copy") continue;
    const dest = instr.destination ?? "";
    const match = dest.match(languageFileRegex);
    if (match?.[1] !== undefined) {
      // Try to read the language_data.xml file
      try {
        const source = instr.source ?? "";
        const filePath = path.join(destinationPath, source);
        const xmlContent = await readFile(filePath, { encoding: "utf-8" });
        const languageName = extractLanguageName(xmlContent);
        if (languageName !== undefined && languageName.length > 0) {
          languageNames.add(languageName);
        } else {
          // Fallback to language code if name not found
          const fallbackCode = getFallbackLanguageCode(match[1]);
          if (fallbackCode) {
            languageNames.add(fallbackCode);
          }
        }
      } catch (err) {
        // Fallback to language code if file read fails
        log("error", "Error reading language_data.xml file:", err);
        const fallbackCode = getFallbackLanguageCode(match[1]);
        if (fallbackCode) {
          languageNames.add(fallbackCode);
        }
      }
    }
  }

  return Array.from(languageNames).sort((a, b) => a.localeCompare(b));
};

/**
 * Push translation language attribute instructions to the instruction list.
 * Adds both a machine-readable array attribute and a human-friendly display string.
 * @param instructions - The instruction list to append to
 * @param languages - Array of language codes to persist as attributes
 */
export const pushTranslationLanguageAttributes = (
  instructions: types.IInstruction[],
  languages: string[],
): void => {
  if (languages.length === 0) return;

  const i18nLanguages = languages
    .map((lang) => languageMap.getCodeFromName(lang.trim()))
    .filter((lang) => lang && lang.length > 0);
  // Machine-readable array attribute
  instructions.push({
    type: "attribute",
    key: "translationLanguages",
    value: i18nLanguages,
  });

  // Human-friendly display string
  instructions.push({
    type: "attribute",
    key: "translationLanguagesText",
    value: languages.join(", "),
  });
};
