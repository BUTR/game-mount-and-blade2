// @ts-check
// Serves what a dedicated server with the BUTR server extension publishes on its game port, for trying out
// the Servers page without a real server. See docs/server-extension.md
//
// Usage: node tools/mock-dedicated-server.js [port] [--vanilla]
//   --vanilla  only serve the vanilla /maps/list, like a server without the extension

// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require("http");

const port = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 7299);
const vanilla = process.argv.includes("--vanilla");

const mapList = {
  currentlyPlaying: "mp_siege_map_003",
  maps: [
    { name: "mp_siege_map_003", uniqueToken: null, revision: null },
    { name: "mp_battle_map_001", uniqueToken: null, revision: null },
    {
      name: "custom_siege_castle",
      uniqueToken: "{45DB4FE2-E5A2-45EB-B3A1-6C7335D7C57B}",
      revision: "1735826730445",
    },
  ],
};

const serverInfo = {
  schemaVersion: 1,
  description:
    "Mock server for the Vortex Servers page.\nSiege every evening, EU timezone.",
  links: [
    { label: "Discord", url: "https://discord.gg/example" },
    { label: "Not shown, not a web link", url: "file:///C:/Windows" },
  ],
  serverModules: [
    { id: "Bannerlord.Harmony", name: "Harmony", version: "v2.3.3.207" },
    { id: "MockAdminTools", name: "Mock Admin Tools", version: "v1.2.0" },
  ],
  clientModules: [
    {
      id: "Bannerlord.Harmony",
      name: "Harmony",
      version: "v2.3.3.207",
      required: true,
      nexusMods: { modId: 2006 },
    },
    {
      id: "MockVlandiaArmor",
      name: "Mock Vlandia Armor",
      version: "v1.0.4",
      required: true,
      nexusMods: { modId: 1234, fileId: 56789 },
    },
    {
      id: "MockBetterHud",
      name: "Mock Better HUD",
      required: false,
      url: "https://example.com/better-hud",
    },
  ],
  // A real, published Bannerlord collection, for display only
  nexusMods: { collection: { slug: "pjkqjk", required: false } },
};

http
  .createServer((request, response) => {
    console.log(`${request.method} ${request.url}`);
    const send = (
      /** @type {number} */ status,
      /** @type {unknown} */ body,
    ) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(body === undefined ? "" : JSON.stringify(body));
    };

    if (request.method !== "GET") {
      send(405, undefined);
    } else if (request.url === "/maps/list") {
      send(200, mapList);
    } else if (request.url === "/butr/v1/server" && !vanilla) {
      send(200, serverInfo);
    } else {
      send(404, undefined);
    }
  })
  .listen(port, () => {
    console.log(
      `Mock dedicated server on http://127.0.0.1:${port}${vanilla ? " (vanilla, no extension)" : ""}`,
    );
  });
