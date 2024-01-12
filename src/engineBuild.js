#!/usr/bin/env node

/** 
 * LittleJS Build System
 * - Combine input files
 * - Run custom build steps
 * - Check for errors
 * - Output to build folder
 * @namespace Build
 */

const ENGINE_NAME = 'littlejs';
const BUILD_FOLDER = 'build';
const SOURCE_FOLDER = 'src';
const engineSourceFiles =
[
    `${SOURCE_FOLDER}/engineUtilities.js`,
    `${SOURCE_FOLDER}/engineSettings.js`,
    `${SOURCE_FOLDER}/engineObject.js`,
    `${SOURCE_FOLDER}/engineDraw.js`,
    `${SOURCE_FOLDER}/engineInput.js`,
    `${SOURCE_FOLDER}/engineAudio.js`,
    `${SOURCE_FOLDER}/engineTileLayer.js`,
    `${SOURCE_FOLDER}/engineParticles.js`,
    `${SOURCE_FOLDER}/engineMedals.js`,
    `${SOURCE_FOLDER}/engineWebGL.js`,
    `${SOURCE_FOLDER}/engine.js`,
];
const asciiArt =`
        ~~~~°°°°ooo°oOo°ooOooOooOo.
 __________   ________   ____ '°OoO.
 |LittleJS|   |Engine|   |[]|_._._Y
.|________|_._|______|_._|__|_|_|_|}
  OOO  OOO     OO  OO     OO=OO---oo\\
`;
const license = '// LittleJS - MIT License - Copyright 2021 Frank Force\n'

console.log(asciiArt);
console.log('Choo Choo... Building LittleJS Engine!\n');
const startTime = Date.now();
const fs = require('node:fs');
const child_process = require('node:child_process');

try
{
    // Setup build folder
    fs.rmSync(BUILD_FOLDER, { recursive: true, force: true });
    fs.mkdirSync(BUILD_FOLDER);
}
catch (e) { handleError(e, 'Failed to create build folder!'); }

Build
(
    'Build Engine -- all',
    `${BUILD_FOLDER}/${ENGINE_NAME}.js`,
    [`${SOURCE_FOLDER}/engineDebug.js`, ...engineSourceFiles],
    [], license
);

Build
(
    'Build Engine -- release',
    `${BUILD_FOLDER}/${ENGINE_NAME}.release.js`,
    [`${SOURCE_FOLDER}/engineRelease.js`, ...engineSourceFiles],
    [], license
);

Build
(
    'Build Engine -- minified',
    `${BUILD_FOLDER}/${ENGINE_NAME}.min.js`,
    [`${BUILD_FOLDER}/${ENGINE_NAME}.release.js`],
    [closureCompilerStep, uglifyBuildStep]
);

Build
(
    'Build Engine -- ESM',
    `${BUILD_FOLDER}/${ENGINE_NAME}.esm.js`,
    [`${BUILD_FOLDER}/${ENGINE_NAME}.js`, `${SOURCE_FOLDER}/engineExport.js`],
    [typeScriptBuildStep]
);

Build
(
    'Build Engine -- ESM minified release',
    `${BUILD_FOLDER}/${ENGINE_NAME}.esm.min.js`,
    [`${BUILD_FOLDER}/${ENGINE_NAME}.min.js`, `${SOURCE_FOLDER}/engineExport.js`],
    [uglifyBuildStep]
);

console.log(`Engine built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);

///////////////////////////////////////////////////////////////////////////////

// A single build with its own source files, build steps, and output file
// - each build step is a callback that accepts a single filename
function Build(message, outputFile, files=[], buildSteps=[], topOfFileText)
{
    console.log(message);

    // copy files into a buffer
    let buffer = '';
    if (topOfFileText)
        buffer +=  topOfFileText + '\n';
    for (const file of files)
        buffer += fs.readFileSync(file) + '\n';

    // output file
    fs.writeFileSync(outputFile, buffer, {flag: 'w+'});

    // execute build steps in order
    for (const buildStep of buildSteps)
        buildStep(outputFile);
}

// Process with Closure Compiler to minify and check for errors
function closureCompilerStep(filename)
{
    const filenameTemp = filename + '.tmp';
    fs.copyFileSync(filename, filenameTemp);
    try
    {
        child_process.execSync(`npx google-closure-compiler --js=${filenameTemp} --js_output_file=${filename} --language_out=ECMASCRIPT_2021 --warning_level=VERBOSE --jscomp_off=*`);
        fs.rmSync(filenameTemp);
    }
    catch (e) { handleError(e, 'Failed to run Closure Compiler step!'); }
};

// Process with Uglify to minify
function uglifyBuildStep(filename)
{
    try
    {
        child_process.execSync(`npx uglifyjs ${filename} -o ${filename}`);
    }
    catch (e) { handleError(e,'Failed to run Uglify minification step!'); }
};

// Build TypeScript definitions
function typeScriptBuildStep(filename)
{
    try
    {
        child_process.execSync(`npx tsc ${filename} --declaration --allowJs --emitDeclarationOnly --outFile ${BUILD_FOLDER}/${ENGINE_NAME}.d.ts`);
    }
    catch (e) { handleError(e, 'Failed to run TypeScript build step!'); }
};

// display the error and exit
function handleError(e,message)
{
    console.error(e);
    console.error(message);
    process.exit(1);
}