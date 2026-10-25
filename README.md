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

The extension is a pnpm workspace. Each feature is a local package, and rolldown bundles them all into `dist/index.js`:

| Package | Contents |
| --- | --- |
| `src/` | The extension itself: registers the game, the features and the load order, and wires Vortex events to them |
| `packages/core` | The game, its mods, load order, profiles and BLSE, which every feature builds on |
| `packages/ui` | React components and styles shared by the pages |
| `packages/saves` | The Saves page |
| `packages/servers` | The Servers page |
| `packages/verify-files` | The Game Files page |
| `packages/collections` | The collection features |

A package only imports the local packages its `package.json` lists, and only the modules in their `exports`. Features
depend on `core` and `ui`, never on each other. `pnpm lint` enforces this with `eslint-rules/package-boundaries.mjs`.

## License

This project is licensed under the [GPL-3.0 License](LICENSE.md).