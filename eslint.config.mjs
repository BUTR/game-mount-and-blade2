import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import eslintReact from "@eslint-react/eslint-plugin";
import noCrossImportsRule from "./eslint-rules/no-cross-imports.mjs";

export default defineConfig([
  {
    ignores: [
      "dist/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  tseslint.configs.recommended,
  {
    ...eslintReact.configs["recommended-typescript"],
    settings: {
      "react-x": {
        version: "16",
      },
    },
  },
  prettierConfig,
  {
    plugins: {
      vortex: {
        rules: {
          "no-cross-imports": noCrossImportsRule,
        },
      },
    },
    rules: {
      "vortex/no-cross-imports": "error",
    },
  }
]);
