import { describe, expect, it, vi } from "vitest";
import { serveWorker } from "@bannerlord/worker/host";
import { verifyBuildAsync } from "./verifyBuild";

vi.mock("@bannerlord/worker/host", () => ({ serveWorker: vi.fn() }));

describe("verifyWorker", () => {
  it("serves verifyBuildAsync as the worker's job", async () => {
    await import("./verifyWorker");

    expect(serveWorker).toHaveBeenCalledTimes(1);
    expect(serveWorker).toHaveBeenCalledWith(verifyBuildAsync);
  });
});
