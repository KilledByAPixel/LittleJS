#!/usr/bin/env node

/** 
 * LittleJS Build System
 */

'use strict';

const PROGRAM_TITLE = 'Little JS Electron Project';
const PROGRAM_NAME = 'game';
const BUILD_FOLDER = 'build';
const USE_ROADROLLER = false; // enable for extra compression
const sourceFiles =
[
    '../../dist/littlejs.release.js',
    'game.js',
    // add your game's files here
];
const dataFiles =
[
    'tiles.png',
    // add your game's data files here
];

console.log(`Building ${PROGRAM_NAME}...`);
const startTime = Date.now();
const fs = require('node:fs');
const child_process = require('node:child_process');

// rebuild engine
//child_process.execSync(`npm run build`, { stdio: 'inherit' });

// remove old files and setup build folder
fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });
fs.rmSync(`${PROGRAM_NAME}.zip`, { force: true });
fs.mkdirSync(BUILD_FOLDER);

// copy data files
for (const file of dataFiles)
    fs.copyFileSync(file, `${BUILD_FOLDER}/${file}`);

Build
(
    `${BUILD_FOLDER}/index.js`,
    sourceFiles,
    USE_ROADROLLER ? 
        [closureCompilerStep, uglifyBuildStep, roadrollerBuildStep, htmlBuildStep, electronBuildStep] :
        [closureCompilerStep, uglifyBuildStep, htmlBuildStep, electronBuildStep]
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
    child_process.execSync(`npx google-closure-compiler --js=${filenameTemp} --js_output_file=${filename} --compilation_level=ADVANCED --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper`, {stdio: 'inherit'});
    fs.rmSync(filenameTemp);
};

function uglifyBuildStep(filename)
{
    console.log('Running uglify...');
    child_process.execSync(`npx uglifyjs ${filename} -c -m -o ${filename}`, {stdio: 'inherit'});
};

function roadrollerBuildStep(filename)
{
    console.log('Running roadroller...');
    child_process.execSync(`npx roadroller ${filename} -o ${filename}`, {stdio: 'inherit'});
};

function htmlBuildStep(filename)
{
    console.log('Building html...');

    // create html file
    let buffer = '';
    buffer += '<!DOCTYPE html>';
    buffer += '<head>';
    buffer += `<title>${PROGRAM_TITLE}</title>`;
    buffer += '<meta charset=utf-8>';
    buffer += '</head>';
    buffer += '<body>';
    buffer += '<script src="index.js"></script>';

    // output html file
    fs.writeFileSync(`${BUILD_FOLDER}/index.html`, buffer, {flag: 'w+'});
};

function electronBuildStep(filename)
{
    console.log('Building executable with electron...');

    // copy elecron files to build folder
    fs.copyFileSync('electron.js', `${BUILD_FOLDER}/electron.js`);
    fs.copyFileSync('package.json', `${BUILD_FOLDER}/package.json`);

    // run electron packager
    child_process.execSync(`npx electron-packager ./${BUILD_FOLDER} --overwrite`, {stdio: 'inherit'});
};