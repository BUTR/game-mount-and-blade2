import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBannerAssets,
  getBannerAssetsAsync,
  IBannerAssets,
} from "./assets";
import { purgeIconCacheAsync } from "./iconCache";
import {
  BannerShape,
  clearRecentIcons,
  getBannerPrimaryColor,
  renderBannerAsync,
} from "./render";
import {
  BANNER_WORKER_FILE,
  getBannerPrimaryColorInWorkerAsync,
  renderBannerInWorkerAsync,
  resetBannerCachesAsync,
  runBannerJobAsync,
} from "./worker";

vi.mock("./assets", () => ({
  clearBannerAssets: vi.fn(),
  getBannerAssetsAsync: vi.fn(),
}));
vi.mock("./render", () => ({
  clearRecentIcons: vi.fn(),
  getBannerPrimaryColor: vi.fn(),
  renderBannerAsync: vi.fn(),
}));
vi.mock("./iconCache", () => ({
  purgeIconCacheAsync: vi.fn(),
}));

const GAME_PATH = "D:\\Games\\Bannerlord";
const CODE = "11.84.84.1528.1528.764.764.0.0.0";
const ASSETS = { colors: new Map() } as unknown as IBannerAssets;
const SHAPES: BannerShape[] = [
  {
    kind: "background",
    layer: {
      meshId: 11,
      colorId: 84,
      colorId2: 84,
      sizeX: 1528,
      sizeY: 1528,
      positionX: 764,
      positionY: 764,
      drawStroke: false,
      mirror: false,
      rotation: 0,
    },
    width: 2,
    height: 2,
    paths: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBannerAssetsAsync).mockResolvedValue(ASSETS);
  vi.mocked(renderBannerAsync).mockResolvedValue(SHAPES);
  vi.mocked(getBannerPrimaryColor).mockReturnValue("#b57a1e");
  vi.mocked(purgeIconCacheAsync).mockResolvedValue(undefined);
});

describe("runBannerJobAsync", () => {
  it("draws a banner from the assets of the game and load order, with the cache folder", async () => {
    const result = await runBannerJobAsync({
      kind: "render",
      gamePath: GAME_PATH,
      moduleIds: ["Native", "AMod"],
      code: CODE,
      cacheDir: "C:\\cache",
    });

    expect(result).toBe(SHAPES);
    expect(getBannerAssetsAsync).toHaveBeenCalledExactlyOnceWith(GAME_PATH, [
      "Native",
      "AMod",
    ]);
    expect(renderBannerAsync).toHaveBeenCalledExactlyOnceWith(ASSETS, CODE, {
      cacheDir: "C:\\cache",
    });
  });

  it("draws a banner in the default load order and without a cache folder", async () => {
    await runBannerJobAsync({
      kind: "render",
      gamePath: GAME_PATH,
      moduleIds: undefined,
      code: CODE,
      cacheDir: undefined,
    });

    expect(getBannerAssetsAsync).toHaveBeenCalledExactlyOnceWith(
      GAME_PATH,
      undefined,
    );
    expect(renderBannerAsync).toHaveBeenCalledExactlyOnceWith(ASSETS, CODE, {});
  });

  it("finds a banner's primary color from the same assets", async () => {
    const result = await runBannerJobAsync({
      kind: "primaryColor",
      gamePath: GAME_PATH,
      moduleIds: ["Native"],
      code: CODE,
    });

    expect(result).toBe("#b57a1e");
    expect(getBannerPrimaryColor).toHaveBeenCalledExactlyOnceWith(ASSETS, CODE);
    expect(renderBannerAsync).not.toHaveBeenCalled();
  });

  it("fails when the game's files can't be read", async () => {
    vi.mocked(getBannerAssetsAsync).mockRejectedValue(new Error("locked"));

    await expect(
      runBannerJobAsync({
        kind: "primaryColor",
        gamePath: GAME_PATH,
        moduleIds: undefined,
        code: CODE,
      }),
    ).rejects.toThrow("locked");
  });
});

describe("the banner worker's client without Web Workers", () => {
  it("draws the banner on the calling thread", async () => {
    expect(typeof Worker).toBe("undefined");

    await expect(
      renderBannerInWorkerAsync(GAME_PATH, ["Native"], CODE, "C:\\cache"),
    ).resolves.toBe(SHAPES);

    expect(getBannerAssetsAsync).toHaveBeenCalledWith(GAME_PATH, ["Native"]);
    expect(renderBannerAsync).toHaveBeenCalledWith(ASSETS, CODE, {
      cacheDir: "C:\\cache",
    });
  });

  it("finds the primary color on the calling thread", async () => {
    await expect(
      getBannerPrimaryColorInWorkerAsync(GAME_PATH, undefined, CODE),
    ).resolves.toBe("#b57a1e");

    expect(getBannerPrimaryColor).toHaveBeenCalledWith(ASSETS, CODE);
  });

  it("passes on what drawing the banner threw", async () => {
    vi.mocked(renderBannerAsync).mockRejectedValue(new Error("corrupt tpac"));

    await expect(
      renderBannerInWorkerAsync(GAME_PATH, undefined, CODE, undefined),
    ).rejects.toThrow("corrupt tpac");
  });
});

