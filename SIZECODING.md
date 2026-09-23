# Size coding for JS13K

A reference for finding bytes in a game that has to fit in 13,312 zipped
bytes. It is written for an AI assistant working on a JS13K entry, most of
it with LittleJS in mind, though almost everything applies to any small
JavaScript build.

Every number here was measured on real entries with the pipelines in
section 2, as zip bytes unless stated. They are illustrations, not
constants: your game will differ, sometimes by sign. The shape of the
results is what transfers.

Compiled from size-coding work on JS13K entries by Frank Force.

The one rule everything else hangs off: **measure, never estimate.** A
design doc estimated an engine at ~5,800 bytes; it measured 2,251. A HUD
rewrite estimated at −100..−300 measured +772. Whole-feature cut estimates
ran 2–4x too high across the board. A throwaway build takes ten seconds
and is the only opinion that counts.

**If you need bytes right now**, the order that pays is: build settings
first (section 2, especially property mangling in 2.6), then whole
subsystems and features nothing else depends on (section 4), then data
and literals, and only then art. Do not start by shortening names —
section 5 is a list of things that look like savings and are not. Set up
a way to measure before you change anything (section 3).

---

## Contents

1. [Where the bytes actually are](#1-where-the-bytes-actually-are) — what a feature really costs
2. [The build pipeline](#2-the-build-pipeline) — the settings, where the big wins live
3. [Measurement discipline](#3-measurement-discipline) — how to get a number you can trust
4. [What pays, ranked by yield](#4-what-pays-ranked-by-yield)
5. [What does not pay](#5-what-does-not-pay-all-measured-all-rejected) — measured and rejected
6. [Gotchas](#6-gotchas) — the ways a smaller build breaks
7. [Estimate versus reality](#7-estimate-versus-reality)
8. [Checklist](#8-checklist)

---

## 1. Where the bytes actually are

Priced by patching each feature out, building, and reverting (the engine
figure by emptying function bodies until the program stopped running):

| thing | bytes |
|---|---|
| LittleJS engine floor (frame loop, canvas, input, audio context, maths) | 2,251 |
| the game itself | ~10,750 |
| a marker sprite | 121 |
| baked prop shadows | 119 |
| a confetti burst | 75 |
| a cinematic camera move | 45 |
| a per-level score table | 38 |
| arrowheads on a guide line | 21 |
| ground stripes | 15 |
| a rainbow trail | 11 |
| background props | 0 |
| **every visual feature together** | **~450** |

The lesson: **trimming art is poor value.** The engine and the build are
where the bytes are. One session that touched no game feature at all went
13,176 → 12,393 (−783), and 633 of that was three engine strips.

A fuller price list, from a different game on a 12,781 baseline. Nothing
here was cut; this is what a menu looks like on the day the budget is
needed, and it is worth building one for your own game before you need
it:

| feature | ZIP |
|---|---|
| a minimap (canvas polyline plus dots) | 164 |
| a background scenery generator (a district of buildings) | 96 |
| a large background fill | 95 |
| a landmark set piece | 82 |
| directional arrows along the route | 67 |
| a looping sound with pitch follow | 66 |
| distant background props | 64 |
| a results line that picks between three strings and reads a name | 64 |
| motion cues beside the play area | 62 |
| clouds | 60 |
| a death explosion | 55 |
| a hit burst | 51 |
| a shadow under the player | 50 |
| one extra detail pass on a model | 49 |
| one AI behaviour (seeking a target) | 47 |
| a win-condition checker | 38 |
| tunnel walls | 35 |
| stars | 24 |
| a sun halo | 23 |
| camera easing on a state change | 23 |
| lines painted on the ground | 23 |
| a field-of-view kick on a state change | 20 |
| a light strip along a wall | 16 |
| a marker line every 24 samples | 15 |
| a saved-best line on the title screen | 10 |
| a time readout line | 8 |

The shape matches the first table: **the scenery generators and the
minimap are the expensive things.** A line of text is cheap *unless it
carries logic* — the results line costs 64 because it chooses between
three strings and looks up a name, while the plain time readout is 8. Any
one visual flourish is 15–60, so cutting them one at a time to find a
hundred bytes is a bad trade against one generator.

---

## 2. The build pipeline

Concatenate → fold feature flags → strip engine code → minify → mangle
properties → roadroller (pinned) → HTML shell → zip → size gate.

Two pipelines are known to work. Pick one and stay on it, because prices
are not comparable across pipelines.

**Closure ADVANCED**, which renames properties by itself:

```
npx google-closure-compiler --js=in.js --js_output_file=out.js \
    --compilation_level=ADVANCED --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper
npx uglifyjs out.js -c -m --toplevel -o out.js
npx roadroller out.js -o out.js <PINNED ARGS>
ect -9 -strip -zip game.zip index.html
```

**Terser**, which does not rename properties unless told to (section 2.6),
and needs no Java. The allow-list is long enough that this one wants the
API or a config file rather than a command line:

```js
// terser options, then the same roadroller and ect steps as above
{
    toplevel: true,
    ecma: 2020,
    compress: {passes: 5, pure_getters: true},
    mangle: {properties: {regex: /^(pos|velocity|heading|…)$/, builtins: true}},
}
```

Versions that behaved as described: google-closure-compiler 20230502,
uglify-js 3.17, terser 5, roadroller 2.1, ect-bin 1.4.

Closure and Terser were priced head to head on one 13 KB game, same pinned
roadroller and zip, with Terser property mangling already on:

| pipeline | ZIP |
|---|---|
| Terser with property mangling | baseline |
| Closure only | +179 |
| Closure then Terser | +36 |
| Closure then Terser with property mangling | +55 |
| Terser then Closure | +360 |
| Terser then Closure then Terser | +26 |

Terser's property allow-list already takes the win Closure's renaming
gives, and Closure's output shape packs worse under roadroller parameters
tuned for Terser. A retune per variant might move each by ~20, not 179.
**Neither compiler is simply better. Do not switch pipelines late.**

### 2.1 Concatenation, before anything minifies

- strip every CR. Git checks out CRLF on Windows and LF elsewhere, so the
  same commit otherwise builds differently on different machines, and any
  pattern below that expects `\n` silently stops matching
- consider stripping `'use strict'`: Closure carries one into the release
  where it can cost ~17 bytes. **This does not always pay.** On one
  LittleJS starter it measured **+2**, because uglify had already
  collapsed every copy into one and roadroller models the remainder
  away. Measure it rather than assuming
- ORDER MATTERS to the compiler: moving one file earlier in the list cost
  +9. Load the file that calls `engineInit` last
- watch for files with no trailing newline; they break `[^\n]*\n` anchors

### 2.2 Feature flags → compile-time constants

An engine declares `let glEnable = true` with a setter so it can change at
runtime. A compiler cannot fold a mutable binding, so the whole subsystem
behind it survives even when nothing calls it. The build rewrites
`let flag = x` to `const flag = false` and empties the setter, and the
compiler deletes the branch.

Have each rewrite **assert that its pattern matched**, and fail the build
if not. A strip that silently stops applying is a slow leak.

In LittleJS, measured on the starter:

| flag folded off | saving | what goes |
|---|---:|---|
| `soundEnable` | 794 | all audio: ZzFX sounds, music, speech |
| `glEnable` | 792 | WebGL sprite batching, falls back to canvas 2D |
| `enablePhysicsSolver` | 488 | collision response, object and tile |
| `gamepadsEnable` | 247 | gamepad input |
| `touchInputEnable` | 152 | touch input and the on-screen gamepad |
| all five | **~2,500** | a silent keyboard-and-mouse game in canvas 2D |

That is about 19% of the budget. Query functions the game calls itself,
like a tile collision test, survive regardless, because the game
references them. `canvasPixelated` alone was −14 and a visual bug fix.

Note that a flag defaulting to `false` costs nothing already: the
compiler sees the initializer, sees that nothing writes it, and deletes
the block. Only flags that default to `true` need this treatment. And
setting one to `false` in your own code **costs** about 50 bytes instead
of saving any, because the binding stays mutable and you have added an
assignment. It has to happen in the build.

### 2.3 Strip colliding method names

A compiler keeps a class method alive if its NAME is used on ANY other
type. `add`, `scale`, `normalize`, `rotate`, `set`, `abs`, `floor` and
`toString` all collide with `Vector3`, `Math`, TypedArray and DOMMatrix.
A table of `{Class: [methods]}` that cuts those bodies out of the source
before the compiler sees them: **−135 for 17 methods**.

Only NAME-COLLIDING methods pay. Adding non-colliding ones measured 0; the
compiler already drops those.

Renaming YOUR class to free the engine's is the wrong direction: giving a
`Vector3` unique method names so the colliding `Vector2` bodies could go
measured **−2**, because the engine calls those `Vector2` methods itself
and they were never dead. Strip the engine's copies instead.

### 2.4 Strip engine code behind mutable state

Engine paths hanging off mutable state the game never touches (an
always-empty object list, an unset fixed canvas size, plugin hook arrays,
image-loading promises, `callback ||= ()=>{}` defaults) come out with
exact-match regexes: **−263**. Promise and DOM-property code compresses
badly, which is why this beats its estimate.

Where the cut can be made in the engine source instead, do that and delete
the regex.

### 2.5 Replace engine subsystems you use a sliver of

- the engine's `Sound` (panner, range, loop, stop, master gain) replaced
  by a 20-line zzfx player: **−235**
- its zzfx generator replaced by one with the same parameter positions and
  only the wave shapes actually used: **−51 and −45**, verified
  bit-identical by rendering every sound both ways
- HUD text moved off the engine's text path: **−106**
- HUD rectangles off the engine's sprite path: **−97** (six `drawRect`
  calls were keeping 4 KB of tile-drawing source alive)

### 2.6 Property mangling with Terser: the single largest knob

Closure ADVANCED renames properties on its own. Terser does not, and on a
41 KB minified source a game's own property names (`velocity`, `heading`,
`chargeLevel`, `previousPosition`, …) were the largest remaining cost:
**−456 bytes, 3.3% of the zip**, from one build option.

- use `mangle: {properties: {regex: /^(pos|velocity|…)$/}}` with an
  **explicit allow-list** of names the game defines. Never a blanket
  regex: Terser renames EVERY occurrence of a listed name, including
  `canvas.width`
- keep off the list anything you DO read off a DOM or built-in object:
  `width`, `height`, `length`, `buffer`, `value`, `state`, `set`,
  `multiply`, `rotate`, `scale` on DOMMatrix. One DOMMatrix `.scale()`
  call became `.scaleSelf()` so a vector class's `scale` could stay on
  the list
- then add `builtins: true`. Terser keeps its own list of DOM and
  built-in property names and refuses to mangle them even when your
  allow-list names them. On one game `float`, `heading`, `forward`,
  `right`, `normalize`, `speed`, `add`, `play`, `turn`, `seed`, `points`,
  `flags`, `pitch`, `transform`, `time`, `name`, `color`, `count`, `draw`
  and `dispose` were all shipping unmangled for this reason. The game
  read none of them off a DOM object: **−141 more**. This option only
  affects names already on your allow-list, so it is safe once the
  exclusions above are right, and dangerous if they are not
- build the list from the minified output: count `\.name` occurrences,
  drop the DOM and Math names, take what is left. Short names (`x`, `r`,
  `s`) gain nothing
- a property added later ships unmangled unless it is added to the list.
  Harmless, just longer

**The rule that follows from this: never name a game property `length`,
`width`, `height`, `buffer`, `multiply`, `set`, `state`, `value`, `loop`,
`code`, `key` or `body`.** Renaming them out of the way afterwards costs
+5 to +12 each, because the shared token was already modelled from its DOM
uses and the mangled letter is a new unique token. Name them `mag`, `w`,
`buf`, `mul` from the start and the allow-list takes them for free.

The dev page is never mangled, so only the packed page can show a name
collision. A release-page walk is not optional once this is on.

### 2.7 Roadroller: pin the parameters

Left to itself roadroller runs a randomised ~30-attempt search, so the
same source packs to a different size every build — a spread of 7 to 15
bytes, which is more than most single changes are worth. **Unpinned A/B
measurement is noise.** Pin the printed parameters.

- re-run the search only after the source has moved a lot (~1 min).
  Typical returns: −12 after 771 bytes of change, −21 after a 17% shrink,
  −29 after a day's work, and **0 or +2 just as often**. A retune is worth
  trying after a big move but it is not owed anything
- judge a retune by the ZIP, never by the number the search prints.
  `--optimize` minimises roadroller's own output, not the zip, and
  "better" retunes measured +2, +6, +10 on the zip. Always confirm a
  search by building with the parameters pinned: one search printed 13,303
  and built 13,308; another printed 13,313 and built 13,318
- `--optimize 2` bought 8–14 for a 6x slower build
- pinning itself is free. The first pinned search packed 7 bytes LARGER
  than the unpinned build it replaced, well inside the search's own spread

**A community fork goes further.** burntcustard's branch — a contextual
mixer on by default, an opt-in secondary symbol estimation (SSE) stage and
a zopfli-aware search — was worth **−443** on a 33 KB minified source. If
it has not landed upstream by the time you read this, it is
https://github.com/burntcustard/roadroller/pull/1 and can be vendored into
the project and imported in place of the published package:

| packer | ZIP | decode, headless | page heap |
|---|---|---|---|
| roadroller 2.1.0 | 13,333 | 2.3 s | 64 MB |
| fork, 150 MB, contextual mixer only | 13,038 | | |
| fork, 150 MB, SSE | 12,956 | | |
| fork, 150 MB, SSE, re-searched params | **12,890** | 5.2 s | 77 MB |
| fork, 500 MB, SSE | 12,928 | | |
| fork, 500 MB, SSE, re-searched | 12,864 | 5.0 s | **435 MB** |
| fork, 1000 MB, SSE | 12,918 | | |

**The memory budget is allocated in the PLAYER's browser at decode time.**
500 MB buys 26 bytes and leaves the page on a 435 MB heap, which is not a
trade worth making. SSE costs a bigger decoder (968 chars against 676) and
about twice the decode time. 150 MB with SSE is the sweet spot.

### 2.8 The HTML shell

Measured against a full doctype/head/title/body page: no `<title>` −22;
then no `<head>`, `</head>`, `</body>` a further −8 (−30 together — yet
dropping `<head>` on its own measured +3, so **these cuts are not
additive, measure the combination**); then no doctype −18 more.

The smallest shell that still works is `<body><script>…</script>`, with a
UTF-8 byte-order mark in front of it once the packed payload contains any
byte above ASCII, which it usually will.

- **`<body>` is required.** Without it the script runs with
  `document.body === null`
- **`</body>` is optional. `</script>` is NOT.** A script the parser
  reaches EOF inside is marked "already started" and never executed at
  all, so dropping those nine bytes builds a smaller zip that does
  nothing, and no test that loads the sources instead of the zip will tell
  you
- **no doctype means quirks mode.** Harmless if the engine sizes its
  canvas from `innerWidth`/`innerHeight`, which quirks mode does not
  change. If anything reads `document.documentElement.clientHeight`, that
  is no longer the viewport by spec but the html element's own box, which
  is empty on a page of absolutely positioned canvases. One browser
  honoured that and reported 1280x0 while another leniently returned the
  viewport, so the bug hid for days. In quirks mode size from
  `document.body.clientWidth/Height` instead
- **a BOM (3 bytes) can replace `<meta charset=utf-8>` for −11.** Browsers
  rank a BOM above every other encoding hint, so a packer's high bytes
  decode correctly over `file://` and http alike
- **the viewport meta is only for phones.** Without it a mobile browser
  lays the page out at 980px and scales the result down. A desktop-only
  game drops it: −40. A mobile game keeps it, with `initial-scale=1`, or
  old iOS loses the zoom on rotation
- **CSS belongs in JS, not a `<style>` tag.** Setting the body margin and
  background and the canvases' `position:absolute` from `gameInit` puts
  them inside the roadroller payload instead of leaving them to deflate:
  **−21** against the tag. Individual property sets beat one `cssText`
  string by 9; `innerHTML` of a style tag gained 2
- canvas centring: `inset:0;margin:auto` beat the
  `top:50%;left:50%;transform` idiom, by 19 on one game and 5 on another

Anything template-shaped (HTML, CSS) compresses worse than the JavaScript
that replaces it. That is the general form of the rule above — but it is
not universal: injecting a viewport meta from engine code instead of
writing it in the shell measured **+53 against +41**, because the raw tag
deflates fine while the injection adds a unique call shape to the payload.

### 2.9 The zip stage is already at its floor

- `ect -9 -strip` then optionally `advzip -4`
- `ect -10000` and `-100000` packed LARGER than `-9` (+92, +84 before
  advzip; +8 after). 200 zopfli iterations bought 2 over the default
- **the archive entry name must be `index.html`.** A shorter name saves
  about 8 and breaks the rules. Measure everything as `index.html`

### 2.10 Dev versus release

Everything debug lives behind `if (debug)`, with `debug` a compile-time 0
in the release build — in LittleJS, a separate `engineRelease.js` is
concatenated where the dev page loads `engineDebug.js`. Whole debug files
removed measured byte-identical, repeatedly. An EDIT inside one can still
move the zip by a few bytes, which is noise rather than cost (section 6).

---

## 3. Measurement discipline

- **Throwaway builds for everything.** Edit, build, read the zip, revert.
  Ten seconds. Nearly every estimate is wrong, usually by 2x, sometimes by
  sign.
- **Build a pricing harness early.** One script that concatenates the
  release source, applies one asserted transform per experiment (a regex
  or string replacement that throws if it does not match), runs the real
  minifier, the pinned packer and the zip, and prints
  `name / minified / zip / delta`. Twenty experiments priced in 40
  seconds. This is what makes "measure, never estimate" affordable enough
  to do for every cut, including the ones you keep.
- **The harness is not the build.** Its shell differs from the release
  shell, and its prices drift from real builds by several bytes. Price
  with the harness to choose what to try; confirm with a real build
  before committing. Cuts the harness priced at −9 to −14 came back as
  +1 in a real build.
- **Baseline first and last.** A moving tree (someone else's commit, a
  retune, an editor BOM) shows up only if you re-measure the baseline.
- **A price is only valid on the baseline it was measured on.** After
  property mangling, the same feature cuts re-priced 30–100% HIGHER:

  | feature | before mangling | after |
  |---|---|---|
  | a minimap | 146 | 188 |
  | a shadow under the player | 44 | 66 |
  | a looping sound with pitch follow | 28 | 61 |
  | three detail passes on one model | 68 | 88 |
  | light rings on scenery | 23 | 45 |
  | a shield glow | 21 | 37 |
  | lines painted on the ground | 26 | 39 |
  | one HUD text line | 57 | 46 |

  The long identifiers were context the compressor modelled the
  surrounding code against; once they were single letters each feature's
  unique code stood more alone. **Take the global transform first, then
  price the cuts you are unsure about.**
- **Batches are not sums.** Deleting related code (a kit and everything
  that drew it) is super-additive; deleting unrelated scraps is
  sub-additive by about a fifth:

  | batch | sum of parts | measured |
  |---|---|---|
  | four related features | ~478 | 517 |
  | six unrelated small cuts | ~432 | 350 |

  Measure the batch you intend to commit, not only its parts. A
  leave-one-out pass over one batch found four cuts that were neutral
  alone but COST bytes inside the batch.
- **Read the minified output.** Keep the post-minify intermediate and look
  at it. What survives there is what costs. Compilers inline every
  single-use function, so used-once helpers are free; the bytes are in
  unique expressions, dead fields, redundant maths and repeated property
  chains. The tell for engine dead weight is a function nothing in the
  game references. Beautifying the release with mangling OFF, so real
  names survive, is the fastest way to find output-identical cuts.
- **Price a feature by patching it out**, building, reverting. Price a
  subsystem by emptying function bodies — but watch reachability (emptying
  `gameInit` orphans the program and "saves" everything) and overlap
  (marginal costs sum above the total).
- **Measure both directions.** A feature "costing 222" was a stale number;
  when the code path was actually cut it measured 14, because a runtime
  call site kept the generator compiled in regardless.
- **Prove a refactor is byte-identical** by hashing the minified
  intermediate before and after. Comments never survive minification, so
  an identical hash after a comment pass proves no code changed. For
  output-identical claims, hash what the game actually produces: every
  level's geometry, every sound's samples, a fixed-length replay, frames
  as PNGs.
- **A smaller build is not a working build.** A −8 "win" was a dangling
  reference the tests caught. Run the tests after every measurement you
  intend to keep, and run them against what is actually on disk.
- **Release-only bugs exist.** A compiler renames DOM properties it has no
  extern for; `ctx.roundRect` became `ctx.ja` and threw every frame in the
  zip while the dev build was perfect. The dev build cannot show a broken
  strip, a bad rename or a mangling collision. **Drive the RELEASE page
  through every state in a headless browser with a console-error gate**,
  and write that walk before you need it.
- **Assert every scripted substitution matched.** A `sed` over a data
  table silently ate a trailing `, 1` and a level's terrain went NaN for
  several commits — tests asserting "never happens" pass vacuously on NaN.
  A `String.replace` that fails to match is silent. A table of four
  identical byte figures came from `\n` patterns not matching a CRLF file.
  A patch that stops at the first missing anchor leaves the source
  half-edited: either apply nothing on any miss, or check every anchor
  first. Grep for the result, or count matches, before believing a number.
- **Watch line endings and BOMs.** CRLF vs LF moves the zip and breaks
  multi-line anchors; PowerShell's `Set-Content -Encoding utf8` writes a
  BOM; editors add them to source files.
- **Attribute overages to the right commit.** One commit per change, with
  the byte delta and what it bought in the message. Two weeks later that
  ledger is the only thing that tells you what a feature costs.

---

## 4. What pays, ranked by yield

### Delete things (the big numbers)

1. **Engine subsystems** (section 2): hundreds of bytes each. Everything
   you never call that the compiler cannot prove dead.
2. **Whole features, screens and modes.** A second renderer −172 net while
   adding features; a debug camera −185; a sky effect −126; two code paths
   unified into one −166; a prediction solver −146. Deleting a results
   SCREEN cost less (−49) than the branches choosing between two versions
   of one screen had cost to add.
3. **Two builders of the same kind of thing.** One mesh builder, given a
   single extra parameter, could produce every shape a second builder
   existed for; deleting that second builder: **−125**. It was 40 lines
   and looked "small". **Unify builders before cutting art.**
4. **A line of UI text.** Deleting one prompt line: −20; a title screen's
   control hint: −54. Three separate times, deleting a line of text beat a
   week of micro-optimisation. Words themselves are almost free (they
   compress); LINES of unique text are not.
5. **Redundant inputs and controls.** Five duplicate keys: −35.
6. **Defensive state restoration, replaced by an assert.** An engine that
   stops reassigning `canvas.width` every frame, because assigning it
   reallocates the canvas and makes the browser rebuild the page, has to
   clear and reset the context by hand instead. Clearing both canvases
   cost 25; restoring the transform, blend mode and alpha cost **36
   more** — and that part only protected a game that left them set, since
   the engine pairs its own calls. **Delete the restore and assert the
   invariant instead.** Three `ASSERT`s at the end of the frame, one per
   piece of state, name whichever one was left set, and they cost zero
   because the release build drops asserts and their arguments whole
   (section 6). You get a louder failure than the silent repair gave you,
   for 36 bytes less. One catch: keep the whole check *inside* the ASSERT
   arguments. Wrapping the three in a `for` loop over the two contexts put
   the loop in live code and cost 15 bytes even though its body compiled
   away.

A kit's cost is in the builder, not its last user: deleting three of the
four things built from one welded kit measured 29, while deleting the kit
and the fourth measured 203.

### Give the compressor what it likes

Roadroller models byte sequences. A repeated token, phrase or call shape is
nearly free the second time; every new unique identifier, literal or shape
costs. Hence:

- **Delete data, factor repeated code SHAPE, but do not rename or unify
  values.** A generated loop beat a stored six-entry array by 22. A
  `panel()` helper replacing three open-coded rounded rects with their
  context boilerplate: −16. But a shared colour constant replacing two
  literals: +13. A named constant is a new unique token; a repeated
  literal is a repeated token.
- **Reuse a function you already have** rather than approximating it. A
  trajectory preview drawn by the real physics integrator cost 91; a
  fitted parabola for the same picture cost 115. Reusing an existing
  swept-path test for a second object: 24 against ~80 for a fresh one.
  Reusing an input routine to pose an intro: +12 against +52 hand-written.
- **A second call to a modelled phrase can be free or negative.** Adding
  one more sound call made the zip 4 SMALLER; removing a sound call once
  made it bigger. A call that repeats an existing call shape is free; the
  odd one out is what costs. Removing a sun disc measured 0, while its
  halo — a second glow call with different literals — was 33.
- **Thin wrappers that split a call shape cost you.** Removing a
  centred-text wrapper and merging its 9 sites into the 20 plain sites:
  −23. The same for two other wrappers (−15 and −5) even though every site
  then spelt out its own argument. Token unification beat text length
  every time.
- **Strings that carry COMPARISON code become integers.** State names as
  strings → ints: −24. Event codes chosen to EQUAL the surface codes they
  map to: −30. Pure data strings, by contrast, are nearly free either way.
- **Restructure a hot block rather than adding to it.** A guard added to a
  branch chain: +18 in all three spellings. The same logic as a ladder of
  ternaries: −4. When a small addition to a dense block measures badly,
  reshape the block.

### Data plumbing beats data

- placing a set piece at a fraction along the path instead of at a
  computed sample removed the bookkeeping from the generator: **−65** for
  ten numbers of data
- four table columns expressed as formulas of the level index: **−41**
- storing heights in hundreds, one fewer digit pair across fifty numbers:
  **−24**, about .5 per digit

### Literals

- **Precision is data.** A depth row `1.0002, 2.0002` → `1, 2`: −14 for
  four characters. Twelve colour components each losing a digit: −11
  (~0.85 per digit). Ten HUD literals rounded under a 10% visual change:
  −6. `.09`→`.1`, `2.8`→`3`, `.55`→`/2`: −20 in one pass. Round anything
  the eye cannot resolve.
- **A literal already in the model is cheaper than a new one.** Step 2→1:
  −7. An easing constant of `.2` cost +6 where `.4` cost +10 and `.25`
  +14, because `.2` already appeared elsewhere. The same digit count can
  differ: `5e5`→`7e5` −5; `1920,1080`→`1e4,1e4` −4.
- **Share a token rather than spell two values.** `.059*SCALE` and
  `.0233*SCALE` beat the flat `.18` and `.07` by 6.

### Flags for the compiler

- A `const FLAG = 0` around a feature lets the compiler delete all of it:
  a lens flare (114), music (67), slope arrows (199), a sparkle effect,
  sun rays. Better than commenting code out, and the feature stays one
  edit away.
- **Keep literals flowing through parameters, gate on `debug` at the READ
  sites.** Routing a literal through a global assigned inside a function
  (`mode = debug && x; gen(seed, mode)`) cost +96 because the compiler
  lost the literal-0 flow and compiled the whole generator back in. Gating
  the read sites instead was −57.
- `new Foo()` is a side effect the compiler keeps; `const s = FLAG && new
  Foo()` lets the flag remove it.

### Minifier knobs

Cheap to try, and nearly all of them are 0. The ones that paid, on
Terser: `ecma: 2020` −15, `passes: 5` over 3 −42, `pure_getters: true`
−7.

Everything else measured at or near 0, or lost: uglify `passes=2` +13;
Terser `reduce_funcs: false` +90, `unsafe_comps` +27, `sequences: false`
+6, the `unsafe_*` set together +126; `passes: 8`, `passes: 10`,
`hoist_funs`, `hoist_vars`, `hoist_props: false`, `inline: 3`, `module`,
`unsafe_proto`, `unsafe_methods`, `unsafe_undefined`, `mangle eval`,
`ecma: 2022` all 0. Closure type and language flags: identical. Dropping
unused engine files from the concatenation: 0–2, the compiler already
strips them.

**Code the minifier already drops is 0 to delete. Delete it anyway, for
the reader.** Unused top-level functions and consts and unread fields
cost nothing to remove either way — but Terser *keeps* unused class
methods (a dead `matrix()` method: 15) and top-level `new Color(...)`
constants nothing reads (34). Those it will not drop for you, so they are
worth real bytes.

---

## 5. What does not pay (all measured, all rejected)

- **Aliases.** `const sin = Math.sin` across 150 call sites: **+47**. The
  compressor already dedupes repeated tokens; an alias adds a unique one.
- **Hoisting into locals and named constants.** Two expressions hoisted
  out of a loop: +27. Shared HUD colour constants: +13. A condition
  hoisted into a flag with its guard flipped: +24. A `const` moved: +5. A
  global shared by two sites: +15. Precomputing `px = rx*w`: +8. The
  compiler already does common-subexpression elimination; you are adding a
  binding.
- **Inlining a constant is a coin flip:** −17 when the expression already
  existed elsewhere (it became a repeat), +14 when it did not (it became
  unique). Check which case you are in.
- **Helpers for two uses.** A local `tick()` for two identical calls: 0. A
  `camZoom(k)` for three ternaries: 0. `menuOn(i)`: +2. The compiler
  inlines the helper and you have gained nothing; sometimes the call shape
  loses.
- **Tables for a handful of calls.** Six `addColorStop` calls as a data
  table plus a loop: +22. Three localStorage keys merged into one object:
  +8. Repeated calls are repeated tokens; a table is unique data plus
  unique loop code.
- **`Math.abs(x)` vs `Math.max(x,-x)`:** +14 vs +1, because `Math.max(`
  was already a token run and `Math.abs(` was not. Check what exists.
- **Shortening words.** Three long option labels shortened to three short
  ones: +5. Rewording a hint: +3. Long words compress to nothing; they
  share context with each other and with the rest of the model. **Cut
  LINES, not letters.**
- **Renaming keys and names.** A localStorage prefix costs its length (a
  3-char prefix free, 4 chars +1, 5 chars +4, 9 chars +13), and the hope
  that an uppercase key shares context with an uppercase title string does
  not happen: case-different spellings share nothing. Rename ALL related
  keys together; renaming one of a set cost +3 by breaking the shared
  prefix. The CONTENT of a stored string costs nothing.
- **A new string versus swapping existing ones.** A new message: +16;
  rearranging two existing strings: −1.
- **Deriving instead of storing** when it is byte-neutral (an index from
  an array length): not worth the invariant it adds.
- **Generation code** costs more than it looks: three scenery generators
  measured +286 against an estimate of +120..170.
- **Removing a branch that leaves a literal behind.** Dropping an
  alternating tint every nine samples: **+8**.
- **Deleting source already folded out behind a compile-time flag: 0.**
  Delete it for clarity, not for bytes.
- **Object literals instead of constructors.** A sample class as an object
  literal: +29. The constructor's repeated `this.x = 0` lines were cheaper
  than one literal with nine unique keys.

**After property mangling, almost everything in this section gets worse.**
On one game, once `builtins` mangling was on, every rename, hoist,
literal-vs-class and loop-shape change measured within ±12 and usually the
wrong way. What is left at that point is the feature price list
(section 1): choices for the designer, not the compressor.

---

## 6. Gotchas

- **A compiler renames DOM API names it has no extern for.** With 2023
  externs, `ctx.roundRect` became `ctx.ja(...)`. Quote new APIs:
  `ctx['roundRect']`. Verify in the release output.
- **A dev constant left at 1 folds into the release.** A layout flag left
  at `1` produced a build 1,669 bytes UNDER budget, because the compiler
  took the title screen as unconditional and deleted the menu, HUD and
  score table as dead code. The dev build looked perfect. **Gate every
  read of a dev flag on `debug &&`.**
- **`+ (debug && x)` costs +4 per site.** The compiler folds it to `+ 0`
  and KEEPS the addition, since it cannot prove the operand is numeric.
  Drive debug input from a debug-side function that calls the game's own
  functions instead: free.
- **A dev-only constant placed before the file that defines its
  constructor.** `const RED = rgb(1,0,0)` at the top of a debug file threw
  before `rgb` existed, killed the rest of that file, and the test harness
  reported only a timeout because the page never reached the point where
  it registers errors. Every suite failed identically. **When everything
  fails at once, suspect load order before the change.**
- **A regex that produces valid but wrong syntax.** A defaults-stripping
  pattern turned `new Mesh([],[]).combine(` into `new Mesh.combine(`,
  which parses and constructs `Mesh.combine`. The minifier and the packer
  both built it happily and every browser suite timed out. A batch is only
  priced once the suites and a packed-page smoke test pass.
- **Tests that reference what you deleted.** Two tests used colour
  constants the game no longer defined. The build was smaller and the
  tests were wrong. Grep the tests for what you delete.
- **Deleting code can make the zip bigger until the packer is retuned**,
  and moving debug-only code shifted a build by 9 as pure noise. Know the
  noise floor before reading a small number.
- **An empty function still evaluates its arguments.** Compiling `ASSERT`
  and `LOG` down to `function ASSERT(){}` in the release does NOT stop
  `ASSERT(isValid(pos), 'message')` from calling `isValid` on every frame,
  because a call evaluates its arguments before it calls anything. A
  compiler removes the ones it can prove pure, and misses the rest: it
  cannot know `Array.prototype.includes` has no side effect, so
  `ASSERT(!this.children.includes(child))` shipped its linear scan and ran
  it on every add and remove. One engine found 425 such call sites still
  live in its release, showing up in the profile as its own validation
  helpers. **Rewrite the calls to `false&&ASSERT(...)` in the build**, so
  they are dead at parse time and the minifier drops them; count what you
  rewrote and fail the build if any call was left, because the ones that
  slip through are invisible and permanent. The LittleJS JS13K starter's
  build does this, so on that branch it is already handled. Check the
  blast radius before extending such a guard to every empty function: on
  that engine the debug draw calls were all inside `if (debugRaycast)`
  style blocks that already fold away, so guarding them too was byte
  identical, and a `false&&` in front of a function whose return value is
  used would change what the expression evaluates to.
- **Dead code is not quite free.** A debug-only edit that shipped nothing
  moved the zip +3: the post-minify output was the same size but one live
  statement was shaped differently (a comma became a semicolon), because
  inlining and sequence-joining decisions are made over the whole program
  before the dead part is dropped, and the packer packs the two shapes
  apart.
- **A flag set to 0 can leave crumbs.** One `MUSIC = 0` left 4 bytes
  behind after a rewrite. Grep the release output for names that must not
  survive, and for ones that must.
- **Concatenation order** changed the packed size (+9 one way,
  byte-identical the other). Fix the order and check the intermediate's
  hash.
- **Emojis and dashes.** An em dash is three UTF-8 bytes; replacing them
  with hyphens: −7. Emoji are fine INSIDE the packed payload (it escapes
  them) but keep an encoding declaration for the day one lands outside it.
- **Comments cost nothing.** Verified byte-identical three times. Trailing
  zero decimals and alignment are free too. Write the comment.

---

## 7. Estimate versus reality

| item | estimated | measured |
|---|---|---|
| engine floor | ~5,800 | 2,251 |
| HTML/CSS HUD rewrite | −100..−300 | +772 |
| three scenery generators | +120..170 | +286 |
| a per-pixel sparkle effect | small | +218 (vertex version +35) |
| every visual feature | "most of the game" | ~450 |
| keeping an alternate mode | 222 | 14 |
| an alias for `Math.sin` | negative | +47 |
| stripping `'use strict'` | −17 | +2 on another build |

Estimates were wrong in both directions and by more than the budget
margin. Build it, then decide.

---

## 8. Checklist

**At the start**

- Set up the pipeline in section 2 with a size gate that fails the build.
- Turn every engine feature flag you do not need into a compile-time
  constant; add a `debug` that is a compile-time 0 in the release.
- Turn on property mangling with an allow-list, early, before pricing
  anything you might cut (section 2.6).
- Never name a game property after a DOM property (section 2.6).
- Keep the minified intermediate readable and look at it early: what is
  the engine bringing that you do not call?
- Pin the packer as soon as the source is stable enough to A/B.
- Write the pricing harness and the release-page walk before you need
  them.

**Every change**

- Build. Put the byte delta and what it bought in the commit message. One
  commit per change.
- Run the tests, and drive the packed page. A smaller build that does not
  run is not a win.
- If a small change measures badly, try two more spellings before
  accepting it; the cheapest is often not the prettiest.

**When you are close to the limit**

- Re-price everything after any global transform: prices move 30–100%.
- Read the minified output for engine functions nothing references, then
  read the beautified release with mangling off for output-identical cuts.
- List features and PRICE them by patching out; you will be surprised
  which are cheap.
- Look for two builders of the same kind of thing and keep one.
- Look for lines of unique text to delete before touching pixels.
- Look for strings that carry comparison logic; make them integers.
- Round every literal the eye cannot resolve.
- Measure the batch you intend to commit, not the sum of its parts.
- Retune the packer once, at the end, and judge by the zip.

**Never**

- Alias `Math.*`, hoist for tidiness, or add helpers for two call sites
  without measuring.
- Trust a substitution you did not assert matched.
- Quote a byte figure from memory. Build it.
- Ship a mangled or stripped release the dev page never exercised: the dev
  build is not mangled, so only the packed page can show a collision.
