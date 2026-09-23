# LittleJS benchmarks

Pages that put LittleJS and other engines through the same scene, so a change to the engine can be measured and
anyone can check the numbers on their own hardware. The other engines load from a CDN, nothing here is part of
the engine.

## Running

Serve the repo and open a page, or the whole set:

```bash
node bench/serve.mjs          # then open http://localhost:8765/bench/all.html
```

`all.html` runs every page in turn at 1280 by 720, twice each, and prints one line per result with a copy
button. `?only=particles` runs one set, `?quick=1` runs each page once. Or open a single page; each takes
`?n=` or `?s=` for its size and `?w=1280&h=720` to fix the canvas, and says what else it takes at the top
of its source.

Headless, with `playwright-core` installed somewhere node can find it (the repo has no dependency on it):

```bash
node bench/run.mjs particles              # a set at a few sizes
node bench/run.mjs dynamic 128 256 -- aa=0
node bench/profile.mjs "bench/particles.html?n=20000&aa=0&w=320&h=180"
```

Headless Chrome renders with SwiftShader, a software GPU, so those numbers compare JS and driver overhead and
say nothing about real hardware. `profile.mjs` prints where the JS time goes.

## Reading the numbers

- **frame** is the time between frames. In a browser it can never go below the display refresh, so 16.7 ms
  means "at least 60 fps", not "16.7 ms of work".
- **gpu** is the time the card spent on the frame's commands, from a timer query. It is only meaningful when the
  frame is at the refresh rate: when the CPU is the bottleneck the GPU idles between commands and that idle
  counts, so a CPU bound page shows a large gpu number that is really CPU time.
- **js** or **update** and **render** are CPU phases measured in the page.
- Run a page twice. The spread between two runs of the same page is the noise floor; a difference smaller than
  that means nothing.

## The pages

| page | scene | against |
|---|---|---|
| cubes | n spinning lit cubes with a shadow map; `?objects=0` draws from arrays, `?instanced=1` keeps them in an InstancedMesh3D | three.js InstancedMesh, `?instanced=0` a Mesh each |
| particles | n soft dot particles from one emitter | three.js Points with a size and color shader |
| sprites | n camera facing sprites, sorted | three.js Sprite |
| dynamic | a grid whose points move every frame; `?dynamic=0` without mesh.dynamicDraw | PlaneGeometry with needsUpdate |
| bigmesh | one terrain of 2 s² triangles with a shadow map, plus build and upload times | PlaneGeometry |
| sprites2d | n tiles bouncing around the screen, the bunnymark; `?objects=1` as EngineObjects | PixiJS Sprite, `?particles=1` ParticleContainer; Phaser Image, `?blitter=1` Blitter (WebGL1, so no gpu time) |

`benchLittle.js` and `benchOther.js` hold the shared timing: 60 warm up frames, then 300 timed, and
`window.benchResult` when done. The LittleJS pages do their per frame work in a pre render hook rather than
gameUpdate, because the fixed timestep runs gameUpdate several times a frame below 60 fps, which would count the
work several times over; the other pages step their simulations the same way.
