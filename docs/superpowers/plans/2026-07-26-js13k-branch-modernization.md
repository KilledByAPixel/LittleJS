# LittleJS JS13K Branch Modernization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `js13k` branch up to date with `main` LittleJS on correctness and API naming, polish the build system, and rewrite the docs so a newcomer can ship a JS13K game and later port it to regular LittleJS with minimal changes.

**Architecture:** The engine is a set of plain `.js` files in `src/` concatenated by a build script — no modules, no bundler. `examples/starter/build.js` concatenates `src/*.js` + `game.js`, runs Closure Compiler ADVANCED → uglify → roadroller, inlines the result into a single HTML file, and zips it with `ect`. Changes are surgical edits to individual `src/` files plus rewrites of `build.js`, `package.json`, and `README.md`.

**Tech Stack:** Vanilla ES2020 JavaScript, Node.js build scripts (`node:fs`, `node:child_process`, `node:http`), Google Closure Compiler, UglifyJS, Roadroller, ect-bin.

## Global Constraints

- **Size budget:** the JS13K limit is **13312 bytes**. Baseline `examples/starter/game.zip` is **7555 bytes**. Record the size after every task.
- **No new dependencies.** `package.json` `devDependencies` must remain exactly: `ect-bin`, `google-closure-compiler`, `roadroller`, `typescript`, `uglify-js`.
- **Closure Compiler ADVANCED performs dead-code elimination.** Any engine function the game does not call is stripped from the final zip. Adding unused API surface is therefore byte-free in the built game. This is why parity additions below are safe.
- **No back-compat aliases.** When renaming, the old name is deleted. Two names for one thing defeats the migration story and costs bytes.
- **Preserve deliberate js13k divergences.** Do NOT "fix" these toward `main`: flat `tileCollision` array; `Music`/zzfxm inline in `engineAudio.js`; `glOverlay`; `medalDisplayIconSize`; `const mouseIsDown = keyIsDown` style aliases; golfed forms like `child.destroy(child.parent = 0)`.
- **Out of scope entirely:** `TileCollisionLayer`, `CanvasLayer`, WebGL tile-layer rendering, the `drawCanvas`/`drawContext` split, plugins, box2d, `cameraAngle`, pointer lock, `mouseDelta`, `TileInfo.setFullImage`.
- **Reference branch:** read `main` with `git show main:src/<file>`. Never merge or cherry-pick from `main` — the branches have diverged structurally and merges will pull in out-of-scope reworks.
- **Verification after every code change:** `node --check` on each edited file, then a full build, then confirm the reported zip size. Closure ADVANCED at `--warning_level=VERBOSE` must produce no errors — that is the real static type check for this codebase.

## Corrections to the Spec

Research during planning found that several fixes the spec listed as missing are **already present** in this branch. Do not re-apply them:

| Spec claimed missing | Actual state |
|---|---|
| Multi-line text vertical centering | Already present, `engineDraw.js:473` |
| Tile layer padding fix | Already present, `engineTileLayer.js:328` |
| Particle `lifetime <= 0` guard | Already present, `engineParticles.js:290` |
| Firefox tile layer jitter | Already present, `engineTileLayer.js:244` |
| Canvas centering on mobile | Already present, `engine.js:298-299` |
| `spawnRandomPoly` fix | Not an engine fix — it touched `examples/box2d/scenes.js`, which this branch does not have |
| `restitution` rename | Already done |

Also corrected: the spec's risk note claims flipping `inputPreventDefault` to `true` changes runtime behavior. **It does not.** Today `preventDefaultInput` defaults to `false` and gates only the keydown handler, while mousedown calls `preventDefault` unconditionally. After Task 2, keydown never calls `preventDefault` (matching `main`) and mousedown is gated by a flag defaulting to `true` — producing byte-for-byte identical default behavior, with the flag now actually useful.

New genuine gaps found during planning that the spec did not list: `localToWorldVector`/`worldToLocalVector` have inverted rotation signs versus `main`; `overflow:hidden` is missing from the root style; `engineInit` crashes if callbacks are omitted.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `examples/starter/build.js` | Modify | Game build pipeline; gains size-budget gate, HTML head, toggles, error handling |
| `serve.js` | **Create** | Zero-dependency static file server for local development |
| `package.json` | Modify | Drop npm-package fields; add `start`, `build`, `build:engine` scripts |
| `.gitignore` | Modify | Add `dist/`, `.vscode/` |
| `src/engineInput.js` | Modify | Input renames + keydown `preventDefault` fix |
| `src/engineSettings.js` | Modify | `setGLEnable` rename; `audioMasterGain` rename |
| `src/engineAudio.js` | Modify | `audioMasterGain` rename |
| `src/engineDebug.js` | Modify | `audioMasterGain` rename |
| `src/engineObject.js` | Modify | `clampSpeed` semantics, rotation-sign fix, asserts, `applyAngularAcceleration` |
| `src/engineParticles.js` | Modify | Particle speed-clamp override to match `main` |
| `src/engine.js` | Modify | `overflow:hidden`, optional callbacks, `getPaused`, version bump |
| `src/engineExport.js` | Modify | Track every rename and addition |
| `README.md` | Rewrite | Getting started, size budget, feature stripping, migration guide |
| `dist/`, `FAQ.md`, `reference.md` | **Delete** | Stale; document an API this branch does not have |

---

### Task 1: Build system, dev server, and npm scripts

