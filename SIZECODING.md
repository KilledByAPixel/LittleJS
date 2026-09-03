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
release now matches it — but quirks mode changes what the DOM reports, see
section 6). What ships:
`<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body><script>…</script>`
The opening `<body>` is required (without it the script runs with
`document.body === null`); `</body>` is not. `</script>` IS: a script the
parser reaches EOF inside is marked "already started" and never executed
at all, so dropping those nine bytes builds a smaller zip that does
nothing, and no test that loads the sources instead of the zip will tell
you. Keep the viewport meta or phones lay out a 980px page and shrink it.
Keep `initial-scale=1` (old iOS loses the zoom on rotation without it).
Keep `<meta charset>` even when the payload is pure ASCII: the day
roadroller emits a high byte it corrupts silently. Canvas centring:
`inset:0;margin:auto` beat the `top:50%;left:50%;transform` idiom by 19.

**Dev vs release.** Everything debug lives behind `if (debug)`, with `debug`
a compile-time 0 in the release build (a separate `engineRelease.js` is
concatenated where the dev page loads `engineDebug.js`). Removing a whole
debug file built byte-identical, repeatedly; an EDIT inside one still moved
the zip by 3 through the minifier's choices (section 6, "dead code is not
quite free"). Two more traps are in section 6.

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
  commit per change, and log the number in the changelog with what it was
  for. Two weeks later that ledger is the only thing that tells you what a
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
- **No doctype means quirks mode, and quirks mode changes the DOM.** With
  the doctype dropped for 18 bytes, `document.documentElement.clientHeight`
  is no longer the viewport by spec but the html element's own box - empty
  on a page of absolutely positioned canvases. Firefox honoured that and
  reported 1280x0, so the canvas was built 0 tall; Chromium leniently
  returned the viewport, so the bug hid for days. In quirks mode size from
  `document.body.clientWidth/Height` (the viewport there, and a shorter
  token); with a doctype use documentElement. Test the release page in more
  than one engine.
- **Dead code is not quite free.** A debug-only edit that shipped nothing
  moved the zip +3: the post-uglify output was the same size but one live
  statement was shaped differently (a comma became a semicolon), because
  Closure's inlining and sequence-joining decisions are made over the whole
  program before the dead part is dropped, and roadroller packs the two
  shapes apart. An earlier debug-only addition moved a build by 9 the same
  way. Rebuild after debug edits too when the last bytes matter, and read a
  debug-only delta against that noise.

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
- Build. Log the byte delta and what it bought in the changelog. One
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

**Never**
- Alias `Math.*`, hoist for tidiness, or add helpers for two call sites
  without measuring.
- Trust a substitution you did not assert matched.
- Quote a byte figure from memory. Build it.
