/** 
 * LittleJS Build System
 */

'use strict';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROGRAM_TITLE = 'Little JS Starter Project';
const PROGRAM_NAME = 'game';
const BUILD_FOLDER = join(__dirname, 'build');
const USE_ROADROLLER = false; // enable for extra compression
const sourceFiles =
[
    join(__dirname, '../../dist/littlejs.release.js'),
    join(__dirname, 'game.js'),
    // add your game's files here
];
const dataFiles =
[
    'tiles.png',
    // add your game's data files here
];

console.log(`Building ${PROGRAM_NAME}...`);
const startTime = Date.now();

// rebuild engine
//execSync(`npm run build`, { stdio: 'inherit' });

// remove old files and setup build folder
fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });
fs.rmSync(join(__dirname, `${PROGRAM_NAME}.zip`), { force: true });
fs.mkdirSync(BUILD_FOLDER);

// copy data files
for (const file of dataFiles)
    fs.copyFileSync(join(__dirname, file), join(BUILD_FOLDER, file));

Build
(
    join(BUILD_FOLDER, 'index.js'),
    sourceFiles,
    USE_ROADROLLER ? 
        [closureCompilerStep, uglifyBuildStep, roadrollerBuildStep, htmlBuildStep, zipBuildStep] :
        [closureCompilerStep, uglifyBuildStep, htmlBuildStep, zipBuildStep]
);

console.log('');
console.log(`Build Completed in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);

///////////////////////////////////////////////////////////////////////////////

// A single build with its own source files, build steps, and output file
// - each build step is a callback that accepts a single filename
function Build(outputFile, files=[], buildSteps=[])
{
    // copy files into a buffer
    let buffer = '';
    for (const file of files)
        buffer += fs.readFileSync(file) + '\n';

    // output file
    fs.writeFileSync(outputFile, buffer, {flag: 'w+'});

    // execute build steps in order
    for (const buildStep of buildSteps)
        buildStep(outputFile);
}

function closureCompilerStep(filename)
{
    console.log('Running closure compiler...');

    // use closer compiler to minify the code
    const filenameTemp = filename + '.tmp';
    fs.copyFileSync(filename, filenameTemp);
    execSync(`npx google-closure-compiler --js=${filenameTemp} --js_output_file=${filename} --compilation_level=ADVANCED --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper`, {stdio: 'inherit'});
    fs.rmSync(filenameTemp);
}

function uglifyBuildStep(filename)
{
    console.log('Running uglify...');
    execSync(`npx uglifyjs ${filename} -c -m -o ${filename}`, {stdio: 'inherit'});
}

function roadrollerBuildStep(filename)
{
    console.log('Running roadroller...');
    execSync(`npx roadroller ${filename} -o ${filename}`, {stdio: 'inherit'});
}

function htmlBuildStep(filename)
{
    console.log('Building html...');

    // create html file
    let buffer = ''
    buffer += '<!DOCTYPE html>';
    buffer += '<head>';
    buffer += `<title>${PROGRAM_TITLE}</title>`;
    buffer += '<meta charset=utf-8>';
    buffer += '</head>';
    buffer += '<body>';
    buffer += '<script>';
    buffer += fs.readFileSync(filename) + '\n';
    buffer += '</script>';

    // output html file
    fs.writeFileSync(join(BUILD_FOLDER, 'index.html'), buffer, {flag: 'w+'});
}

function zipBuildStep(filename)
{
    console.log('Zipping...');
    const sources = ['index.html', ...dataFiles];
    const sourceList = sources.join(' ');
    execSync(`npx bestzip ../${PROGRAM_NAME}.zip ${sourceList}`, {cwd:BUILD_FOLDER, stdio: 'inherit'});
    console.log(`Size of ${PROGRAM_NAME}.zip: ${fs.statSync(join(__dirname, `${PROGRAM_NAME}.zip`)).size} bytes`);
}