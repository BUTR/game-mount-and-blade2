import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import eslintReact from "@eslint-react/eslint-plugin";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "typings.custom/**",
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
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // No barrels: re-exports hide real dependencies and create import cycles. Import from the declaring file.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message: "Don't re-export (barrels cause import cycles). Import from the declaring file instead.",
        },
        {
          selector: "ExportNamedDeclaration[source]",
          message: "Don't re-export (barrels cause import cycles). Import from the declaring file instead.",
        },
      ],
    },
  },
  {
    ...eslintReact.configs["recommended-typescript"],
    settings: {
      "react-x": {
        version: "18",
      },
    },
  },
  prettierConfig
]);
