import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Unmodified = typeof import("./unmodified");

const UNMODIFIED_ATTRIBUTE = "$KERNEL.PURGE.GAMING.UNMODIFIED";
const STATUS_SUCCESS = 0;
const STATUS_NO_EAS_ON_FILE = 0xc0000052;
const STATUS_ACCESS_DENIED = 0xc0000022;

/**
 * What the fake koffi answers, read when the reader calls it, so a test sets it after loading the module
 */
const native = vi.hoisted(() => ({
  loadError: undefined as Error | undefined,
  invalidHandle: false,
  status: 0,
  ea: Buffer.alloc(0) as Buffer,
  createFileArgs: [] as unknown[][],
  closedHandles: [] as unknown[],
}));

vi.mock("koffi", () => {
  const handle = { native: "handle" };
  const fake = {
    load: (library: string) => {
      if (native.loadError !== undefined) {
        throw native.loadError;
      }
      return {
        func: (_convention: string, name: string) => {
          switch (name) {
            case "CreateFileW":
              return (...args: unknown[]): unknown => {
                native.createFileArgs.push(args);
                return handle;
              };
            case "CloseHandle":
              return (file: unknown): number => {
                native.closedHandles.push(file);
                return 1;
              };
            case "NtQueryEaFile":
              return (
                _file: unknown,
                _status: Buffer,
                buffer: Buffer,
              ): number => {
                native.ea.copy(buffer);
                // An NTSTATUS as koffi returns an int32_t, negative for a failure
                return native.status | 0;
              };
            default:
              throw new Error(`Unexpected import ${library}!${name}`);
          }
        },
      };
    },
    opaque: () => "opaque",
    pointer: () => "pointer",
    address: (file: unknown): bigint =>
      native.invalidHandle
        ? 0xffffffffffffffffn
        : file === handle
          ? 0x1234n
          : 0n,
  };
  return { default: fake, ...fake };
});

/**
 * A FILE_FULL_EA_INFORMATION list: each entry's offset to the next, flags, name length, value length, the name with
 * its terminator and the value, 4-aligned but the last
 */
const eaList = (entries: { name: string; value: Buffer }[]): Buffer =>
  Buffer.concat(
    entries.map(({ name, value }, index) => {
      const last = index === entries.length - 1;
      const length = 8 + name.length + 1 + value.length;
      const entry = Buffer.alloc(last ? length : Math.ceil(length / 4) * 4);
      entry.writeUInt32LE(last ? 0 : entry.length, 0);
      entry[5] = name.length;
      entry.writeUInt16LE(value.length, 6);
      entry.write(name, 8, "latin1");
      value.copy(entry, 9 + name.length);
      return entry;
    }),
  );

const mark = (value: number): { name: string; value: Buffer } => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return { name: UNMODIFIED_ATTRIBUTE, value: data };
};

const platform = process.platform;
const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, "platform", { value, configurable: true });
};

describe("loadUnmodifiedReaderAsync", () => {
  // Fresh per test, the module keeps the reader once it's loaded
  let unmodified: Unmodified;
  const file = path.join("C:", "XboxGames", "Game", "Content", "a.txt");

  beforeEach(async () => {
    native.loadError = undefined;
    native.invalidHandle = false;
    native.status = STATUS_SUCCESS;
    native.ea = Buffer.alloc(0);
    native.createFileArgs = [];
    native.closedHandles = [];
    setPlatform("win32");
    vi.resetModules();
    unmodified = await import("./unmodified");
  });

  afterEach(() => {
    setPlatform(platform);
  });

  const readAsync = async (filePath = file): Promise<boolean | undefined> => {
    const isUnmodified = await unmodified.loadUnmodifiedReaderAsync();
    expect(isUnmodified).toBeDefined();
    return isUnmodified!(filePath);
  };

  it("finds the mark set to 1, opening the file to read its attributes only and closing it", async () => {
    native.ea = eaList([mark(1)]);

    expect(await readAsync()).toBe(true);

    expect(native.createFileArgs).toEqual([
      [
        path.toNamespacedPath(path.resolve(file)),
        0x8,
        0x7,
        null,
        3,
        0x02000000,
        null,
      ],
    ]);
    expect(native.closedHandles).toHaveLength(1);
  });

  it("finds the mark after other attributes", async () => {
    native.ea = eaList([
      { name: "USER.OTHER", value: Buffer.from("xyz") },
      { name: "$KERNEL.PURGE.OTHER", value: Buffer.alloc(8) },
      mark(1),
    ]);

    expect(await readAsync()).toBe(true);
  });

  it("is false for a mark that isn't 1, or isn't a u32", async () => {
    native.ea = eaList([mark(0)]);
    expect(await readAsync()).toBe(false);

    native.ea = eaList([
      { name: UNMODIFIED_ATTRIBUTE, value: Buffer.from([1]) },
    ]);
    expect(await readAsync()).toBe(false);
  });

  it("is false for a file with other attributes only, or none", async () => {
    native.ea = eaList([
      { name: "USER.OTHER", value: Buffer.from("xyz") },
      { name: "$KERNEL.PURGE.GAMING.UNMODIFIED2", value: Buffer.alloc(4, 1) },
    ]);
    expect(await readAsync()).toBe(false);

    native.ea = Buffer.alloc(0);
    native.status = STATUS_NO_EAS_ON_FILE;
    expect(await readAsync()).toBe(false);
    expect(native.closedHandles).toHaveLength(2);
  });

  it("is undefined when the attributes can't be read, closing the file", async () => {
    native.ea = eaList([mark(1)]);
    native.status = STATUS_ACCESS_DENIED;

    expect(await readAsync()).toBe(undefined);
    expect(native.closedHandles).toHaveLength(1);
  });

  it("is undefined for a file that can't be opened, without a handle to close", async () => {
    native.invalidHandle = true;

    expect(await readAsync()).toBe(undefined);
    expect(native.closedHandles).toEqual([]);
  });

  it("loads the reader once", async () => {
    const [first, second] = await Promise.all([
      unmodified.loadUnmodifiedReaderAsync(),
      unmodified.loadUnmodifiedReaderAsync(),
    ]);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(await unmodified.loadUnmodifiedReaderAsync()).toBe(first);
  });

  it("has no reader without koffi's native module", async () => {
    native.loadError = new Error("Cannot find module");

    expect(await unmodified.loadUnmodifiedReaderAsync()).toBe(undefined);
  });

  it("has no reader off Windows, without loading koffi", async () => {
    setPlatform("linux");
    native.loadError = new Error("must not be loaded");

    expect(await unmodified.loadUnmodifiedReaderAsync()).toBe(undefined);
  });
});

describe.skipIf(process.platform !== "win32")(
  "loadUnmodifiedReaderAsync with the real koffi",
  () => {
    let root: string;

    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-ea-"));
      vi.doUnmock("koffi");
      vi.resetModules();
    });

    afterEach(async () => {
      await fs.rm(root, { recursive: true, force: true });
    });

    it("reads a file of this machine: no mark on a new file, nothing for a missing one", async () => {
      const { loadUnmodifiedReaderAsync } = await import("./unmodified");
      await fs.writeFile(path.join(root, "a.txt"), "abc");

      const isUnmodified = await loadUnmodifiedReaderAsync();

      expect(isUnmodified).toBeDefined();
      expect(isUnmodified!(path.join(root, "a.txt"))).toBe(false);
      expect(isUnmodified!(path.join(root, "missing.txt"))).toBe(undefined);
    });
  },
);
