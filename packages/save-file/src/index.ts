import { promises as fs } from "fs";
import { promisify } from "util";
import { inflateRaw } from "zlib";
import { runInWorkerAsync } from "@bannerlord/worker/client";

/**
 * Reads campaign details the save's metadata doesn't have from the save itself, like the player clan's name.
 *
 * A save is the metadata, then the game's data compressed with DEFLATE. The data is archives of save entries
 * (TaleWorlds.SaveSystem): every object's members are entries keyed by the member's class level and save id, which
 * the game keeps stable across versions to load old saves. So a member is reached by following those keys from the
 * root object, without the game's type definitions. Saves before v1.1.0 wrapped the same data with BinaryFormatter
 */

const inflateRawAsync = promisify(inflateRaw);

// Saves are shared online, so a small file must not be able to decompress into all of the memory.
// Real saves decompress to about eight times their size, tens of MB, these leave plenty of room
const MAX_SAVE_FILE_BYTES = 512 * 1024 * 1024;
const MAX_SAVE_DATA_BYTES = 1024 * 1024 * 1024;

const FOLDER_OBJECT = 1;
const FOLDER_STRUCT = 2;
const FOLDER_CONTAINER = 3;
const FOLDER_STRINGS = 4;
const ENTRY_FIELD = 2;
const ENTRY_PROPERTY = 3;
const ENTRY_KEY = 4;
const ENTRY_VALUE = 5;
const ENTRY_BASICS = 8;
const ENTRY_TXT = 10;

const MEMBER_OBJECT = 0;
const MEMBER_CONTAINER = 1;
const MEMBER_STRING = 2;
const MEMBER_CUSTOM_STRUCT = 4;
const MEMBER_ENUM = 5;
const MEMBER_BASIC_TYPE = 6;

// The game's type ids, from its type definers
const TYPE_CLAN = 330032;
const TYPE_HERO = 330048;
const TYPE_KINGDOM = 330053;
const TYPE_TEXT_OBJECT = 20001;
// Its basic types are 30000 and the type's number
const BASIC_INT = 30001;
const BASIC_FLOAT = 30007;
const BASIC_DOUBLE = 30008;
const BASIC_LONG = 30009;
const BASIC_BOOL = 30020;

const PLAYER_CLAN_ID = "player_faction";

interface IFolder {
  parent: number;
  global: number;
  local: number;
  ext: number;
}

interface IEntry {
  folder: number;
  id: number;
  ext: number;
  data: Buffer;
}

interface IArchive {
  folders: IFolder[];
  entries: IEntry[];
}

interface IMember {
  type: number;
  level: number;
  id: number;
  /**
   * The index of the object, container, string or child struct, -1 for none
   */
  index: number;
  /**
   * An enum's name, or a number or bool's value
   */
  value?: string | number | bigint | boolean | undefined;
}

interface IGameData {
  header: Buffer;
  objects: Buffer[];
  containers: Buffer[];
  strings: Buffer;
}

/**
 * The bytes at start, subarray() would silently cut a length that runs past the data short
 */
const slice = (buf: Buffer, start: number, length: number): Buffer => {
  if (length < 0 || start < 0 || start + length > buf.length) {
    throw new Error("Unexpected end of the save data");
  }
  return buf.subarray(start, start + length);
};

const readArchive = (buf: Buffer): IArchive => {
  let p = 0;
  const i32 = (): number => {
    const v = buf.readInt32LE(p);
    p += 4;
    return v;
  };
  const u8 = (): number => slice(buf, p++, 1)[0]!;
  const i24 = (): number => {
    const bytes = slice(buf, p, 3);
    const a = bytes[0]!;
    const b = bytes[1]!;
    const c = bytes[2]!;
    p += 3;
    return a === 255 && b === 255 && c === 255 ? -1 : a | (b << 8) | (c << 16);
  };
  const folders: IFolder[] = [];
  for (let i = 0, n = i32(); i < n; i++) {
    const parent = i24();
    const global = i24();
    const local = i24();
    folders.push({ parent, global, local, ext: u8() });
  }
  const entries: IEntry[] = [];
  for (let i = 0, n = i32(); i < n; i++) {
    const folder = i24();
    const id = i24();
    const ext = u8();
    const length = buf.readInt16LE(p);
    p += 2;
    entries.push({ folder, id, ext, data: slice(buf, p, length) });
    p += length;
  }
  return { folders, entries };
};

