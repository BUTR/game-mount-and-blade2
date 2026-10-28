import { describe, expect, it } from "vitest";
import { formatSize } from "./format";

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1.0 MB"],
    [1024 * 1024 - 1, "1.0 MB"],
    [1024 * 1024 - 52, "1023.9 KB"],
    [1024 ** 3 - 1, "1.0 GB"],
    [5.5 * 1024 ** 3, "5.5 GB"],
    [2 * 1024 ** 4, "2.0 TB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  it("stays in terabytes past the largest unit", () => {
    expect(formatSize(2048 * 1024 ** 4)).toBe("2048.0 TB");
  });
});
