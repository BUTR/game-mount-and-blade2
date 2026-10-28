import path from "path";

/**
 * Gaming Services' mark of a file of an Xbox package it wrote and nothing changed since: an NTFS kernel extended
 * attribute. NTFS removes it with any change of the file's data, a copy doesn't have it, and it can't be set from
 * user mode. The Xbox app's Verify and repair checks it, it doesn't hash the files.
 * See docs/research/xbox-file-verification.md
 */
const UNMODIFIED_ATTRIBUTE = "$KERNEL.PURGE.GAMING.UNMODIFIED";

const FILE_READ_EA = 0x8;
// Read, write and delete: the game or the Xbox app may have the file open
const FILE_SHARE_ALL = 0x7;
const OPEN_EXISTING = 3;
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn;
const STATUS_SUCCESS = 0;
const STATUS_NO_EAS_ON_FILE = 0xc0000052;
// The most NTFS keeps of a file's extended attributes
const EA_BUFFER_SIZE = 65536;

/**
 * Whether the file has the unmodified mark, undefined when its attributes can't be read
 */
export type IsUnmodified = (filePath: string) => boolean | undefined;

/**
 * Whether the FILE_FULL_EA_INFORMATION list has the mark set to 1, as the Gaming Services driver checks it
 */
const hasUnmodifiedMark = (buffer: Buffer): boolean => {
  for (let offset = 0; ; ) {
    const next = buffer.readUInt32LE(offset);
    const nameLength = buffer[offset + 5]!;
    const valueLength = buffer.readUInt16LE(offset + 6);
    const name = buffer.toString("latin1", offset + 8, offset + 8 + nameLength);
    if (name === UNMODIFIED_ATTRIBUTE) {
      return (
        valueLength === 4 && buffer.readUInt32LE(offset + 9 + nameLength) === 1
      );
    }
    if (next === 0) {
      return false;
    }
    offset += next;
  }
};

let readerPromise: Promise<IsUnmodified | undefined> | undefined;

/**
 * Reads the unmodified mark of files through koffi, Node can't read extended attributes. Undefined when it can't be
 * read, off Windows or without koffi's native module. Synchronous calls, for the verify worker
 */
export const loadUnmodifiedReaderAsync = (): Promise<
  IsUnmodified | undefined
> =>
  (readerPromise ??= (async () => {
    if (process.platform !== "win32") {
      return undefined;
    }
    try {
      const koffi = await import("koffi");
      const kernel32 = koffi.load("kernel32.dll");
      const ntdll = koffi.load("ntdll.dll");
      // Unnamed types, koffi's names are shared by everything that loads it
      const handle = koffi.pointer(koffi.opaque());
      const createFile = kernel32.func("__stdcall", "CreateFileW", handle, [
        "str16",
        "uint32_t",
        "uint32_t",
        "void *",
        "uint32_t",
        "uint32_t",
        handle,
      ]);
      const closeHandle = kernel32.func("__stdcall", "CloseHandle", "int", [
        handle,
      ]);
      const queryEaFile = ntdll.func("__stdcall", "NtQueryEaFile", "int32_t", [
        handle,
        "void *",
        "void *",
        "uint32_t",
        "uint8_t",
        "void *",
        "uint32_t",
        "void *",
        "uint8_t",
      ]);

      const statusBlock = Buffer.alloc(16);
      const buffer = Buffer.alloc(EA_BUFFER_SIZE);
      return (filePath: string): boolean | undefined => {
        const file: unknown = createFile(
          path.toNamespacedPath(path.resolve(filePath)),
          FILE_READ_EA,
          FILE_SHARE_ALL,
          null,
          OPEN_EXISTING,
          FILE_FLAG_BACKUP_SEMANTICS,
          null,
        );
        if (koffi.address(file) === INVALID_HANDLE_VALUE) {
          return undefined;
        }
        try {
          const status =
            (queryEaFile(
              file,
              statusBlock,
              buffer,
              buffer.length,
              0,
              null,
              0,
              null,
              1,
            ) as number) >>> 0;
          if (status === STATUS_NO_EAS_ON_FILE) {
            return false;
          }
          return status === STATUS_SUCCESS
            ? hasUnmodifiedMark(buffer)
            : undefined;
        } finally {
          closeHandle(file);
        }
      };
    } catch {
      return undefined;
    }
  })());
