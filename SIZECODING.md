# Size coding for JS13K

What actually made a 13,312-byte game smaller, what did not, and how to
tell the difference. Every number here was measured on a real build of
SUNSHINE GOLF CLASSIC (JS13K 2026, LittleJS + a custom WebGL renderer) with
the pipeline in section 2. Numbers are zip bytes unless stated. Your game
will differ, but the shape of the results will not.

The build script the numbers came from is `game/build.mjs` in the game's
repository, https://github.com/KilledByAPixel/Golf13K — the feature-flag
folding, the strip tables, the pinned roadroller call and the HTML shell
described below are all in that one file, and the source it builds is
alongside it.

The one rule everything else hangs off: **measure, never estimate.** Our
design doc estimated the engine at ~5,800 bytes; it measured 2,251. A HUD
rewrite estimated at −100..−300 measured +772. Whole-feature cut estimates
were 2–4x too high across the board. A throwaway build takes ten seconds
and is the only opinion that counts.

---

## 1. Where the bytes actually are

Priced by patching each feature out, building, and reverting (the engine
figure by emptying function bodies until the program stopped running):

| thing | bytes |
|---|---|
| LittleJS engine floor (frame loop, canvas, input, audio context, maths) | 2,251 |
| the game itself | ~10,750 |
| pin marker | 121 |
| baked tree shadows | 119 |
| confetti | 75 |
| landing-preview camera | 45 |
| per-hole scorecard | 38 |
| putt arrowheads | 21 |
| mow stripes | 15 |
| rainbow trail | 11 |
| bushes | 0 |
| **every visual feature together** | **~450** |

The lesson: **trimming art is poor value.** The engine and the build were
where the bytes were. One session that touched no game feature at all went
13,176 → 12,393 (−783), and 633 of that was three engine strips.

---

## 2. The pipeline

Concatenate → fold feature flags → strip engine code → Closure ADVANCED →
UglifyJS → roadroller (pinned) → HTML shell → ect zip → size gate.

```
npx google-closure-compiler --js=in.js --js_output_file=out.js
    --compilation_level=ADVANCED --warning_level=VERBOSE --jscomp_off=* --assume_function_wrapper
npx uglifyjs out.js -c -m --toplevel -o out.js
npx roadroller out.js -o out.js <PINNED ARGS>      # e.g. -Zab31 -Zlr1064 -Zmc4 -Zmd10 -Zpr13 -S0,1,2,3,...
ect -9 -strip -zip ../game.zip index.html
```

Versions that behaved as described here: google-closure-compiler 20230502,
uglify-js 3.17, roadroller 2.1, ect-bin 1.4.

**Concatenation, before anything minifies:**
- strip every CR — git checks out CRLF on Windows and LF elsewhere, and that
  alone moves the packed size by a few bytes
- strip `'use strict'` — Closure carries one to the top of the release and
  it costs 17 bytes of zip; classes are strict regardless
- ORDER MATTERS to Closure: moving one file earlier in the list cost +9.
  Load the file that calls `engineInit` last

**Feature flags → compile-time constants.** An engine declares
`let glEnable = true` with a setter so it can change at runtime; Closure
cannot fold a mutable binding, so the whole subsystem behind it survives
even when nothing calls it. The build rewrites `let flag = x` to
`const flag = false` and empties the setter, and Closure deletes the branch.
Each rewrite asserts the pattern matched (webgl, gamepad, physics solver,
pixelated: all off this way; `canvasPixelated` alone was −14 and a visual
bug fix).

**STRIP_METHODS.** Closure keeps a class method alive if its NAME is used on
ANY other type — `add`, `scale`, `normalize`, `rotate`, `set`, `abs`,
`floor`, `toString` all collide with Vector3, Math, TypedArray, DOMMatrix.
A table of `{Class: [methods]}` cuts those bodies from the source before
Closure sees them: −135 for 17 methods. Only NAME-COLLIDING methods pay;
adding non-colliding ones to the table measured 0, Closure already drops
those.

**STRIP_CODE.** Engine paths that hang off MUTABLE STATE the game never
touches (an always-empty object list, an unset fixed canvas size, plugin
hook arrays, image-loading promises, `callback ||= ()=>{}` defaults) are
exact-match regexes with replacements: −263. Promise and DOM-property code
compresses badly, which is why this beat its estimate. Every pattern fails
the build if it stops matching, and you WANT that: a strip that silently
stops applying is a slow leak. Where the cut could be made in the engine
source instead, do that and delete the regex (six were retired that way).

**Replace engine subsystems you use a sliver of.** The engine's `Sound`
(panner, range, loop, stop, master gain) replaced by a 20-line zzfx player:
−235. Its zzfx generator replaced by one with the same parameter positions
and only the wave shapes actually used: −51 and −45, verified bit-identical
by rendering every sound both ways. HUD text moved off the engine's text
path: −106. HUD rectangles off the engine's sprite path (six `drawRect`
calls were keeping 4KB of tile-drawing source alive): −97.

**Roadroller args are PINNED.** Left to itself roadroller runs a randomised
~30-attempt search, so the same source packs to a different size every
build: a ~15-byte spread, which is more than most single changes are worth,
so unpinned A/B measurement is noise. Pin the printed parameters. Re-run the
search only after the source has moved a lot (~1 min; −12 after 771 bytes
of change, −20 across two retunes in a day). Judge a retune by the ZIP,
never by the number the search prints: `--optimize` minimises roadroller's
own output, not the zip, and "better" retunes measured +2, +6, +10 on the
zip. `--optimize 2` bought 8–14 for a 6x slower build.

**The HTML shell**, measured against a full doctype/head/title/body page:
no `<title>` −22; then no `<head>`, `</head>`, `</body>` a further −8
(−30 together — yet dropping `<head>` on its own had measured +3, so
**these cuts are not additive, measure the combination**); then no
doctype −18 more (quirks mode was already what the dev page ran in, so the
release now matches it). What ships (SP13KTRA, 2026-09-09):
`﻿<body><script>…` — a UTF-8 byte-order mark and no meta tags at all, and since
2026-09-11 no `<style>` either: the body margin and background and the canvases'
`position:absolute` are set from JS in gameInit, where they ride roadroller instead of
deflate (−21 against the tag; property sets beat one `cssText` string by 9, `innerHTML`
of a style tag gained 2, Frank's idea). The opening `<body>` is required (without it the script runs with
`document.body === null`); the closing tag is not. The viewport meta is only for
phones (a 980px layout shrunk); a desktop-only game drops it: −40. The BOM (3 bytes)
replaces `<meta charset=utf-8>` for another −11: browsers rank a BOM above every
other encoding hint, so roadroller's high bytes decode correctly from file:// and
http alike (verified by the packed smoke test). A mobile game keeps the viewport and
`initial-scale=1` (old iOS loses the zoom on rotation without it). Canvas centring: `inset:0;margin:auto` beat the
`top:50%;left:50%;transform` idiom by 19.

