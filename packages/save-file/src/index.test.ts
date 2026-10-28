import { promises as fs, Stats } from "fs";
import os from "os";
import path from "path";
import { deflateRawSync } from "zlib";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readSaveDetailsAsync, readSaveDetailsInWorkerAsync } from "./index";

const TYPE_CLAN = 330032;
const TYPE_HERO = 330048;
const TYPE_KINGDOM = 330053;
const TYPE_TEXT_OBJECT = 20001;
const TYPE_OTHER = 1;

const TICKS_PER_DAY = 864_000_000n;

const i32 = (value: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(value);
  return b;
};

const i24 = (value: number): Buffer =>
  value === -1
    ? Buffer.from([255, 255, 255])
    : Buffer.from([value & 255, (value >> 8) & 255, (value >> 16) & 255]);

const i16 = (value: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeInt16LE(value);
  return b;
};

const sized = (data: Buffer): Buffer => Buffer.concat([i32(data.length), data]);

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

const archive = (folders: IFolder[], entries: IEntry[]): Buffer =>
  Buffer.concat([
    i32(folders.length),
    ...folders.map((f) =>
      Buffer.concat([
        i24(f.parent),
        i24(f.global),
        i24(f.local),
        Buffer.from([f.ext]),
      ]),
    ),
    i32(entries.length),
    ...entries.map((e) =>
      Buffer.concat([
        i24(e.folder),
        i24(e.id),
        Buffer.from([e.ext]),
        i16(e.data.length),
        e.data,
      ]),
    ),
  ]);

type Member = Buffer;

const memberHead = (type: number, level: number, id: number): Buffer =>
  Buffer.concat([Buffer.from([type, level]), i16(id)]);

const indexed =
  (type: number) =>
  (level: number, id: number, index: number): Member =>
    Buffer.concat([memberHead(type, level, id), i32(index)]);

const objectMember = indexed(0);
const containerMember = indexed(1);
const stringMember = indexed(2);
const structMember = indexed(4);

const enumMember = (level: number, id: number, name: string): Member => {
  const text = Buffer.from(name, "utf8");
  return Buffer.concat([
    memberHead(5, level, id),
    Buffer.from([0]),
    i32(1234),
    i32(text.length),
    text,
  ]);
};

const basicMember = (
  level: number,
  id: number,
  typeId: number,
  value: Buffer,
): Member =>
  Buffer.concat([
    memberHead(6, level, id),
    Buffer.from([0]),
    i32(typeId),
    value,
  ]);

const intMember = (level: number, id: number, value: number): Member =>
  basicMember(level, id, 30001, i32(value));

const floatMember = (level: number, id: number, value: number): Member => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(value);
  return basicMember(level, id, 30007, b);
};

const longMember = (level: number, id: number, value: bigint): Member => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(value);
  return basicMember(level, id, 30009, b);
};

const boolMember = (level: number, id: number, value: boolean): Member =>
  basicMember(level, id, 30020, Buffer.from([value ? 1 : 0]));

interface IObjectSpec {
  type: number;
  members: Member[];
  structs: Member[][];
  raw?: Buffer;
}

/**
 * Builds the game data the way TaleWorlds.SaveSystem writes it, object 0 is the Game
 */
class SaveBuilder {
  private strings: string[] = [];
  private objects: IObjectSpec[] = [];
  private containers: { key?: Member; value: Member }[][] = [];

  public string(value: string): number {
    this.strings.push(value);
    return this.strings.length - 1;
  }

  public reserve(type: number): number {
    this.objects.push({ type, members: [], structs: [] });
    return this.objects.length - 1;
  }

  public set(index: number, members: Member[], structs: Member[][] = []): void {
    const object = this.objects[index]!;
    object.members = members;
    object.structs = structs;
  }

  public corrupt(index: number): void {
    this.objects[index]!.raw = Buffer.from([1, 0, 0, 0, 0]);
  }

  public object(type: number, members: Member[], structs?: Member[][]): number {
    const index = this.reserve(type);
    this.set(index, members, structs);
    return index;
  }

  public container(elements: { key?: Member; value: Member }[]): number {
    this.containers.push(elements);
    return this.containers.length - 1;
  }

  public text(raw: string, attributes: [string, Member][] = []): number {
    const members = [stringMember(2, 1, this.string(raw))];
    if (attributes.length > 0) {
      const container = this.container(
        attributes.map(([name, value]) => ({
          key: stringMember(0, 0, this.string(name)),
          value,
        })),
      );
      members.push(containerMember(2, 2, container));
    }
    return this.object(TYPE_TEXT_OBJECT, members);
  }

