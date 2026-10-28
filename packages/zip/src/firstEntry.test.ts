import { describe, expect, it } from "vitest";
import { crc32, deflateRawSync } from "zlib";
import { isZip, readFirstZipEntryAsync } from "./firstEntry";

interface IEntry {
  name: string;
  data: Buffer;
  method?: number;
  // Leaves the local header's sizes to a data descriptor, like a streamed archive
  descriptor?: boolean;
}

const buildZip = (entries: IEntry[], comment = Buffer.alloc(0)): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data, method = 0, descriptor = false } of entries) {
    const stored = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(descriptor ? 0x0008 : 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(descriptor ? 0 : crc, 14);
    local.writeUInt32LE(descriptor ? 0 : stored.length, 18);
    local.writeUInt32LE(descriptor ? 0 : data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const trailer = Buffer.alloc(descriptor ? 16 : 0);
    if (descriptor) {
      trailer.writeUInt32LE(0x08074b50, 0);
      trailer.writeUInt32LE(crc, 4);
      trailer.writeUInt32LE(stored.length, 8);
      trailer.writeUInt32LE(data.length, 12);
    }

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);

    const localRecord = Buffer.concat([local, nameBytes, stored, trailer]);
    locals.push(localRecord);
    centrals.push(Buffer.concat([central, nameBytes]));
    offset += localRecord.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, centralDirectory, end, comment]);
};

const MANIFEST = Buffer.from("manifest contents ".repeat(50), "utf8");

describe("isZip", () => {
  it("recognizes the local header signature", () => {
    expect(isZip(buildZip([{ name: "a", data: MANIFEST }]))).toBe(true);
  });

  it("rejects other data and data shorter than a signature", () => {
    expect(isZip(Buffer.from("PK\x05\x06rest", "latin1"))).toBe(false);
    expect(isZip(Buffer.from([0x50, 0x4b, 0x03]))).toBe(false);
    expect(isZip(Buffer.alloc(0))).toBe(false);
  });
});

describe("readFirstZipEntryAsync", () => {
  it("returns a stored first entry as it is", async () => {
    const zip = buildZip([{ name: "manifest", data: MANIFEST }]);

    expect(await readFirstZipEntryAsync(zip)).toEqual(MANIFEST);
  });

  it("inflates a deflated first entry", async () => {
    const zip = buildZip([{ name: "manifest", data: MANIFEST, method: 8 }]);

    expect(await readFirstZipEntryAsync(zip)).toEqual(MANIFEST);
  });

  it("returns only the first of several entries", async () => {
    const zip = buildZip([
      { name: "first", data: Buffer.from("first") },
      { name: "second", data: Buffer.from("second") },
    ]);

    expect((await readFirstZipEntryAsync(zip)).toString()).toBe("first");
  });

  it("takes the sizes from the central directory when the local header defers them to a descriptor", async () => {
    const zip = buildZip([
      { name: "manifest", data: MANIFEST, method: 8, descriptor: true },
    ]);

    expect(await readFirstZipEntryAsync(zip)).toEqual(MANIFEST);
  });

  it("finds the central directory behind an archive comment", async () => {
    const zip = buildZip(
      [{ name: "manifest", data: MANIFEST }],
      Buffer.from("a comment after the end record"),
    );

    expect(await readFirstZipEntryAsync(zip)).toEqual(MANIFEST);
  });

  it("rejects data without an end of central directory record", async () => {
    const zip = buildZip([{ name: "manifest", data: MANIFEST }]);

    await expect(
      readFirstZipEntryAsync(zip.subarray(0, zip.length - 22)),
    ).rejects.toThrow("no central directory");
    await expect(readFirstZipEntryAsync(Buffer.alloc(10))).rejects.toThrow(
      "no central directory",
    );
  });

  it("rejects a central directory offset that doesn't point at a central header", async () => {
    const zip = buildZip([{ name: "manifest", data: MANIFEST }]);
    zip.writeUInt32LE(0, zip.length - 22 + 16);

    await expect(readFirstZipEntryAsync(zip)).rejects.toThrow(
      "central directory is broken",
    );
  });

  it("rejects a local header offset that doesn't point at a local header", async () => {
    const zip = buildZip([{ name: "manifest", data: MANIFEST }]);
    const central = zip.readUInt32LE(zip.length - 22 + 16);
    zip.writeUInt32LE(4, central + 42);

    await expect(readFirstZipEntryAsync(zip)).rejects.toThrow(
      "file header is broken",
    );
  });

  it("rejects compression methods other than stored and deflated", async () => {
    const zip = buildZip([{ name: "manifest", data: MANIFEST, method: 12 }]);

    await expect(readFirstZipEntryAsync(zip)).rejects.toThrow(
      "compression method 12",
    );
  });
});
