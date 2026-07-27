# LittleJS JS13K Branch Modernization — Design

**Date:** 2026-07-26
**Branch:** `js13k`
**Status:** Approved

## Problem

The `js13k` branch forked from `main` in September 2025 at engine version `1.11.8.2`. `main` is now
`1.13.1`, 380 commits ahead. The branch has drifted: some bug fixes and API renames from `main` never
made it over, the README gives no instructions for building or getting started, and the repo carries
stale artifacts (`dist/`, `FAQ.md`, `reference.md`) that describe an API this branch does not have.

This branch exists for other people to build JS13K games with. It should be small, correct, and
obvious to start using.

## Primary Goal: Portability to main LittleJS

Beyond being small and correct, this branch has a specific target: **someone should be able to build
a game here during the compo, then port it to regular LittleJS afterward with very few changes** —
few enough that an AI assistant can do the conversion from the documented differences alone.

This goal drives several decisions that would otherwise be judgment calls:

- Where an API name differs from `main` and matching it costs no bytes, match it. Renames are not
  churn; they are the deliverable.
- No back-compat aliases. Two names for one thing is the opposite of a clean migration story, and it
  costs bytes.
- The README's differences section is written as a **migration guide**, not a trivia table — for each
  divergence, what it is called here, what it is called in `main`, and what a port requires.
- It also means users can rely on the regular LittleJS documentation, which is why this branch does
  not need its own API reference.

The honest exception is tile collision. Everything else on the list is a rename or an absence; the
flat `tileCollision` array versus `main`'s `TileCollisionLayer` objects is a genuine structural
difference and the one area where a port takes real work. The migration guide says so plainly rather
than implying the whole surface is drop-in.

## Non-Goals

This branch is deliberately not a copy of `main`. `main` has expanded in ways that cost bytes, and
those expansions are exactly what this branch trades away. The following stay out:

