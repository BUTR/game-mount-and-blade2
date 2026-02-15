export enum ModOptionsEntryType {
  Global = "global",
  Special = "special",
}

export type ModOptionsEntry = {
  name: string;
  path: string;
  type: ModOptionsEntryType;
};

export type ModOptionsStorage = Record<string, ModOptionsEntry>;

export type PersistentModOptionsEntry = ModOptionsEntry & {
  contentBase64: string;
};
