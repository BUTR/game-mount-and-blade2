import { NativeLogger } from "@butr/vortexextensionnative";
import { log, util } from "@nexusmods/vortex-api";

type LogLevel = Parameters<typeof log>[0];

const getLogLevel = (level: number): LogLevel => {
  switch (level) {
    case 0:
      return "debug";
    case 1:
      return "debug";
    case 2:
      return "info";
    case 3:
      return "warn";
    case 4:
      return "error";
    case 5:
      return "error";
  }
  return "debug";
};

export class VortexLauncherManagerLogger {
  private mLogger: NativeLogger;

  public constructor() {
    this.mLogger = new NativeLogger(this.log);
  }

  public useVortexFunctions = () => {
    this.mLogger.setCallbacks();
  };

  public useLibraryFunctions = () => {
    NativeLogger.setDefaultCallbacks();
  };

  /**
   * Callback
   */
  private log = (level: number, message: string): void => {
    const logLevel = getLogLevel(level);
    log(logLevel, message);
  };
}

let nativeLogger: VortexLauncherManagerLogger | null = null;

/**
 * Routes the native library's log to Vortex's, loading the library on first use.
 * Vortex loads the extension for every game, so this waits for Bannerlord instead of running at startup:
 * a library that can't load then fails only Bannerlord, not every game Vortex manages
 */
export const ensureNativeLogger = (): void => {
  if (nativeLogger !== null) {
    return;
  }
  try {
    const logger = new VortexLauncherManagerLogger();
    logger.useVortexFunctions();
    nativeLogger = logger;
  } catch (err) {
    log("error", "Failed to load the native library", err);
    // Vortex shows a SetupError as 'Failed to set game mode' without a Report button
    throw new util.SetupError(
      `The extension's native library could not be loaded. Update Vortex, then reinstall the extension. ` +
        `If that doesn't help, check that your antivirus didn't quarantine 'Bannerlord.LauncherManager.Native.dll' ` +
        `or 'launchermanager.node' from the extension's folder. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
};
