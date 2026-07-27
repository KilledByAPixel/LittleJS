#!/usr/bin/env node

/**
 * LittleJS Build System - JS13K Edition
 * - Concatenates engine + game source
 * - Minifies with Closure Compiler and UglifyJS
 * - Compresses with Roadroller
 * - Inlines everything into a single HTML file
 * - Zips with ect and checks against the JS13K size limit
 */

'use strict';

const PROGRAM_TITLE = 'LittleJS JS13K Project';
const PROGRAM_NAME = 'game';
const BUILD_FOLDER = 'build';
const SIZE_LIMIT = 13312; // JS13K limit in bytes

// Set true to keep intermediate .closure.js / .uglify.js files for debugging
const DEBUG_BUILD = false;
// Roadroller shrinks the code a lot but is the slowest step
const USE_ROADROLLER = true;
// Extreme mode takes over a minute and usually saves only a few bytes
const ROADROLLER_EXTREME = false;

const sourceFiles =
[
    // LittleJS engine files
    `../../src/engineRelease.js`,
    `../../src/engineUtilities.js`,
    `../../src/engineSettings.js`,
    `../../src/engineObject.js`,
    `../../src/engineDraw.js`,
    `../../src/engineInput.js`,
    `../../src/engineAudio.js`,
    `../../src/engineTileLayer.js`,
    `../../src/engineParticles.js`,
    `../../src/engineMedals.js`,
    `../../src/engineWebGL.js`,
    `../../src/engine.js`,

    // game files
    'game.js',
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

// always run relative to this script's folder so npm run build works from anywhere
process.chdir(__dirname);

try
{
    // remove old files and setup build folder
    fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });
    fs.rmSync(`${PROGRAM_NAME}.zip`, { force: true });
    fs.mkdirSync(BUILD_FOLDER);

    // copy data files
    for (const file of dataFiles)
        fs.copyFileSync(file, `${BUILD_FOLDER}/${file}`);

    const buildSteps = [closureCompilerStep, uglifyBuildStep];
    if (USE_ROADROLLER)
        buildSteps.push(roadrollerBuildStep);
    buildSteps.push(htmlBuildStep, zipBuildStep);

    Build(`${BUILD_FOLDER}/index.js`, sourceFiles, buildSteps);
}
catch (e) { handleError(e, 'Build failed!'); }

// report size against the JS13K budget
const size = fs.statSync(`${PROGRAM_NAME}.zip`).size;
const percent = (100*size/SIZE_LIMIT).toFixed(1);
console.log('');
console.log(`Build completed in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);
console.log(`${PROGRAM_NAME}.zip: ${size} / ${SIZE_LIMIT} bytes (${percent}%)`);
if (size > SIZE_LIMIT)
{
    console.error(`OVER BUDGET by ${size - SIZE_LIMIT} bytes!`);
    process.exit(1);
}
console.log(`${SIZE_LIMIT - size} bytes remaining`);

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
    try
    {
        child_process.execSync(`npx google-closure-compiler --js=${filenameTemp} --js_output_file=${filename} --compilation_level=ADVANCED --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper`, {stdio: 'inherit'});
    }
    catch (e) { handleError(e, 'Closure Compiler step failed!'); }
    if (DEBUG_BUILD)
        fs.copyFileSync(filename, filename+'.closure.js');
    fs.rmSync(filenameTemp);
};

function uglifyBuildStep(filename)
{
    console.log(`Running uglify...`);
    try
    {
        child_process.execSync(`npx uglifyjs ${filename} -c -m -o ${filename}`, {stdio: 'inherit'});
    }
    catch (e) { handleError(e, 'Uglify step failed!'); }
    if (DEBUG_BUILD)
        fs.copyFileSync(filename, filename+'.uglify.js');
};

function roadrollerBuildStep(filename)
{
    console.log(`Running roadroller...`);
    const optimize = ROADROLLER_EXTREME ? ' --optimize 2' : '';
    try
    {
        child_process.execSync(`npx roadroller ${filename} -o ${filename}${optimize}`, {stdio: 'inherit'});
    }
    catch (e) { handleError(e, 'Roadroller step failed!'); }
};

function htmlBuildStep(filename)
{
    console.log(`Building html...`);

    // create html file
    let buffer = '<!DOCTYPE html>';
    buffer += '<head>';
    buffer += `<title>${PROGRAM_TITLE}</title>`;
    buffer += '<meta charset=utf-8>';
    buffer += '</head>';
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
    const args = ['-9', '-strip', '-zip', `../${PROGRAM_NAME}.zip`, 'index.html', ...dataFiles];

    // run ect zip compressor
    try
    {
        const ectLocation = require('ect-bin');
        child_process.spawnSync(ectLocation, args, {stdio: 'inherit', cwd: BUILD_FOLDER});
    }
    catch (e) { handleError(e, 'Zip step failed!'); }
};

// display the error and exit
function handleError(e, message)
{
    console.error(e);
    console.error(message);
    process.exit(1);
}
