// @ts-check
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const child_process = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sevenZipBin = require('7zip-bin');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SEVEN_ZIP = sevenZipBin.path7za;

/**
 * @param {string} command
 * @param {string} [cwd]
 */
const exec = (command, cwd = ROOT_DIR) => {
  console.log(`> ${command}`);
  child_process.execSync(command, { cwd, stdio: 'inherit', shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' });
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
  console.log('Clean');

  // Remove .7z files
  for (const file of fs.readdirSync(ROOT_DIR)) {
    if (file.endsWith('.7z')) {
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
  console.log('Updating @butr/vortexextensionnative from File');

  const extensionBasePath = path.resolve(ROOT_DIR, '../Bannerlord.LauncherManager');
  const extensionPath = path.join(extensionBasePath, 'src/Bannerlord.LauncherManager.Native.TypeScript');

  exec('yarn remove @butr/vortexextensionnative');

  exec('yarn run clean', extensionPath);
  exec(`yarn run build -- ${configuration}`, extensionPath);

  const tgzFile = 'butr-vortexextensionnative.tgz';
  exec(`yarn pack --filename ${tgzFile}`, extensionPath);
  fs.copyFileSync(path.join(extensionPath, tgzFile), path.join(ROOT_DIR, tgzFile));
  exec(`yarn add file:./${tgzFile}`);
};

const updateFromNpm = () => {
  console.log('Updating @butr/vortexextensionnative from NPM');

  exec('npx tsc -p tsconfig.json');
  exec('npx tsc -p tsconfig.module.json');
};

const lint = () => {
  console.log('Lint');

  exec('yarn format:check');
  exec('yarn lint');
};

const webpack = () => {
  console.log('Webpack');

  exec('npx webpack --config webpack.config.js --color');
  exec('npx extractInfo');
};

const pack7z = () => {
  console.log('Pack 7z');

  // Ensure the 7zip binary has execute permissions on Unix systems
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(SEVEN_ZIP, 0o755);
    } catch (/** @type {any} */ error) {
      console.warn('Failed to set execute permissions on 7zip binary:', error.message);
    }
  }

  exec(`"${SEVEN_ZIP}" a -t7z "game-mount-and-blade2.7z" "./dist/*.*"`);
};

/**
 * @param {boolean} isDev
 */
const copyToVortex = (isDev) => {
  const deployPath = isDev ? 'vortex_devel/plugins' : 'vortex/plugins';

  try {
    const appDataPath = process.env.APPDATA;
    if (appDataPath) {
      const targetPath = path.join(appDataPath, deployPath);

      console.log(`Copy dist to Vortex plugins: ${targetPath}`);
      const destPath = path.join(targetPath, 'bannerlord');
      removeIfExists(destPath);
      copyRecursive(DIST_DIR, destPath);
    }
  } catch {
    // Silently ignore errors (matching PowerShell behavior)
  }
};

/**
 * @param {{ type: string; configuration: string }} options
 */
const build = (options) => {
  const { type, configuration } = options;
  const isDev = type === 'build-dev';
  const effectiveType = isDev ? 'build' : type;

  // Clean
  if (['build', 'build-extended', 'build-update', 'clean'].includes(effectiveType)) {
    clean();
  }

  // Update from file
  if (effectiveType === 'build-extended') {
    updateFromFile(configuration);
  }

  // Update from NPM
  if (effectiveType === 'build-update') {
    updateFromNpm();
  }

  // Lint
  if (['build', 'build-extended', 'build-update', 'build-webpack'].includes(effectiveType)) {
    lint();
  }

  // Webpack
  if (['build', 'build-extended', 'build-update', 'build-webpack'].includes(effectiveType)) {
    webpack();
  }

  // 7z
  if (['build', 'build-extended', 'build-update', 'build-7z'].includes(effectiveType)) {
    pack7z();
  }

  // Copy to Vortex
  if (['build', 'build-extended', 'build-update', 'build-webpack', 'build-7z'].includes(effectiveType)) {
    copyToVortex(isDev);
  }
};

// Parse arguments
const args = process.argv.slice(2);
const type = args[0] || 'build';
const configuration = args[1] || 'Release';

build({ type, configuration });
