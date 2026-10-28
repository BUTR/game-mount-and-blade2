import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  getBinaryModdingPath,
  getBinaryPath,
  isStoreStandard,
  isStoreSteam,
  isStoreXbox,
  vortexStoreToLibraryStore,
} from "./store";

vi.mock("@butr/vortexextensionnative", () => ({}));

describe("vortexStoreToLibraryStore", () => {
  it("maps Vortex's store ids to the library's stores", () => {
    expect(vortexStoreToLibraryStore("steam")).toBe("Steam");
    expect(vortexStoreToLibraryStore("gog")).toBe("GOG");
    expect(vortexStoreToLibraryStore("epic")).toBe("Epic");
    expect(vortexStoreToLibraryStore("xbox")).toBe("Xbox");
  });

  it("doesn't know other stores, nor the ids in another case", () => {
    expect(vortexStoreToLibraryStore("Steam")).toBe("Unknown");
    expect(vortexStoreToLibraryStore("humble")).toBe("Unknown");
    expect(vortexStoreToLibraryStore("")).toBe("Unknown");
  });
});

describe("store checks", () => {
  it("counts Steam, GOG and Epic as the standard stores", () => {
    expect(isStoreStandard("steam")).toBe(true);
    expect(isStoreStandard("gog")).toBe(true);
    expect(isStoreStandard("epic")).toBe(true);
    expect(isStoreStandard("xbox")).toBe(false);
    expect(isStoreStandard("Steam")).toBe(false);
    expect(isStoreStandard(undefined)).toBe(false);
  });

  it("tells Steam and Xbox apart from the rest", () => {
    expect(isStoreSteam("steam")).toBe(true);
    expect(isStoreSteam("gog")).toBe(false);
    expect(isStoreSteam(undefined)).toBe(false);
    expect(isStoreXbox("xbox")).toBe(true);
    expect(isStoreXbox("steam")).toBe(false);
    expect(isStoreXbox(undefined)).toBe(false);
  });
});

describe("binary folders", () => {
  it("uses Xbox's binary folder only for Xbox", () => {
    expect(getBinaryPath("xbox")).toBe(
      path.join("bin", "Gaming.Desktop.x64_Shipping_Client"),
    );
    expect(getBinaryPath("steam")).toBe(
      path.join("bin", "Win64_Shipping_Client"),
    );
    expect(getBinaryPath(undefined)).toBe(
      path.join("bin", "Win64_Shipping_Client"),
    );
  });

  it("has one editor folder, the Modding Kit is Steam's only", () => {
    const editor = path.join("bin", "Win64_Shipping_wEditor");

    expect(getBinaryModdingPath("steam")).toBe(editor);
    expect(getBinaryModdingPath("xbox")).toBe(editor);
    expect(getBinaryModdingPath(undefined)).toBe(editor);
  });
});