const folderMembers = (archive: IArchive, folder: number): IMember[] =>
  archive.entries
    .filter(
      (e) =>
        e.folder === folder &&
        (e.ext === ENTRY_FIELD || e.ext === ENTRY_PROPERTY),
    )
    .map((e) => readMember(e.data));

const readBasic = (
  typeId: number,
  data: Buffer,
  p: number,
): number | bigint | boolean | undefined => {
  switch (typeId) {
    case BASIC_INT:
      return data.readInt32LE(p);
    case BASIC_FLOAT:
      return data.readFloatLE(p);
    case BASIC_DOUBLE:
      return data.readDoubleLE(p);
    case BASIC_LONG:
      return data.readBigInt64LE(p);
    case BASIC_BOOL:
      return data[p] !== 0;
    default:
      return undefined;
  }
};

/**
 * A member: its kind, class level and save id, then an index, or a type id and the value for enums and basic types
 */
const readMember = (data: Buffer): IMember => {
  const type = data[0]!;
  const member: IMember = {
    type,
    level: data[1]!,
    id: data.readInt16LE(2),
    index: -1,
  };
  if (type <= MEMBER_STRING || type === MEMBER_CUSTOM_STRUCT) {
    member.index = data.readInt32LE(4);
  } else if (
    (type === MEMBER_ENUM || type === MEMBER_BASIC_TYPE) &&
    data[4] === 0
  ) {
    // A plain type id, the generic and container ones aren't read
    const typeId = data.readInt32LE(5);
    member.value =
      type === MEMBER_ENUM
        ? slice(data, 13, data.readInt32LE(9)).toString("utf8")
        : readBasic(typeId, data, 9);
  }
  return member;
};

// v1.1.0 and later: length-prefixed header, objects, containers, strings (GameData.Read)
const readGameData = (body: Buffer): IGameData => {
  let p = 0;
  const bytes = (): Buffer => {
    const length = body.readInt32LE(p);
    const b = slice(body, p + 4, length);
    p += 4 + length;
    return b;
  };
  const list = (): Buffer[] => {
    const count = body.readInt32LE(p);
    p += 4;
    return Array.from({ length: count }, bytes);
  };
  const header = bytes();
  const objects = list();
  const containers = list();
  return { header, objects, containers, strings: bytes() };
};

// Before v1.1.0 BinaryFormatter wrote the data. Its fixed start: a SerializationHeaderRecord (0) with root id 1,
// header id -1 and version 1.0, then a BinaryLibrary record (12)
const LEGACY_SIGNATURE = Buffer.from([
  0, 1, 0, 0, 0, 255, 255, 255, 255, 1, 0, 0, 0, 0, 0, 0, 0, 12,
]);

/**
 * Mirrors the game's LegacyGameDataDeserializer, which reads the records BinaryFormatter writes for GameData
 */
