import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { types } from "@nexusmods/vortex-api";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  getAvailableTranslationLanguages,
  languageFileRegex,
  pushTranslationLanguageAttributes,
} from "./translationLanguages";

const copy = (source: string, destination = source): types.IInstruction => ({
  type: "copy",
  source,
  destination,
});

describe("languageFileRegex", () => {
  it("matches a language_data.xml in a language folder with either separator", () => {
    expect(
      languageFileRegex.exec(
        "Modules/Mod/ModuleData/Languages/RU/language_data.xml",
      )?.[1],
    ).toBe("RU");
    expect(
      languageFileRegex.exec(
        "Mod\\ModuleData\\Languages\\PT-BR\\Language_Data.XML",
      )?.[1],
    ).toBe("PT-BR");
  });

  it("doesn't match other files or a language_data.xml outside a language folder", () => {
    expect(languageFileRegex.test("ModuleData/Languages/RU/strings.xml")).toBe(
      false,
    );
    expect(
      languageFileRegex.test("ModuleData/Languages/language_data.xml"),
    ).toBe(false);
  });
});

describe("getAvailableTranslationLanguages", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bannerlord-languages-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeLanguageData = async (
    language: string,
    content: string,
  ): Promise<string> => {
    const relative = path.join(
      "ModuleData",
      "Languages",
      language,
      "language_data.xml",
    );
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content, "utf8");
    return relative;
  };

  it("reads each language's name from its language_data.xml, sorted", async () => {
    const german = await writeLanguageData(
      "DE",
      `<LanguageData id="Deutsch" name="Deutsch" subtitle_extension="de">`,
    );
    const french = await writeLanguageData(
      "FR",
      `<?xml version="1.0"?>\n<LanguageData id="Français" name='Français'>\n</LanguageData>`,
    );

    const result = await getAvailableTranslationLanguages(
      [copy(french), copy(german)],
      root,
    );

    expect(result).toEqual(["Deutsch", "Français"]);
  });

  it("falls back to the folder's code in uppercase without a name or a readable file", async () => {
    const noName = await writeLanguageData("de", `<LanguageData id="de">`);
    const missing = path.join(
      "ModuleData",
      "Languages",
      "tr",
      "language_data.xml",
    );

    const result = await getAvailableTranslationLanguages(
      [copy(noName), copy(missing)],
      root,
    );

    expect(result).toEqual(["DE", "TR"]);
  });

  it("lists a language once and ignores other instructions", async () => {
    const russian = await writeLanguageData(
      "RU",
      `<LanguageData name="Русский">`,
    );

    const result = await getAvailableTranslationLanguages(
      [
        copy(russian),
        copy(russian, `Modules/Other/${russian}`),
        copy("ModuleData/Languages/RU/strings.xml"),
        { type: "attribute", key: "x", value: russian },
      ],
      root,
    );

    expect(result).toEqual(["Русский"]);
  });

  it("matches the destination, the source is where the file is read from", async () => {
    const source = await writeLanguageData(
      "RU",
      `<LanguageData name="Русский">`,
    );

    const result = await getAvailableTranslationLanguages(
      [copy(source, "Modules/Mod/ModuleData/Languages/RU/language_data.xml")],
      root,
    );

    expect(result).toEqual(["Русский"]);
  });
});

describe("pushTranslationLanguageAttributes", () => {
  const attributes = (languages: string[]): Record<string, unknown> => {
    const instructions: types.IInstruction[] = [];
    pushTranslationLanguageAttributes(instructions, languages);
    return Object.fromEntries(
      instructions.map((instruction) => [instruction.key, instruction.value]),
    );
  };

  it("adds nothing without languages", () => {
    const instructions: types.IInstruction[] = [];
    pushTranslationLanguageAttributes(instructions, []);
    expect(instructions).toEqual([]);
  });

  it("maps language names and folder codes to language codes", () => {
    expect(attributes(["Русский", "DE", "PT-BR"])).toEqual({
      translationLanguages: ["ru", "de", "pt-BR"],
      translationLanguagesText: "Русский, DE, PT-BR",
    });
  });

  it("lists a language once when both its name and its code were found", () => {
    expect(attributes(["Français", "FR"])["translationLanguages"]).toEqual([
      "fr",
    ]);
  });

  it("keeps languages it doesn't know in the text only", () => {
    expect(attributes(["Esperanto", "XX"])).toEqual({
      translationLanguages: [],
      translationLanguagesText: "Esperanto, XX",
    });
  });
});
