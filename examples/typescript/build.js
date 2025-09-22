#!/usr/bin/env node

const PROGRAM_NAME = 'game';
const BUILD_FOLDER = 'build';

// Define TypeScript source files
const tsSourceFiles = [
    'game.ts',
    // add your TypeScript files here
];

// Corresponding JS output files
const jsSourceFiles = tsSourceFiles.map(file => file.replace('.ts', '.js'));

console.log(`Building TypeScript for ${PROGRAM_NAME}...`);
const startTime = Date.now();
const fs = require('node:fs');
const child_process = require('node:child_process');

console.log(`Removing old build folder...`);
fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });

console.log(`Compiling TypeScript...`);
// Compile all TypeScript files at once
const tsFiles = tsSourceFiles.join(' ');
child_process.execSync(`npx tsc ${tsFiles} --outDir "./${BUILD_FOLDER}" --target es2020 --module es2020`, {stdio: 'inherit'});
console.log(`TypeScript built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);

console.log(`Moving js files back to root...`);
for(const file of jsSourceFiles)
    fs.copyFileSync(`${BUILD_FOLDER}/${file}`, file);
