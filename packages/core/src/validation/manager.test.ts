import { describe, expect, it } from "vitest";
import { types as vetypes } from "@butr/vortexextensionnative";
import { ValidationManager } from "./manager";
import { VortexLoadOrderEntry } from "../types";

const vortexEntry = (id: string, enabled: boolean): VortexLoadOrderEntry =>
  ({ id, name: id, enabled }) as unknown as VortexLoadOrderEntry;

describe("ValidationManager.fromVortex", () => {
  const manager = ValidationManager.fromVortex([
    vortexEntry("Native", true),
    vortexEntry("Bannerlord.Harmony", false),
  ]);

  it("selects the enabled entries", () => {
    expect(manager.isSelected("Native")).toBe(true);
  });

  it("doesn't select disabled entries", () => {
    expect(manager.isSelected("Bannerlord.Harmony")).toBe(false);
  });

  it("doesn't select modules the load order doesn't list", () => {
    expect(manager.isSelected("Missing")).toBe(false);
  });
});

describe("ValidationManager.fromLibrary", () => {
  const loadOrder: vetypes.LoadOrder = {
    Native: {
      id: "Native",
      name: "Native",
      isSelected: true,
      isDisabled: false,
      index: 0,
    },
    "Bannerlord.Harmony": {
      id: "Bannerlord.Harmony",
      name: "Harmony",
      isSelected: false,
      isDisabled: false,
      index: 1,
    },
  };
  const manager = ValidationManager.fromLibrary(loadOrder);

  it("selects by the entry's isSelected", () => {
    expect(manager.isSelected("Native")).toBe(true);
    expect(manager.isSelected("Bannerlord.Harmony")).toBe(false);
  });

  it("doesn't select modules the load order doesn't list", () => {
    expect(manager.isSelected("Missing")).toBe(false);
  });
});