Infrastructure first — every later task needs the size readout to measure its cost and `npm start` to verify in a browser.

**Files:**
- Modify: `examples/starter/build.js`
- Create: `serve.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run build` (builds the starter, prints size vs budget, exits non-zero if over 13312), `npm start` (serves repo root at http://localhost:8000), `npm run build:engine` (builds `dist/`).

- [ ] **Step 1: Record the baseline**

From `examples/starter`, run `node build.js` and note the reported byte count. It should be 7555. Write it down; every later task compares against it.

- [ ] **Step 2: Rewrite `examples/starter/build.js`**

Replace the entire file with:

```js
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
```

- [ ] **Step 3: Verify the build still works and reports size**

Run `node build.js` from `examples/starter`. Expected: completes, and the final three lines read like

```
game.zip: 7555 / 13312 bytes (56.8%)
5757 bytes remaining
```

The byte count must match the Step 1 baseline. The added `<!DOCTYPE html><head><title>…` costs roughly 60 bytes before compression; a small increase over 7555 (under ~40 bytes after zip) is expected and acceptable. Record the new number as the working baseline.

- [ ] **Step 4: Verify the size gate fires**

Temporarily change `const SIZE_LIMIT = 13312;` to `const SIZE_LIMIT = 1000;` and run `node build.js`. Expected: prints `OVER BUDGET by …` and exits non-zero (check with `echo $?` — should be `1`). Change `SIZE_LIMIT` back to `13312` and re-run to confirm it passes again.

- [ ] **Step 5: Verify `build/` is not littered**

Run `ls examples/starter/build`. Expected: exactly `index.html`, `index.js`, and `tiles.png` — no `.closure.js` or `.uglify.js` files, because `DEBUG_BUILD` is `false`.

- [ ] **Step 6: Create `serve.js` at the repo root**

```js
#!/usr/bin/env node

/**
 * LittleJS Dev Server
 * - Minimal static file server with no dependencies
 * - Needed because opening index.html over file:// makes tiles.png
 *   cross-origin, which makes WebGL texture upload throw a SecurityError
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const MIME =
{
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.wav':  'audio/wav',
};

http.createServer((req, res) =>
{
    // strip query string and decode, then resolve inside ROOT
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(ROOT, urlPath);

    // prevent escaping the root directory
    if (!filePath.startsWith(ROOT))
    {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // serve index.html for directories
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())
        filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (err, data) =>
    {
        if (err)
        {
            res.writeHead(404);
            res.end('Not found: ' + urlPath);
            return;
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-cache'});
        res.end(data);
    });
}).listen(PORT, () =>
{
    console.log(`LittleJS dev server running at http://localhost:${PORT}`);
    console.log(`Starter project: http://localhost:${PORT}/examples/starter/`);
});
```

- [ ] **Step 7: Verify the dev server**

Run `node --check serve.js`. Expected: no output (valid syntax).

Start it with `node serve.js` in the background, then fetch the starter page:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/examples/starter/
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/examples/starter/tiles.png
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/src/engine.js
```

Expected: `200` for all three. Also confirm the traversal guard: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/../../../etc/hosts` must NOT return 200. Stop the server when done.

- [ ] **Step 8: Update `package.json`**

Replace the whole file with:

```json
{
  "name": "littlejs-js13k",
  "version": "1.13.1-js13k",
  "description": "LittleJS - Tiny and Fast HTML5 Game Engine - JS13K Edition",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/KilledByAPixel/LittleJS.git"
  },
  "keywords": [
    "LittleJS",
    "HTML5",
    "JavaScript",
    "game",
    "engine",
    "library",
    "JS13K",
    "webgl"
  ],
  "author": "Frank Force",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/KilledByAPixel/LittleJS/issues"
  },
  "homepage": "https://github.com/KilledByAPixel/LittleJS",
  "scripts": {
    "start": "node serve.js",
    "build": "node examples/starter/build.js",
    "build:engine": "node src/engineBuild.js"
  },
  "devDependencies": {
    "ect-bin": "~1.4.1",
    "google-closure-compiler": "~20230502.0.0",
    "roadroller": "~2.1.0",
    "typescript": "~5.1.6",
    "uglify-js": "~3.17.4"
  }
}
```

Note `main`, `types`, and `exports` are removed — this is a template repo, not a published package.

- [ ] **Step 9: Fix the build script's working directory**

`npm run build` now runs `build.js` from the repo root, but the script uses paths relative to `examples/starter`. Add this immediately after the `const child_process = require('node:child_process');` line in `examples/starter/build.js`:

```js
// always run relative to this script's folder so npm run build works from anywhere
process.chdir(__dirname);
```

- [ ] **Step 10: Verify the npm scripts**

From the repo root run `npm run build`. Expected: same successful build and same size as Step 3, proving `process.chdir` works.

- [ ] **Step 11: Update `.gitignore`**

Replace the contents with:

```
# node files
node_modules

# editor files
.vscode

# engine build output (generate with: npm run build:engine)
dist

