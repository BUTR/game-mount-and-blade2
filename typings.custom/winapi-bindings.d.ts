// Minimal typings for `winapi-bindings`, a git-hosted package Vortex provides at runtime, Windows only.
// Mirrors https://github.com/Nexus-Mods/node-winapi-bindings/blob/master/index.d.ts
declare module "winapi-bindings" {
  export type REGISTRY_HIVE =
    | "HKEY_CLASSES_ROOT"
    | "HKEY_CURRENT_CONFIG"
    | "HKEY_CURRENT_USER"
    | "HKEY_LOCAL_MACHINE"
    | "HKEY_USERS";

  export type REGISTRY_TYPE =
    | "REG_BINARY"
    | "REG_DWORD"
    | "REG_DWORD_BIG_ENDIAN"
    | "REG_EXPAND_SZ"
    | "REG_LINK"
    | "REG_MULTI_SZ"
    | "REG_NONE"
    | "REG_QWORD"
    | "REG_SZ";

  // Throws when the key or value doesn't exist
  export function RegGetValue(
    hkey: REGISTRY_HIVE,
    path: string,
    key: string,
  ): { type: REGISTRY_TYPE; value: string | string[] | number | Buffer };

  // Opens the key for the callback, closed after it. Throws when the key doesn't exist
  export function WithRegOpen(
    hive: REGISTRY_HIVE,
    path: string,
    cb: (hkey: Buffer) => void,
  ): void;

  // The subkeys of a key WithRegOpen opened
  export function RegEnumKeys(
    hkey: Buffer,
  ): Array<{ class: string; key: string; lastWritten: number }>;
}
