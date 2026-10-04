/**
 * LittleJS Documentation Build System
 * - Generates the JSDoc API site from src/ and plugins/
 * - Uses README.md as the documentation homepage
 * - Copies example images referenced by the homepage; the template in tools/docs/ copies its own static files
 * - Outputs to docs/ folder, which is published by GitHub Pages
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// built in a folder of its own and put in docs when all of it is there, so a build that fails leaves the site whole
const OUTPUT_FOLDER = join(ROOT_DIR, 'docs');
const DOCS_FOLDER = join(ROOT_DIR, 'docs.build');
const EXAMPLE_FOLDER = join(ROOT_DIR, 'examples');
const CONFIG_FILE = 'tools/jsdoc.config.json';

// images referenced by README.md, which is used as the docs homepage
const docsImageFiles =
[
    `${EXAMPLE_FOLDER}/favicon.png`,
    `${EXAMPLE_FOLDER}/logo.png`,
    `${EXAMPLE_FOLDER}/screenshot.jpg`,
    `${EXAMPLE_FOLDER}/screenshot2.jpg`,
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
    // a fresh folder to build in, one left by a build that failed goes first
    fs.rmSync(DOCS_FOLDER, { recursive: true, force: true });
}
catch (e) { handleError(e, 'Failed to clear docs folder!'); }

console.log('Build Docs -- jsdoc');
let jsdocMessages = '';
try
{
    // parsing progress stays live on stdout, the messages on stderr are captured
    // so the expected tag errors can be told apart from real ones
    execSync(`npx jsdoc -c ${CONFIG_FILE} -d "${DOCS_FOLDER}"`, { stdio: ['ignore', 'inherit', 'pipe'] });
}
catch (e)
{
    // jsdoc exits non-zero when it logs any tag error, even though it still
    // finishes generating the site, so verify the output instead of the exit code
    jsdocMessages = (e.stderr || '').toString();
    if (!fs.existsSync(join(DOCS_FOLDER, 'index.html')))
        handleError(e, 'Failed to generate docs!');
}
checkJSDocMessages(jsdocMessages);

console.log('Build Docs -- images');
try
{
    const imageFolder = join(DOCS_FOLDER, 'examples');
    fs.mkdirSync(imageFolder, { recursive: true });
    for (const file of docsImageFiles)
        fs.copyFileSync(file, join(imageFolder, basename(file)));
}
catch (e) { handleError(e, 'Failed to copy static files!'); }

try
{
    // all of it is there: the site is given every page built, and then loses the ones no longer built, so pages
    // for removed symbols do not linger; copied, not renamed, since a folder just written may still be held open
    fs.cpSync(DOCS_FOLDER, OUTPUT_FOLDER, { recursive: true, force: true });
    const prune = (folder, built)=>
    {
        for (const name of fs.readdirSync(folder))
        {
            const path = join(folder, name), from = join(built, name);
            if (!fs.existsSync(from))
                fs.rmSync(path, { recursive: true, force: true });
            else if (fs.statSync(path).isDirectory())
                prune(path, from);
        }
    };
    prune(OUTPUT_FOLDER, DOCS_FOLDER);
}
catch (e) { handleError(e, 'Failed to put the docs in place!'); }
try { fs.rmSync(DOCS_FOLDER, { recursive: true, force: true }); }
catch { console.warn('Build Docs -- docs.build could not be removed, the next build clears it'); }

console.log(`Docs built in ${((Date.now() - startTime)/1e3).toFixed(2)} seconds! ✨`);

// The engine writes TypeScript flavored JSDoc on purpose so dist/littlejs.d.ts gets
// precise types. Tuples like [Vector2, Vector2, number], arrays of them like
// Array<[number, boolean]>, records with optional fields like {color?: Color}, and
// predicates like "a is Array<any>" have no spelling both tools accept: jsdoc's type parser is Closure
// only, and the forms it does accept, Array<Vector2|number> or a record type, throw the
// positions away. So jsdoc always rejects those and that is expected. Every other
// message is a real problem, and burying it in the expected ones is how tags rot.
function checkJSDocMessages(output)
{
    // a message about a tag whose description runs over several lines runs over as many, so a line that does not
    // start a message goes back onto the one before it
    const lines = [];
    for (const line of output.split(/\r?\n/).map(line => line.trim()).filter(line => line))
        /^(ERROR|WARNING)\b/.test(line) || !lines.length ? lines.push(line) : lines[lines.length - 1] += ' ' + line;
    // tuples, predicates, records with optional fields, and a function type grouped in parentheses to join a union
    const expected = (line)=> /Invalid type expression "(\[|\(function\(|\w+ is |Array<\[|[^"]*\w\?: )/.test(line);
    const unexpected = lines.filter(line => !expected(line));
    if (unexpected.length)
    {
        for (const line of unexpected)
            console.error(line);
        console.error(`Build Docs -- ${unexpected.length} jsdoc messages that are not expected type errors`);
        console.error('Fix the tags above. If one of them is deliberate, say so in checkJSDocMessages.');
        process.exit(1);
    }
    if (lines.length)
        console.log(`Build Docs -- ${lines.length} expected type errors, tuples and predicates jsdoc cannot parse`);
}

function handleError(e, message)
{
    console.error(e);
    console.error(message);
    process.exit(1);
}