# example builds
examples/starter/build
examples/starter/*.zip
```

- [ ] **Step 12: Commit**

```bash
git add examples/starter/build.js serve.js package.json .gitignore
git commit -m "build: add size budget gate, dev server, and npm scripts"
```

---

### Task 2: Input renames and keydown preventDefault fix

**Files:**
- Modify: `src/engineInput.js`
- Modify: `src/engine.js` (one call site)
- Modify: `src/engineExport.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `inputClear()`, `inputClearKey(key, device, clearDown, clearPressed, clearReleased)`, `inputPreventDefault` (boolean, default `true`), `setInputPreventDefault(preventDefault)`, `mouseEventToScreen(mousePos: Vector2): Vector2`. Removes `clearInput`, `preventDefaultInput`, `mouseToScreen`.

- [ ] **Step 1: Rename `clearInput` and add `inputClearKey`**

In `src/engineInput.js`, replace the `clearInput` block at line 58-60:

```js
/** Clears all input
 *  @memberof Input */
function clearInput() { inputData = [[]]; touchGamepadButtons = []; }
```

with:

```js
/** Clears all input
 *  @memberof Input */
function inputClear() { inputData = [[]]; touchGamepadButtons = []; }

/** Clears an input key state
 *  @param {String|Number} key
 *  @param {Number} [device]
 *  @param {Boolean} [clearDown=true]
 *  @param {Boolean} [clearPressed=true]
 *  @param {Boolean} [clearReleased=true]
 *  @memberof Input */
function inputClearKey(key, device=0, clearDown=true, clearPressed=true, clearReleased=true)
{
    if (!inputData[device])
        return;
    inputData[device][key] &= ~((clearDown?1:0)|(clearPressed?2:0)|(clearReleased?4:0));
}
```

- [ ] **Step 2: Rename `preventDefaultInput` and flip its default**

In `src/engineInput.js`, replace lines 103-106:

```js
/** Prevents input continuing to the default browser handling (false by default)
 *  @type {Boolean}
 *  @memberof Input */
let preventDefaultInput = false;
```

with:

```js
/** Prevents input continuing to the default browser handling (true by default)
 *  @type {Boolean}
 *  @memberof Input */
let inputPreventDefault = true;

/** Set to prevent input continuing to the default browser handling
 *  @param {Boolean} preventDefault
 *  @memberof Input */
function setInputPreventDefault(preventDefault) { inputPreventDefault = preventDefault; }
```

- [ ] **Step 3: Apply the keydown preventDefault fix and remaining renames**

In `src/engineInput.js` inside `inputInit()`, delete line 189 entirely:

```js
        preventDefaultInput && e.preventDefault();
```

`main` removed this call — a game should not swallow browser key handling by default. Deleting it leaves the `onkeydown` arrow function ending at the closing brace of the `if (!e.repeat)` block.

Then change line 219 from:

```js
        e.button && e.preventDefault();
```

to:

```js
        inputPreventDefault && e.button && e.preventDefault();
```

Then change line 225 from:

```js
    onblur        = (e) => clearInput(); // reset input when focus is lost
```

to:

```js
    onblur        = (e) => inputClear(); // reset input when focus is lost
```

- [ ] **Step 4: Rename `mouseToScreen` to `mouseEventToScreen`**

In `src/engineInput.js`, rename the function at line 233 and all four call sites (lines 218, 222, 397, 445). The signature stays as-is — it takes the event-like object with `.x`/`.y`, and the existing `!mainCanvas || headlessMode` guard is a js13k fix that `main` lacks, so keep it:

```js
// convert a mouse or touch event position to screen space
function mouseEventToScreen(mousePos)
{
    if (!mainCanvas || headlessMode)
        return vec2(); // fix bug that can occur if user clicks before page loads

    const rect = mainCanvas.getBoundingClientRect();
    return vec2(mainCanvas.width, mainCanvas.height).multiply(
        vec2(percent(mousePos.x, rect.left, rect.right), percent(mousePos.y, rect.top, rect.bottom)));
}
```

Confirm no stragglers: `grep -n "mouseToScreen\|clearInput\|preventDefaultInput" src/` must return nothing except the `engine.js` hit handled in the next step.

- [ ] **Step 5: Update the `engine.js` call site**

In `src/engine.js` line 340, change `clearInput();` to `inputClear();`.

- [ ] **Step 6: Update `src/engineExport.js`**

Change `clearInput,` (line 249) to:

```
	inputClear,
	inputClearKey,
```

Change `preventDefaultInput,` (line 257) to:

```
	inputPreventDefault,
	setInputPreventDefault,
```

Delete the `mouseToScreen,` line — `main` does not export this function (it was removed in commit `32b1cba1`), so dropping it from the export list is part of matching `main`.

- [ ] **Step 7: Verify syntax and build**

```bash
node --check src/engineInput.js
node --check src/engine.js
node --check src/engineExport.js
npm run build
```

Expected: all three `node --check` calls silent; build succeeds with no Closure warnings; size within a few bytes of the Task 1 baseline.

- [ ] **Step 8: Verify in the browser**

Run `npm start`, open `http://localhost:8000/examples/starter/`, and confirm: the game renders, arrow keys/WASD move the player, and the browser console shows no errors. Then confirm the keydown fix specifically — pressing arrow keys must still scroll the page if the page is scrollable, since the engine no longer calls `preventDefault` on keys.

- [ ] **Step 9: Commit**

```bash
git add src/engineInput.js src/engine.js src/engineExport.js
git commit -m "input: rename to inputClear/inputPreventDefault, add inputClearKey, match main

Aligns input API names with main LittleJS. Also removes the preventDefault
call from onkeydown (main removed it) and gates the mousedown call behind
inputPreventDefault, which now defaults to true. Net default behavior is
unchanged; the flag is now useful."
```

