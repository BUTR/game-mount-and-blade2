import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBannerAssetsAsync, IBannerAssets } from "./assets";
import { getBannerPrimaryColor, renderBannerAsync } from "./render";
import { BannerJob } from "./worker";
// Loading the script makes it listen on this thread's scope, as it does in the worker's
import "./bannerWorker";

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

type Scope = { onmessage: ((event: MessageEvent) => void) | null };

const GAME_PATH = "D:\\Games\\Bannerlord";
const CODE = "11.84.84.1528.1528.764.764.0.0.0";
const ASSETS = { colors: new Map() } as unknown as IBannerAssets;

const postMessage = vi.fn();

const send = (id: number, request: BannerJob): void => {
  const { onmessage } = globalThis as unknown as Scope;
  expect(onmessage).not.toBeNull();
  // A request of the worker protocol, see @bannerlord/worker's protocol.ts
  onmessage!({ data: { id, request } } as MessageEvent);
};

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("postMessage", postMessage);
  vi.mocked(getBannerAssetsAsync).mockResolvedValue(ASSETS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the banner worker script", () => {
  it("answers a render job with the banner drawn from the game's assets", async () => {
    const shapes = [{ kind: "icon", href: "data:," }];
    vi.mocked(renderBannerAsync).mockResolvedValue(
      shapes as unknown as Awaited<ReturnType<typeof renderBannerAsync>>,
    );

    send(3, {
      kind: "render",
      gamePath: GAME_PATH,
      moduleIds: ["Native", "AMod"],
      code: CODE,
      cacheDir: "C:\\cache",
    });
    await flush();

    expect(getBannerAssetsAsync).toHaveBeenCalledExactlyOnceWith(GAME_PATH, [
      "Native",
      "AMod",
    ]);
    expect(renderBannerAsync).toHaveBeenCalledExactlyOnceWith(ASSETS, CODE, {
      cacheDir: "C:\\cache",
    });
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 3,
      result: shapes,
    });
  });

  it("answers a primary color job", async () => {
    vi.mocked(getBannerPrimaryColor).mockReturnValue("#b57a1e");

    send(4, {
      kind: "primaryColor",
      gamePath: GAME_PATH,
      moduleIds: undefined,
      code: CODE,
    });
    await flush();

    expect(getBannerAssetsAsync).toHaveBeenCalledExactlyOnceWith(
      GAME_PATH,
      undefined,
    );
    expect(getBannerPrimaryColor).toHaveBeenCalledExactlyOnceWith(ASSETS, CODE);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 4,
      result: "#b57a1e",
    });
  });

  it("answers with the error when the game's files can't be read", async () => {
    vi.mocked(getBannerAssetsAsync).mockRejectedValue(new Error("locked"));

    send(5, {
      kind: "primaryColor",
      gamePath: GAME_PATH,
      moduleIds: undefined,
      code: CODE,
    });
    await flush();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 5,
      error: "locked",
    });
  });
});