**Dev vs release.** Everything debug lives behind `if (debug)`, with `debug`
a compile-time 0 in the release build (a separate `engineRelease.js` is
concatenated where the dev page loads `engineDebug.js`). Verified byte-
identical builds with and without whole debug files, repeatedly. Two traps
are in section 6.

---

## 3. Measurement discipline

- **Throwaway builds for everything.** Edit, build, read the zip, revert.
  Ten seconds. Every estimate in this project's history was wrong, usually
  by 2x, sometimes by sign.
- **Baseline first and last.** A moving tree (someone else's commit, a
  retune, an editor BOM) shows up only if you re-measure the baseline.
- **Read the minified output.** Keep the post-uglify intermediate
  (`DEBUG_BUILD`) and look at it. What survives there is what costs.
  Closure inlines every single-use function, so used-once helpers are free;
  the bytes are in unique expressions, dead fields, redundant maths and
  repeated property chains. The tell for engine dead weight is a function
  nothing in the game references.
- **Price a feature by patching it out**, building, reverting. Price a
  subsystem by emptying function bodies — but watch reachability (emptying
  `gameInit` orphans the program and "saves" everything) and overlap
  (marginal costs sum above the total).
- **Measure both directions.** A feature "costing 222" was a stale number;
  when the code path was actually cut it measured 14, because a runtime
  call site kept the generator compiled in regardless.
- **Prove a refactor is byte-identical** by hashing the minified
  intermediate before and after. Comments never survive minification, so an
  identical hash after a comment pass proves no code changed.
- **A smaller build is not a working build.** A −8 "win" was a dangling
  reference the unit tests caught. Run the tests after every measurement
  you intend to keep.
- **Release-only bugs exist.** Closure ADVANCED renames DOM properties it
  has no extern for; `ctx.roundRect` became `ctx.ja` and threw every frame
  in the zip while the dev build was perfect. The dev build cannot show a
  broken strip or a bad rename. Drive the RELEASE page through every state
  in a headless browser with a console-error gate.
- **Assert every scripted substitution matched.** A `sed` over a data table
  silently ate a trailing `, 1` and one hole's terrain went NaN for several
  commits — tests asserting "never happens" pass vacuously on NaN. A
  `String.replace` that fails to match is silent. A table of four identical
  byte figures came from `\n` patterns not matching a CRLF file. Grep for
  the result, or count matches, before believing a number.
- **Watch line endings and BOMs.** CRLF vs LF moved the zip; PowerShell's
  `Set-Content -Encoding utf8` writes a BOM; an editor put one on a source
  file. The build strips CR for this reason.
- **Attribute overages to the right commit.** Measure per change, one
  commit per change, and put the number in the commit message with what it
  was for. Two weeks later that ledger is the only thing that tells you what a
  feature costs.

---

## 4. What pays, ranked by yield

### Delete things (the big numbers)
1. **Engine subsystems** (section 2): hundreds of bytes each. Everything
   you never call that Closure cannot prove dead.
2. **Whole features, screens and modes.** A second renderer −172 net while
   adding features; a debug camera −185; a sky effect −126; a putting-only
   code path unified with the full-shot path −166; a prediction solver
   −146. Deleting a results SCREEN cost less (−49) than the branches
   choosing between two versions of one screen had cost to add.
3. **A line of UI text.** Deleting one prompt line: −20. Three separate
   times, deleting a line of text beat a week of micro-optimisation. Words
   themselves are almost free (they compress); LINES of unique text are not.
4. **Redundant inputs and controls.** Five duplicate keys: −35.

### Give the compressor what it likes
Roadroller models byte sequences. A repeated token, phrase or call shape is
nearly free the second time; every new unique identifier, literal or shape
costs. Hence:
- **Delete data, factor repeated code SHAPE, but do not rename or unify
  values.** A generated loop beat a stored six-entry array by 22. A
  `panel()` helper replacing three open-coded rounded rects with their
  context boilerplate: −16. But a shared colour constant replacing two
  literals: +13. A named constant is a new unique token; a repeated literal
  is a repeated token.
- **Reuse a function you already have** rather than approximating it. The
  aim arc drawn by the real flight integrator cost 91; a fitted parabola
  for the same picture cost 115. Reusing the cup's swept-path test for the
  flagstick: 24 vs ~80 for a fresh one. Reusing the aim-entry routine for
  the intro's end pose: +12 vs +52 hand-written.
- **A second call to a modelled phrase can be free or negative.** Adding
  one more `sfxBounce(g.s, …)` call made the zip 4 SMALLER; removing a sound
  call once made it bigger. Do not assume "less code, fewer bytes".
- **Thin wrappers that split a call shape cost you.** Removing a `txtC`
  wrapper and merging its 9 sites into the 20 plain `txt` sites: −23. The
  same for a strip wrapper (−15) and an octahedron wrapper (−5) even though
  every site then spelt out its own argument. Token unification beat text
  length every time.
- **Strings that carry COMPARISON code become integers.** Meter phase
  names `'swing'/'power'/'cancel'` → ints: −24. Shot-end events → ints
  chosen to EQUAL the surface codes they map to: −30. Pure data strings, by
  contrast, are nearly free either way.
- **Restructure a hot block rather than adding to it.** A guard added to a
  branch chain: +18 in all three spellings. The same logic as a ladder of
  ternaries: −4. When a small addition to a dense block measures badly,
  reshape the block.

### Literals
- **Precision is data.** A depth row `1.0002, 2.0002` → `1, 2`: −14 for
  four characters. Twelve colour components each losing a digit: −11
  (~0.85 per digit). Ten HUD literals rounded under a 10% visual change:
  −6. `.09`→`.1`, `2.8`→`3`, `.55`→`/2`: −20 in one pass. Round anything
  the eye cannot resolve.
- **A literal already in the model is cheaper than a new one.** Step 2→1:
  −7. An easing constant of `.2` cost +6 where `.4` cost +10 and `.25` +14,
  because `.2` already appeared elsewhere. The same digit count can differ:
  `5e5`→`7e5` −5; `1920,1080`→`1e4,1e4` −4.
