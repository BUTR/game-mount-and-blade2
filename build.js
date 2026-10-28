// @ts-check
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const child_process = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sevenZipBin = require("7zip-bin");

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SEVEN_ZIP = sevenZipBin.path7za;

/**
 * Runs a command through the shell. Only pass constant strings here, never paths
 * or user input, use run() for those
 * @param {string} command
 * @param {string} [cwd]
 */
const exec = (command, cwd = ROOT_DIR) => {
  console.log(`> ${command}`);
  child_process.execSync(command, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
  });
};

/**
 * Runs an executable directly, without a shell, so arguments are never interpreted
 * @param {string} file
 * @param {string[]} args
 * @param {string} [cwd]
 */
const run = (file, args, cwd = ROOT_DIR) => {
  console.log(`> ${[file, ...args].join(" ")}`);
  child_process.execFileSync(file, args, {
    cwd,
    stdio: "inherit",
  });
};

/**
 * @param {string} filePath
 */
const removeIfExists = (filePath) => {
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  }
};

/**
 * @param {string} src
 * @param {string} dest
 */
const copyRecursive = (src, dest) => {
  if (!fs.existsSync(src)) {
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
};

const clean = () => {
  console.log("Clean");

  // Remove .7z files
  for (const file of fs.readdirSync(ROOT_DIR)) {
    if (file.endsWith(".7z")) {
      removeIfExists(path.join(ROOT_DIR, file));
    }
  }

  // Remove dist folder
  removeIfExists(DIST_DIR);
};

/**
 * @param {string} configuration
 */
const updateFromFile = (configuration) => {
  console.log("Updating @butr/vortexextensionnative from File");

  const extensionBasePath = path.resolve(
    ROOT_DIR,
    "../Bannerlord.LauncherManager",
  );
  const extensionPath = path.join(
    extensionBasePath,
    "src/Bannerlord.LauncherManager.Native.TypeScript",
  );

  if (!/^[A-Za-z]+$/.test(configuration)) {
    throw new Error(`Invalid configuration: ${configuration}`);
  }

  // The workspace root is the extension, -w adds to it instead of a package
  exec("pnpm remove -w @butr/vortexextensionnative");

  exec("pnpm run clean", extensionPath);
  exec(`pnpm run build -- ${configuration}`, extensionPath);

  const tgzFile = "butr-vortexextensionnative.tgz";
  // Pack into the extension folder so no absolute path goes through the shell
  exec("pnpm pack", extensionPath);
  // pnpm pack produces a scoped filename; move it here under the expected name
  const packedFiles = fs
    .readdirSync(extensionPath)
    .filter(
      (f) => f.startsWith("butr-vortexextensionnative-") && f.endsWith(".tgz"),
    );
  if (packedFiles.length > 0) {
    const packedPath = path.join(extensionPath, packedFiles[0]);
    fs.copyFileSync(packedPath, path.join(ROOT_DIR, tgzFile));
    fs.unlinkSync(packedPath);
  }
  exec(`pnpm add -w file:./${tgzFile}`);
};

const updateFromNpm = () => {
  console.log("Updating @butr/vortexextensionnative from NPM");

  exec("pnpm exec tsc -p tsconfig.json");
  exec("pnpm exec tsc -p tsconfig.module.json");
};

const lint = () => {
  console.log("Lint");

  exec("pnpm format:check");
  exec("pnpm lint");
  exec("pnpm lint:cycles");
};

const bundle = () => {
  console.log("Bundle");

  exec("pnpm exec rolldown --config rolldown.config.mjs");
  exec("pnpm exec extractInfo");
  publishLobbyBridge();
};

/**
 * The lobby bridge is a framework dependent .NET 9 tool, Vortex makes sure the runtime is installed
 */
const publishLobbyBridge = () => {
  console.log("Publish Bannerlord.LobbyBridge");

  run("dotnet", [
    "publish",
    "packages/lobby/bridge/Bannerlord.LobbyBridge.csproj",
    "-c",
    "Release",
    "-o",
    DIST_DIR,
    "-p:DebugType=none",
    "-nologo",
  ]);
};

const pack7z = () => {
  console.log("Pack 7z");

  // Ensure the 7zip binary has execute permissions on Unix systems
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(SEVEN_ZIP, 0o755);
    } catch (/** @type {any} */ error) {
      console.warn(
        "Failed to set execute permissions on 7zip binary:",
        error.message,
      );
    }
  }

  run(SEVEN_ZIP, ["a", "-t7z", "game-mount-and-blade2.7z", "./dist/*.*"]);
};