---

### Task 3: Settings and audio renames

**Files:**
- Modify: `src/engineSettings.js`
- Modify: `src/engineAudio.js`
- Modify: `src/engineDebug.js`
- Modify: `src/engineExport.js`

**Interfaces:**
- Produces: `setGLEnable(enable)` replacing `setGlEnable`. Internal `audioMasterGain` replacing `audioGainNode`.

- [ ] **Step 1: Rename `setGlEnable` to `setGLEnable`**

In `src/engineSettings.js` line 328 area, change:

```js
function setGlEnable(enable) { glEnable = enable; }
```

to:

```js
function setGLEnable(enable) { glEnable = enable; }
```

Leave `setGlOverlay` and `glOverlay` exactly as they are — `glOverlay` is a js13k-only setting that `main` removed, and it stays.

- [ ] **Step 2: Rename `audioGainNode` to `audioMasterGain`**

This is an internal variable renamed in `main` commit `926a31ba`. Update all 9 occurrences across 4 files:

- `src/engineAudio.js` lines 22, 29, 30, 31, 335
- `src/engineDebug.js` lines 522, 526
- `src/engineSettings.js` lines 446, 447

Verify with `grep -rn "audioGainNode" src/` — expected: no matches.

- [ ] **Step 3: Update `src/engineExport.js`**

Change `setGlEnable,` to `setGLEnable,`.

- [ ] **Step 4: Verify**

```bash
node --check src/engineSettings.js
node --check src/engineAudio.js
node --check src/engineDebug.js
node --check src/engineExport.js
npm run build
```

Expected: silent checks, successful build, size within a few bytes of baseline.

- [ ] **Step 5: Verify audio still works in the browser**

Run `npm start` and open the starter. Click to trigger a sound (the starter plays a sound on mouse click). Confirm audio plays and the console is clean — this exercises the renamed gain node path.

- [ ] **Step 6: Commit**

```bash
git add src/engineSettings.js src/engineAudio.js src/engineDebug.js src/engineExport.js
git commit -m "settings: rename setGlEnable to setGLEnable and audioGainNode to audioMasterGain"
```

---

### Task 4: EngineObject correctness and parity

Contains the one genuine bug fix found in this branch: the local/world vector rotation helpers have inverted signs versus `main`.

**Files:**
- Modify: `src/engineObject.js`
- Modify: `src/engineParticles.js`
- Modify: `src/engineExport.js`

**Interfaces:**
- Produces: `EngineObject.clampSpeed` (boolean, default `true`) replacing `clampSpeedLinear`; `EngineObject.applyAngularAcceleration(acceleration)`; corrected `localToWorldVector`/`worldToLocalVector`.

- [ ] **Step 1: Fix the inverted rotation signs**

In `src/engineObject.js`, the two vector-rotation helpers are inverted relative to `main`, which fixed this in commit `34a7f57b`. Change:

```js
    localToWorldVector(vec) { return vec.rotate(-this.angle); }
```

to:

```js
    localToWorldVector(vec) { return vec.rotate(this.angle); }
```

and change:

```js
    worldToLocalVector(vec) { return vec.rotate(this.angle); }
```

to:

```js
    worldToLocalVector(vec) { return vec.rotate(-this.angle); }
```

Before editing, confirm the premise still holds — `Vector2.rotate` must be identical in both branches, since these helpers are only correct relative to it:

```bash
git show main:src/engineUtilities.js | grep -A5 "rotate(angle)"
grep -A5 "rotate(angle)" src/engineUtilities.js
```

Expected: both print the same body using `Math.cos(-angle)`. If they differ, stop and re-derive which side is correct before changing anything.

- [ ] **Step 2: Rename `clampSpeedLinear` to `clampSpeed` and change its meaning**

This is not a pure rename. In `main`, `clampSpeed` is a boolean for *whether* to clamp (always linear); circular clamping moved into `Particle`. Replace the js13k block in `update()`:

```js
        // limit max speed to prevent missing collisions
        if (this.clampSpeedLinear)
        {
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }
        else
        {
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }
```

with:

```js
        if (this.clampSpeed)
        {
            // limit max speed to prevent missing collisions
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }
```

And in the constructor, replace:

```js
        /** @property {Boolean}  - Limit object speed using linear or circular math */
        this.clampSpeedLinear = true;
```

with:

```js
        /** @property {Boolean} - Limit object speed along x and y axis */
        this.clampSpeed = true;
        /** @property {EngineObject} - Object we are standing on, if any  */
        this.groundObject = undefined;
```

(`groundObject` was previously never declared in the constructor; `main` declares it.)

- [ ] **Step 3: Move circular clamping into `Particle`**

In `src/engineParticles.js`, replace:

```js
        // particles use circular clamped speed
        this.clampSpeedLinear = false;
    }
```

with:

```js
        // particles do not clamp speed by default
        this.clampSpeed = false;
    }

    /** Update the object physics, called automatically by engine once each frame */
    update()
    {
        super.update();

        if (this.collideTiles || this.collideSolidObjects)
        {
            // only apply max circular speed if particle can collide
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }
    }
```

- [ ] **Step 4: Add the ground-object self-reference guard**

In `src/engineObject.js` line 177, change:

```js
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
```

to:

```js
            const groundSpeed = this.groundObject != this && this.groundObject.velocity ?
                this.groundObject.velocity.x : 0;
```

