import { serveWorker } from "@bannerlord/worker/host";
import { readSaveDetailsAsync } from "./index";

// Reads a save's details off the renderer's thread, see readSaveDetailsInWorkerAsync
serveWorker(readSaveDetailsAsync);
