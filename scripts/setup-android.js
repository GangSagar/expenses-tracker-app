#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const localPropertiesPath = path.join(androidDir, 'local.properties');

// 1. Check Node.js Version
const currentMajor = parseInt(process.versions.node.split('.')[0], 10);
if (currentMajor < 22) {
  console.warn('\n\x1b[33m⚠️  Warning: Node.js version is ' + process.version + '.\x1b[0m');
  console.warn('\x1b[33mReact Native 0.85 requires Node >= 22.11.0.\x1b[0m');
  console.warn('\x1b[33mMetro may crash with "configs.toReversed is not a function".\x1b[0m');
  console.warn('\x1b[33mRun: nvm install 22 && nvm use 22\x1b[0m\n');
}

// 2. Ensure android/local.properties exists with valid sdk.dir
if (!fs.existsSync(localPropertiesPath)) {
  const homeDir = os.homedir();
  let candidateSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

  if (!candidateSdk || !fs.existsSync(candidateSdk)) {
    // Check standard default OS locations
    if (process.platform === 'linux') {
      const linuxSdk = path.join(homeDir, 'Android', 'Sdk');
      if (fs.existsSync(linuxSdk)) candidateSdk = linuxSdk;
    } else if (process.platform === 'darwin') {
      const macSdk = path.join(homeDir, 'Library', 'Android', 'sdk');
      if (fs.existsSync(macSdk)) candidateSdk = macSdk;
    } else if (process.platform === 'win32') {
      const winSdk = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null;
      if (winSdk && fs.existsSync(winSdk)) candidateSdk = winSdk;
    }
  }

  if (candidateSdk && fs.existsSync(candidateSdk)) {
    // Escape backslashes for Windows paths in properties file
    const formattedPath = candidateSdk.replace(/\\/g, '/');
    fs.writeFileSync(localPropertiesPath, `sdk.dir=${formattedPath}\n`, 'utf8');
    console.log(`\x1b[32m✔ Auto-configured android/local.properties (sdk.dir=${formattedPath})\x1b[0m`);
  } else {
    console.warn('\n\x1b[33m⚠️  Could not detect Android SDK location.\x1b[0m');
    console.warn(`Please set ANDROID_HOME or create android/local.properties with:`);
    console.warn(`sdk.dir=/path/to/your/android/sdk\n\x1b[0m`);
  }
}
