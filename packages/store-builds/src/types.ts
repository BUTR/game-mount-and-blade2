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