  public header(): Buffer {
    const folders = this.objects.map((_, index) => ({
      parent: -1,
      global: index + 100,
      local: index,
      ext: 1,
    }));
    const entries = this.objects.map((object, index) => ({
      folder: index + 100,
      id: 0,
      ext: 8,
      data: Buffer.concat([Buffer.from([0]), i32(object.type), i32(0)]),
    }));
    return archive(folders, entries);
  }

  public objectData(): Buffer[] {
    return this.objects.map((object, index) => {
      if (object.raw !== undefined) {
        return object.raw;
      }
      const own = 7;
      const folders: IFolder[] = [
        { parent: -1, global: own, local: index, ext: 1 },
        ...object.structs.map((_, struct) => ({
          parent: own,
          global: own + 1 + struct,
          local: struct,
          ext: 2,
        })),
      ];
      const entries: IEntry[] = [
        ...object.members.map((data, id) => ({
          folder: own,
          id,
          ext: id % 2 === 0 ? 2 : 3,
          data,
        })),
        ...object.structs.flatMap((members, struct) =>
          members.map((data, id) => ({
            folder: own + 1 + struct,
            id,
            ext: 2,
            data,
          })),
        ),
      ];
      return archive(folders, entries);
    });
  }

  public containerData(): Buffer[] {
    return this.containers.map((elements, index) => {
      const folder = 3;
      const entries: IEntry[] = elements.flatMap((element, id) => [
        ...(element.key !== undefined
          ? [{ folder, id, ext: 4, data: element.key }]
          : []),
        { folder, id, ext: 5, data: element.value },
      ]);
      return archive(
        [{ parent: -1, global: folder, local: index, ext: 3 }],
        entries,
      );
    });
  }

  public stringData(): Buffer {
    return archive(
      [{ parent: -1, global: 9, local: -1, ext: 4 }],
      this.strings.map((value, id) => ({
        folder: 9,
        id,
        ext: 10,
        data: sized(Buffer.from(value, "utf8")),
      })),
    );
  }

  public gameData(): Buffer {
    const list = (items: Buffer[]): Buffer =>
      Buffer.concat([i32(items.length), ...items.map(sized)]);
    return Buffer.concat([
      sized(this.header()),
      list(this.objectData()),
      list(this.containerData()),
      sized(this.stringData()),
    ]);
  }

  /**
   * The same data as BinaryFormatter wrote it before v1.1.0
   */
  public legacyGameData(): Buffer {
    const netString = (value: string): Buffer => {
      const text = Buffer.from(value, "utf8");
      return Buffer.concat([Buffer.from([text.length]), text]);
    };
    const byteArray = (id: number, data: Buffer): Buffer =>
      Buffer.concat([
        Buffer.from([15]),
        i32(id),
        i32(data.length),
        Buffer.from([2]),
        data,
      ]);
    const refArray = (id: number, ids: number[]): Buffer =>
      Buffer.concat([
        Buffer.from([7]),
        i32(id),
        Buffer.from([1]),
        i32(1),
        i32(ids.length),
        Buffer.from([7, 2]),
        ...ids.map((ref) => Buffer.concat([Buffer.from([9]), i32(ref)])),
      ]);
    const objects = this.objectData();
    const containers = this.containerData();
    const objectIds = objects.map((_, i) => 1000 + i);
    const containerIds = containers.map((_, i) => 2000 + i);
    return Buffer.concat([
      Buffer.from([0]),
      i32(1),
      i32(-1),
      i32(1),
      i32(0),
      Buffer.from([12]),
      i32(2),
      netString("TaleWorlds.SaveSystem"),
      Buffer.from([5]),
      i32(1),
      netString("TaleWorlds.SaveSystem.Load.GameData"),
      i32(4),
      netString("<Header>k__BackingField"),
      netString("<Strings>k__BackingField"),
      netString("<ObjectData>k__BackingField"),
      netString("<ContainerData>k__BackingField"),
      Buffer.from([7, 7, 7, 7, 2, 2]),
      netString("x"),
      netString("y"),
      i32(2),
      ...[3, 4, 5, 6].map((ref) => Buffer.concat([Buffer.from([9]), i32(ref)])),
      byteArray(3, this.header()),
      byteArray(4, this.stringData()),
      refArray(5, objectIds),
      refArray(6, containerIds),
      ...objects.map((data, i) => byteArray(objectIds[i]!, data)),
      ...containers.map((data, i) => byteArray(containerIds[i]!, data)),
      Buffer.from([11]),
    ]);
  }
}