- **Share a token rather than spell two values.** `.059*SCALE` and
  `.0233*SCALE` beat the flat `.18` and `.07` by 6. Named constants kept
  beating fresh literals when the constant's token already recurs.

### Flags for Closure
- A `const FLAG = 0` around a feature lets Closure delete all of it: a lens
  flare (114), music (67), slope arrows (199), water sparkle, sun rays.
  Better than commenting code out, and the feature stays one edit away.
- **Keep literals flowing through parameters, gate on `debug` at the READ
  sites.** Routing a literal through a global assigned inside a function
  (`mode = debug && x; gen(seed, mode)`) cost +96 because Closure lost the
  literal-0 flow and compiled the whole generator back in. Gating the read
  sites instead was −57.
- `new Foo()` is a side effect Closure keeps; `const s = FLAG && new Foo()`
  lets the flag remove it.

### Build knobs
- **Retune roadroller after a large move**, judge by the zip (section 2).
- Everything else measured ~0: uglify `passes=2` (+13), Closure type and
  language flags (identical), ect above `-9` (0 or 1), dropping unused
  engine files from the concatenation (0–2, Closure already strips them),
  more non-colliding methods in the strip table (0).

---

## 5. What does not pay (all measured, all rejected)

- **Aliases.** `const sin = Math.sin` across 150 call sites: **+47**. The
  compressor already dedupes repeated tokens; an alias adds a unique one.
- **Hoisting into locals and named constants.** Two expressions hoisted
  out of a loop: +27. Shared HUD colour constants: +13. A condition hoisted
  into `aiming` with its guard flipped: +24. A `const` moved: +5. A global
  shared by two sites: +15. Precomputing `px = rx*w`: +8. Closure already
  does common-subexpression elimination; you are adding a binding.
- **Inlining a constant is a coin flip:** −17 when the expression already
  existed elsewhere (it became a repeat), +14 when it did not (it became
  unique). Check which case you are in.
- **Helpers for two uses.** A local `tick()` for two identical calls: 0.
  A `camZoom(k)` for three ternaries: 0. `menuOn(i)`: +2. Closure inlines
  the helper and you have gained nothing; sometimes the call shape loses.
- **Tables for a handful of calls.** Six `addColorStop` calls as a data
  table plus a loop: +22. Three localStorage keys merged into one object:
  +8. Repeated calls are repeated tokens; a table is unique data plus
  unique loop code.
- **`Math.abs(x)` vs `Math.max(x,-x)`:** +14 vs +1, because `Math.max(`
  was already a token run and `Math.abs(` was not. Check what exists.
- **Renaming YOUR class to free the engine's.** Giving `Vector3` unique
  method names (`plus`/`minus`/`unit`/`cross3`) so Closure could drop the
  colliding `Vector2` bodies: **−2**. The engine calls those `Vector2`
  methods itself, so they were never dead. Strip the engine's copies from
  the source instead (STRIP_METHODS above, −135); renaming your own class
  only pays when the engine truly never calls the collider.
- **Shortening words.** `BACKSPIN/NO SPIN/TOPSPIN` → `BACK/NONE/TOP`: +5.
  Long words compress to nothing; they share context with each other and
  with the rest of the model. Cut LINES, not letters.
- **Renaming keys and names.** A localStorage prefix costs its length
  (`sg_` free, `sgc_` +1, `GOLF_` +4, `SUNSHINE_` +13) and the hope that an
  uppercase key would share context with an uppercase title string does
  not happen: case-different spellings share nothing. Rename ALL related
  keys together; renaming one of a set cost +3 by breaking the shared
  prefix. The CONTENT of a stored string costs nothing.
- **A new string versus swapping existing ones.** A new `GREAT!` message:
  +16; rearranging two existing strings: −1.
- **Deriving instead of storing** when it is byte-neutral (a hole index
  from an array length): not worth the invariant it adds.
- **Generation code** costs more than it looks: forests, bushes and shadows
  measured +286 against an estimate of +120..170. Anything template-shaped
  (HTML, CSS) compresses worse than the drawing code that replaces it.

---

## 6. Gotchas that bit us

- **Closure renames DOM API names it has no extern for.** With 2023
  externs, `ctx.roundRect` became `ctx.ja(...)`. Quote new APIs:
  `ctx['roundRect']`. Verify in the release output, and run the release
  page under a console-error gate.
- **A dev constant left at 1 folds into the release.** A thumbnail-layout
  flag left at `1` produced a build 1,669 bytes UNDER budget: Closure took the title
  screen as unconditional and deleted the menu, HUD and scorecard as dead
  code. The dev build looked perfect. Gate every read of a dev flag on
  `debug &&`.
- **`+ (debug && x)` costs +4 per site.** Closure folds it to `+ 0` and
  KEEPS the addition, since it cannot prove the operand is numeric. Drive
  debug input from a debug-side function that calls the game's own
  functions: free.
- **Deleting code can make the zip bigger until roadroller is retuned**,
  and moving debug-only code shifted a build by 9 as pure noise. Know the
  noise floor before reading a small number.
- **A flag set to 0 can leave crumbs.** `MUSIC = 0` left 4 bytes behind
  after a rewrite. Grep the release output for names that must not survive
  (and for ones that must).
- **Concatenation order** changed the packed size (+9 one way, byte-
  identical the other). Fix the order and check the intermediate's hash.
- **Emojis and dashes.** An em dash is three UTF-8 bytes; hyphens: −7.
  Emoji are fine INSIDE the roadroller payload (it escapes them) but keep
  the charset meta for the day one lands outside it.
- **The zip entry name** must be `index.html` (a shorter name saves 8 and
  breaks the rule).
- **Comments cost nothing.** Verified byte-identical builds three times.
  Trailing-zero decimals and alignment are free too. Write the comment.

---

## 7. Estimate versus reality

| item | estimated | measured |
|---|---|---|
| engine floor | ~5,800 | 2,251 |
| HTML/CSS HUD rewrite | −100..−300 | +772 |
| forests + bushes + shadows | +120..170 | +286 |
| per-pixel water sparkle | small | +218 (vertex version +35) |
| every visual feature | "most of the game" | ~450 |
| keeping the remix mode | 222 | 14 |
| an alias for Math.sin | negative | +47 |

Estimates were wrong in both directions and by more than the budget
margin. Build it, then decide.

---

## 8. Checklist for the next game

**At the start**
- Set up the pipeline in section 2 with the size gate failing the build.
- Turn every engine feature flag you do not need into a compile-time
  constant; add a `debug` that is a compile-time 0 in the release.
- Keep the minified intermediate readable (`DEBUG_BUILD`) and look at it
  early: what is the engine bringing that you do not call?