describe("resetBannerCachesAsync", () => {
  it("forgets the assets and icons in memory and deletes the icons cached on disk", async () => {
    await resetBannerCachesAsync("C:\\cache");

    expect(clearBannerAssets).toHaveBeenCalledOnce();
    expect(clearRecentIcons).toHaveBeenCalledOnce();
    expect(purgeIconCacheAsync).toHaveBeenCalledExactlyOnceWith("C:\\cache");
  });

  it("leaves the disk alone without a cache folder", async () => {
    await resetBannerCachesAsync(undefined);

    expect(clearBannerAssets).toHaveBeenCalledOnce();
    expect(clearRecentIcons).toHaveBeenCalledOnce();
    expect(purgeIconCacheAsync).not.toHaveBeenCalled();
  });

  it("fails when the cached icons can't be deleted, after forgetting what's in memory", async () => {
    vi.mocked(purgeIconCacheAsync).mockRejectedValue(new Error("in use"));

    await expect(resetBannerCachesAsync("C:\\cache")).rejects.toThrow("in use");
    expect(clearBannerAssets).toHaveBeenCalledOnce();
  });
});

describe("the banner worker's client with Web Workers", () => {
  // The worker protocol's messages, see @bannerlord/worker's protocol.ts
  type BannerRequest = { id: number; request: Record<string, unknown> };
  type BannerResponse = { id: number } & (
    | { result: unknown }
    | { error: string }
  );

  class FakeWorker {
    public static instances: FakeWorker[] = [];

    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public readonly posted: BannerRequest[] = [];
    public terminated = false;

    public constructor(public readonly url: string) {
      FakeWorker.instances.push(this);
    }

    public postMessage(message: BannerRequest): void {
      this.posted.push(message);
    }

    public terminate(): void {
      this.terminated = true;
    }

    public respond(data: BannerResponse): void {
      this.onmessage?.({ data } as MessageEvent);
    }
  }

  // The module creates its client when loaded, a fresh one sees the stubbed Worker
  let worker: typeof import("./worker");

  beforeEach(async () => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.resetModules();
    worker = await import("./worker");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts the worker script next to the bundle and sends it the banner jobs", async () => {
    const drawing = worker.renderBannerInWorkerAsync(
      GAME_PATH,
      ["Native"],
      CODE,
      "C:\\cache",
    );
    const coloring = worker.getBannerPrimaryColorInWorkerAsync(
      GAME_PATH,
      undefined,
      CODE,
    );
    const [instance] = FakeWorker.instances;

    expect(FakeWorker.instances).toHaveLength(1);
    expect(instance!.url).toMatch(
      new RegExp(`^file:///.*/${BANNER_WORKER_FILE.replace(".", "\\.")}$`),
    );
    expect(instance!.posted.map((message) => message.request)).toEqual([
      {
        kind: "render",
        gamePath: GAME_PATH,
        moduleIds: ["Native"],
        code: CODE,
        cacheDir: "C:\\cache",
      },
      {
        kind: "primaryColor",
        gamePath: GAME_PATH,
        moduleIds: undefined,
        code: CODE,
      },
    ]);

    instance!.respond({ id: instance!.posted[1]!.id, result: "#b57a1e" });
    instance!.respond({ id: instance!.posted[0]!.id, result: SHAPES });

    await expect(drawing).resolves.toEqual(SHAPES);
    await expect(coloring).resolves.toBe("#b57a1e");
    expect(renderBannerAsync).not.toHaveBeenCalled();
    expect(getBannerPrimaryColor).not.toHaveBeenCalled();
  });

  it("resetting the caches closes the worker, failing the banners it was drawing", async () => {
    const drawing = worker.renderBannerInWorkerAsync(
      GAME_PATH,
      undefined,
      CODE,
      undefined,
    );
    const [instance] = FakeWorker.instances;

    await worker.resetBannerCachesAsync(undefined);

    expect(instance!.terminated).toBe(true);
    await expect(drawing).rejects.toThrow(
      "The worker was closed before the job finished",
    );
    expect(clearBannerAssets).toHaveBeenCalledOnce();

    // The next banner starts a new worker, from the new files
    void worker.renderBannerInWorkerAsync(
      GAME_PATH,
      undefined,
      CODE,
      undefined,
    );
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