Do **not** also adopt `main`'s `max(this.friction, this.groundObject.friction)` from the same commit. In `main`, `groundObject` can be a `TileCollisionLayer` carrying its own friction; in this branch it is either an `EngineObject` or the boolean from `this.groundObject = wasMovingDown`, so reading `.friction` off it is meaningless. That half of the change belongs to the tile-collision rework, which is out of scope.

- [ ] **Step 5: Add `applyAngularAcceleration`**

In `src/engineObject.js`, immediately after the `applyAcceleration` method, add:

```js
    /** Apply angular acceleration to this object 
     *  @param {Number} acceleration */
    applyAngularAcceleration(acceleration) { if (this.mass) this.angleVelocity += acceleration; }
```

Closure ADVANCED strips this if the game never calls it, so it costs nothing in the built zip.

- [ ] **Step 6: Strengthen the constructor asserts**

`ASSERT` compiles to nothing in the release build, so better asserts are free. In `src/engineObject.js`, replace:

```js
        // set passed in params
        ASSERT(isVector2(pos) && isVector2(size), 'ensure pos and size are vec2s');
        ASSERT(typeof tileInfo !== 'number' || !tileInfo, 'old style tile setup');
```

with:

```js
        // check passed in params
        ASSERT(isVector2(pos) && pos.isValid(), 'object pos should be a vec2');
        ASSERT(isVector2(size) && size.isValid(), 'object size should be a vec2');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo, 'object tileInfo should be a TileInfo or undefined');
        ASSERT(typeof angle == 'number' && isFinite(angle), 'object angle should be a number');
        ASSERT(isColor(color) && color.isValid(), 'object color should be a valid rgba color');
        ASSERT(typeof renderOrder == 'number', 'object renderOrder should be a number');
```

- [ ] **Step 7: Verify no stale references remain**

```bash
grep -rn "clampSpeedLinear" src/ examples/
```

Expected: no matches. If `examples/starter/game.js` used it, update that too.

- [ ] **Step 8: Verify syntax and build**

```bash
node --check src/engineObject.js
node --check src/engineParticles.js
npm run build
```

Expected: silent checks, clean build. The `Particle.update()` override adds bytes only if the game spawns particles — the starter does, so expect a small increase (under ~30 bytes). Record it.

- [ ] **Step 9: Verify physics in the browser**

Run `npm start` and open the starter. Confirm: the player falls under gravity and lands cleanly on the ground without sinking or jittering; particle effects still emit and fade; objects still collide with tiles. The rotation-sign change affects any object using parent/child local space — confirm nothing renders at a mirrored angle.

- [ ] **Step 10: Commit**

```bash
git add src/engineObject.js src/engineParticles.js src/engineExport.js
git commit -m "object: fix inverted local/world vector rotation, align clampSpeed with main

localToWorldVector and worldToLocalVector had swapped rotation signs
relative to main, which fixed this in 34a7f57b. Also renames
clampSpeedLinear to clampSpeed with main's semantics (circular clamping
moves into Particle), adds applyAngularAcceleration, and strengthens
constructor asserts."
```

---

### Task 5: engine.js fixes and version bump

**Files:**
- Modify: `src/engine.js`
- Modify: `src/engineExport.js`

**Interfaces:**
- Produces: `getPaused(): boolean`; `setPaused(isPaused=true)`; `engineVersion === '1.13.1-js13k'`; `engineInit` tolerating omitted callbacks.

- [ ] **Step 1: Restore `overflow:hidden`**

In `src/engine.js`, the root style is missing the scrollbar suppression `main` added in commit `0caa927f`. Change:

```js
    const styleRoot = 
        'margin:0;' +                 // fill the window
        'background:#000;' +          // set background color
```

to:

```js
    const styleRoot = 
        'margin:0;' +                 // fill the window
        'overflow:hidden;' +          // no scroll bars
        'background:#000;' +          // set background color
```

- [ ] **Step 2: Allow omitted `engineInit` callbacks**

Currently `await gameInit();` at line 267 throws if the caller passed `undefined`. Immediately after the two opening `ASSERT` lines in `engineInit`, add:

```js
    // allow passing in empty functions
    gameInit       ||= ()=>{};
    gameUpdate     ||= ()=>{};
    gameUpdatePost ||= ()=>{};
    gameRender     ||= ()=>{};
    gameRenderPost ||= ()=>{};
```

- [ ] **Step 3: Add `getPaused` and default `setPaused`**

Replace:

```js
/** Set if game is paused
 *  @param {Boolean} isPaused
 *  @memberof Engine */
function setPaused(isPaused) { paused = isPaused; }
```

with:

```js
/** Get if game is paused
 *  @return {Boolean}
 *  @memberof Engine */
function getPaused() { return paused; }

/** Set if game is paused
 *  @param {Boolean} [isPaused]
 *  @memberof Engine */
function setPaused(isPaused=true) { paused = isPaused; }
```

- [ ] **Step 4: Bump the version**

Change `const engineVersion = '1.11.8.2';` to `const engineVersion = '1.13.1-js13k';`.

- [ ] **Step 5: Update `src/engineExport.js`**

Add `getPaused,` immediately before the existing `setPaused,` line.

- [ ] **Step 6: Verify**

```bash
node --check src/engine.js
node --check src/engineExport.js
npm run build
```

Expected: silent checks, clean build.

