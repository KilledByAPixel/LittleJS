let scale = 1, hue = 0, saturation = 1, playing = [], replayTimes = [];

// the effects in a grid of 8 by 3, 3 units apart
const cellPos = (i)=> vec2((i % 8 - 3.5) * 3, 3 - (i / 8 | 0) * 4);

function gameInit()
{
    cameraScale = 40;
    canvasClearColor = hsl(.6,.2,.12);
    playAll();
}

function play(i)
{
    playing[i]?.destroy();
    const name = particleEffectsBuiltIn[i];
    const s = particleEffectsGet(name).settings;
    playing[i] = particleEffect(name, cellPos(i), {scale, hue, saturation});

    // a one-shot plays again once its last particle is gone, 2 seconds on
    // at least; its particles live up to particleTime and randomness more
    const life = s.emitTime + s.particleTime * (1 + s.randomness);
    replayTimes[i] = s.emitTime ? time + max(2, life) : Infinity;
}

function playAll()
{
    particleEffectsBuiltIn.forEach((name, i)=> play(i));
}

function gameUpdate()
{
    for (const k of [1, 2, 3])
        if (keyWasPressed('Digit' + k)) scale = k, playAll();
    if (keyWasPressed('KeyH')) hue = (hue + .25) % 1, playAll();
    if (keyWasPressed('KeyS')) saturation = saturation ? 0 : 1, playAll();
    particleEffectsBuiltIn.forEach((name, i)=>
    {
        if (mouseWasPressed(0) && mousePos.distance(cellPos(i)) < 1.5 ||
            time > replayTimes[i])
            play(i);
    });

    // a trail only shows when it moves, this one circles its cell
    const trail = particleEffectsBuiltIn.indexOf('trail');
    playing[trail].pos = cellPos(trail).add(
        vec2(cos(time*4), sin(time*4)).scale(.8));
}

function gameRender()
{
    particleEffectsBuiltIn.forEach((name, i)=>
    {
        drawRect(cellPos(i), vec2(1), hsl(0,0,1,.08));
        drawText(name, cellPos(i).add(vec2(0, -1.4)), .4, hsl(0,0,.8));
    });
}

/* info
Every built-in particle effect at scale 1, each made to fit an object
one unit across, in a grid with its name under it. The one-shots play
again every few seconds and the trail moves so it can be seen. Click
one to play it now, keys 1 to 3 set the scale, H turns the hue and S
takes the color out or puts it back.

## How it works
### The grid
`particleEffectsBuiltIn` is the list of the built-in effects' names, 24
of them. `cellPos(i)` is the middle of cell `i`: `i % 8` is its column
and `i / 8 | 0` its row, with columns 3 units apart and rows 4.
`cameraScale` is how many pixels a world unit takes, and 40 fits the
grid in the view.

### play
`play(i)` starts the effect of one cell again.

- `playing[i]?.destroy()` ends the emitter that was there, if there was
  one. An emitter destroyed this way stops emitting and is removed when
  its last particle is gone.
- `particleEffect(name, pos, options)` makes the new emitter and
  returns it. `{scale, hue, saturation}` is short for an object with
  those three variables as its options.
- `particleEffectsGet(name).settings` is the effect's own data, read
  here to know how long it lasts. `emitTime` is the seconds it emits
  for, and 0 means forever.

An effect that emits forever needs no replay, so its replay time is
`Infinity`. A one-shot is over when it has stopped emitting and its
last particle is gone, and a particle lives up to
`particleTime * (1 + randomness)` seconds. It plays again then, or
after 2 seconds if that is later. `replayTimes[i]` is the engine
`time` at which that happens.

### gameUpdate
`keyWasPressed` is true on the frame a key goes down. Keys are named by
their place on the keyboard, `'Digit1'` or `'KeyH'`. The options only
count when an emitter is made, so each key changes a variable and calls
`playAll`.

The loop plays a cell again when its replay time has passed, or on a
click less than `1.5` units from its middle. `mousePos` is the mouse in
world units.

The trail effect's particles have no speed of their own, so its
emitter is moved: its `pos` is set each frame to a point on a circle of
radius `.8` around its cell.

### gameRender
`gameRender` runs before the engine draws its objects, so the faint one
unit boxes and the names are behind the particles.

## Try it
- Change `scale = 1` at the top to `scale = 2` to start with every
  effect twice the size.
- Change `max(2, life)` to `max(.5, life)`: the short one-shots play
  again sooner.
- Change `hue + .25` to `hue + .1` for smaller steps of the H key.
- Change `.scale(.8)` to `.scale(1.5)` for a wider circle under the
  trail.

## See also
Particles is the place to start, and Particle Options shows what each
option does to one effect. 3D Particles has emitters in 3D. Look up
`particleEffect` and `particleEffectsAdd`, which adds effects of your
own to play by name.
*/
