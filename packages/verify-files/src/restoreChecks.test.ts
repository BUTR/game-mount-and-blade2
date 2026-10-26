import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IFilesArchive } from "./archive";
import { findModuleConflictsAsync, getVersionMismatch } from "./restoreChecks";
import { IVerifyFile, IVerifyFilesReport, VerifyStore } from "./types";

vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("winapi-bindings", () => ({}));

const archive = (
  store: VerifyStore,
  buildId: string,
  gameVersion?: string,
): IFilesArchive => ({
  version: 1,
  createdAt: "2026-10-26T10:00:00.000Z",
  store,
  buildId,
  ...(gameVersion !== undefined ? { gameVersion } : {}),
  files: [],
  archivePath: "files.zip",
  size: 0,
});

const report = (
  store: VerifyStore,
  buildId: string,
  version?: string,
  files: IVerifyFile[] = [],
): IVerifyFilesReport => ({
  store,
  buildId,
  ...(version !== undefined ? { version } : {}),
  storeUrl: "",
  expectedFileCount: 0,
  sizesKnown: true,
  contentsChecked: false,
  missingLists: [],
  files,
});

describe("getVersionMismatch", () => {
  it("compares by version when both are known, whatever the builds", () => {
    expect(
      getVersionMismatch(
        archive("steam", "1", "v1.4.8.119303"),
        report("gog", "2", "v1.4.8.119303"),
      ),
    ).toBe(undefined);
    expect(
      getVersionMismatch(
        archive("steam", "1", "v1.2.12.98765"),
        report("steam", "1", "v1.4.8.119303"),
      ),
    ).toEqual({
      archived: { buildId: "1", version: "v1.2.12.98765" },
      installed: { buildId: "1", version: "v1.4.8.119303" },
    });
  });

  it("compares by build of the same store when a version is unknown", () => {
    expect(
      getVersionMismatch(
        archive("steam", "1", "v1.2.12.98765"),
        report("steam", "2"),
      ),
    ).toEqual({
      archived: { buildId: "1", version: "v1.2.12.98765" },
      installed: { buildId: "2" },
    });
    expect(
      getVersionMismatch(
        archive("steam", "1"),
        report("steam", "1", "v1.0.0.1"),
      ),
    ).toBe(undefined);
  });

  it("can't tell builds of different stores apart without versions", () => {
    expect(getVersionMismatch(archive("steam", "1"), report("gog", "2"))).toBe(
      undefined,
    );
  });
});

describe("findModuleConflictsAsync", () => {
  let gamePath: string;

  beforeEach(async () => {
    gamePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "verify-files-restore-"),
    );
  });

  afterEach(async () => {
    await fs.rm(gamePath, { recursive: true, force: true });
  });

  const writeFileAsync = async (filePath: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(gamePath, filePath)), {
      recursive: true,
    });
    await fs.writeFile(path.join(gamePath, filePath), "x");
  };

  const file = (
    filePath: string,
    folder: string,
    source: IVerifyFile["source"],
    status: IVerifyFile["status"] = "extra",
  ): IVerifyFile => ({ path: filePath, folder, status, source });

  it("finds the archived modules the game folder has a mod's folder of again", async () => {
    await writeFileAsync("Modules/Hand/SubModule.xml");
    await writeFileAsync("Modules/Native/SubModule.xml");
    await writeFileAsync("Modules/Vortexed/SubModule.xml");
    await writeFileAsync("Modules/NoSubModule/readme.txt");

    const conflicts = await findModuleConflictsAsync(
      gamePath,
      report("steam", "1", undefined, [
        file("Modules/hand/SubModule.xml", "Modules/hand", "manualMod"),
        file("Modules/Vortexed/SubModule.xml", "Modules/Vortexed", "vortex"),
      ]),
      [
        "Modules/Vortexed/bin/a.dll",
        "Modules/Hand/bin/Hand.dll",
        "Modules/Hand/SubModule.xml",
        "Modules/Native/added-by-mod.xml",
        "Modules/Gone/SubModule.xml",
        "Modules/NoSubModule/a.xml",
        "bin/Win64_Shipping_Client/version.dll",
        "Modules/loose.txt",
      ],
    );

    expect(conflicts).toEqual([
      { folder: "Modules/Hand", deployedByVortex: false },
      { folder: "Modules/NoSubModule", deployedByVortex: false },
      { folder: "Modules/Vortexed", deployedByVortex: true },
    ]);
  });

  it("knows Vortex deployed a module whose folder's case changed since archiving", async () => {
    await writeFileAsync("Modules/Vortexed/SubModule.xml");

    const conflicts = await findModuleConflictsAsync(
      gamePath,
      report("steam", "1", undefined, [
        file("Modules/vortexed/SubModule.xml", "Modules/vortexed", "vortex"),
      ]),
      ["Modules/Vortexed/bin/a.dll"],
    );

    expect(conflicts).toEqual([
      { folder: "Modules/Vortexed", deployedByVortex: true },
    ]);
  });

  it("finds nothing when the game folder doesn't have the modules", async () => {
    expect(
      await findModuleConflictsAsync(gamePath, report("steam", "1"), [
        "Modules/Hand/SubModule.xml",
      ]),
    ).toEqual([]);
  });
});
