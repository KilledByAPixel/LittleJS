let cells;
const replay = new Timer;
const effect = 'fire'; // the effect every cell plays

// 4 cells across and 2 down, 5 units apart
const cellPos = (i)=> vec2((i % 4 - 1.5) * 5, i < 4 ? 1.5 : -4);

function gameInit()
{
    cameraScale = 45;
    canvasClearColor = hsl(.6,.2,.12);

    // the options for each cell, and what it says under the fire
    cells =
    [
        [{}, 'as it is'],
        [{scale: 2}, '{scale: 2}'],
        [{hue: .6}, '{hue: .6}'],
        [{saturation: 0}, '{saturation: 0}'],
        [{emitSize: 2}, '{emitSize: 2}'],
        [{tileInfo: tile(6)}, '{tileInfo: tile(6)}'],
        [{emitTime: .3}, '{emitTime: .3}'],
        [{speed: .1, particleTime: .4}, '{speed: .1, particleTime: .4}'],
    ];
    cells.forEach(([options], i)=>
        particleEffect(effect, cellPos(i), options));
    replay.set(2);
}

function gameUpdate()
{
    // the burst ends itself, so it plays again every 2 seconds
    if (replay.elapsed())
    {
        particleEffect(effect, cellPos(6), cells[6][0]);
        replay.set(2);
    }
}

function gameRender()
{
    cells.forEach(([, text], i)=>
    {
        drawRect(cellPos(i), vec2(1, .2), hsl(0,0,1,.1));
        drawText(text, cellPos(i).add(vec2(0, -1)), .45, hsl(0,0,.85));
    });
    drawText(`particleEffect('${effect}', pos, options)`, vec2(0, 5.2),
        .6, hsl(.1,.8,.7));
}

/* info
One built-in effect, fire, with other options in each cell and the
options that do it under it. Any effect setting can go in the options
too, like `emitTime` for a burst or `speed`. There is nothing to press.

## How it works
`particleEffect(name, pos, options)` makes an emitter set up as a
built-in effect. The options change the effect for that one emitter,
and the effect itself stays as it is.

`cells` is a list of pairs: an options object, and the text to show
under it. `gameInit` makes one fire for each pair at `cellPos(i)`, 4
cells across and 5 units apart, in two rows.

### The options
1. `{}` is the fire as it is made, to fit an object one unit across.
2. `scale: 2` grows the whole effect: the area particles start in,
  their sizes and their speed.
3. `hue: .6` turns the colors around the color wheel, where 1 is all
  the way around. The fire's orange goes to blue.
4. `saturation: 0` multiplies how strong the colors are, and 0 leaves
  grey.
5. `emitSize: 2` is the diameter of the area the particles start in.
  The fire's own is `.6`, so this is a wider fire of the same
  particles.
6. `tileInfo: tile(6)` draws each particle with a tile of the game's
  tile sheet in place of the effect's own shape, tinted by the effect's
  colors.
7. `emitTime: .3` is the seconds to emit for. The fire's own is 0, which
  is forever, so this makes it a burst that ends itself.
8. `speed: .1, particleTime: .4` are two effect settings: the speed
  particles start with, in world units per frame, and the seconds each
  one lives. The fire's own are `.02` and `.8`.

### The replay
A `Timer` counts seconds of engine time. `new Timer` makes one that is
not set, `replay.set(2)` sets it to 2 seconds, and `replay.elapsed()`
is true once they have passed. `gameUpdate` then makes the burst of
cell 6 again, counting from 0, and sets the timer again. Nothing has to
be cleaned up: an emitter that has stopped emitting is removed when its
last particle is gone.

### gameRender
Each cell gets a bar one unit wide, the size the effect is made for,
and its text one unit under it. The last `drawText` is the line across
the top.

## Try it
- Change `'fire'` to `'magic'` at the top to see the same options on
  another effect.
- Change the `.6` of `hue` to `.3`, in the options and in its text, for
  a green fire.
- Change `tile(6)` to `tile(2)`, in the options and in its text, to
  draw the particles with another tile.

## See also
Particles has the basics, and Particle Effects shows every built-in
effect. Tile Layer uses options to make sparks that bounce. Timers has
more on `Timer`, and the `ParticleEmitter` underneath has every setting
in its constructor.
*/
