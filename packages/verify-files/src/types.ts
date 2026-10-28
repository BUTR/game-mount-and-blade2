/**
 * The stores whose builds list their files: Steam caches the depot manifests, GOG installs a hash list per product
 */
export type VerifyStore = "steam" | "gog" | "epic" | "xbox";

/**
 * extra: in the game folder, not in the build. changed: a file of the build with another size. missing: a file of
 * the build not in the game folder
 */
export type VerifyFileStatus = "extra" | "changed" | "missing";

/**
 * Who put the file there, or changed it:
 * vortex: a mod Vortex deployed. vortexInternal: Vortex's own deployment manifests and backups of overwritten files.
 * store: the store's own files next to the game, like GOG's uninstaller and shortcut.
 * game: the game at runtime, its rebuilt shader caches and downloaded multiplayer maps.
 * unknown: anything else, like mods installed by hand, the files that usually break the game
 */
export type VerifyFileSource =
  | "vortex"
  | "vortexInternal"
  | "store"
  | "game"
  // A mod copied into the game folder by hand, a module that isn't the game's, Vortex didn't deploy it
  | "manualMod"
  | "unknown";

export interface IVerifyFile {
  /**
   * Relative to the game folder, '/' separated
   */
  path: string;
  /**
   * The folder the file is listed under, a module or the folder it's in
   */
  folder: string;
  status: VerifyFileStatus;
  source: VerifyFileSource;
  /**
   * The mod Vortex deployed the file from, its id is missing when the mod was removed since
   */
  modId?: string;
  modName?: string;
  /**
   * On disk, or the expected size of a missing file when the store tells it
   */
  size?: number;
  /**
   * The size in the build, of a changed file. The same as its size when only its contents changed
   */
  expectedSize?: number;
  /**
   * The package the file is of when it isn't the game's, an Xbox DLC in a folder of its own. Its path is relative to
   * the package's folder
   */
  package?: IVerifyPackage;
}

/**
 * A package installed with the game in a folder of its own, an Xbox DLC
 */
export interface IVerifyPackage {
  name: string;
  /**
   * The package's folder, its Content
   */
  path: string;
}

export interface IVerifyFilesReport {
  store: VerifyStore;
  buildId: string;
  /**
   * The game's version with its changeset, like v1.4.8.119303. Undefined when neither BUTR's registry nor the game's
   * files tell it, the build id is shown then
   */
  version?: string;
  /**
   * Opens the game in the store, where its files can be verified and restored
   */
  storeUrl: string;
  expectedFileCount: number;
  /**
   * Whether the store tells the sizes of the files, without them changed files aren't found
   */
  sizesKnown: boolean;
  /**
   * Whether files whose contents changed but not their size are found, by Xbox's unmodified mark
   */
  contentsChecked: boolean;
  missingLists: string[];
  files: IVerifyFile[];
}
