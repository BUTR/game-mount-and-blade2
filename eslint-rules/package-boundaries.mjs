// @ts-check
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const SCOPE = "@bannerlord/";

/**
 * What Vortex provides the extension at runtime, and the extension's native addon. A library takes what it needs from
 * them as parameters, so it works outside Vortex
 */
const EXTENSION_RUNTIME = [
  "@nexusmods/vortex-api",
  "vortex-api",
  "@nexusmods/nexus-api",
  "electron",
  "react",
  "react-dom",
  "react-redux",
  "react-bootstrap",
  "react-i18next",
  "redux",
  "redux-act",
  "reselect",
  "re-reselect",
  "@butr/vortexextensionnative",
];

/**
 * The folder of the package a file belongs to: its folder under packages/, or the root for the extension itself
 * @param {string} file
 */
const getPackageRoot = (file) => {
  const relative = path.relative(PACKAGES_DIR, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return ROOT_DIR;
  }
  return path.join(PACKAGES_DIR, relative.split(path.sep)[0] ?? "");
};

/**
 * @typedef {{ dependencies: string[]; library: boolean }} IPackageInfo
 */

/** @type {Map<string, IPackageInfo>} */
const packageCache = new Map();

/**
 * The local packages a package declares in its package.json, and whether it is a library: logic that doesn't need
 * Vortex or the extension, marked with "bannerlord": { "library": true }
 * @param {string} packageRoot
 * @returns {IPackageInfo}
 */
const getPackageInfo = (packageRoot) => {
  let info = packageCache.get(packageRoot);
  if (info === undefined) {
    const manifest = JSON.parse(
      readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    );
    info = {
      dependencies: Object.keys(manifest.dependencies ?? {}).filter((name) =>
        name.startsWith(SCOPE),
      ),
      library: manifest.bannerlord?.library === true,
    };
    packageCache.set(packageRoot, info);
  }
  return info;
};

/**
 * @param {string} packageRoot
 */
const getLocalDependencies = (packageRoot) =>
  getPackageInfo(packageRoot).dependencies;

/**
 * The folder of a local package by name, packages/core for @bannerlord/core
 * @param {string} name
 */
const getNamedPackageRoot = (name) =>
  path.join(PACKAGES_DIR, name.slice(SCOPE.length));

/**
 * Whether the package depends on the other package, directly or through its dependencies
 * @param {string} packageRoot
 * @param {string} otherRoot
 * @param {Set<string>} [seen]
 * @returns {boolean}
 */
const dependsOn = (packageRoot, otherRoot, seen = new Set()) => {
  if (seen.has(packageRoot)) {
    return false;
  }
  seen.add(packageRoot);
  return getLocalDependencies(packageRoot).some((name) => {
    const dependencyRoot = getNamedPackageRoot(name);
    return (
      dependencyRoot === otherRoot || dependsOn(dependencyRoot, otherRoot, seen)
    );
  });
};

/**
 * Keeps the local packages apart: a relative import stays in its own package, and another package is imported by
 * name only when the package.json lists it and it doesn't depend back on this one. Features don't list each other,
 * so they can't reach into each other. Libraries only use other libraries, and nothing of Vortex or the extension
 * @type {import("eslint").Rule.RuleModule}
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow relative imports out of a package and imports of local packages it doesn't depend on",
    },
    schema: [],
    messages: {
      outside:
        "'{{source}}' is outside this package. Import it from its package, if this package may depend on it.",
      undeclared:
        "'{{name}}' is not a dependency of this package. Add it to package.json if this package may depend on it.",
      cycle:
        "'{{name}}' depends on this package, so this package can't depend on it. Move what both need to a package below them.",
      libraryDependency:
        "'{{name}}' is not a library, a library only depends on libraries. Take what it needs as a parameter instead.",
      libraryRuntime:
        "'{{name}}' is part of Vortex or the extension, a library works without them. Take what it needs as a parameter instead.",
    },
  },
  create(context) {
    const file = context.filename;
    const packageRoot = getPackageRoot(file);
    const isLibrary =
      packageRoot !== ROOT_DIR && getPackageInfo(packageRoot).library;

    /**
     * @param {import("estree").ImportDeclaration | import("estree").ExportNamedDeclaration | import("estree").ExportAllDeclaration | import("estree").ImportExpression} node
     */
    const check = (node) => {
      const source = node.source;
      if (source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }
      const specifier = source.value;

      if (specifier.startsWith(".")) {
        const target = path.resolve(path.dirname(file), specifier);
        if (getPackageRoot(target) !== packageRoot) {
          context.report({
            node: source,
            messageId: "outside",
            data: { source: specifier },
          });
        }
        return;
      }

      if (specifier.startsWith(SCOPE)) {
        const name = specifier.split("/").slice(0, 2).join("/");
        if (!getLocalDependencies(packageRoot).includes(name)) {
          context.report({
            node: source,
            messageId: "undeclared",
            data: { name },
          });
        } else if (dependsOn(getNamedPackageRoot(name), packageRoot)) {
          context.report({ node: source, messageId: "cycle", data: { name } });
        } else if (
          isLibrary &&
          !getPackageInfo(getNamedPackageRoot(name)).library
        ) {
          context.report({
            node: source,
            messageId: "libraryDependency",
            data: { name },
          });
        }
        return;
      }

      if (isLibrary) {
        const name = EXTENSION_RUNTIME.find(
          (runtime) =>
            specifier === runtime || specifier.startsWith(`${runtime}/`),
        );
        if (name !== undefined) {
          context.report({
            node: source,
            messageId: "libraryRuntime",
            data: { name },
          });
        }
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};
