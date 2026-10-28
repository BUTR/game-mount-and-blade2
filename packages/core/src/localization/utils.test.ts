import { describe, expect, it } from "vitest";
import { languageMap } from "./utils";

describe("languageMap", () => {
  it("maps Vortex's language codes to the game's language names", () => {
    expect(languageMap.getNameFromCode("en")).toBe("English");
    expect(languageMap.getNameFromCode("zh")).toBe("简体中文");
    expect(languageMap.getNameFromCode("es")).toBe("Español (LA)");
  });

  it("matches codes regardless of case", () => {
    expect(languageMap.getNameFromCode("pt-BR")).toBe("Português (BR)");
    expect(languageMap.getNameFromCode("pt-br")).toBe("Português (BR)");
    expect(languageMap.getNameFromCode("DE")).toBe("Deutsch");
    expect(languageMap.hasCode("PT-BR")).toBe(true);
  });

  it("falls back to the uppercased code for an unknown language", () => {
    expect(languageMap.getNameFromCode("xx")).toBe("XX");
    expect(languageMap.hasCode("xx")).toBe(false);
  });

  it("maps names back to the original code", () => {
    expect(languageMap.getCodeFromName("Português (BR)")).toBe("pt-BR");
    expect(languageMap.getCodeFromName("Klingon")).toBeUndefined();
  });

  it("round-trips every code through its name", () => {
    for (const code of languageMap.getAllCodes()) {
      const name = languageMap.getNameFromCode(code);
      expect(languageMap.hasName(name)).toBe(true);
      expect(languageMap.getCodeFromName(name)?.toLowerCase()).toBe(code);
    }
  });
});
