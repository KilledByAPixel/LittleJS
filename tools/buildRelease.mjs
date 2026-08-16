/**
 * LittleJS Release Build System
 * - Builds the engine, then zips up a release package for GitHub
 * - The zip contains exactly what npm publish would send, nothing more
 * - File list comes from npm itself, so it can never drift from the package
 * - Outputs LittleJS-<version>.zip to the repo root
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const packageInfo = JSON.parse(fs.readFileSync(join(ROOT_DIR, 'package.json')));
const ZIP_NAME = `LittleJS-${packageInfo.version}.zip`;
const ZIP_FILE = join(ROOT_DIR, ZIP_NAME);

const asciiArt =`
      ~~~~°°°°ooo°oOo°ooOooOooOo.
 __________   ________   ____'°oO.
 |LittleJS|   |Engine|   |[]|_._Y
.|________|_._|______|_._|__|_|_|}
  OOO  OOO     OO  OO     OO=OO-oo\\
`;

console.log(asciiArt);
console.log(`Choo Choo... Building LittleJS Release ${packageInfo.version}!`);
const startTime = Date.now();

// everything runs from the repo root so npm and bestzip see the package
process.chdir(ROOT_DIR);

console.log('Build Release -- engine');
try
{
    execSync('npm run build', { stdio: 'inherit' });
}
catch (e) { handleError(e, 'Failed to build engine!'); }

console.log('Build Release -- collecting package files');
let releaseFiles;
try
{
    // ask npm what it would publish instead of duplicating the files list from
    // package.json, this also picks up the files npm always includes
    // (package.json, README.md, LICENSE) which are not in that list
    const output = execSync('npm pack --dry-run --json', { encoding: 'utf8' });
    releaseFiles = JSON.parse(output)[0].files.map(f=>f.path);
    if (!releaseFiles.length)
        throw new Error('npm reported no files to publish');
}
catch (e) { handleError(e, 'Failed to get package file list!'); }

console.log(`Build Release -- zipping ${releaseFiles.length} files`);
try
{
    // remove any older zip for this version so we never merge into a stale one
    fs.rmSync(ZIP_FILE, { force: true });
    execSync(`npx bestzip ${ZIP_NAME} ${releaseFiles.join(' ')}`, { stdio: 'inherit' });
}
catch (e) { handleError(e, 'Failed to create release zip!'); }

const zipSizeKB = (fs.statSync(ZIP_FILE).size/1024).toFixed(1);
console.log(`Size of ${ZIP_NAME}: ${zipSizeKB} KB`);
console.log(`Release built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds! ✨`);

function handleError(e, message)
{
    console.error(e);
    console.error(message);
    process.exit(1);
}