- Pin roadroller as soon as the source is stable enough to A/B.
- Write the release-page walk (headless browser, console-error gate,
  every state) before you need it.

**Every change**
- Build. Put the byte delta and what it bought in the commit message. One
  commit per change.
- Run the tests. A smaller build that does not run is not a win.
- If a small change measures badly, try two more spellings before
  accepting it; the cheapest is often not the prettiest.

**When you are close to the limit**
- Read the minified output for engine functions nothing references.
- List features and PRICE them by patching out; you will be surprised
  which are cheap.
- Look for lines of unique text to delete before touching pixels.
- Look for strings that carry comparison logic; make them integers.
- Round every literal the eye cannot resolve.
- Retune roadroller once, at the end, and judge by the zip.
- If the minifier is Terser, mangle your own property names through an
  allow-list (section 9): it was the single largest win of the second game.
- Re-price after any global transform (mangling, a retune, a big delete):
  every remaining feature's price moved by 30-100% (section 9).
- Look for two builders of the same kind of thing (two mesh builders, two
  text paths, two placement loops) and keep one, even when the second is
  small.

**Never**
- Alias `Math.*`, hoist for tidiness, or add helpers for two call sites
  without measuring.
- Trust a substitution you did not assert matched.
- Quote a byte figure from memory. Build it.
- Ship a mangled release the dev page never exercised: the dev build is
  not mangled, so only the packed page can show a DOM name collision.

---

## 9. Second game: SP13KTRA, a 3D racer (measured September 2026)

Same limit, a different engine: a custom WebGL2 renderer with persistent
meshes, a ten-circuit world built at load, eight AI craft, items, a power
slide. Pipeline: concat → Terser (`toplevel`, `passes: 5`, `ecma: 2020`,
`unsafe*`, property mangling) → Roadroller (pinned) → bare shell → ect →
size gate. No Closure (no Java on the machine). Start of the pass: 14,971.
End: 13,160. Every figure below is a ZIP delta from a throwaway build with
pinned Roadroller parameters, so a 3-byte delta is real.

### The pass, in order

| commit | what | ZIP |
|---|---|---|
| start | the game as built | 14,971 |
| pipeline | pinned Roadroller, ect for the zip, bare shell (no doctype/head/title/closing tags), CR and `'use strict'` stripped | 14,909 |
| free source cuts | unused colour constants 34, old-save migration 32, minimap point cache 26, frame-time smoothing 18, dev reroll gated on `debug` 42, `passes: 5` 42, dead fields | 14,681 |
| features | lens flare + occlusion query 180, arch kit 203, pad arrows 55, slide sparks | 14,164 |
| **property mangling** | allow-list of the game's own names | **13,698** |
| data + small cuts | ladder columns as formulas 41, heights in hundreds 24, landmark by lap fraction 65, HUD lines, drift tick 66, hull stripe and block | 13,348 |
| knobs | Roadroller retune 21, `ecma: 2020` 15 | 13,311 |
| one builder | the loft makes the cube and prism, second builder deleted 125 | 13,160 |

### Property mangling with Terser: −456

Closure ADVANCED renames properties by itself. Terser does not, and on a
41 KB minified source the game's own property names (`velocity`, `heading`,
`driftCharge`, `previousPosition`, …) were the largest remaining cost:
**−456 bytes, 3.3% of the zip**, from one build option. The recipe:

- `mangle: {properties: {regex: /^(pos|velocity|…)$/}}` with an explicit
  allow-list of names the game defines. Never a blanket regex: Terser renames
  EVERY occurrence of a listed name, including `canvas.width`.
- Exclude anything also read off a DOM or built-in object: `width`, `height`,
  `length`, `buffer`, `value`, `state`, `set`, `multiply`, `rotate`, `scale`
  on DOMMatrix. One DOMMatrix `.scale()` call became `.scaleSelf()` so the
  vector class's `scale` could stay on the list.
- Build the property list from the minified output: count `\.name`
  occurrences and take everything that is yours. Short names (`x`, `r`,
  `s`) gain nothing.
- A new property added later ships unmangled unless it is added to the list.
  Harmless, just longer. Write the rule where the next person edits.
- The dev page is never mangled. Only the packed page can show a collision,
  so the release-page walk is not optional once this is on.

### Feature prices, before and after mangling

The same cut, priced on the unmangled build and again after mangling:

| feature | before | after |
|---|---|---|
| minimap (canvas polyline + dots) | 146 | 188 |
| craft shadow (flattened hull, second draw) | 44 | 66 |
| engine sound (loop + pitch follow) | 28 | 61 |
| canopy + stripe + engine block on the hull | 68 | 88 |
| skyline lamp rings | 23 | 45 |
| shield glow | 21 | 37 |
| lane lines | 26 | 39 |
| nozzle glows | 25 | 34 |
| wall light rail | 14 | 28 |
| item name text (one HUD line) | 57 | 46 |

Prices rose 30-100% after mangling. The long identifiers were context the
compressor was modelling the surrounding code against; once they were
single letters, each feature's unique code stood more alone. Two lessons:
**a price is only valid on the baseline it was measured on**, and the
ordering matters — take the global transform first, then price the cuts
you are unsure about.

### Batches are not sums

| batch | sum of the parts | measured |
|---|---|---|
| lens flare + arch kit + pad arrows + sparks | ~478 | 517 |
| ladder formulas + heights + landmark + HUD + audio + hull details | ~432 | 350 |

Deleting related code (a kit and everything that drew it) was
super-additive; deleting unrelated scraps was sub-additive by a fifth.
Measure the batch you intend to commit, not only its parts.

### What paid, new to this game

- **One shape builder.** A loft (diamond sections along z) already built
  the craft hulls; teaching it a fifth station value (side height: .5 =
  diamond, 0 = triangle) let it make the cube (diamond turned 45 degrees)
  and the prism too, and the separate extrude builder went: **−125**. The
  second builder was 40 lines and "small". Unify builders before cutting art.
- **Data plumbing over data.** Placing the landmark at a lap fraction
  instead of at a computed corner sample removed the corner bookkeeping
  from the generator: **−65** for ten numbers of data. Four ladder columns
  (bank, rival skill, pad spacing, item rows) as formulas of the circuit
  index: **−41**. Storing heights in hundreds (one fewer digit pair on
  fifty numbers): **−24**, about .5 per digit, in line with section 4.
- **A kit's cost is in the builder, not the last user.** On the unmangled
  build, deleting the gates, pylons and shards but keeping the chevron on
  the same welded kit measured 29; deleting the kit with the chevron
  measured 203. The
  replacement warning (an emissive band painted on the road at build time,
  one line in the road builder) cost about 15.