const metadata = Buffer.from(
  JSON.stringify({ Name: "save", Modules: "Native" }),
  "utf8",
);

const saveFile = (body: Buffer): Buffer =>
  Buffer.concat([i32(metadata.length), metadata, deflateRawSync(body)]);

interface ICampaignOptions {
  clanId?: string;
  fast?: boolean;
  kingdom?: "ruler" | "vassal" | "mercenary" | "none";
  married?: boolean;
  corruptClanName?: boolean;
  playerTroop?: boolean;
}

const YEAR = 1084n;
const NORMAL_NOW = (YEAR * 84n + 2n * 21n + 4n) * TICKS_PER_DAY + 1234n;

/**
 * A campaign with a clan of the player in the kingdom of Vlandia, at war with Sturgia and a bandit faction
 */
const buildCampaign = (
  options: ICampaignOptions = {},
): { builder: SaveBuilder; now: bigint } => {
  const b = new SaveBuilder();
  const game = b.reserve(TYPE_OTHER);
  const campaign = b.reserve(TYPE_OTHER);
  const clan = b.reserve(TYPE_CLAN);
  const hero = b.reserve(TYPE_HERO);

  const fast = options.fast === true;
  const now = fast ? (YEAR * 24n + 1n * 6n + 2n) * TICKS_PER_DAY : NORMAL_NOW;
  const daysPerYear = fast ? 24n : 84n;
  const birth = now - (31n * daysPerYear + 10n) * TICKS_PER_DAY;

  const clanName = b.text("{=Xyz123}House {FAMILY} {MISSING}", [
    [
      "FAMILY",
      objectMember(
        0,
        0,
        b.text("{=abc}of {NAME}", [
          ["NAME", stringMember(0, 0, b.string("Galend"))],
        ]),
      ),
    ],
  ]);
  if (options.corruptClanName === true) {
    b.corrupt(clanName);
  }

  const vlandia = b.object(TYPE_KINGDOM, []);
  const sturgia = b.object(TYPE_KINGDOM, [
    objectMember(3, 1, b.text("Sturgia")),
  ]);
  const battania = b.object(TYPE_KINGDOM, [
    objectMember(3, 1, b.text("Battania")),
  ]);
  const aserai = b.object(TYPE_KINGDOM, [objectMember(3, 1, b.text("Aserai"))]);
  const bandits = b.object(TYPE_CLAN, [objectMember(3, 1, b.text("Looters"))]);
  const otherClan = b.object(TYPE_CLAN, []);
  b.set(vlandia, [
    objectMember(3, 1, b.text("{=k1}Vlandia")),
    objectMember(3, 18, options.kingdom === "ruler" ? clan : otherClan),
  ]);

  const playerFaction = options.kingdom === "none" ? clan : vlandia;
  const link = (stance: string, first: number, second: number): Member =>
    objectMember(
      0,
      0,
      b.object(TYPE_OTHER, [
        enumMember(2, 0, stance),
        objectMember(2, 20, first),
        objectMember(2, 30, second),
      ]),
    );
  const stances = b.object(TYPE_OTHER, [
    containerMember(
      2,
      10,
      b.container([
        { value: link("War", playerFaction, sturgia) },
        { value: link("War", battania, playerFaction) },
        { value: link("War", playerFaction, bandits) },
        { value: link("Neutral", playerFaction, aserai) },
        { value: link("War", aserai, otherClan) },
        { value: link("War", sturgia, playerFaction) },
      ]),
    ),
  ]);
  const factionManager = b.object(TYPE_OTHER, [objectMember(2, 20, stances)]);

  const timeTracker = b.object(TYPE_OTHER, [longMember(2, 0, now)]);
  const campaignOptions = b.object(TYPE_OTHER, [
    enumMember(2, 19, fast ? "Fast" : "Standard"),
  ]);

  const person = (
    name: string,
    members: Member[] = [],
    state = "Active",
  ): number =>
    b.object(TYPE_HERO, [
      objectMember(3, 181, b.text(name)),
      enumMember(3, 260, state),
      ...members,
    ]);
  const spouse = person("Ira");
  const child1 = person("Child One", [objectMember(3, 500, clan)]);
  const child2 = person("Child Two", [objectMember(3, 500, clan)]);
  person("Dead Brother", [objectMember(3, 500, clan)], "Dead");
  person("Companion", [objectMember(3, 380, clan)]);
  person("Gone Companion", [objectMember(3, 380, clan)], "Disabled");
  person("Stranger", [objectMember(3, 500, otherClan)]);

  b.set(
    hero,
    [
      objectMember(3, 181, b.text("Derthert")),
      enumMember(3, 260, "Active"),
      objectMember(3, 500, clan),
      structMember(3, 440, 0),
      ...(options.married !== false ? [objectMember(3, 730, spouse)] : []),
      containerMember(
        3,
        740,
        b.container([
          { value: objectMember(0, 0, child1) },
          { value: objectMember(0, 0, child2) },
        ]),
      ),
    ],
    [[longMember(1, 2, birth)]],
  );

  const kingdom = options.kingdom ?? "vassal";
  b.set(clan, [
    stringMember(2, 1, b.string(options.clanId ?? "player_faction")),
    objectMember(3, 51, clanName),
    intMember(3, 91, 4),
    floatMember(3, 88, 1234.6),
    ...(kingdom !== "none" ? [objectMember(3, 57, vlandia)] : []),
    boolMember(3, 75, kingdom === "mercenary"),
    objectMember(3, 83, hero),
  ]);
  b.set(campaign, [
    objectMember(3, 17, clan),
    objectMember(3, 100, timeTracker),
    objectMember(3, 2, campaignOptions),
    objectMember(3, 11, factionManager),
  ]);
  const playerTroop = b.object(TYPE_OTHER, [objectMember(4, 101, hero)]);
  b.set(game, [
    objectMember(2, 3, campaign),
    ...(options.playerTroop !== false ? [objectMember(2, 8, playerTroop)] : []),
  ]);
  return { builder: b, now };
};

