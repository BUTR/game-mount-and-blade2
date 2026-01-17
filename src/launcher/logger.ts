import { NativeLogger } from "@butr/vortexextensionnative";
import { log } from "vortex-api";
import { LogLevel } from "vortex-api/lib/util/log";

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
