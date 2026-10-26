import { describe, expect, it } from "vitest";
import { decompressLz4Block } from "./lz4";

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === "string" ? [...Buffer.from(part, "latin1")] : part,
    ),
  );

const text = (data: Uint8Array): string => Buffer.from(data).toString("latin1");

describe("decompressLz4Block", () => {
  it("copies a block of literals only", () => {
    const block = bytes([0x50], "hello");

    expect(text(decompressLz4Block(block, 5))).toBe("hello");
  });

  it("copies a match from earlier output, then the final literals", () => {
    // 3 literals, a match of 5 + 4 at offset 3, then 1 literal
    const block = bytes([0x35], "abc", [3, 0], [0x10], "!");

    expect(text(decompressLz4Block(block, 13))).toBe("abcabcabcabc!");
  });

  it("repeats a match that overlaps the bytes it is writing", () => {
    const block = bytes([0x16], "a", [1, 0]);

    expect(text(decompressLz4Block(block, 11))).toBe("a".repeat(11));
  });

  it("reads a two-byte little-endian match offset", () => {
    const literals = Array.from({ length: 300 }, (_, i) => i & 0xff);
    // 300 literals: 15 + 255 + 30. Then a match of 4 at offset 300 (0x012c)
    const block = bytes([0xf0, 255, 30], literals, [0x2c, 0x01]);

    const output = decompressLz4Block(block, 304);

    expect([...output.subarray(300)]).toEqual([0, 1, 2, 3]);
  });

  it("extends literal and match lengths with continuation bytes", () => {
    const literals = "x".repeat(15 + 255 + 255 + 2);
    // Match length 15 + 10 + 4 = 29 at offset 2
    const block = bytes([0xff, 255, 255, 2], literals, [2, 0], [10]);

    const output = decompressLz4Block(block, literals.length + 29);

    expect(text(output)).toBe("x".repeat(literals.length + 29));
  });

  it("decompresses an empty block to nothing", () => {
    expect(decompressLz4Block(new Uint8Array(0), 0)).toEqual(new Uint8Array(0));
  });

  it("rejects a match offset of zero", () => {
    const block = bytes([0x10], "a", [0, 0]);

    expect(() => decompressLz4Block(block, 5)).toThrow("Corrupt LZ4 block");
  });

  it("rejects a match reaching back before the output's start", () => {
    const block = bytes([0x10], "a", [2, 0]);

    expect(() => decompressLz4Block(block, 5)).toThrow("Corrupt LZ4 block");
  });

  it("rejects literals running past the end of the block", () => {
    const block = bytes([0x50], "abc");

    expect(() => decompressLz4Block(block, 5)).toThrow("Corrupt LZ4 block");
  });

  it("rejects literals that don't fit the output", () => {
    const block = bytes([0x50], "hello");

    expect(() => decompressLz4Block(block, 4)).toThrow("Corrupt LZ4 block");
  });

  it("rejects a match that doesn't fit the output", () => {
    const block = bytes([0x16], "a", [1, 0]);

    expect(() => decompressLz4Block(block, 10)).toThrow("Corrupt LZ4 block");
  });

  it("rejects a block cut off inside a match offset", () => {
    const block = bytes([0x10], "a", [1]);

    expect(() => decompressLz4Block(block, 5)).toThrow("Corrupt LZ4 block");
  });

  it("rejects a block cut off inside a length's continuation bytes", () => {
    const block = bytes([0xf0, 255]);

    expect(() => decompressLz4Block(block, 300)).toThrow("Corrupt LZ4 block");
  });

  it("decompresses a block as the reference compressor lays it out", () => {
    // 32 bytes of "a" as LZ4_compress_default encodes them: one literal, then a match of 26 at offset 1 (15 in the
    // token, 7 more, plus the 4 of a minimal match), stopping 5 bytes short of the end, which stay literals
    const block = bytes([0x1f], "a", [1, 0], [7], [0x50], "aaaaa");

    expect(text(decompressLz4Block(block, 32))).toBe("a".repeat(32));
  });

  it("rejects a block that decompresses to fewer bytes than expected", () => {
    const block = bytes([0x50], "hello");

    expect(() => decompressLz4Block(block, 6)).toThrow(
      "decompressed to 5 bytes, expected 6",
    );
  });
});
