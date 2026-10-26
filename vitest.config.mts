import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const LOCALIZATION_MODULE = "virtual:localization";

/**
 * The same module the build makes from the localization XMLs, see rolldown.config.mjs
 */
const localizationPlugin = (): Plugin => ({
    name: "localization",
    resolveId: (id) =>
        id === LOCALIZATION_MODULE ? `\0${LOCALIZATION_MODULE}` : undefined,
    load: (id) => {
        if (id !== `\0${LOCALIZATION_MODULE}`) {
            return undefined;
        }
        const files = globSync("assets/localization/**/*.xml", {
            cwd: root,
        }).sort();
        return `export default ${JSON.stringify(
            files.map((file) => readFileSync(path.resolve(root, file), "utf8")),
        )};`;
    },
});

export default defineConfig({
    plugins: [localizationPlugin()],
    // The build injects these, see rolldown.config.mjs
    define: {
        __EXTENSION_NAME__: JSON.stringify("test"),
        __EXTENSION_VERSION__: JSON.stringify("0.0.0-test"),
        __VORTEX_API_VERSION__: JSON.stringify("0.0.0-test"),
    },
    resolve: {
        alias: {
            // The Vortex API package is types-only, Vortex provides the runtime. Tests get a stub
            "@nexusmods/vortex-api": path.resolve(
                root,
                "test/stubs/vortex-api.ts",
            ),
        },
    },
    test: {
        include: ["packages/*/src/**/*.test.ts"],
        environment: "node",
    },
});
