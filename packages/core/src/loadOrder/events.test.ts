import { beforeEach, describe, expect, it, vi } from "vitest";
import { types, util } from "@nexusmods/vortex-api";
import {
  didDeployLoadOrderAsync,
  gamemodeActivatedLoadOrderAsync,
} from "./events";
import { LoadOrderManager } from "./manager";

vi.mock("@nexusmods/vortex-api", () => {
  class ProcessCanceled extends Error {}
  return { util: { ProcessCanceled } };
});

vi.mock("./manager", () => ({
  LoadOrderManager: { getInstance: vi.fn() },
}));

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const deserializeLoadOrder = vi.fn();

const createApi = (): types.IExtensionApi =>
  ({ showErrorNotification: vi.fn() }) as unknown as types.IExtensionApi;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(LoadOrderManager.getInstance).mockReturnValue({
    deserializeLoadOrder,
  } as unknown as LoadOrderManager);
});

describe.each([
  ["didDeployLoadOrderAsync", didDeployLoadOrderAsync],
  ["gamemodeActivatedLoadOrderAsync", gamemodeActivatedLoadOrderAsync],
])("%s", (_name, handler) => {
  it("reads the load order", async () => {
    deserializeLoadOrder.mockResolvedValue([]);

    await handler(createApi());

    expect(deserializeLoadOrder).toHaveBeenCalledTimes(1);
  });

  it("stays quiet about a read canceled by a profile or game switch", async () => {
    deserializeLoadOrder.mockRejectedValue(new util.ProcessCanceled("switch"));
    const api = createApi();

    await expect(handler(api)).resolves.toBeUndefined();
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it("reports other failures instead of throwing out of the event", async () => {
    deserializeLoadOrder.mockRejectedValue(new Error("broken"));
    const api = createApi();

    await expect(handler(api)).resolves.toBeUndefined();
    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
  });
});
