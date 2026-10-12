// Minimal typings for `turbowalk`, a git-hosted package Vortex provides at runtime.
// Mirrors https://github.com/Nexus-Mods/node-turbowalk/blob/master/index.d.ts
declare module "turbowalk" {
  export interface IEntry {
    filePath: string;
    isDirectory: boolean;
    isReparsePoint: boolean;
    size: number;
    mtime: number;
    isTerminator?: boolean;
    id?: number;
    idStr?: string;
    linkCount?: number;
  }

  export interface IWalkOptions {
    terminators?: boolean;
    details?: boolean;
    threshold?: number;
    recurse?: boolean;
    skipHidden?: boolean;
    skipLinks?: boolean;
    skipInaccessible?: boolean;
  }

  function turbowalk(
    basePath: string,
    progress: (entries: IEntry[]) => void,
    options?: IWalkOptions,
  ): Promise<void>;

  export default turbowalk;
}
