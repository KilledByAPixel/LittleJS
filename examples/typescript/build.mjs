/**
 * LittleJS TypeScript Example Build System
 */

'use strict';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRAM_NAME = 'game';
const BUILD_FOLDER = join(__dirname, 'build');

// Define TypeScript source files
const tsSourceFiles = [
    'game.ts',
    // add your TypeScript files here
];

// Corresponding JS output files
const jsSourceFiles = tsSourceFiles.map(file => file.replace('.ts', '.js'));

console.log(`Building TypeScript for ${PROGRAM_NAME}...`);
const startTime = Date.now();

console.log(`Removing old build folder...`);
fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });

console.log(`Compiling TypeScript...`);

// Use tsconfig.json for compilation settings
try
{
    const result = execSync(`npx -p typescript tsc`, {cwd: __dirname, encoding: 'utf8', stdio: 'pipe'});
    console.log(result);
} catch (error)
{
    console.error('TypeScript compilation errors:');
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    console.error('TypeScript compilation failed!');
    process.exit(1);
}

console.log(`Copying js files back to root...`);
for (const file of jsSourceFiles)
{
    // TypeScript outputs to build/examples/typescript/ because of relative paths
    const buildFile = join(BUILD_FOLDER, 'examples', 'typescript', file);
    const targetFile = join(__dirname, file);
    console.log(`Copying ${file}...`);
    if (fs.existsSync(buildFile))
        fs.copyFileSync(buildFile, targetFile);
    else
        console.error(`✗ Build file not found: ${buildFile}`);
}

console.log(`TypeScript built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);