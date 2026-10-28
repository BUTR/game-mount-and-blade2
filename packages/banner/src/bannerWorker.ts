import { serveWorker } from "@bannerlord/worker/host";
import { runBannerJobAsync } from "./worker";

// Renders banners off the renderer's thread, keeping the game's banner data between them, see worker.ts
serveWorker(runBannerJobAsync);