/**
 * Returns true if a Vortex process is currently running (Windows only).
 * Vortex locks the plugin's native libraries while loaded, so deleting or
 * overwriting them fails with EPERM/EBUSY.
 */
const isVortexRunning = () => {
  if (process.platform !== "win32") {
    return false;
  }
  try {
    const out = child_process
      .execSync('tasklist /FI "IMAGENAME eq Vortex.exe" /NH', {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .toLowerCase();
    return out.includes("vortex.exe");
  } catch {
    return false;
  }
};

/**
 * @param {boolean} isDev
 */
const copyToVortex = (isDev) => {
  const deployPath = isDev ? "@vortex/main/plugins" : "Vortex/plugins";

  const appDataPath = process.env.APPDATA;
  if (!appDataPath) {
    console.warn("APPDATA is not set, skipping copy to Vortex plugins");
    return;
  }

  const targetPath = path.join(appDataPath, deployPath);
  const destPath = path.join(targetPath, "bannerlord");
  console.log(`Copy dist to Vortex plugins: ${targetPath}`);

  if (isVortexRunning()) {
    console.warn(
      "WARNING: Vortex is running. It locks the plugin's native libraries, so the copy will most likely fail. Close Vortex and rerun the build.",
    );
  }

  try {
    removeIfExists(destPath);
    copyRecursive(DIST_DIR, destPath);
    console.log(`Copied to ${destPath}`);
  } catch (error) {
    const err = /** @type {NodeJS.ErrnoException} */ (error);
    console.error(
      `ERROR: Failed to copy dist to ${destPath}: ${err.code ?? ""} ${err.message}`,
    );
    console.error(
      "The plugin folder may now contain a mix of old and new files. Close Vortex and rerun the build.",
    );
    process.exitCode = 1;
  }
};

/**
 * @param {{ type: string; configuration: string }} options
 */
const build = (options) => {
  const { type, configuration } = options;
  const isDev = type === "build-dev";
  const effectiveType = isDev ? "build" : type;

  // Clean
  if (
    ["build", "build-extended", "build-update", "clean"].includes(effectiveType)
  ) {
    clean();
  }

  // Update from file
  if (effectiveType === "build-extended") {
    updateFromFile(configuration);
  }

  // Update from NPM
  if (effectiveType === "build-update") {
    updateFromNpm();
  }

  // Lint
  if (
    ["build", "build-extended", "build-update", "build-webpack"].includes(
      effectiveType,
    )
  ) {
    lint();
  }

  // Webpack
  if (
    ["build", "build-extended", "build-update", "build-webpack"].includes(
      effectiveType,
    )
  ) {
    bundle();
  }

  // 7z
  if (
    ["build", "build-extended", "build-update", "build-7z"].includes(
      effectiveType,
    )
  ) {
    pack7z();
  }

  // Copy to Vortex
  if (
    [
      "build",
      "build-extended",
      "build-update",
      "build-webpack",
      "build-7z",
    ].includes(effectiveType)
  ) {
    copyToVortex(isDev);
  }
};

// Parse arguments
const args = process.argv.slice(2);
const type = args[0] || "build";
const configuration = args[1] || "Release";

build({ type, configuration });
