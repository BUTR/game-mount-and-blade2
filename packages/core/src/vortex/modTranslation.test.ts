import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  isModTranslationArchive,
  isModTypeTranslation,
  modTranslationInstaller,
} from "./modTranslation";
import { GAME_ID } from "../common";

const launcherModules = vi.hoisted(() => ({
  value: {} as Record<string, { name: string }>,
}));

vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));
vi.mock("../launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({
      getAllModulesAsync: () => Promise.resolve(launcherModules.value),
    }),
  },
}));

const LANGUAGE_FILE = "ModuleData/Languages/RU/language_data.xml";

describe("isModTranslationArchive", () => {
  it("supports archives with language files and no module", async () => {
    const result = await isModTranslationArchive(
      [
        "./Diplomacy RU/ModuleData/Languages/RU/language_data.xml",
        "Diplomacy RU/ModuleData/Languages/RU/strings.xml",
        "readme.txt",
      ],
      GAME_ID,
    );

    expect(result).toEqual({
      supported: true,
      requiredFiles: ["Diplomacy RU/ModuleData/Languages/RU/language_data.xml"],
    });
  });

  it("leaves archives with a SubModule.xml to the module installer", async () => {
    const result = await isModTranslationArchive(
      [`Mod\\${LANGUAGE_FILE.replace(/\//g, "\\")}`, "Mod\\SUBMODULE.XML"],
      GAME_ID,
    );

    expect(result.supported).toBe(false);
  });

  it("doesn't support archives without language files or for other games", async () => {
    expect(
      (await isModTranslationArchive(["ModuleData/strings.xml"], GAME_ID))
        .supported,
    ).toBe(false);
    expect(
      (await isModTranslationArchive([LANGUAGE_FILE], "skyrimse")).supported,
    ).toBe(false);
  });
});

describe("isModTypeTranslation", () => {
  const copy = (destination: string): types.IInstruction => ({
    type: "copy",
    source: destination,
    destination,
  });

  it("is a translation when language files are installed without a module", () => {
    expect(isModTypeTranslation([copy(`Modules/Mod/${LANGUAGE_FILE}`)])).toBe(
      true,
    );
    expect(
      isModTypeTranslation([
        copy(`Modules/Mod/${LANGUAGE_FILE}`),
        copy("Modules/Mod/SubModule.xml"),
      ]),
    ).toBe(false);
    expect(isModTypeTranslation([copy("Modules/Mod/readme.txt")])).toBe(false);
  });
});

