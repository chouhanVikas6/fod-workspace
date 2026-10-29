import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Ensure PROTOC environment variable is set if not already present
if (!process.env.PROTOC) {
  const localWingetProtoc = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WinGet',
    'Packages',
    'Google.Protobuf_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'bin',
    'protoc.exe'
  );
  if (fs.existsSync(localWingetProtoc)) {
    process.env.PROTOC = localWingetProtoc;
  }
}

// 1. Get host target triple using `rustc -vV`
let targetTriple = '';
try {
  const rustcOutput = execSync('rustc -vV').toString();
  const hostMatch = rustcOutput.match(/host:\s*([\w.-]+)/);
  if (hostMatch) {
    targetTriple = hostMatch[1].trim();
  }
} catch (err) {
  console.error('Failed to run rustc -vV:', err);
  process.exit(1);
}

if (!targetTriple) {
  console.error('Could not determine rustc host target triple.');
  process.exit(1);
}

const isWindows = targetTriple.includes('windows');
const ext = isWindows ? '.exe' : '';

const isDebug = process.argv.includes('--debug');
const profile = isDebug ? 'debug' : 'release';
const cargoFlags = isDebug ? '' : '--release';

console.log(`Building backend-rs (${profile}) for target: ${targetTriple}...`);
execSync(`cargo build ${cargoFlags} --manifest-path backend-rs/Cargo.toml`, {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

// 2. Ensure src-tauri/binaries exists
const binariesDir = path.resolve(rootDir, 'src-tauri', 'binaries');
fs.mkdirSync(binariesDir, { recursive: true });

// 3. Copy binary to src-tauri/binaries/fod-backend-${targetTriple}${ext}
const src = path.resolve(rootDir, 'backend-rs', 'target', profile, `fod-backend${ext}`);
const dest = path.resolve(binariesDir, `fod-backend-${targetTriple}${ext}`);

if (!fs.existsSync(src)) {
  console.error(`Expected backend binary not found at: ${src}`);
  process.exit(1);
}

console.log(`Copying sidecar binary:\n  from: ${src}\n    to: ${dest}`);
fs.copyFileSync(src, dest);
console.log('Backend sidecar binary prepared successfully.');