- **Sounds are not free.** One ZzFX definition plus its trigger logic, on
  the mangled build: drift tick 66, engine loop 61. Cheaper than a feature, dearer than a line
  of text.
- **`ecma: 2020` −15, `passes: 5` over 3 −42.** `unsafe_methods` +
  `hoist_funs` + `unsafe_comps` + `unsafe_proto`: **+126**. `sequences:
  false` +6. `module`, `inline: 3`, `reduce_funcs`: 0.
- **Retune Roadroller after a 17% source shrink: −21** in 90 seconds.
  Pinning itself cost nothing: the first search packed 7 bytes LARGER than
  the unpinned build it replaced, well inside the search's own spread.
- **Terser keeps unused class methods** (a dead `matrix()` method: 15)
  and top-level `new Color(...)`/`vec3()` constants nothing reads (34).
  Delete them; the minifier will not.

### What did not pay here

- Deleting the gamepad and touch source: **0**. They were already folded
  out behind a compile-time flag. Delete it for clarity, not for bytes.
- The sun disc: **0** to remove, while its halo (a second glow call with
  different literals) was 33. A call that repeats an existing call shape
  is free; the odd one out is what costs (section 4, confirmed).
- Shortening the title's control hint from four phrases to one: −4.
  Rewording it: +3. Words are free; the line is not, and only deleting the
  whole line (54) pays.
- Removing the alternating road tint every nine samples: **+8**. The
  branch it removed was cheaper than the literal it left behind.

### Gotchas, second set

- **A dev-only constant placed before the file that defines its
  constructor.** `const RED = rgb(1,0,0)` at the top of the debug file threw
  before `rgb` existed, killed the rest of that file, and the test harness
  reported only a timeout because the page never reached the point where
  it registers errors. Every suite failed identically. When everything
  fails at once, suspect load order before the change.
- **A test that used a deleted constant.** Two tests referenced colour
  constants the game no longer defined. The build was smaller and the
  tests were wrong. Grep the tests for what you delete.
- **A patch that stops at the first missing anchor** leaves the source
  half-edited. Either apply nothing on any miss or check every anchor
  first; then run the suites on what is actually on disk.
- **Files without a trailing newline** break `[^\n]*\n` patterns. The
  last sound in the sound list had no newline after it.
- **CRLF checkouts** move the packed size by a few bytes and break
  multi-line string anchors; normalise line endings before matching and in
  the build.
- **The optimiser's own number is not the zip.** Roadroller's search
  prints its packed length; judge a retune by the ZIP after ect.

### A pricing harness that made this fast

One script, run through the serial test runner: concatenate the release
source, apply one asserted transform per experiment (a regex or string
replacement that throws if it does not match), Terser with the shipped
options, Roadroller with the pinned parameters, the bare shell, ect, print
`name / minified / zip / delta`. Twenty experiments priced in 40 seconds.
Batching experiments in one run is what made "measure, never estimate"
affordable enough to do for every cut, including the ones kept.

## 10. SP13KTRA, the night pass of 2026-09-11

Baseline 12,929 after two days of feature work (a field of eight, arrows, an
infield, a death explosion). Every number is a ZIP delta from the pricing harness
(`local/measure.js`, pinned Roadroller, ect); the shipped build confirms the total.

### The win: `mangle.properties.builtins` −141

Terser keeps its own list of DOM and built-in property names and refuses to
mangle any of them, EVEN when your allow-list names them. Reading the minified
output showed `float` (46 uses), `heading` 27, `forward` 22, `right` 19,
`normalize` 18, `speed` 16, `add` 12, `play` 12, `turn`, `seed`, `points`,
`flags`, `pitch`, `upload`, `transform`, `time`, `name`, `color`, `count`,
`draw`, `dispose` all shipping unmangled: `float` is a CSS property,
`add` is `DOMTokenList.add`, `right` is `DOMRect.right`, `play` is media,
`normalize` is `String.prototype.normalize`. The game reads none of those off a
DOM object, so `properties: {regex, builtins: true}` mangles them: **−141**, 1.1% of
the zip, one option. The allow-list rule still stands (never list a name you DO
read off a DOM object), and the packed page must be driven after the change:
the dev page is never mangled, so only `smoke:--dist` can show a collision.

How to find yours: count `\.name` occurrences in the minified output, drop the
DOM and Math names, and look at what is left.

### Closure ADVANCED: does not beat Terser here

Golf's pipeline (section 2) runs Closure ADVANCED. Golf's `node_modules` carries
the native Windows compiler, so no Java is needed, and it was priced on this
game against the shipped Terser pipeline, same pinned Roadroller and ect:

| pipeline | ZIP |
|---|---|
| Terser (shipped) | 12,929 |
| Closure only | +179 |
| Closure then Terser | +36 |
| Closure then Terser with property mangling | +55 |
| Terser then Closure | +360 |
| Terser then Closure then Terser | +26 |

Terser's property allow-list already takes the win Closure's renaming gave golf,
and Closure's output shape packs worse under Roadroller parameters tuned for
Terser. A retune per variant might move each by ~20, not 179. Not pursued.

### Terser knobs, measured on this source

`pure_getters: true` **−7** (kept). `reduce_funcs: false` +90, `unsafe_comps`
+27, `passes: 3` +4; `passes: 8`, `unsafe_proto`, `unsafe_methods`,
`hoist_props: false`, `inline: 3`, `unsafe_undefined`, `module`, `ecma: 2022`
all 0. The shipped options were already at the floor.

### Roadroller retune: 0

`build-full:--search` after ~1,500 bytes of source change proposed new
parameters that packed **+2** on the ZIP. The 2026-09-08 pins stay. A retune
is worth trying after a big move but it is not owed anything.

### Small trims, priced one by one then together

| trim | ZIP |
|---|---|
| ZzFX saw wave (no sound uses shape 2) | −13 |
| ZzFX modulation (no sound uses it) | −14 |
| `soundEnable` guards (never cleared) | 0 |
| a dead `roll` parameter on the road profile | −7 |
| `glSetCapability` inlined (two callers left after culling went) | −15 |
| the five together | −45 |
| minimap point cache as a local instead of a global | −7 |
| `pushGradient` inlined into its one caller | 0 |
| the camera boom vec3 as a scalar | +1 |

Dead code the minifier already drops (unused top-level functions and consts:
`movementDistance`, `pushSprite`, `glPolygonOffset`, `isOverlapping`, `shuffle`,
`noise1D`) is 0 to delete; delete it for the reader, not the zip.

