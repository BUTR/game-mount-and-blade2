import { defineConfig } from "rolldown";
import { builtinModules, createRequire } from "node:module";
import { readFileSync, readdirSync, globSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename, dirname, extname } from "node:path";

const require = createRequire(import.meta.url);
const vortexApiDir = dirname(require.resolve("vortex-api/package.json"));

function getExternals() {
  const builtins = builtinModules.filter((m) => !m.startsWith("_"));

  let appDeps = [];
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(vortexApiDir, "../../src/main/package.json"), "utf8"),
    );
    appDeps = Object.keys(pkg.dependencies || {});
  } catch {
    try {
      appDeps = JSON.parse(
        readFileSync(resolve(vortexApiDir, "externals.json"), "utf8"),
      );
    } catch {
      // nop
    }
  }

  return [...new Set([...builtins, ...appDeps, "electron", "vortex-api"])];
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
  output: { file: "dist/index.js", format: "cjs", sourcemap: true, exports: "auto" },
  external: getExternals(),
  platform: "node",
  resolve: { extensions: [".js", ".jsx", ".json", ".ts", ".tsx"], tsconfigFilename: "tsconfig.json" },
  plugins: [nativeAddonPlugin(), copyAssetsPlugin()],
});
