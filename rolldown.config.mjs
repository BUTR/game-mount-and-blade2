import { defineConfig } from "rolldown";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, globSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename, dirname, extname } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));

// The package `exports` map hides package.json from `require`, so read it by path.
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
      for (const pattern of ["assets/*.{jpg,png,svg}", "src/stylesheets/*.scss"]) {
        for (const file of globSync(pattern)) {
          this.emitFile({ type: "asset", fileName: basename(file), source: readFileSync(file) });
        }
      }
      for (const file of globSync("assets/localization/**/*.xml")) {
        const content = readFileSync(file);
        const hash = createHash("sha256").update(content).digest("hex").slice(0, 20);
        this.emitFile({ type: "asset", fileName: `localization_${hash}${extname(file)}`, source: content });
      }
    },
  };
}

export default defineConfig({
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "cjs",
    sourcemap: true,
    exports: "auto",
    // Lazily loaded modules, like node:sqlite, stay a require like the rest of the bundle, not an import() of the ESM loader
    dynamicImportInCjs: false,
    // Emit the legacy module id: Vortex 1.x only provides `vortex-api`, Vortex 2.x accepts both.
    // This lets Vortex 1.x load the bundle far enough to reject it through `requireVersion`.
    paths: { "@nexusmods/vortex-api": "vortex-api" },
  },
  external: getExternals(),
  platform: "node",
  transform: {
    // The minimum Vortex version is the API version the extension is built against
    define: { __VORTEX_API_VERSION__: JSON.stringify(vortexApiPackage.version) },
  },
  resolve: { extensions: [".js", ".jsx", ".json", ".ts", ".tsx"], tsconfigFilename: "tsconfig.json" },
  plugins: [nativeAddonPlugin(), copyAssetsPlugin()],
});