### The menu: what each feature costs today (12,781 baseline)

Priced by patching each out. Nothing here was cut; it is the price list for the
day the budget is needed. Related cuts are super-additive, unrelated ones
sub-additive (section 9): measure the batch.

| feature | ZIP |
|---|---|
| minimap | 164 |
| mid-field districts | 96 |
| infield fill | 95 |
| landmark | 82 |
| corner arrows | 67 |
| engine sound (loop + pitch follow) | 66 |
| far giants | 64 |
| results "NEXT / AGAIN / GRAND PRIX COMPLETE" line | 64 |
| speed cues beside the road | 62 |
| clouds | 60 |
| death explosion | 55 |
| hit burst | 51 |
| craft shadow | 50 |
| canopy | 49 |
| pad-seeking AI | 47 |
| finish checker | 38 |
| tunnel walls | 35 |
| stars | 24 |
| sun halo | 23 |
| camera boom easing on boost | 23 |
| lane lines | 23 |
| boost lens widening | 20 |
| wall light rail | 16 |
| cross line every 24 samples | 15 |
| title best-time line | 10 |
| results time line | 8 |

The shape of it matches section 1: the scenery generators and the minimap are
the expensive things; a line of text is cheap unless it carries logic (the
results line chooses between three strings and reads the next circuit's name:
64); any single visual flourish is 15–60.

### Renaming your own colliding names: +5 to +12 each

After `builtins`, the names still shipping unmangled were the ones the game
shares with the DOM for real: `length` (`Vector3.length()` beside array
`.length`), `width` (track samples beside the canvas), `buffer` (the mesh's
beside `AudioBuffer`), `set` (the timer's beside `TypedArray.set`). Renaming
ours out of the way so the allow-list could take them (`len`, `hw`, `vbo`,
`at`) measured **+12, +10, +5, +12**, and all four together 0. The shared
token was already modelled from its DOM uses; the mangled letter is a new
unique token. Section 4 again: do not rename or unify values. Adding `name`,
`count` and `get` to the list: −1.

### Structure and the zip stage: 0

A per-sample `heading` instead of the cumulative heading array: +4. The route
sample class as an object literal: +29 (the constructor's repeated `this.x = 0`
lines were cheaper than one literal with nine unique keys). Both together −1.
On the built page, `ect -10000` and `-100000` packed LARGER than `-9` (+92,
+84 before advzip; +8 after), and 200 zopfli iterations bought 2 over the
default. The zip stage is at its floor; `ect -9` then `advzip -4` stays.

The lesson of the night: after property mangling with `builtins`, every
rename, hoist, literal-vs-class or loop-shape change measured within ±12 and
usually the wrong way. What is left is the menu above: features, chosen by
the designer, not the compressor.

## 11. The roadroller fork (2026-09-11): −443

A js13k contestant's roadroller branch (burntcustard, PR #1 on their fork: a contextual
mixer on by default, an opt-in secondary symbol estimation stage, and a zopfli-aware
search) is vendored in `tools/roadroller/` and is what `build.js` imports now. On our
33 KB terser output, zipped as the build zips:

| packer, same pinned params unless noted | ZIP | decode, headless | page heap |
|---|---|---|---|
| roadroller 2.1.0 (the build until today) | 13,333 | 2.3 s | 64 MB |
| fork, 150 MB (contextual mixer only) | 13,038 | | |
| fork, 150 MB, SSE | 12,956 | | |
| fork, 150 MB, SSE, re-searched params | **12,890** | 5.2 s | 77 MB |
| fork, 500 MB (its new default), SSE | 12,928 | | |
| fork, 500 MB, SSE, re-searched | 12,864 | 5.0 s | **435 MB** |
| fork, 1000 MB, SSE | 12,918 | | |

Kept: 150 MB with SSE and the re-searched parameters (`RR_PARAMS` in build.js:
modelRecipBaseCount 20, recipLearningRate 1434, numAbbreviations 0, the selectors
unchanged). The context-table budget is allocated in the PLAYER's browser at decode
time: 500 MB buys 26 bytes and leaves the page at a 435 MB heap, so no. SSE costs a
bigger decoder (968 chars against 676) and about twice the decode time, which on
SwiftShader is 5 s and on a desktop should be about a second. The search
(`build-full:--search`) still works on the fork; retune after large source moves as
before. The archive's file name counts too: measure everything as `index.html`.

## 12. Priced and shelved (2026-09-11)

- A shipped music toggle on M with its own saved setting: **+46**. The dev build has it on B
  (`musicMuted`, a folded const 0 in the release files) for nothing.

## 13. The music filter build (2026-09-12): +177, Frank to pick the tier

`local/musicNotes.md` (Tier E, the full build as Frank tuned it by ear) went into
`music.js` with the saw shape restored in `zzfxG`. Priced with `local/experiments21.js`
against the loop before it; the ZIP was 13,253 and the full build is 13,430 (+118 over):

| tier | what it keeps | ZIP delta vs the old loop | over the limit |
|---|---|---|---|
| E, the full build | snare, echo, filter build, breakdown sweep, pump, tanh, hat variation, snare roll, lead unison | +177 | +118 |
| D | E without the frills (hat variation, snare roll, unison) | +122 | +63 |
| C | D without the pump and tanh | +98 | +39 |
| B | C with the filter simply open through the breakdown | +90 | +31 |
| old loop, no saw | kick, hat, sine bass, triangle lead | 0 | −59 |

Within E: the pump and tanh together are 15, the breakdown sweep 9, the three frills
55. The saw shape in `zzfxG` is inside every tier's number. Every tier is over on its
own, so the music needs cuts elsewhere or a tier plus about 30 to 120 bytes found
somewhere else.

## 14. The overnight size pass (2026-09-12/13): -155 without a change in behaviour

Frank asked for space with nothing changed. Three commits, from 13,272 to 13,117:

