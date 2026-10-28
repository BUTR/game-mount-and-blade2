import { serveWorker } from "@bannerlord/worker/host";
import { verifyBuildAsync } from "./verifyBuild";

// Verifies the game folder off the renderer's thread, see verifyBuildInWorkerAsync
serveWorker(verifyBuildAsync);