- `TileCollisionLayer` / `CanvasLayer` / WebGL tile-layer rendering (`main`'s tile collision rework)
- Plugins (box2d, uiSystem, postProcess, newgrounds, zzfxm as a separate file)
- Generated JSDoc site
- `cameraAngle`, pointer lock, `mouseDelta` / `mouseDeltaScreen`
- Test framework

Existing js13k-specific divergences are size wins, not staleness, and are preserved:

- Flat `tileCollision` array (`initTileCollision` / `setTileCollisionData` / `getTileCollisionData`)
- `Music` and zzfxm inline in `engineAudio.js` (`main` moved these to a plugin)
- `glOverlay`, `medalDisplayIconSize`
- Aliases over wrappers, e.g. `const mouseIsDown = keyIsDown`

## Guardrails

**The byte budget is the acceptance test.** Baseline: `examples/starter/game.zip` = **7,555 bytes**
against the JS13K limit of 13,312. Each change group is measured and its delta reported. The default
build must not regress meaningfully.

**No new runtime or build dependencies.**

## Current State (verified)

Engine source divergence from `main`, measured as changed lines per file:

| File | Δ | Assessment |
|---|---|---|
| `engineUtilities.js` | 29 | **In sync.** Diff is comment-only. All vector rotation, random bias, `lerp`, `getPercent`, `floatSign`, `randBool` fixes already present. |
| `engineTileLayer.js` | 624 | Divergent by design (tile collision rework skipped). |
| `engineAudio.js` | 434 | Divergent by design (inline Music). |
| `engineDraw.js` | 299 | Mostly `main`'s `drawCanvas`/`drawContext` split, which belongs to the CanvasLayer rework. |
| `engineInput.js` | 241 | Renames plus skipped features (pointer lock, mouseDelta). |
| `engineSettings.js` | 188 | One rename plus skipped `cameraAngle`. |
| `engineObject.js` | 179 | One rename plus fixes. `restitution` rename already done. |
| `engineDebug.js` | 103 | Mostly `main`-side expansion. |
| `engineWebGL.js` | 106 | Mostly `main`-side expansion. |
| `engineParticles.js` | 54 | Two fixes. |
| `engine.js` | 45 | Mostly `main`-side expansion. |
| `engineMedals.js` | 11 | Minor. |

The build chain already works and is correct for the purpose: `src/*.js` → Closure Compiler ADVANCED
→ uglify → roadroller → inlined `<script>` → **ect** zip. This is better suited to JS13K than
`main`'s, which zips with `bestzip` and defaults roadroller off. The build system work is polish, not
replacement.

## Design

### 1. Engine catch-up

Take correctness fixes and API renames. Skip features.

**Renames** (straight renames, no back-compat aliases — aliases cost bytes and defeat the purpose):

| Old | New | File |
|---|---|---|
| `clearInput` | `inputClear` | `engineInput.js` |
| — | `inputClearKey` (new) | `engineInput.js` |
| `preventDefaultInput` | `inputPreventDefault` | `engineInput.js` |
| `mouseToScreen` | `mouseEventToScreen` | `engineInput.js` |
| `setGlEnable` | `setGLEnable` | `engineSettings.js` |
| `clampSpeedLinear` | `clampSpeed` | `engineObject.js` |

`inputPreventDefault` also flips its default from `false` to `true`. This is the fix behind `main`'s
`fix onkeydown should not call preventDefault` and `added inputPreventDefault to fix issues with html
menus` — it is a behavior change, not just a rename.

**Fixes to port:**

- `engineObject.js` — friction when on tile collision; constructor asserts
- `engineDraw.js` — multi-line text not centered vertically; tile layer should use padding setting
  for its tile info; `setBlendMode` default; `TileInfo.setFullImage`
- `engineParticles.js` — guard `lifetime <= 0`; `spawnRandomPoly` fix
- `engineTileLayer.js` — Firefox tile layer jitter; padding
- `engineDebug.js`, `engineWebGL.js`, `engineMedals.js`, `engine.js` — audit and take fixes only

Every candidate is verified against the current source before porting. Several `main` commits that
look like gaps are already present (`restitution`, lerp param order, vec2 gravity, gamepad stuck fix,
`floatSign`, async `engineInit`); those are confirmed and skipped rather than reapplied.

`engineVersion` becomes `1.13.1-js13k` so the lineage is legible from the source.

`src/engineExport.js` is updated to match the renamed API.

### 2. Build system

`examples/starter/build.js` keeps its current pipeline. Additions:

- **Size budget readout.** Print `game.zip: 7,555 / 13,312 bytes (56.8%) — 5,757 remaining`. Exit
  non-zero if over 13,312.
- **Restore the HTML head.** Emit `<!DOCTYPE html><head><title>…</title><meta charset=utf-8></head>`
  driven by a `PROGRAM_TITLE` constant. This branch currently emits a bare `<body>`; `main` has the
  full head.
- **Toggles at the top of the file:** `USE_ROADROLLER`, `ROADROLLER_EXTREME` (with its "takes over a
  minute" note), `DEBUG_BUILD`.
- **Debug dumps behind `DEBUG_BUILD`.** The `.closure.js` and `.uglify.js` intermediate copies are
  useful when a build breaks but clutter `build/` by default.
- **Error handling.** Wrap steps in try/catch, print which step failed, exit non-zero — so
  `build.bat`'s pause and any CI both fail loudly.

`src/engineBuild.js` is kept as opt-in via `npm run build:engine`, writing to a gitignored `dist/`.
It has no consumer on this branch (the starter compiles straight from `src/`), but it lets anyone
produce a minified `littlejs.js` or TypeScript definitions on demand without stale artifacts living
in the repo.

**New file: `serve.js`** — a static file server in ~25 lines using only `node:http`, `node:fs`, and
`node:path`, wired to `npm start`. This is genuinely needed, not convenience: opening `index.html`
over `file://` makes `tiles.png` cross-origin, and `gl.texImage2D` on a tainted image throws a
`SecurityError`, so the engine cannot start. Newcomers currently hit this with no explanation.

**`package.json`:** this is a template repo, not an npm package. Remove `main`, `types`, and
`exports`. Scripts become:

| Script | Action |
|---|---|
| `npm start` | `node serve.js` |
| `npm run build` | build the starter |
| `npm run build:engine` | `node src/engineBuild.js` → `dist/` |

### 3. Repo cleanup

**Delete:**

- `dist/` — stale since the last `src/` change; now gitignored and generated on demand
- `FAQ.md`, `reference.md` — both document `main`'s API, including functions this branch does not
  have. Wrong documentation is worse than none, and because the API is kept deliberately close to
  `main`, users are better served by the regular LittleJS docs plus the migration guide.

**Keep:**

- `package-lock.json` — for a template repo, pinned dependencies are a feature, not clutter

**Gitignore:** `dist/`, `.vscode/`

**`examples/starter/index.html`:** remove the `?1105` cache-buster query strings from all 12 script
tags. They are stale and confuse readers into thinking they matter.

### 4. README rewrite

This is the primary deliverable for "easy and clean for others to use." Current README has no build
instructions at all and five typos (`speficially`, `evoling`, `minigfing`, `compititons`,
`incuding`).

New structure:

1. **What this is and why it exists** — a size-optimized fork of LittleJS for JS13K, tracking `main`
   selectively rather than fully
2. **Quick start** — clone → `npm install` → `npm start` → edit `examples/starter/game.js` →
   `npm run build`
3. **How the size budget works** — what each pipeline stage does, what the readout means, where the
   bytes go
4. **How to disable features to save space** — WebGL, particles, medals, tile layers, touch gamepad.
   The current README promises this ("Individual features like WebGL can be disabled to save even
   more space") and documents it nowhere. Each entry lists the actual measured savings.
5. **Migrating to main LittleJS** — the section that carries the portability goal. Points users at
   the regular LittleJS docs as the API reference, then lists every divergence with what a port
   requires:
   - *Renames* — old name, new name, mechanical find-and-replace
   - *Absent features* — `cameraAngle`, pointer lock, `mouseDelta`, plugins; adding them back is
     additive, so a game that never used them ports cleanly
   - *Inline vs plugin* — `Music`/zzfxm lives in `engineAudio.js` here, in a plugin on `main`
   - *Tile collision* — flagged explicitly as the one structural difference requiring real work,
     with a sketch of what changes
   This section is written so an AI assistant handed the game source and this table can do the
   conversion.
6. **JS13K games built with it** — existing showcase list, typos fixed

## Verification

No test framework. The build chain is the test, which matches how `main` LittleJS is verified:

- `node --check` on every file in `src/`
- Closure Compiler ADVANCED at `--warning_level=VERBOSE` must stay clean — this is the real static
  check, and ADVANCED mode catches renaming and dead-code errors that would break only in the
  minified build
- Build completes and the zip is under 13,312 bytes
- Size delta reported per change group against the 7,555-byte baseline
- Manual browser verification of the starter, both unbuilt (via `npm start`) and from the built zip

The unbuilt and built paths must both be checked. They compile differently — the unbuilt path loads
`src/*.js` as separate script tags with debug code included; the built path runs everything through
Closure ADVANCED with `engineRelease.js` stubbing the debug functions. A break in one will not
necessarily show in the other.

## Risks

**Renames are breaking for anyone already using this branch.** Accepted deliberately: back-compat
aliases cost bytes, and the point of the renames is to match `main`'s documentation so users can
follow the existing tutorial. The README's differences table documents them.

~~**`inputPreventDefault` defaulting to `true` changes runtime behavior.**~~ Corrected during
planning: it does not. Today `preventDefaultInput` defaults to `false` and gates only the keydown
handler, while mousedown calls `preventDefault` unconditionally. After the change, keydown never
calls `preventDefault` (matching `main`) and mousedown is gated by a flag defaulting to `true` —
producing identical default behavior, with the flag now actually useful.

**Deleting `FAQ.md` and `reference.md` removes content some may link to.** They describe an API this
branch does not implement, so they actively mislead. The README's differences table replaces the part
that was ever accurate here.
