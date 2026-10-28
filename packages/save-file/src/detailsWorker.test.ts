import { describe, expect, it, vi } from "vitest";
import { readSaveDetailsAsync } from "./index";

const mocks = vi.hoisted(() => ({
  serveWorker: vi.fn<(job: unknown) => void>(),
}));

vi.mock("@bannerlord/worker/host", () => ({ serveWorker: mocks.serveWorker }));

describe("the save details worker", () => {
  it("serves readSaveDetailsAsync once its script loads, the renderer's readSaveDetailsInWorkerAsync asks it", async () => {
    await import("./detailsWorker");

    expect(mocks.serveWorker).toHaveBeenCalledExactlyOnceWith(
      readSaveDetailsAsync,
    );
  });
});
