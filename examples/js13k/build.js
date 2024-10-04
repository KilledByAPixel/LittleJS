#!/usr/bin/env node

/** 
 * LittleJS Build System
 */

'use strict';

const PROGRAM_NAME = 'game';
const BUILD_FOLDER = 'build';
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
for(const file of dataFiles)
    fs.copyFileSync(file, `${BUILD_FOLDER}/${file}`);

Build
(
    `${BUILD_FOLDER}/index.js`,
    sourceFiles,
    [closureCompilerStep, uglifyBuildStep, roadrollerBuildStep, htmlBuildStep, zipBuildStep]
   //[closureCompilerSimpleStep, htmlBuildStep] // for build debugging
);

console.log(``);
console.log(`Build Completed in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);
console.log(`Size of ${PROGRAM_NAME}.zip: ${fs.statSync(`${PROGRAM_NAME}.zip`).size} bytes`);

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
    console.log(`Running closure compiler...`);

    const filenameTemp = filename + '.tmp';
    fs.copyFileSync(filename, filenameTemp);
    child_process.execSync(`npx google-closure-compiler --js=${filenameTemp} --js_output_file=${filename} --compilation_level=ADVANCED --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper`, {stdio: 'inherit'});
    fs.rmSync(filenameTemp);
};

function closureCompilerSimpleStep(filename)
{
    console.log(`Running closure compiler in simple mode...`);

    const filenameTemp = filename + '.tmp';
    fs.copyFileSync(filename, filenameTemp);
    child_process.execSync(`npx google-closure-compiler --js=${filenameTemp} --js_output_file=${filename} --compilation_level=SIMPLE --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper`, {stdio: 'inherit'});
    fs.rmSync(filenameTemp);
};

function uglifyBuildStep(filename)
{
    console.log(`Running uglify...`);
    child_process.execSync(`npx uglifyjs ${filename} -c -m -o ${filename}`, {stdio: 'inherit'});
};

function roadrollerBuildStep(filename)
{
    console.log(`Running roadroller...`);
    child_process.execSync(`npx roadroller ${filename} -o ${filename}`, {stdio: 'inherit'});
};

function roadrollerExtremeBuildStep(filename)
{
    // this takes over a minute to run but might be a little smaller
    console.log(`Running roadroller extreme...`);
    child_process.execSync(`npx roadroller ${filename} -o ${filename} --optimize 2`, {stdio: 'inherit'});
};

function htmlBuildStep(filename)
{
    console.log(`Building html...`);

    // create html file
    let buffer = '';
    buffer += '<body>';
    buffer += '<script>';
    buffer += fs.readFileSync(filename);
    buffer += '</script>';

    // output html file
    fs.writeFileSync(`${BUILD_FOLDER}/index.html`, buffer, {flag: 'w+'});
};

function zipBuildStep(filename)
{
    console.log(`Zipping...`);
    const ect = '../../../node_modules/ect-bin/vendor/win32/ect.exe';
    const args = ['-9', '-strip', '-zip', `../${PROGRAM_NAME}.zip`, 'index.html', ...dataFiles];
    child_process.spawnSync(ect, args, {stdio: 'inherit', cwd: BUILD_FOLDER});
};