describe("readSaveDetailsAsync", () => {
  let dir: string;
  let counter = 0;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bannerlord-save-file-"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const writeSave = async (content: Buffer): Promise<string> => {
    const file = path.join(dir, `save${counter++}.sav`);
    await fs.writeFile(file, content);
    return file;
  };

  const read = async (options?: ICampaignOptions) => {
    const { builder } = buildCampaign(options);
    return readSaveDetailsAsync(await writeSave(saveFile(builder.gameData())));
  };

  it("reads every detail of a campaign", async () => {
    expect(await read()).toEqual({
      clanName: "House of Galend {MISSING}",
      clanTier: 4,
      clanRenown: 1235,
      date: { year: 1084, season: "autumn", day: 5 },
      kingdom: { name: "Vlandia", status: "vassal" },
      wars: ["Battania", "Sturgia"],
      heroAge: 31,
      spouseName: "Ira",
      childCount: 2,
      clanMemberCount: 3,
      companionCount: 1,
    });
  });

  it("reads the same details from a save from before v1.1.0", async () => {
    const { builder } = buildCampaign();
    const current = await readSaveDetailsAsync(
      await writeSave(saveFile(builder.gameData())),
    );
    const legacy = await readSaveDetailsAsync(
      await writeSave(saveFile(builder.legacyGameData())),
    );

    expect(legacy).toEqual(current);
    expect(legacy.clanName).toBe("House of Galend {MISSING}");
  });

  it("dates a fast campaign with 6-day seasons", async () => {
    const details = await read({ fast: true });

    expect(details.date).toEqual({ year: 1084, season: "summer", day: 3 });
    expect(details.heroAge).toBe(31);
  });

  it.each([
    ["ruler", "ruler"],
    ["mercenary", "mercenary"],
    ["vassal", "vassal"],
  ] as const)("tells a %s of the kingdom", async (kingdom, status) => {
    expect((await read({ kingdom })).kingdom).toEqual({
      name: "Vlandia",
      status,
    });
  });

  it("has no kingdom for an independent clan and counts the clan's own wars", async () => {
    const details = await read({ kingdom: "none" });

    expect(details.kingdom).toBeNull();
    expect(details.wars).toEqual(["Battania", "Sturgia"]);
  });

  it("has a null spouse for an unmarried hero", async () => {
    expect((await read({ married: false })).spouseName).toBeNull();
  });

  it("finds the hero as the clan's leader without a player troop", async () => {
    const details = await read({ playerTroop: false });

    expect(details.heroAge).toBe(31);
    expect(details.spouseName).toBe("Ira");
  });

  it("keeps the other details when one can't be read", async () => {
    const details = await read({ corruptClanName: true });

    expect(details.clanName).toBeUndefined();
    expect(details.clanTier).toBe(4);
    expect(details.kingdom).toEqual({ name: "Vlandia", status: "vassal" });
  });

  it("has no details when the campaign's clan isn't the player's", async () => {
    expect(await read({ clanId: "clan_empire_north_1" })).toEqual({});
  });

  it("rejects a metadata length past the end of the file", async () => {
    const file = await writeSave(Buffer.concat([i32(1000), metadata]));

    await expect(readSaveDetailsAsync(file)).rejects.toThrow(
      "Unexpected metadata length in the save",
    );
  });

  it("rejects a negative metadata length", async () => {
    const file = await writeSave(Buffer.concat([i32(-1), metadata]));

    await expect(readSaveDetailsAsync(file)).rejects.toThrow(
      "Unexpected metadata length in the save",
    );
  });

  it("rejects data that isn't compressed", async () => {
    const file = await writeSave(
      Buffer.concat([
        i32(metadata.length),
        metadata,
        Buffer.from([255, 255, 255, 255]),
      ]),
    );

    await expect(readSaveDetailsAsync(file)).rejects.toThrow();
  });

  it("rejects game data cut short", async () => {
    const { builder } = buildCampaign();
    const data = builder.gameData();
    const file = await writeSave(saveFile(data.subarray(0, data.length - 50)));

    await expect(readSaveDetailsAsync(file)).rejects.toThrow(
      "Unexpected end of the save data",
    );
  });

  it("rejects a section claiming more bytes than the data has", async () => {
    const file = await writeSave(
      saveFile(Buffer.concat([i32(1_000_000), Buffer.alloc(16)])),
    );

    await expect(readSaveDetailsAsync(file)).rejects.toThrow(
      "Unexpected end of the save data",
    );
  });

  it("rejects a legacy save with an unknown record", async () => {
    const { builder } = buildCampaign();
    const legacy = builder.legacyGameData();
    const broken = Buffer.concat([
      legacy.subarray(0, legacy.length - 1),
      Buffer.from([42, 0, 0, 0, 0]),
    ]);

    await expect(
      readSaveDetailsAsync(await writeSave(saveFile(broken))),
    ).rejects.toThrow("Unexpected record 42 of the legacy save");
  });

  it("rejects a file that doesn't exist", async () => {
    await expect(
      readSaveDetailsAsync(path.join(dir, "missing.sav")),
    ).rejects.toThrow();
  });

  it("rejects a file too short for its metadata length", async () => {
    await expect(
      readSaveDetailsAsync(await writeSave(Buffer.from([1, 0]))),
    ).rejects.toThrow();
  });

  it("rejects an archive entry with a negative length", async () => {
    // A header of no folders and one entry: folder 0, id 0, basics, length -1
    const header = Buffer.concat([
      i32(0),
      i32(1),
      i24(0),
      i24(0),
      Buffer.from([8]),
      i16(-1),
    ]);
    const data = Buffer.concat([
      sized(header),
      i32(0),
      i32(0),
      sized(new SaveBuilder().stringData()),
    ]);

    await expect(
      readSaveDetailsAsync(await writeSave(saveFile(data))),
    ).rejects.toThrow("Unexpected end of the save data");
  });

  it("rejects a file larger than a save can be without reading it", async () => {
    const file = await writeSave(saveFile(buildCampaign().builder.gameData()));
    vi.spyOn(fs, "stat").mockResolvedValueOnce({
      size: 512 * 1024 * 1024 + 1,
    } as Stats);
    const readFile = vi.spyOn(fs, "readFile");

    await expect(readSaveDetailsAsync(file)).rejects.toThrow(
      "larger than a save can be",
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it("has no details for game data without any object, the save isn't a campaign", async () => {
    const file = await writeSave(saveFile(new SaveBuilder().gameData()));

    await expect(readSaveDetailsAsync(file)).resolves.toEqual({});
  });

  it("reads the details on this thread where there's no Web Worker to run in", async () => {
    const file = await writeSave(saveFile(buildCampaign().builder.gameData()));

    await expect(readSaveDetailsInWorkerAsync(file)).resolves.toEqual(
      await readSaveDetailsAsync(file),
    );
  });
});
