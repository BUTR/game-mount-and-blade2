// @ts-check
// Finds import cycles in the extension and in each package. Each package's src is passed on its own: given
// packages/ whole, madge stops walking at the workspace links in the packages' node_modules
import { globSync } from "node:fs";
import madge from "madge";

const paths = ["src", ...globSync("packages/*/src")];

const result = await madge(paths, {
  fileExtensions: ["ts", "tsx"],
  tsConfig: "tsconfig.json",
});

const cycles = result.circular();
if (cycles.length > 0) {
  console.error(`${cycles.length} circular dependencies found:`);
  for (const cycle of cycles) {
    console.error(`  ${cycle.join(" > ")}`);
  }
  process.exit(1);
}
console.log(
  `No circular dependency found in ${Object.keys(result.obj()).length} files`,
);
