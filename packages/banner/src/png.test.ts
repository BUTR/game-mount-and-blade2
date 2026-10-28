import { describe, expect, it } from "vitest";
import { crc32, inflateSync } from "zlib";
import { encodePng } from "./png";

interface IChunk {
  type: string;
  data: Buffer;
  crc: number;
}

const readChunks = (png: Buffer): IChunk[] => {
  const chunks: IChunk[] = [];
  let position = 8;
  while (position < png.length) {
    const length = png.readUInt32BE(position);
    const type = png.toString("ascii", position + 4, position + 8);
    const data = png.subarray(position + 8, position + 8 + length);
    chunks.push({ type, data, crc: png.readUInt32BE(position + 8 + length) });
    position += 12 + length;
  }
  return chunks;
};

const pixels = (width: number, height: number): Uint8Array =>
  Uint8Array.from({ length: width * height * 4 }, (_, i) => (i * 7 + 3) & 0xff);

describe("encodePng", () => {
  it("starts with the PNG signature and has IHDR, IDAT and IEND chunks in order", () => {
    const png = encodePng(pixels(3, 2), 3, 2);

    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(readChunks(png).map((chunk) => chunk.type)).toEqual([
      "IHDR",
      "IDAT",
      "IEND",
    ]);
  });

  it("describes 8-bit RGBA without interlacing in the header", () => {
    const [header] = readChunks(encodePng(pixels(3, 2), 3, 2));

    expect(header!.data.length).toBe(13);
    expect(header!.data.readUInt32BE(0)).toBe(3);
    expect(header!.data.readUInt32BE(4)).toBe(2);
    expect([...header!.data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  });

  it("writes the CRC of each chunk's type and data", () => {
    const png = encodePng(pixels(5, 4), 5, 4);

    for (const chunk of readChunks(png)) {
      expect(chunk.crc).toBe(
        crc32(Buffer.concat([Buffer.from(chunk.type, "ascii"), chunk.data])),
      );
    }
  });

  it("stores each row unfiltered after a filter byte", () => {
    const rgba = pixels(5, 4);
    const [, data] = readChunks(encodePng(rgba, 5, 4));

    const rows = inflateSync(data!.data);

    expect(rows.length).toBe(4 * (1 + 5 * 4));
    for (let y = 0; y < 4; y++) {
      const row = rows.subarray(y * 21, (y + 1) * 21);
      expect(row[0]).toBe(0);
      expect([...row.subarray(1)]).toEqual([
        ...rgba.subarray(y * 20, (y + 1) * 20),
      ]);
    }
  });

  it("encodes an empty IEND chunk", () => {
    const chunks = readChunks(encodePng(pixels(1, 1), 1, 1));

    expect(chunks.at(-1)!.data.length).toBe(0);
  });

  it("rejects pixel data that doesn't match the size", () => {
    expect(() => encodePng(pixels(3, 2), 3, 3)).toThrow(
      "Expected 36 bytes of RGBA data, got 24",
    );
    expect(() => encodePng(pixels(3, 3), 3, 2)).toThrow(
      "Expected 24 bytes of RGBA data, got 36",
    );
  });
});
