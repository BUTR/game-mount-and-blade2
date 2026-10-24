/**
 * The stores whose builds list their files: Steam caches the depot manifests, GOG installs a hash list per product
 */
export type VerifyStore = "steam" | "gog";

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
  | "unknown";

/**
 * A file of the build
 */
export interface IExpectedFile {
  /**
   * Relative to the game folder, with the store's separators
   */
  path: string;
  /**
   * Unknown for a file whose size the store doesn't tell, or that it lets the user change
   */
  size?: number;
}

/**
 * The files of the installed build, as the store lists them
 */
export interface IStoreBuild {
  buildId: string;
  /**
   * The store's id of the game, for opening it in the store
   */
  productId: string;
  files: IExpectedFile[];
  /**
   * The parts of the build whose file list is gone, Steam's depots or GOG's products. The folder isn't compared
   * without them
   */
  missingLists: string[];
}

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
   * The size in the build, of a changed file
   */
  expectedSize?: number;
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
  missingLists: string[];
  files: IVerifyFile[];
}
