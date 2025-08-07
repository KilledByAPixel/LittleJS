#!/usr/bin/env node

/** 
 * LittleJS Build System
 */

'use strict';

const PROGRAM_NAME = 'game';
const BUILD_FOLDER = 'build';
const ROOT_FOLDER = 'examples/typescript';
const sourceFiles =
[
    'game.js',
    // add your game's scripts here
];

console.log(`Building TypeScript for ${PROGRAM_NAME}...`);
const startTime = Date.now();
const fs = require('node:fs');
const child_process = require('node:child_process');

console.log(`Removing old build filder...`);
fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });

console.log(`Compiling TypeScript...`);
child_process.execSync(`npx tsc --outDir "./${BUILD_FOLDER}"`, {stdio: 'inherit'});

console.log(`Moving js files to root...`);
for(const file of sourceFiles)
    fs.copyFileSync(`${BUILD_FOLDER}/${ROOT_FOLDER}/${file}`, `${file}`);

console.log(`TypeScript built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);