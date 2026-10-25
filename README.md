# Vortex Extension for Mount & Blade II: Bannerlord

This project is an extension for the Vortex mod manager.  
It provides additional functionality to enhance your experience with Mount & Blade II: Bannerlord.

## Features
- **BLSE** - the extension can automatically detect Bannerlord Software Extender (BLSE) and recommend its installation if it's missing. This ensures that you have all the necessary components for modding Bannerlord.
- **Save Viewer** - keep track of your progress with a comprehensive list of save games. If BLSE is installed, you can select a save file to load directly from the Vortex UI.
- **Load Order Manager** - the extension allows you to control your game's load order for optimal performance and compatibility. It ensures that your mods are loaded in the correct order to prevent conflicts and crashes.
<!---
- **Collections Data View** - provides a detailed view of your collections data for better organization and management.
-->

## Usage

After installing this extension via Vortex, you can access its features through the Vortex UI.

## Development

The extension is a pnpm workspace of local packages, and rolldown bundles them all into `dist/index.js`.

The extension and its features:

| Package | Contents |
| --- | --- |
| `src/` | The extension itself: registers the game, the features and the load order, and wires Vortex events to them |
| `packages/core` | The game, its mods, load order, profiles and BLSE, which every feature builds on |
| `packages/ui` | React components and styles shared by the pages |
| `packages/saves` | The Saves page |
| `packages/servers` | The Servers page |
| `packages/verify-files` | The Game Files page |
| `packages/collections` | The collection features |

Libraries, logic that works without Vortex or the extension:

| Package | Contents |
| --- | --- |
| `packages/game-layout` | The game's folder layout: its `Modules` folder, module folders linked into it, their `SubModule.xml` |
| `packages/zip` | Reading zip archives and writing uncompressed ones, ZIP64 included |
| `packages/store-builds` | The files of the build Steam or GOG installed, from their local manifests, and comparing a folder to them |
| `packages/build-versions` | The game version of a Steam or GOG build, from BUTR's registry of builds |
| `packages/save-file` | Campaign details read from save files |
| `packages/tpac` | The game's `.tpac` asset packages |
| `packages/banner` | Banner codes, rendered from the game's assets |
| `packages/server-query` | A dedicated server's map list and BUTR's server extension, over HTTP |
| `packages/server-maps` | Local scenes and downloading custom maps from servers |
| `packages/lobby` | The lobby's custom server list and server pings, through the .NET bridge in `bridge/` |
| `packages/mod-analyzer` | BUTR's ModAnalyzer compatibility scores |

A package only imports the local packages its `package.json` lists, and only the modules in their `exports`. Features
depend on `core`, `ui` and libraries, never on each other. Libraries, marked with `"bannerlord": { "library": true }`,
depend only on other libraries and use nothing Vortex provides: what they need from Vortex, like a logger, a path or
an archiver, is a parameter. `pnpm lint` enforces this with `eslint-rules/package-boundaries.mjs`.

## License

This project is licensed under the [GPL-3.0 License](LICENSE.md).