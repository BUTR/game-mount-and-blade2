import { defineConfig } from "rolldown";
import { builtinModules, createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, globSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));

// The package `exports` map hides package.json from `require`, so read it by path.
const extensionPackage = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const vortexApiPackage = JSON.parse(
  readFileSync(resolve(rootDir, "node_modules/@nexusmods/vortex-api/package.json"), "utf8"),
);

/**
 * Modules provided by Vortex at runtime that must stay external.
 * The bulk of the list comes from the peerDependencies of `@nexusmods/vortex-api`;
 * the rest are git-hosted Vortex runtime packages that cannot be declared as peers.
 */
function getExternals() {
  const builtins = builtinModules.filter((m) => !m.startsWith("_"));

  const { peerDependencies } = vortexApiPackage;

  const injected = [
    "electron",
    "vortex-api",
    "@nexusmods/vortex-api",
    "@nexusmods/nexus-api",
    "reselect",
    "re-reselect",
    "turbowalk",
    "winapi-bindings",
  ];

  const ids = [
    ...builtins,
    ...builtins.map((m) => `node:${m}`),
    ...Object.keys(peerDependencies ?? {}),
    ...injected,
  ];
  const idSet = new Set(ids);

  // Match both the package itself and its subpaths, e.g. `react/jsx-runtime`.
  return (id) => idSet.has(id) || ids.some((e) => id.startsWith(`${e}/`));
}

function nativeAddonPlugin() {
  const nativeDirs = new Set();
  return {
    name: "native-addon",
    resolveId(source, importer) {
      if (source.endsWith(".node") && importer) {
        const fullPath = resolve(dirname(importer), source);
        nativeDirs.add(dirname(fullPath));
        return { id: "./" + basename(fullPath), external: true };
      }
    },
    generateBundle() {
      for (const dir of nativeDirs) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          if (entry.name.endsWith(".node") || entry.name.endsWith(".dll")) {
            this.emitFile({
              type: "asset",
              fileName: entry.name,
              source: readFileSync(resolve(dir, entry.name)),
            });
          }
        }
      }
    },
  };
}

function copyAssetsPlugin() {
  return {
    name: "copy-assets",
    generateBundle() {
      for (const pattern of ["assets/*.{jpg,png,svg}", "packages/*/src/stylesheets/*.scss"]) {
        for (const file of globSync(pattern)) {
          this.emitFile({ type: "asset", fileName: basename(file), source: readFileSync(file) });
        }
      }
    },
  };
}

const LOCALIZATION_MODULE = "virtual:localization";

/**
 * The localization XMLs as a module of strings, so the renderer doesn't read them from disk at runtime
 */
function localizationPlugin() {
  return {
    name: "localization",
    resolveId(id) {
      return id === LOCALIZATION_MODULE ? "\0" + LOCALIZATION_MODULE : undefined;
    },
    load(id) {
      if (id !== "\0" + LOCALIZATION_MODULE) {
        return undefined;
      }
      const files = globSync("assets/localization/**/*.xml").sort();
      for (const file of files) {
        this.addWatchFile(resolve(rootDir, file));
      }
      return `export default ${JSON.stringify(files.map((file) => readFileSync(file, "utf8")))};`;
    },
  };
}

const resolveOptions = {
  extensions: [".js", ".jsx", ".json", ".ts", ".tsx"],
  tsconfigFilename: "tsconfig.json",
  alias: {
    // koffi's CommonJS entry requires its platform package, so its koffi.node is bundled next to the bundle. The ESM
    // entry, the one an import resolves to, looks for it at runtime, in node_modules the extension doesn't have
    koffi: createRequire(resolve(rootDir, "packages/store-builds/package.json")).resolve("koffi"),
  },
};

export default defineConfig([
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.js",
      format: "cjs",
      sourcemap: true,
      exports: "auto",
      // Lazily loaded modules, like node:sqlite, stay a require like the rest of the bundle, not an import() of the ESM loader
      dynamicImportInCjs: false,
      // The bundled ones, like koffi, are inlined into the one file, loaded when they're first imported
      codeSplitting: false,
      // Emit the legacy module id: Vortex 1.x only provides `vortex-api`, Vortex 2.x accepts both.
      // This lets Vortex 1.x load the bundle far enough to reject it through `requireVersion`.
      paths: { "@nexusmods/vortex-api": "vortex-api" },
    },
    external: getExternals(),
    platform: "node",
    transform: {
      // The minimum Vortex version is the API version the extension is built against
      define: {
        __VORTEX_API_VERSION__: JSON.stringify(vortexApiPackage.version),
        __EXTENSION_VERSION__: JSON.stringify(extensionPackage.version),
        __EXTENSION_NAME__: JSON.stringify(extensionPackage.config.extensionName),
      },
    },
    resolve: resolveOptions,
    plugins: [nativeAddonPlugin(), copyAssetsPlugin(), localizationPlugin()],
  },
  // Web Workers of the renderer, next to the bundle, see @bannerlord/worker. Vortex enables Node in them, so built-ins
  // stay a require. Only context-aware native modules load in them, like koffi's, not Vortex's winapi-bindings
  ...Object.entries({
    "verifyWorker.js": "packages/store-builds/src/verifyWorker.ts",
    "saveDetailsWorker.js": "packages/save-file/src/detailsWorker.ts",
    "bannerWorker.js": "packages/banner/src/bannerWorker.ts",
  }).map(([file, input]) => ({
    input,
    output: { file: `dist/${file}`, format: "cjs", sourcemap: true, dynamicImportInCjs: false, codeSplitting: false },
    external: getExternals(),
    platform: "node",
    resolve: resolveOptions,
    plugins: [nativeAddonPlugin()],
  })),
]);