- [ ] **Step 7: Verify the omitted-callback path**

Temporarily edit `examples/starter/game.js` and change its `engineInit(...)` call to pass `undefined` for `gameRenderPost` (keep the rest). Run `npm start` and confirm the game still loads without a console error. Then revert `game.js` with `git checkout examples/starter/game.js`.

- [ ] **Step 8: Verify no scrollbars**

With `npm start` running, open the starter and confirm the page has no scrollbars at any window size.

- [ ] **Step 9: Commit**

```bash
git add src/engine.js src/engineExport.js
git commit -m "engine: restore overflow:hidden, allow omitted engineInit callbacks, add getPaused

Bumps engineVersion to 1.13.1-js13k to record the lineage."
```

---

### Task 6: Audit the remaining engine files

The files not touched by Tasks 2-5 have large diffs against `main`, but nearly all of it is `main`-side expansion that is explicitly out of scope. This task is a bounded classification pass to catch anything genuinely missing.

**Files:**
- Read: `src/engineDraw.js`, `src/engineWebGL.js`, `src/engineDebug.js`, `src/engineTileLayer.js`, `src/engineAudio.js`, `src/engineMedals.js`
- Modify: only those with a confirmed fix

**Interfaces:**
- Consumes: renames from Tasks 2-5 are already applied, so ignore any diff hunk that is only about those names.
- Produces: a list of findings recorded in the commit message; possibly no code change at all, which is a valid outcome.

- [ ] **Step 1: Generate the diffs**

```bash
git diff main js13k -- src/engineDraw.js > /tmp/draw.diff
git diff main js13k -- src/engineWebGL.js > /tmp/webgl.diff
git diff main js13k -- src/engineDebug.js > /tmp/debug.diff
git diff main js13k -- src/engineTileLayer.js > /tmp/tilelayer.diff
git diff main js13k -- src/engineAudio.js > /tmp/audio.diff
git diff main js13k -- src/engineMedals.js > /tmp/medals.diff
```

Remember the direction: `-` lines are `main`'s, `+` lines are this branch's.

- [ ] **Step 2: Classify every hunk**

For each hunk assign exactly one label:

- **COSMETIC** — JSDoc casing (`{number}` vs `{Number}`), whitespace, comment wording, `==` vs `===`, alignment. **Take nothing.**
- **OUT OF SCOPE** — belongs to `drawCanvas`/`drawContext`, `CanvasLayer`, `TileCollisionLayer`, WebGL tile layers, `cameraAngle`, pointer lock, `mouseDelta`, the zzfxm plugin split, video capture, or `TileInfo.setFullImage`. **Take nothing.**
- **DELIBERATE JS13K** — this branch is smaller on purpose (`medalDisplayIconSize` fixed sizing, inline `Music`, `glOverlay`, golfed expressions). **Take nothing.**
- **FIX** — `main` corrects wrong behavior that this branch still has, and the correction does not depend on any out-of-scope rework. **Take it.**

The known-cosmetic majority: `main` migrated JSDoc from `{Number}`/`{Boolean}`/`{String}` to lowercase `{number}`/`{boolean}`/`{string}`. Every such hunk is COSMETIC. Do not churn this branch's JSDoc casing — it is a large diff for zero behavior.

- [ ] **Step 3: Apply only the FIX hunks**

For each hunk labeled FIX, make the minimal edit and note the file, the line, and the `main` commit that introduced it. If a hunk seems like a fix but depends on out-of-scope code, label it OUT OF SCOPE and record it for the migration guide instead.

- [ ] **Step 4: Verify**

```bash
node --check src/engineDraw.js
node --check src/engineWebGL.js
node --check src/engineDebug.js
node --check src/engineTileLayer.js
node --check src/engineAudio.js
node --check src/engineMedals.js
npm run build
```

Expected: silent checks, clean build, size at or near the Task 5 figure.

- [ ] **Step 5: Verify in the browser**

Run `npm start` and confirm the starter still renders, plays sound, and responds to input.

- [ ] **Step 6: Commit**

If any fixes were applied:

```bash
git add src/
git commit -m "engine: port remaining correctness fixes from main

<one line per fix: file, what it corrects, and the main commit hash>"
```

If the audit found nothing to take, skip the commit and record the finding in the Task 8 README work instead — a clean audit is a real result and belongs in the migration guide.

---

### Task 7: Repo cleanup

**Files:**
- Delete: `dist/`, `FAQ.md`, `reference.md`
- Modify: `examples/starter/index.html`

- [ ] **Step 1: Confirm nothing references the files being deleted**

```bash
grep -rn "FAQ.md\|reference.md" --include=*.md --include=*.html --include=*.js . | grep -v node_modules | grep -v docs/superpowers
grep -rn "dist/" --include=*.html --include=*.js examples/ src/ | grep -v node_modules
```

Expected: matches only in `README.md` (rewritten in Task 8) and possibly none for `dist/`. If `examples/starter/index.html` or `build.js` references `dist/`, stop — the starter must build from `src/`, and a `dist/` reference means Task 1 was not applied correctly.

- [ ] **Step 2: Delete the stale files**

```bash
git rm -r dist
git rm FAQ.md reference.md
```

`dist/` is regenerable at any time with `npm run build:engine` and is gitignored as of Task 1.

- [ ] **Step 3: Remove the cache-buster query strings**

In `examples/starter/index.html`, remove the `?1105` suffix from all 13 script `src` attributes. The result:

