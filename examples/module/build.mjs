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
const sourceFiles =
[
    'game.js',
    // add your game's source files here
];
const engineFile = join(__dirname, '../../dist/littlejs.esm.min.js'); // Use the minified ES module
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

// copy engine module
fs.copyFileSync(engineFile, join(BUILD_FOLDER, 'littlejs.esm.min.js'));

Build
(
    sourceFiles,
    [htmlBuildStep, zipBuildStep]
);

console.log('');
console.log(`Build Completed in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds!`);

///////////////////////////////////////////////////////////////////////////////

// A single build with its own source files, build steps, and output file
// - each build step is a callback that accepts a single filename
function Build(files=[], buildSteps=[])
{
    // process each source file separately (don't concatenate modules!)
    for (const file of files)
    {
        const outputFile = join(BUILD_FOLDER, file);
        fs.copyFileSync(join(__dirname, file), outputFile);
        moduleFixStep(outputFile);
        uglifyBuildStep(outputFile);
    }

    // execute build steps in order
    for (const buildStep of buildSteps)
        buildStep();
}

function moduleFixStep(filename)
{
    console.log(`Fixing module imports in ${filename}...`);
    
    let code = fs.readFileSync(filename, 'utf8');
    
    // update the import path to use the local minified version
    code = code.replace(/import \* as LJS from ['"].*littlejs\.esm(?:\.min)?\.js['"];?/g, 
        "import * as LJS from './littlejs.esm.min.js';");
    
    // also fix relative imports to other game modules
    code = code.replace(/from ['"]\.\.\//g, "from './");
    
    fs.writeFileSync(filename, code);
}

function uglifyBuildStep(filename)
{
    console.log('Running uglify...');
    execSync(`npx uglifyjs ${filename} -c -m -o ${filename}`, {stdio: 'inherit'});
}

function htmlBuildStep()
{
    console.log('Building html...');

    // create html file with module script tag pointing to main game file
    let buffer = ''
    buffer += '<!DOCTYPE html>';
    buffer += '<head>';
    buffer += `<title>${PROGRAM_TITLE}</title>`;
    buffer += '<meta charset=utf-8>';
    buffer += '</head>';
    buffer += '<body>';
    buffer += '<script src="game.js" type="module"></script>';
    buffer += '</body>';

    // output html file
    fs.writeFileSync(join(BUILD_FOLDER, 'index.html'), buffer, {flag: 'w+'});
}

function zipBuildStep()
{
    console.log('Zipping...');
    const sources = ['index.html', 'littlejs.esm.min.js', ...sourceFiles, ...dataFiles];
    const sourceList = sources.join(' ');
    execSync(`npx bestzip ../${PROGRAM_NAME}.zip ${sourceList}`, {cwd:BUILD_FOLDER, stdio: 'inherit'});
    console.log(`Size of ${PROGRAM_NAME}.zip: ${fs.statSync(join(__dirname, `${PROGRAM_NAME}.zip`)).size} bytes`);
}