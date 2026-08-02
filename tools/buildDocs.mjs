/**
 * LittleJS Documentation Build System
 * - Generates the JSDoc API site from src/ and plugins/
 * - Uses README.md as the documentation homepage
 * - Copies example images referenced by the homepage
 * - Outputs to docs/ folder, which is published by GitHub Pages
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const DOCS_FOLDER = join(ROOT_DIR, 'docs');
const EXAMPLE_FOLDER = join(ROOT_DIR, 'examples');
const CONFIG_FILE = 'tools/jsdoc.config.json';
const FAVICON_FILE = join(__dirname, 'static', 'favicon.png');

// images referenced by README.md, which is used as the docs homepage
const docsImageFiles =
[
    `${EXAMPLE_FOLDER}/favicon.png`,
    `${EXAMPLE_FOLDER}/logo.png`,
    `${EXAMPLE_FOLDER}/screenshot.jpg`,
    `${EXAMPLE_FOLDER}/games.jpg`,
];

const asciiArt =`
      ~~~~°°°°ooo°oOo°ooOooOooOo.
 __________   ________   ____'°oO.
 |LittleJS|   |Engine|   |[]|_._Y
.|________|_._|______|_._|__|_|_|}
  OOO  OOO     OO  OO     OO=OO-oo\\
`;

console.log(asciiArt);
console.log('Choo Choo... Building LittleJS Docs!');
const startTime = Date.now();

// jsdoc resolves paths in its config relative to the working directory,
// not the config file, so everything must run from the repo root
process.chdir(ROOT_DIR);

try
{
    // clear the docs folder so pages for removed symbols do not linger
    fs.rmSync(DOCS_FOLDER, { recursive: true, force: true });
}
catch (e) { handleError(e, 'Failed to clear docs folder!'); }

console.log('Build Docs -- jsdoc');
try
{
    execSync(`npx jsdoc -c ${CONFIG_FILE}`, { stdio: 'inherit' });
}
catch (e)
{
    // jsdoc exits non-zero when it logs any tag error, even though it still
    // finishes generating the site. The engine writes TypeScript flavored
    // JSDoc on purpose so dist/littlejs.d.ts gets precise types (tuples like
    // [Vector2, Vector2, number], predicates like "a is Array<any>"), and
    // jsdoc cannot parse those forms. Verify the output instead of trusting
    // the exit code, so a real failure still stops the build.
    if (!fs.existsSync(join(DOCS_FOLDER, 'index.html')))
        handleError(e, 'Failed to generate docs!');
    console.log('Build Docs -- jsdoc reported tag errors, site generated anyway');
}

console.log('Build Docs -- images');
try
{
    const imageFolder = join(DOCS_FOLDER, 'examples');
    fs.mkdirSync(imageFolder, { recursive: true });
    for (const file of docsImageFiles)
        fs.copyFileSync(file, join(imageFolder, basename(file)));

    // the theme mirrors its static_dir path into the output, which would bury
    // the favicon under docs/tools/, so copy it to docs/static/ ourselves to
    // match the href the theme writes into every page
    const staticFolder = join(DOCS_FOLDER, 'static');
    fs.mkdirSync(staticFolder, { recursive: true });
    fs.copyFileSync(FAVICON_FILE, join(staticFolder, basename(FAVICON_FILE)));
}
catch (e) { handleError(e, 'Failed to copy static files!'); }

console.log(`Docs built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds! ✨`);

function handleError(e, message)
{
    console.error(e);
    console.error(message);
    process.exit(1);
}