```html
<head>
<title>LittleJS JS13K Project</title>
<meta charset=utf-8>
</head><body>

<!-- LittleJS Engine -->
<script src=../../src/engineDebug.js></script>
<script src=../../src/engineUtilities.js></script>
<script src=../../src/engineSettings.js></script>
<script src=../../src/engineObject.js></script>
<script src=../../src/engineDraw.js></script>
<script src=../../src/engineInput.js></script>
<script src=../../src/engineAudio.js></script>
<script src=../../src/engineTileLayer.js></script>
<script src=../../src/engineParticles.js></script>
<script src=../../src/engineMedals.js></script>
<script src=../../src/engineWebGL.js></script>
<script src=../../src/engine.js></script>

<!-- Add your game scripts here -->
<script src=game.js></script>
```

The `Cache-Control: no-cache` header from `serve.js` makes the query strings unnecessary.

- [ ] **Step 4: Verify the unbuilt path still works**

Run `npm start` and open `http://localhost:8000/examples/starter/`. Confirm the game loads and runs with debug mode available (press Escape) — this is the unbuilt path, which loads `src/*.js` directly including `engineDebug.js`.

- [ ] **Step 5: Verify the built path still works**

```bash
npm run build
```

Then open `http://localhost:8000/examples/starter/build/` and confirm the built game runs identically. Both paths must work — they compile differently, and a break in one will not necessarily show in the other.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove stale dist, FAQ, and reference docs

FAQ.md and reference.md document main's API, including functions this
branch does not have. dist/ was stale and is now generated on demand
with npm run build:engine."
```

---

### Task 8: README rewrite with migration guide

The primary deliverable for making this usable by other people. The current README has no build instructions and five typos: `speficially`, `evoling`, `minigfing`, `compititons`, `incuding`.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Measure the feature-stripping savings**

The current README promises "Individual features like WebGL can be disabled to save even more space" and documents nothing. Produce real numbers before writing that section.

For each of these, remove the named file from the `sourceFiles` array in `examples/starter/build.js`, stub any resulting undefined references in `game.js`, run `npm run build`, and record the zip size:

- `engineWebGL.js` (also requires `setGLEnable(false)` before `engineInit`)
- `engineParticles.js`
- `engineMedals.js`
- `engineTileLayer.js`

Restore `build.js` and `game.js` with `git checkout examples/starter/build.js examples/starter/game.js` after each measurement. Record each saving in bytes. If removing a file turns out not to work cleanly, record that honestly rather than inventing a number — "removing X requires also doing Y" is useful information.

- [ ] **Step 2: Write the README**

Structure, in order:

1. **Title and what this is** — a size-optimized fork of LittleJS for JS13K and similar size-coding compos, tracking `main` selectively. State the current starter size and the 13312 limit. Keep the existing logo image reference (`examples/logo.png`) and the "All aboard" intro, with the typos fixed.
2. **Quick start** — the exact commands:
   ```
   git clone -b js13k https://github.com/KilledByAPixel/LittleJS.git
   cd LittleJS
   npm install
   npm start
   ```
   then open `http://localhost:8000/examples/starter/`, edit `examples/starter/game.js`, and run `npm run build` to produce `examples/starter/game.zip`. Explain that `npm start` is required because opening the file directly makes `tiles.png` cross-origin and WebGL texture upload fails.
3. **How the build works** — one line per stage (concatenate → Closure ADVANCED → uglify → roadroller → inline into one HTML → ect zip), what the size readout means, and the `USE_ROADROLLER` / `ROADROLLER_EXTREME` / `DEBUG_BUILD` toggles at the top of `build.js`.
4. **Saving space** — the measured table from Step 1, plus the note that Closure ADVANCED already strips any engine function the game never calls, so unused features mostly cost nothing.
5. **Migrating to main LittleJS** — see Step 3.
6. **JS13K games made with LittleJS** — keep the existing five entries, fix `incuding`.

- [ ] **Step 3: Write the migration guide section**

This section carries the branch's primary goal: a game written here should port to regular LittleJS with few enough changes that an AI assistant can do it from this table alone. Open by pointing readers at the regular LittleJS docs (`https://killedbyapixel.github.io/LittleJS/docs`) as the API reference, since after this work the APIs match closely.

Include a **renames** table — these are all mechanical find-and-replace, and after Tasks 2-5 this branch already matches `main`, so the table documents that there is nothing to do:

| This branch | main LittleJS | Notes |
|---|---|---|
| `inputClear` | `inputClear` | matches |
| `inputPreventDefault` | `inputPreventDefault` | matches |
| `setGLEnable` | `setGLEnable` | matches |
| `clampSpeed` | `clampSpeed` | matches |
| `restitution` | `restitution` | matches |

Then an **absent features** section — adding these back is purely additive, so a game that never used them ports cleanly: `cameraAngle`/`setCameraAngle`, pointer lock (`pointerLockRequest`/`pointerLockExit`/`pointerLockIsActive`), `mouseDelta`/`mouseDeltaScreen`, `CanvasLayer`, `TileInfo.setFullImage`, `debugScreenshot`, `glDeleteTexture`/`glSetTextureData`, and all plugins (box2d, uiSystem, postProcess, newgrounds).

