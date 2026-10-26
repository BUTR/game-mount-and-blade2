import { describe, expect, it } from "vitest";
import { parseBannerCode } from "./code";

const BACKGROUND = "11.84.84.1528.1528.764.764.0.0.0";
const ICON = "133.116.116.493.493.764.764.1.1.-45";

describe("parseBannerCode", () => {
  it("parses each ten fields into a layer, the background first", () => {
    expect(parseBannerCode(`${BACKGROUND}.${ICON}`)).toEqual([
      {
        meshId: 11,
        colorId: 84,
        colorId2: 84,
        sizeX: 1528,
        sizeY: 1528,
        positionX: 764,
        positionY: 764,
        drawStroke: false,
        mirror: false,
        rotation: 0,
      },
      {
        meshId: 133,
        colorId: 116,
        colorId2: 116,
        sizeX: 493,
        sizeY: 493,
        positionX: 764,
        positionY: 764,
        drawStroke: true,
        mirror: true,
        rotation: -45,
      },
    ]);
  });

  it("treats only 1 as true for the stroke and mirror flags", () => {
    const [layer] = parseBannerCode("1.2.3.4.5.6.7.2.-1.0")!;

    expect(layer!.drawStroke).toBe(false);
    expect(layer!.mirror).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseBannerCode(`  ${BACKGROUND}\n`)).toHaveLength(1);
  });

  it("ignores trailing fields that don't make a whole layer", () => {
    expect(parseBannerCode(`${BACKGROUND}.${ICON}.1.2.3`)).toHaveLength(2);
  });

  it("rejects codes with fewer fields than one layer", () => {
    expect(parseBannerCode("")).toBeNull();
    expect(parseBannerCode("1.2.3.4.5.6.7.8.9")).toBeNull();
  });

  it("rejects layers with fields that aren't integers", () => {
    expect(parseBannerCode("1.2.3.4.5.6.7.8.9.x")).toBeNull();
    expect(
      parseBannerCode(`${BACKGROUND}.133.116.116.4.5e2.764.764.1.1.0`),
    ).toBeNull();
    expect(parseBannerCode("1.2.3.4..6.7.8.9.10")).toBeNull();
    expect(parseBannerCode("1.2.3.4. 5.6.7.8.9.10")).toBeNull();
  });
});
