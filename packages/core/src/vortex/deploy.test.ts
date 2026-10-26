import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { enableModsAsync, ensureModsDeployedAsync } from "./deploy";
import { GAME_ID } from "../common";

const vortex = vi.hoisted(() => ({
  calls: [] as unknown[][],
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    activeProfile: (state: { activeProfileId?: string }) =>
      state.activeProfileId !== undefined
        ? { id: state.activeProfileId }
        : undefined,
  });
  Object.assign(api.actions, {
    setModsEnabled: (...args: unknown[]) => {
      vortex.calls.push(["setModsEnabled", ...args.slice(1)]);
      return Promise.resolve();
    },
    setDeploymentNecessary: (gameId: string, required: boolean) => ({
      type: "SET_DEPLOYMENT_NECESSARY",
      gameId,
      required,
    }),
  });
  Object.assign(api.util, {
    toPromise: (fn: (cb: (err: unknown) => void) => void) =>
      new Promise<void>((resolve) => fn(() => resolve())),
  });
  return api;
});

const makeApi = (options: {
  activeProfileId?: string;
  needToDeploy?: boolean;
  awaitModsDeployment?: boolean;
}) => {
  const emitted: string[] = [];
  const dispatched: unknown[] = [];
  const api = {
    getState: () => ({
      activeProfileId: options.activeProfileId,
      persistent: {
        deployment: { needToDeploy: { [GAME_ID]: options.needToDeploy } },
      },
    }),
    events: {
      emit: (event: string, ...args: unknown[]) => {
        emitted.push(event);
        const cb = args.find((arg) => typeof arg === "function") as
          | ((err: null) => void)
          | undefined;
        cb?.(null);
      },
    },
    ext: options.awaitModsDeployment
      ? {
          awaitModsDeployment: () => {
            emitted.push("awaitModsDeployment");
            return Promise.resolve();
          },
        }
      : {},
    store: { dispatch: (action: unknown) => dispatched.push(action) },
  };
  return { api: api as unknown as types.IExtensionApi, emitted, dispatched };
};

beforeEach(() => {
  vortex.calls = [];
});

describe("ensureModsDeployedAsync", () => {
  it("deploys when the active profile has changes not on disk", async () => {
    const { api, emitted } = makeApi({ needToDeploy: true });

    await ensureModsDeployedAsync(api);

    expect(emitted).toEqual(["deploy-mods"]);
  });

  it("uses Vortex's own deployment wrapper when it has one", async () => {
    const { api, emitted } = makeApi({
      needToDeploy: true,
      awaitModsDeployment: true,
    });

    await ensureModsDeployedAsync(api);

    expect(emitted).toEqual(["awaitModsDeployment"]);
  });

  it("only waits for a running deployment otherwise", async () => {
    const { api, emitted } = makeApi({ needToDeploy: false });

    await ensureModsDeployedAsync(api);

    expect(emitted).toEqual(["await-activation"]);
  });
});

describe("enableModsAsync", () => {
  it("enables the mods without an automatic deployment", async () => {
    const { api } = makeApi({ activeProfileId: "p1" });

    await enableModsAsync(api, "p1", ["harmony"], { installed: true });

    expect(vortex.calls).toEqual([
      [
        "setModsEnabled",
        "p1",
        ["harmony"],
        true,
        { allowAutoDeploy: false, installed: true },
      ],
    ]);
  });

  it("clears the deployment flag a change to another profile raised", async () => {
    const { api, dispatched } = makeApi({
      activeProfileId: "p1",
      needToDeploy: false,
    });

    await enableModsAsync(api, "p2", ["harmony"]);

    expect(dispatched).toEqual([
      { type: "SET_DEPLOYMENT_NECESSARY", gameId: GAME_ID, required: false },
    ]);
  });

  it("keeps the flag for the active profile or when a deployment was already due", async () => {
    const active = makeApi({ activeProfileId: "p1", needToDeploy: false });
    await enableModsAsync(active.api, "p1", ["harmony"]);

    const due = makeApi({ activeProfileId: "p1", needToDeploy: true });
    await enableModsAsync(due.api, "p2", ["harmony"]);

    expect(active.dispatched).toEqual([]);
    expect(due.dispatched).toEqual([]);
  });
});