Then a **this branch only** section — these exist here and not in `main`, so a port must remove them: `glOverlay`/`setGlOverlay`, `medalDisplayIconSize`/`setMedalDisplayIconSize`, and `Music` (inline here, a separate zzfxm plugin in `main`).

Then **tile collision**, called out as the one structural difference requiring real work. This branch uses a single global collision array:

```js
initTileCollision(vec2(width, height));
setTileCollisionData(pos, data);
getTileCollisionData(pos);
```

`main` uses `TileCollisionLayer` objects, so a port means creating a layer object and moving the calls onto it. Say plainly that this is the one part a port cannot do mechanically.

- [ ] **Step 4: Verify the documented commands actually work**

Run each command block from the README in order, from a clean state, and confirm each does what the README says. In particular `npm install`, `npm start`, and `npm run build` must all succeed. Fix the README, not your memory of it, if anything differs.

- [ ] **Step 5: Verify the typos are gone**

```bash
grep -niE "speficially|evoling|minigfing|compititons|incuding" README.md
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with quick start, size budget, and migration guide

Adds the getting-started instructions the branch never had, documents the
feature-stripping savings it previously only promised, and adds a migration
guide for porting a finished game to main LittleJS."
```

---

### Task 9: Final verification

**Files:** none modified unless a problem is found.

- [ ] **Step 1: Syntax check every source file**

```bash
for f in src/*.js serve.js examples/starter/build.js examples/starter/game.js; do node --check "$f" || echo "FAILED: $f"; done
```

Expected: no `FAILED` lines.

- [ ] **Step 2: Clean-clone build**

Verify the repo works for a newcomer, which is the whole point of this work:

```bash
git clone -b js13k . /tmp/ljs-clean-test
cd /tmp/ljs-clean-test
npm install
npm run build
```

Expected: build succeeds and reports a size under 13312. This catches anything accidentally depending on a gitignored or uncommitted file.

- [ ] **Step 3: Verify both run paths in a browser**

With `npm start` running:
- `http://localhost:8000/examples/starter/` — unbuilt path, debug build. Confirm rendering, input, sound, particles, and that Escape toggles debug overlay.
- `http://localhost:8000/examples/starter/build/` — built path, release build. Confirm identical behavior and a clean console.

- [ ] **Step 4: Confirm the final size and report the delta**

Record the final `game.zip` size and compute the change from the 7555-byte baseline. State it plainly in the summary — including if it grew.

- [ ] **Step 5: Confirm the engine build still works**

```bash
npm run build:engine
ls dist
```

Expected: `dist/` contains `littlejs.js`, `littlejs.release.js`, `littlejs.min.js`, `littlejs.esm.js`, `littlejs.esm.min.js`, and `littlejs.d.ts`. This exercises `src/engineExport.js`, which every rename task touched — a typo there shows up here and nowhere else.

- [ ] **Step 6: Confirm the working tree is clean**

```bash
git status
```

Expected: clean, with `dist/`, `node_modules`, `.vscode`, and the starter build outputs all ignored.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Renames: `inputClear`, `inputClearKey`, `inputPreventDefault`, `mouseEventToScreen` | Task 2 |
| Rename: `setGLEnable` | Task 3 |
| Rename: `clampSpeed` | Task 4 |
| Rename: `restitution` | Already done — noted in Corrections |
| `inputPreventDefault` default flip | Task 2 |
| Bug fixes from `main` | Task 4 (rotation, ground guard), Task 5 (`overflow:hidden`, callbacks), Task 6 (audit) |
| `engineVersion` → `1.13.1-js13k` | Task 5 |
| `engineExport.js` tracks renames | Tasks 2, 3, 4, 5 |
| Size budget readout + non-zero exit | Task 1 |
| Restore HTML head | Task 1 |
| `USE_ROADROLLER` / `ROADROLLER_EXTREME` / `DEBUG_BUILD` toggles | Task 1 |
| Build error handling | Task 1 |
| `engineBuild.js` opt-in via `build:engine` | Task 1, verified Task 9 |
| `serve.js` + `npm start` | Task 1 |
| `package.json` npm fields stripped | Task 1 |
| Delete `dist/`, `FAQ.md`, `reference.md` | Task 7 |
| Gitignore `dist/`, `.vscode/` | Task 1 |
| Keep `package-lock.json` | Untouched by every task |
| Remove `?1105` cache-busters | Task 7 |
| README: what/why, quick start, size budget, feature stripping, migration guide, showcase | Task 8 |
| Verification: `node --check`, Closure VERBOSE, size gate, both browser paths | Tasks 1-8 inline, Task 9 final |

No gaps.

**Placeholder scan:** No TBD/TODO markers. Every code step contains the literal code. Task 6 is an audit rather than a fixed edit list, but it specifies the exact commands, a four-way classification with explicit criteria, and defines "no change" as a valid outcome — it does not defer a decision to the implementer's taste.

**Type consistency:** `inputClear`, `inputClearKey`, `inputPreventDefault`, `setInputPreventDefault`, `mouseEventToScreen`, `setGLEnable`, `audioMasterGain`, `clampSpeed`, `groundObject`, `applyAngularAcceleration`, and `getPaused` are each defined once and referenced consistently across Tasks 2-5, `engineExport.js`, and the Task 8 migration table. `SIZE_LIMIT`, `DEBUG_BUILD`, `USE_ROADROLLER`, and `ROADROLLER_EXTREME` are defined in Task 1's `build.js` and referenced by that name in Tasks 8 and 9.