const readLegacyGameData = (body: Buffer): IGameData => {
  let p = 0;
  const u8 = (): number => slice(body, p++, 1)[0]!;
  const i32 = (): number => {
    const v = body.readInt32LE(p);
    p += 4;
    return v;
  };
  // .NET BinaryReader.ReadString: a 7-bit encoded length, then UTF-8
  const skipString = (): void => {
    let length = 0;
    let shift = 0;
    let b: number;
    do {
      b = u8();
      length |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    p += length;
  };
  const expect = (value: number): void => {
    if (u8() !== value) {
      throw new Error(`Unexpected record at ${p - 1} of the legacy save`);
    }
  };

  expect(0);
  p += 16;
  expect(12);
  i32();
  skipString();
  expect(5);
  i32();
  skipString();
  for (let i = 0, n = i32(); i < n; i++) {
    skipString();
  }
  p += 4 + 2;
  skipString();
  skipString();
  i32();
  // Header, Strings, ObjectData, ContainerData
  const references: number[] = [];
  for (let i = 0; i < 4; i++) {
    expect(9);
    references.push(i32());
  }

  const arrays = new Map<number, Buffer>();
  const lists = new Map<number, number[]>();
  while (p < body.length) {
    const record = u8();
    if (record === 11) {
      break;
    }
    const id = i32();
    if (record === 15) {
      // An array of bytes
      const count = i32();
      u8();
      arrays.set(id, slice(body, p, count));
      p += count;
    } else if (record === 7) {
      // An array of references to arrays of bytes
      u8();
      i32();
      const count = i32();
      if (u8() === 7) {
        u8();
      }
      const ids: number[] = [];
      for (let i = 0; i < count; i++) {
        expect(9);
        ids.push(i32());
      }
      lists.set(id, ids);
    } else {
      throw new Error(`Unexpected record ${record} of the legacy save`);
    }
  }
  const array = (id: number | undefined): Buffer => {
    const value = id !== undefined ? arrays.get(id) : undefined;
    if (value === undefined) {
      throw new Error("Missing data in the legacy save");
    }
    return value;
  };
  return {
    header: array(references[0]),
    strings: array(references[1]),
    objects: (lists.get(references[2]!) ?? []).map(array),
    containers: (lists.get(references[3]!) ?? []).map(array),
  };
};

/**
 * Reads members of a save's objects by their keys
 */
class SaveReader {
  private data: IGameData;
  private types = new Map<number, number>();
  private strings = new Map<number, string>();
  private objects = new Map<
    number,
    { archive: IArchive; members: IMember[] }
  >();

  public constructor(data: IGameData) {
    this.data = data;

    // Each object's type id is in its folder's basics entry of the header
    const header = readArchive(data.header);
    const objectFolders = new Map<number, number>();
    for (const folder of header.folders) {
      if (folder.ext === FOLDER_OBJECT) {
        objectFolders.set(folder.global, folder.local);
      }
    }
    for (const entry of header.entries) {
      const index = objectFolders.get(entry.folder);
      if (
        index !== undefined &&
        entry.ext === ENTRY_BASICS &&
        entry.data[0] === 0
      ) {
        this.types.set(index, entry.data.readInt32LE(1));
      }
    }

    const strings = readArchive(data.strings);
    const stringsFolder = strings.folders.find(
      (f) => f.local === -1 && f.ext === FOLDER_STRINGS,
    )?.global;
    for (const entry of strings.entries) {
      if (entry.folder === stringsFolder && entry.ext === ENTRY_TXT) {
        this.strings.set(
          entry.id,
          slice(entry.data, 4, entry.data.readInt32LE(0)).toString("utf8"),
        );
      }
    }
  }

  public typeOf(index: number | undefined): number | undefined {
    return index !== undefined ? this.types.get(index) : undefined;
  }

  /**
   * The objects of the type
   */
  public objectsOfType(type: number): number[] {
    return [...this.types].filter(([, t]) => t === type).map(([i]) => i);
  }

  private object(
    index: number,
  ): { archive: IArchive; members: IMember[] } | undefined {
    let object = this.objects.get(index);
    if (object === undefined) {
      const data = this.data.objects[index];
      if (data === undefined) {
        return undefined;
      }
      const archive = readArchive(data);
      const folder = archive.folders.find(
        (f) => f.local === index && f.ext === FOLDER_OBJECT,
      );
      object = {
        archive,
        members:
          folder !== undefined ? folderMembers(archive, folder.global) : [],
      };
      this.objects.set(index, object);
    }
    return object;
  }

  public member(
    index: number | undefined,
    level: number,
    id: number,
  ): IMember | undefined {
    return index !== undefined && index >= 0
      ? this.object(index)?.members.find(
          (m) => m.level === level && m.id === id,
        )
      : undefined;
  }

  /**
   * A member of an object's child struct, the struct a custom struct member points to
   */
  public structMember(
    index: number | undefined,
    struct: IMember | undefined,
    level: number,
    id: number,
  ): IMember | undefined {
    if (
      index === undefined ||
      struct?.type !== MEMBER_CUSTOM_STRUCT ||
      struct.index < 0
    ) {
      return undefined;
    }
    const object = this.object(index);
    const own = object?.archive.folders.find(
      (f) => f.local === index && f.ext === FOLDER_OBJECT,
    );
    const folder = object?.archive.folders.find(
      (f) =>
        f.parent === own?.global &&
        f.local === struct.index &&
        f.ext === FOLDER_STRUCT,
    );
    return folder !== undefined && object !== undefined
      ? folderMembers(object.archive, folder.global).find(
          (m) => m.level === level && m.id === id,
        )
      : undefined;
  }

  public objectAt(
    index: number | undefined,
    level: number,
    id: number,
  ): number | undefined {
    const member = this.member(index, level, id);
    return member?.type === MEMBER_OBJECT && member.index >= 0
      ? member.index
      : undefined;
  }

  public stringAt(
    index: number | undefined,
    level: number,
    id: number,
  ): string | undefined {
    const member = this.member(index, level, id);
    return member?.type === MEMBER_STRING
      ? this.strings.get(member.index)
      : undefined;
  }

  public valueAt(
    index: number | undefined,
    level: number,
    id: number,
  ): IMember["value"] {
    return this.member(index, level, id)?.value;
  }

  /**
   * A container's elements, with their keys for dictionaries
   */
  public container(index: number): { key?: IMember; value: IMember }[] {
    const data = this.data.containers[index];
    if (data === undefined) {
      return [];
    }
    const archive = readArchive(data);
    const folder = archive.folders.find(
      (f) => f.local === index && f.ext === FOLDER_CONTAINER,
    );
    const entries = archive.entries.filter((e) => e.folder === folder?.global);
    // Large ones are thousands of elements, so keys are looked up by id
    const keys = new Map(
      entries.filter((e) => e.ext === ENTRY_KEY).map((e) => [e.id, e]),
    );
    return entries
      .filter((e) => e.ext === ENTRY_VALUE)
      .map((value) => {
        const key = keys.get(value.id);
        return {
          ...(key !== undefined && { key: readMember(key.data) }),
          value: readMember(value.data),
        };
      });
  }

  public containerAt(
    index: number | undefined,
    level: number,
    id: number,
  ): { key?: IMember; value: IMember }[] | undefined {
    const member = this.member(index, level, id);
    return member?.type === MEMBER_CONTAINER && member.index >= 0
      ? this.container(member.index)
      : undefined;
  }

  /**
   * A TextObject's text with its variables filled in from its attributes and the localization ids removed
   */
  public text(index: number | undefined, depth = 0): string | undefined {
    if (this.typeOf(index) !== TYPE_TEXT_OBJECT) {
      return undefined;
    }
    const raw = this.stringAt(index, 2, 1);
    if (raw === undefined) {
      return undefined;
    }
    const variables = new Map<string, string>();
    for (const { key, value } of depth < 5
      ? (this.containerAt(index, 2, 2) ?? [])
      : []) {
      const name =
        key?.type === MEMBER_STRING ? this.strings.get(key.index) : undefined;
      const text =
        value.type === MEMBER_STRING
          ? this.strings.get(value.index)
          : value.type === MEMBER_OBJECT && value.index >= 0
            ? this.text(value.index, depth + 1)
            : undefined;
      if (name !== undefined && text !== undefined) {
        variables.set(name, text);
      }
    }
    const text = raw
      .replace(/\{=[^}]*\}/g, "")
      .replace(
        /\{([A-Z_][A-Z0-9_]*)\}/g,
        (all, name: string) => variables.get(name) ?? all,
      )
      .trim();
    return text !== "" ? text : undefined;
  }

  public textAt(
    index: number | undefined,
    level: number,
    id: number,
  ): string | undefined {
    return this.text(this.objectAt(index, level, id));
  }
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export type KingdomStatus = "ruler" | "vassal" | "mercenary";

/**
 * The details read from the save, each missing when it couldn't be read
 */
export interface ISaveDetails {
  clanName?: string;
  clanTier?: number;
  clanRenown?: number;
  /**
   * The in-game date
   */
  date?: { year: number; season: Season; day: number };
  /**
   * Null for an independent clan
   */
  kingdom?: { name: string; status: KingdomStatus } | null;
  /**
   * The names of the kingdoms the player is at war with
   */
  wars?: string[];
  heroAge?: number;
  /**
   * Null when unmarried
   */
  spouseName?: string | null;
  childCount?: number;
  /**
   * The clan's living heroes, its lords and ladies
   */
  clanMemberCount?: number;
  companionCount?: number;
}

const TICKS_PER_DAY = 864_000_000n;
const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
// Heroes in these states aren't counted
const GONE_HERO_STATES = ["Dead", "Disabled"];

// Each detail on its own, one the save doesn't have doesn't keep the others
const attempt = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

const readDetails = (reader: SaveReader): ISaveDetails => {
  // Game (2,3) GameType is the campaign, Campaign (3,17) PlayerDefaultFaction the player clan
  const campaign = reader.objectAt(0, 2, 3);
  const clan = reader.objectAt(campaign, 3, 17);
  // Checked by its type and id, the campaign's type differs between versions
  if (
    clan === undefined ||
    reader.typeOf(clan) !== TYPE_CLAN ||
    reader.stringAt(clan, 2, 1) !== PLAYER_CLAN_ID
  ) {
    return {};
  }
  const details: ISaveDetails = {};
  const set = <K extends keyof ISaveDetails>(
    key: K,
    value: ISaveDetails[K] | undefined,
  ): void => {
    if (value !== undefined) {
      details[key] = value;
    }
  };

  set(
    "clanName",
    attempt(() => reader.textAt(clan, 3, 51)),
  );
  set(
    "clanTier",
    attempt(() => {
      const tier = reader.valueAt(clan, 3, 91);
      return typeof tier === "number" ? tier : undefined;
    }),
  );
  set(
    "clanRenown",
    attempt(() => {
      const renown = reader.valueAt(clan, 3, 88);
      return typeof renown === "number" ? Math.round(renown) : undefined;
    }),
  );

  // Campaign (3,100) MapTimeTracker's ticks. The fast campaign (v1.3+), Campaign (3,2) Options (2,19), has 3-day weeks
  // and 2-week seasons instead of 7 and 3
  const now = attempt(() => {
    const ticks = reader.valueAt(reader.objectAt(campaign, 3, 100), 2, 0);
    return typeof ticks === "bigint" ? ticks : undefined;
  });
  const fast = attempt(
    () => reader.valueAt(reader.objectAt(campaign, 3, 2), 2, 19) === "Fast",
  );
  const daysPerSeason = fast === true ? 6n : 21n;
  const daysPerYear = daysPerSeason * 4n;
  if (now !== undefined) {
    const days = now / TICKS_PER_DAY;
    set("date", {
      year: Number(days / daysPerYear),
      season: SEASONS[Number((days % daysPerYear) / daysPerSeason)]!,
      day: Number(days % daysPerSeason) + 1,
    });
  }

  // Clan (3,57) its kingdom: Kingdom (3,1) its name, (3,18) its ruling clan. Clan (3,75) is under mercenary service
  const kingdom = attempt(() => reader.objectAt(clan, 3, 57));
  set(
    "kingdom",
    attempt(() => {
      if (kingdom === undefined) {
        return null;
      }
      const name = reader.textAt(kingdom, 3, 1);
      if (name === undefined) {
        return undefined;
      }
      const status: KingdomStatus =
        reader.objectAt(kingdom, 3, 18) === clan
          ? "ruler"
          : reader.valueAt(clan, 3, 75) === true
            ? "mercenary"
            : "vassal";
      return { name, status };
    }),
  );

  // Campaign (3,11) FactionManager (2,20) its stances (2,10): links between two factions (2,20) and (2,30) with their
  // stance (2,0). The player's faction is its kingdom, the clan when independent. Wars with bandits and other clans
  // aren't counted, only with kingdoms
  set(
    "wars",
    attempt(() => {
      const faction = kingdom ?? clan;
      const stances = reader.objectAt(reader.objectAt(campaign, 3, 11), 2, 20);
      const links = reader.containerAt(stances, 2, 10);
      if (links === undefined) {
        return undefined;
      }
      const enemies = new Set<string>();
      for (const { value } of links) {
        if (value.type !== MEMBER_OBJECT || value.index < 0) {
          continue;
        }
        if (reader.valueAt(value.index, 2, 0) !== "War") {
          continue;
        }
        const first = reader.objectAt(value.index, 2, 20);
        const second = reader.objectAt(value.index, 2, 30);
        const other =
          first === faction ? second : second === faction ? first : undefined;
        if (other === undefined || reader.typeOf(other) !== TYPE_KINGDOM) {
          continue;
        }
        const name = reader.textAt(other, 3, 1);
        if (name !== undefined) {
          enemies.add(name);
        }
      }
      return [...enemies].sort((lhs, rhs) => lhs.localeCompare(rhs));
    }),
  );

  // Game (2,8) PlayerTroop (4,101) its hero, the clan's leader Clan (3,83) otherwise
  const hero = attempt(
    () =>
      reader.objectAt(reader.objectAt(0, 2, 8), 4, 101) ??
      reader.objectAt(clan, 3, 83),
  );
  if (hero !== undefined) {
    // Hero (3,440) its birthday, a CampaignTime with its ticks at (1,2)
    set(
      "heroAge",
      attempt(() => {
        const birth = reader.structMember(
          hero,
          reader.member(hero, 3, 440),
          1,
          2,
        )?.value;
        return typeof birth === "bigint" && now !== undefined
          ? Number((now - birth) / (TICKS_PER_DAY * daysPerYear))
          : undefined;
      }),
    );
    // Hero (3,730) its spouse, Hero (3,181) a hero's name
    set(
      "spouseName",
      attempt(() => {
        const spouse = reader.objectAt(hero, 3, 730);
        return spouse === undefined ? null : reader.textAt(spouse, 3, 181);
      }),
    );
    // Hero (3,740) its children
    set(
      "childCount",
      attempt(() => reader.containerAt(hero, 3, 740)?.length),
    );
  }

  // Every hero: Hero (3,500) its clan, (3,380) the clan it's a companion of, (3,260) its state
  attempt(() => {
    let members = 0;
    let companions = 0;
    for (const index of reader.objectsOfType(TYPE_HERO)) {
      const state = reader.valueAt(index, 3, 260);
      if (typeof state === "string" && GONE_HERO_STATES.includes(state)) {
        continue;
      }
      if (reader.objectAt(index, 3, 500) === clan) {
        members++;
      } else if (reader.objectAt(index, 3, 380) === clan) {
        companions++;
      }
    }
    set("clanMemberCount", members);
    set("companionCount", companions);
  });

  return details;
};

/**
 * The save's details, each missing when the save doesn't have it. Rejects when the file isn't a save that can be read
 */
export const readSaveDetailsAsync = async (
  filePath: string,
): Promise<ISaveDetails> => {
  const { size } = await fs.stat(filePath);
  if (size > MAX_SAVE_FILE_BYTES) {
    throw new Error(`The save is ${size} bytes, larger than a save can be`);
  }
  const file = await fs.readFile(filePath);
  const metaDataLength = file.readInt32LE(0);
  if (metaDataLength < 0 || 4 + metaDataLength > file.length) {
    throw new Error("Unexpected metadata length in the save");
  }
  // Rejects with ERR_BUFFER_TOO_LARGE past the limit instead of allocating it
  const body = await inflateRawAsync(file.subarray(4 + metaDataLength), {
    maxOutputLength: MAX_SAVE_DATA_BYTES,
  });
  const data = body
    .subarray(0, LEGACY_SIGNATURE.length)
    .equals(LEGACY_SIGNATURE)
    ? readLegacyGameData(body)
    : readGameData(body);
  return readDetails(new SaveReader(data));
};

/**
 * The file name of the worker next to the bundle, see rolldown.config.mjs
 */
export const SAVE_DETAILS_WORKER_FILE = "saveDetailsWorker.js";

/**
 * readSaveDetailsAsync in a Web Worker next to the bundle: decoding a save's data is tens of MB of work the renderer
 * would do while it renders
 */
export const readSaveDetailsInWorkerAsync = (
  filePath: string,
): Promise<ISaveDetails> =>
  runInWorkerAsync(SAVE_DETAILS_WORKER_FILE, filePath, readSaveDetailsAsync);