| step | saving | ZIP |
|---|---|---|
| roadroller parameters re-searched after the day's source moves (`build-full:--search`) | -29 | 13,243 |
| dead code: `roadQuad` folded into its one caller, the quad Mesh nothing rendered became a point array, TrackSegment fields every sample overwrites, an unread segment index, the empty PlayerVehicle subclass, a velocity guard that could never matter, `render()` defaulting to the identity, `glPush`'s never-passed cap, `lapWorldLength`, `this.hue`, `cameraPlayerOffset` down to its z, an unread `this.mesh`, the finish-line controls down to two fields, a `sampleRate` alias, YELLOW inlined, the attract grid through `slotX` | -95 | 13,148 |
| renames: game properties named like DOM properties can NEVER be mangled (Terser's `builtins` list): the vector `length()` is now `mag()`, the segment `width` is `w`, the mesh `buffer` is `buf`, the vector `multiply` is `mul`, the skeleton's `height`/`length` are `y`/`len`; `name`, `count`, `get` added to the mangle list | -31 | 13,117 |

A third commit, expression level (2026-09-13, -45, 13,072): drawHUDText takes x, y (every caller built a vec3); one paint loop for strips, pads and shoulders; the bounding box's min/max once each; put is combine bound; the two open-coded uniforms through set; the wall quad ordered by lo/hi instead of a swap; the lap floor and the AI's player guards that could never fire; containCraft's hint that was always v.s; isFinite; vec3 trailing zeros; defaults nobody overrode or everybody passed; the corner readouts inside the results' else.

Priced and found worthless: every Terser option tried (passes 10, hoist_funs, hoist_vars, inline 3,
sequences 200, module, mangle eval: 0; the unsafe_* set: +12). Property mangling is exhausted: every
long name left in `dist/game.min.js` is a WebGL or DOMMatrix method. Lesson recorded in CLAUDE.md:
never call a game property length, width, height, buffer, multiply, set, state, value, loop, code,
key or body.

The MENU of cuts that WOULD change something, each priced alone on this build (`local/experiments24.js`),
for Frank to pick from:

| cut | saving |
|---|---|
| music: the three frills (hat variation, snare roll, lead unison) | 61 |
| music: pump and tanh | 25 |
| music: the breakdown sweep | 5 |
| music: all of the above (tier B) | 82 |
| charging sparks: none at all | 37 |
| charging sparks: world-flat ring again (tilts on banks) | 10 |
| HUD drop shadow (text unshadowed) | 27 |
| gripKeep (back to the old speed bleed in corners) | 22 |
| the finale's hue cycle | 18 |
| the off-gas / turbo steer multipliers | 18 |
| minimap strokes fixed pixels again | 16 |
| countdown numerals without the shrink | 12 |
| the low-energy tick | 11 |
| the lap beep once instead of three | 9 |

## 15. The review pass (2026-09-13): -50, two bugs fixed for nothing

A read of the whole source for small bugs and dead weight, from 13,275 to **13,225** (87 under).
Every line priced alone through `local/measure.js` (`local/experiments27.js`, `experiments28.js`);
the measure shell differs from the release one, so the deltas are what count.

| change | saving |
|---|---|
| the `ground` column (1 on all nine circuits), its field and both branches | -10 |
| scenery bit 1, no infield (no circuit set it) | -6 |
| the mouse steer's `raw`, computed and discarded on keys | -9 |
| `playerVehicle.energy=playerEnergy`, a round trip (only ever written from the craft) | -2 |
| `nearest()`'s road height, read only by the no-ground branch | in the batch |
| `wrapDeltaZ` (no callers; Terser already dropped it) | 0 |
| **fix:** the shoulder test window 80 -> 120, the length it paints (SODIUM lost ten pad samples) | -3 |
| **fix:** `paint()` guarded by a gated `debug && ASSERT` instead of a wrap | 0 |
| **fix:** the TEAM button draws at `menuRowSize`, which owns its .15 (the hit box was the .1 row's) | +5 |
| all together, release `build-full` | **-50** |

Priced and not taken: `paint()` wrapping through `wrapSegment` (+5; the assert is the guard,
because no placement reaches the end today and a dev build would say so at once); the TEAM hit
test widened for its row alone (+9, the menuRowSize route is cheaper); the uniform locations cached
instead of looked up per draw per uniform (+21: about 1,200 string lookups a frame, not a problem
at current frame rates, the cheapest lever if one is ever needed).

The mangle list was audited again (`local/mangleaudit.js`): every game-defined name is covered.

## 16. The output-identical pass (2026-09-13): -214, nothing changed

Frank asked for bytes that change nothing. A read of what survives Terser with mangling off
(`local/survivors.js` writes the beautified release with real names) found 31 cuts; a second
review (`docs/size-saving-investigation.md`) overlapped five of them and added four. From 13,322
(10 over) to **13,108** (204 under). Priced in `local/experiments30.js`-`32.js`, applied by
`local/apply33.js` in six commits. Alone most are 0 to -10; the batch is what counts (-215 on the
measure shell): the leave-one-out found four that cost bytes INSIDE the batch although neutral alone.

| group | cuts (price alone) |
|---|---|
| the Timer class | the countdown beeps off the clock gameStart zeroes and GO shows while time < 4; gameOverTime a number, 0 unset (-66 with the countdown) |
| player mirrors | playerEnergy and playerDeadTime (-10); racePlace, always assigned with lastRacePlace (+16 alone) |
| vehicles | seated once, the constructor takes the lane (-11); Vector3.copy (-4); home is racerIndex (-8; the title's attract player craft also gets its 4%); craftMatrix's defaults (+4); Vector3.lerp's clamp (+3) |
| world | the skeleton's dead setSeed (-2); worldKey is the circuit (-8); a route sample is an object literal (+8); laneCount (-2) and rainbow (+4) from the index; the constant width not interpolated (+1) |
| rendering | sky bands push their corners: pushGradient, quadPoints, Vector3.mul, pushSprite (-26); Mesh.bytes dev only (+2); lazy uploads (-10); specs from racerColors (-7); glRender's transform (-1), glDraw's defaults (-2); new Mesh with defaulted arrays (+7) |
| small | Color.lerp's double clamp (+3); setHSLA's defaults and clamps (-6); empty ZzFX randomness slots (0); the pitch jitter without rand (-4); playSamples' offset default (0); the bake's stem array (+1); the locked grey as hsl (+8); mod's default (-3); a menu row helper (-1) |

Priced and left out, each worse inside the batch: the music instruments as raw zzfxG arrays
(+18 in the batch), an alpha(c,a) helper for the five rgb(c.r,c.g,c.b,a) (+15), a remainder save
parse (+12), glBake returning upload's result (+10).

**The gotcha:** the Mesh-defaults regex turned `new Mesh([],[]).combine(` into
`new Mesh.combine(`, valid syntax that constructs `Mesh.combine`: Terser and roadroller built it,
every browser suite timed out. `new Mesh().combine(` fixed it (+3). The measure harness never
runs the page, so a batch is only priced once the suites and `smoke:--dist` pass.

## 17. Post-deadline cuts (2026-09-13): eight in (upload, then hull, fog and hud for the menu arrows and the finish beep, then grip, map and place for the brake and turbo fixes, then depth for the AI corner scan, then emissive for the gas-key mouse mode fix on 2026-09-14, each batch re-proven identical on its base), four in reserve

Emissive went in for the mouse mode fix (the gas key ends mouse mode in vehicle.js instead of any key in onkeydown, 13,318 alone): 13,312 in a real build. On that base emissive with keyWasPressed as `inputData[key] >> 1 & 1` (the same 0 or 1) was 13,321, and with wrap 13,322; on Space-in-onkeydown bases zzfx, corners, wrap and stop gave 0 to +10 (`local/mouse-key-size-try.js` to try7.js). Proven identical: every glPush of a world build on all eight circuits, with the emissive and specularity it reads, hashed the same as HEAD's buildRoadChunk (`local/emissive-identical-probe.js`).

More candidates, found by a read-only review on 2026-09-14 and NOT priced or proven (each needs a real build and the identical probes): the results exit as one comparison (`time-gameOverTime > (pressed ? 1 : 12)`); a `seatCamera(n)` helper for the three yaw-then-updateCamera loops; vehicle.js's `contactTimes`, `lowBeepTime`, `lapBeeps`, `lapBeepTime` initialisers (gameStart writes them); game.js's `currentCircuit`, `lastRacePlace`, `playerCraft` initialisers (the save parse writes them); gameStart's zeros as one chain; `rgb`/`hsl` forwarding rest arguments; trackGen's roll as `clamp((banked?9:bankAmp)*t.turn,-.5,.5)`; `||=` for the engine sound and the audio context; webgl.js `!stored`, `depthMask(write)`, `[...'pnc']`; track.js `lift` defaults the point() reader repeats, `sky&1` for `L.sky&1`, `c?.dispose()`; vehicle.js `tangent.mag()?`.

Depth went in for the AI's weighted corner scan with Frank's key steer ease and camera ease (13,313, 1 over): 13,311 in a real build. On that base, in real builds (`local/cut-size-try.js`), zzfx was +1, and on the scan's base corners was +1 and corners with emissive 0, so none of those is worth taking there; the throwaway builds had priced them -9 to -14. Re-price in a real build every time.

Grip, map and place went in together for the brake-beats-boost fix and the turbo's press window (13,322, 10 over): -12 in a real build to 13,310 (grip and map alone were 13,311; place added 1). Throwaway-build prices on that base were grip -13, map -13, place -6 alone and -18 for grip and map, so never sum them. `local/experiments-postfix.js` holds that base's prices for every reserve cut and several combinations (depth -14, corners -13, zzfx -9, emissive -8 alone).

After the submission the js13k rules allow minor bug fixes (and difficulty tuning) for 24 hours through one pull request that lists every change. The fixes needed room, and Frank wanted as few size changes in that PR as possible, so exactly ONE cut went in: glRender uploads the stream vertices with WebGL2's `bufferSubData(target, 0, glVertexData, 0, glBatchCount*12)` instead of a `subarray` view (-13 alone; the menu and race frames compared byte for byte). Everything below is measured and held in reserve. Prices are real `build-full` runs (not the measure harness, which drifted by several bytes that day), each ALONE against the stated base; batches are not sums.

Round one, priced against 13,308 (committed as one batch, -11 together to 13,297, then undone in favour of the upload cut). Apply with `node local/size-cuts.js <names>`. Proven identical by `local/identical-probe.js` (every circuit's skeleton hash and a fixed 30 s race on REDSHIFT and UMBRA):

| cut | price alone | the change |
|---|---|---|
| grip | -7 | stepVehicle's grip step reuses `speed` (the same `v.velocity.mag()` from the top) instead of a second `sp` |
| place | -5 | the rival respawn calls `v.place(v.nextGate-lapDistance/8)` without the 0 `place()` defaults |
| map | -4 | drawMap drops the `!trackMapPts ||` guard (the world is built before the first frame) |
| corners | -1 | circuit corners ending in a 0 height drop it (skeleton.js reads `c[3]||0`) |
| wrap | 0 | buildRoadChunk's marking scan reads `track[i+k]`, not `track[wrapSegment(i+k)]` (i+k < end <= N) |
| stop | +1 | musicStop and onblur stop with `x = x?.stop()` (stop() returns undefined, read as 0) |

Round two, priced against 13,305 (the fixes plus the round-one batch). Apply with `node local/size-cuts2.js <names>`. All seven together were 13,259 (-46):

| cut | price alone | the change, and why the output is the same |
|---|---|---|
| upload | -13 | IN: the offset/length upload above |
| hull | -10 | makeCraftSpec returns `mesh: buildLoft([...])` and draw.js maps `craftSpecs=racerColors.map((_,i)=>makeCraftSpec(i))`; nothing else reads `stations` |
| fog | -9 | drop `glEnableFog` from drawSky (`=0`), drawTrack (`=1`) and the end of buildCourseWorld: the world build leaves fog on, and the sky meshes are `stored`, which never read the fog uniform |
| zzfx | -9 | zzfxG's `shape`, `repeatTime`, `bitCrush` lose their `= 0` defaults: undefined takes the same branches and `NaN|0` is 0 (confirm with a hash of every sound's samples) |
| depth | -7 | the depth test is enabled once at glInit and glSetDepthTest(write) only sets the mask and blending: the sky draws first after the depth clear, inside the far plane, writing no depth, so the test passes it; test/world-visuals.js calls it with no arguments, which still works |
| hud | -6 | drawPlace drops `if (!p) return` (every caller passes 1-8), drawHUDText its `size=.05` default (all 18 calls pass a size), the lap readout its `min(playerLap+1,raceLaps)` clamp (the finish shows the results card in the same update) |
| emissive | -4 | buildRoadChunk drops `glEmissive=0` resets the next write overwrites, with one `glEmissive=0` moved before the wall glPush (the pads set their own emissive after the rail) |

Before using any of them: re-price in a real build on the current base (the packer shuffles a few bytes on any edit), and prove the output identical, frames with `local/hud-identical-probe.js` (TAG before/after, compare the PNGs), physics and geometry with `local/identical-probe.js`, then the suites and `smoke:--dist`. Not proposed at all (riskier or not identical): constructor fields left undefined (NaN comparisons), removing `playerPlace=fieldSize` (drawPlace would receive undefined before the first update), the explicit skyline upload (tests count uploads).

The same day's re-search of the pinned Roadroller parameters saved 3 more (13,311 to 13,308, build tooling only); a search that printed 13,303 built 13,308 once pinned, and an earlier one printed 13,313 and built 13,318 - always confirm a search with a pinned build.