describe("modTranslationInstaller", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bannerlord-translation-"));
    launcherModules.value = {};
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const makeApi = (downloads: Record<string, unknown> = {}) => {
    const api = {
      getState: () => ({
        persistent: { downloads: { files: downloads }, mods: {} },
      }),
      sendNotification: vi.fn(),
      showErrorNotification: vi.fn(),
    };
    return api;
  };

  const install = async (
    api: ReturnType<typeof makeApi>,
    files: string[],
    archivePath?: string,
  ): Promise<types.IInstruction[]> => {
    const result = await modTranslationInstaller(
      api as unknown as types.IExtensionApi,
      files,
      root,
      GAME_ID,
      () => undefined,
      undefined,
      undefined,
      archivePath,
    );
    return result.instructions;
  };

  const copies = (instructions: types.IInstruction[]) =>
    instructions
      .filter((instruction) => instruction.type === "copy")
      .map(({ source, destination }) => ({ source, destination }));

  const attribute = (instructions: types.IInstruction[], key: string) =>
    instructions.find(
      (instruction) =>
        instruction.type === "attribute" && instruction.key === key,
    )?.value;

  it("installs the language files under the module folder found before ModuleData", async () => {
    const api = makeApi();
    const instructions = await install(api, [
      "I Dont Care RU 2.8.1\\IDontCare\\ModuleData\\Languages\\RU\\language_data.xml",
      "I Dont Care RU 2.8.1/IDontCare/ModuleData/Languages/RU/",
      "I Dont Care RU 2.8.1/readme.txt",
    ]);

    expect(copies(instructions)).toEqual([
      {
        source:
          "I Dont Care RU 2.8.1/IDontCare/ModuleData/Languages/RU/language_data.xml",
        destination:
          "Modules/IDontCare/ModuleData/Languages/RU/language_data.xml",
      },
    ]);
    expect(
      attribute(instructions, "inferredTranslationTarget"),
    ).toBeUndefined();
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it("keeps paths that already start in the Modules folder", async () => {
    const instructions = await install(makeApi(), [
      `./Modules/IDontCare/${LANGUAGE_FILE}`,
    ]);

    expect(copies(instructions)).toEqual([
      {
        source: `Modules/IDontCare/${LANGUAGE_FILE}`,
        destination: `Modules/IDontCare/${LANGUAGE_FILE}`,
      },
    ]);
  });

  it("records the languages it reads from the extracted files", async () => {
    const source = `IDontCare/${LANGUAGE_FILE}`;
    await mkdir(path.dirname(path.join(root, source)), { recursive: true });
    await writeFile(
      path.join(root, source),
      `<LanguageData id="Русский" name="Русский">`,
    );

    const instructions = await install(makeApi(), [source]);

    expect(attribute(instructions, "translationLanguages")).toEqual(["ru"]);
    expect(attribute(instructions, "translationLanguagesText")).toBe("Русский");
  });

  it("reports an unknown target for files directly in ModuleData without an archive", async () => {
    const api = makeApi();
    const instructions = await install(api, [LANGUAGE_FILE]);

    expect(copies(instructions)).toEqual([
      { source: LANGUAGE_FILE, destination: LANGUAGE_FILE },
    ]);
    expect(attribute(instructions, "inferredTranslationTarget")).toBe(
      "unknown",
    );
    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
  });

  describe("with files directly in ModuleData", () => {
    const archivePath = "C:\\Downloads\\Diplomacy RU-123-1-0.zip";
    const downloads = (name: string) => ({
      dl: {
        game: [GAME_ID],
        localPath: "Diplomacy RU-123-1-0.zip",
        modInfo: { nexus: { modInfo: { name } } },
      },
    });

    it("installs them under the module its Nexus Mods name matches", async () => {
      launcherModules.value = {
        "Bannerlord.Diplomacy": { name: "Diplomacy Mod" },
        "Bannerlord.Harmony": { name: "Harmony" },
      };
      const api = makeApi(
        downloads("Bannerlord Diplomacy Mod - Russian Translation"),
      );

      const instructions = await install(api, [LANGUAGE_FILE], archivePath);

      expect(copies(instructions)).toEqual([
        {
          source: LANGUAGE_FILE,
          destination: `Modules/Bannerlord.Diplomacy/${LANGUAGE_FILE}`,
        },
      ]);
      expect(attribute(instructions, "inferredTranslationTarget")).toBe(
        "Bannerlord.Diplomacy",
      );
      expect(api.sendNotification).toHaveBeenCalledTimes(1);
      expect(api.showErrorNotification).not.toHaveBeenCalled();
    });

    it("doesn't guess from a weak match", async () => {
      launcherModules.value = {
        "Bannerlord.Diplomacy": { name: "Diplomacy" },
      };
      const api = makeApi(downloads("Diplomacy Russian Translation"));

      const instructions = await install(api, [LANGUAGE_FILE], archivePath);

      expect(copies(instructions)[0]?.destination).toBe(LANGUAGE_FILE);
      expect(attribute(instructions, "inferredTranslationTarget")).toBe(
        "unknown",
      );
    });

    it("doesn't guess without the archive's download", async () => {
      launcherModules.value = {
        "Bannerlord.Diplomacy": { name: "Diplomacy Mod" },
      };
      const api = makeApi(
        downloads("Bannerlord Diplomacy Mod - Russian Translation"),
      );

      const instructions = await install(
        api,
        [LANGUAGE_FILE],
        "C:\\Downloads\\Something Else.zip",
      );

      expect(attribute(instructions, "inferredTranslationTarget")).toBe(
        "unknown",
      );
    });
  });
});
