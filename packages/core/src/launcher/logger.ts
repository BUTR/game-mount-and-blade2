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

// ERROR_SYSTEM_INTEGRITY_POLICY_VIOLATION and Smart App Control's reputation variants (4556-4559, 4580-4582) from
// dlopen, as a number where Windows has no English message
const APPLICATION_CONTROL =
  /Application Control policy has blocked|^error: (?:4551|455[6-9]|458[0-2])\b/i;

/**
 * Why the native library didn't load, in words for the user. A blocked dependency fails the .node with the
 * dependency's error, so a block names both files
 */
export const describeLoadFailure = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  // node sets the code whatever language Windows phrased the failure in
  if (
    !(err instanceof Error) ||
    !("code" in err) ||
    err.code !== "ERR_DLOPEN_FAILED"
  ) {
    return (
      `The extension's native library could not be loaded. Update Vortex, then reinstall the extension. ` +
      `If that doesn't help, check that your antivirus didn't quarantine 'Bannerlord.LauncherManager.Native.dll' ` +
      `or 'launchermanager.node' from the extension's folder. (${message})`
    );
  }
  // The message ends in the library's path, after a line break or straight after the number
  const reason = message.split(/\r?\n|\\\\\?\\/)[0]!.trim() || message;
  if (APPLICATION_CONTROL.test(message)) {
    return (
      `Windows blocked the extension's native library ('launchermanager.node' or ` +
      `'Bannerlord.LauncherManager.Native.dll') with an Application Control policy, such as Smart App Control. ` +
      `Bannerlord can't be managed until the policy allows it. (${reason})`
    );
  }
  return (
    `The extension's native library could not be loaded: ${reason.replace(/\.$/, "")}. ` +
    `Reinstall the extension. If that doesn't help, check that your antivirus didn't quarantine ` +
    `'Bannerlord.LauncherManager.Native.dll' or 'launchermanager.node' from the extension's folder.`
  );
};

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
    throw new util.SetupError(describeLoadFailure(err));
  }
};
