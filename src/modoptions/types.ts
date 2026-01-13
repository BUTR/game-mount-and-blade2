export enum ModOptionsEntryType {
  Global = "global",
  Special = "special",
}

export type ModOptionsEntry = {
  name: string;
  path: string;
  type: ModOptionsEntryType;
};

export type ModOptionsStorage = {
  [key: string]: ModOptionsEntry;
};

export type PersistentModOptionsEntry = ModOptionsEntry & {
  contentBase64: string;
};
