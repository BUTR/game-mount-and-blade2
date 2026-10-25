import path from "path";
import { types } from "@nexusmods/vortex-api";
import { watchNoModsProfile } from "./noModsProfile";
import { watchClonedServerProfiles } from "./profileWatch";
import { ServersPage } from "./views/ServersPage";
import { ServersPageOptions } from "./views/options";

export const registerServers = (context: types.IExtensionContext): void => {
  context.registerMainPage(
    /*icon:*/ "connection",
    /*title:*/ "Servers",
    /*element:*/ ServersPage,
    /*options:*/ new ServersPageOptions(context),
  );

  context.once(() => {
    context.api.setStylesheet("servers", path.join(__dirname, "servers.scss"));
  });
};

/**
 * Keeps the server profiles what they were made for, after the profile types are assigned
 */
export const watchServerProfiles = (api: types.IExtensionApi): void => {
  watchNoModsProfile(api);
  watchClonedServerProfiles(api);
};
