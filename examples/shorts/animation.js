canvasClearColor = GRAY;

// a SpriteAnimation steps a tile through the frames beside it, driven by
// the engine time, so it pauses with the game and needs no update call;
// a SpriteAnimator switches between a character's animations by name
let hero, sweep, oneShot;

class Walker extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(4), hero.tileInfo, 0, hsl(.6,1,.7));
        this.velocity = vec2(.05, 0);
    }
    update()
    {
        this.tileInfo = hero.tileInfo; // the frame to show now
        if (this.pos.x > 14)
            this.pos.x = -14;
    }
}

function gameInit()
{
    // made once the tiles have loaded
    hero = new SpriteAnimator({
        walk:   new SpriteAnimation(tile(3), 2, .15),         // loops
        morph:  new SpriteAnimation(tile(8), 4, .08).play(), // once
    });
    sweep = new SpriteAnimation(tile(5), 7, .1).pingPong(); // there and back
    oneShot = new SpriteAnimation(tile(8), 4, .2).play();   // once
    new Walker(vec2(-8, 3));
}

function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        oneShot.play(); // from the first frame again
        hero.set('morph', ()=> hero.set('walk')); // then walks on
    }
}

function gameRender()
{
    drawTile(vec2(-6, -3), vec2(4), sweep.tileInfo);
    drawTile(vec2(0, -3), vec2(4), oneShot.tileInfo);
    drawText(oneShot.isDone ? 'click' : 'playing', vec2(0, -6), 1.5);

    // frame math by hand still works for the simple cases
    drawTile(vec2(6, -3), vec2(4), tile(3).frame(time*4%2|0), hsl(0,1,.6));
}

/* info
Four ways to animate a sprite whose frames sit side by side in the tile
sheet: a looping walk on an object that crosses the screen, a ping pong,
a clip that plays once, and frame math by hand. Click to play the
one-shot again and to make the walker morph before it walks on.

## How it works
An animation here is a run of tiles next to each other in the sheet.
`tileInfo.frame(n)` returns the tile `n` places along the row, and
everything below is a way to pick `n` from the time.

### SpriteAnimation
`new SpriteAnimation(tileInfo, frameCount, frameTime)` takes the first
frame, how many frames there are, and the seconds each one shows for.
It works from the engine's `time`, so it has no update call and it
pauses when the game does. Reading its `tileInfo` gives the tile of the
frame showing now.

A new one loops. Two methods change that, each starting over from the
first frame and returning the animation, so they chain onto `new`:

- `play()` runs through once and holds the last frame. `isDone` is true
  from then on.
- `pingPong()` runs there and back, forever.

`sweep` has 7 frames from tile 5. `oneShot` has 4 frames from tile 8 at
`.2` seconds each, so a play takes `.8` seconds. They are made in
`gameInit` because `tile` needs the tile sheet to be loaded.

### SpriteAnimator
A `SpriteAnimator` holds several animations by name and shows one of
them, the first to begin with, here `walk`. `hero.set(name, onEnd)`
switches. It starts the clip over only when the clip changes or its play
has ended, so a click in the middle of the morph does not start it
again. `onEnd` is called once when a clip that plays once ends, and
here it sets `walk` again.

### Walker
`EngineObject(pos, size, tileInfo, angle, color)` makes the sprite that
moves. Its `velocity` is in world units per frame, so `.05` is 3 units a
second. `update` is called once a frame: it copies `hero.tileInfo` into
the object's own `tileInfo`, which is all it takes to animate an
object, and it puts the walker back at x `-14` once it passes `14`.

### gameUpdate and gameRender
`mouseWasPressed(0)` is true on the frame the left button goes down.
`gameRender` draws `sweep` and `oneShot` with `drawTile`, and the text
under the one-shot says whether it has ended.

The last draw needs no class. `time*4` counts 4 frames a second, `%2`
wraps it to two frames and `|0` drops the fraction, so it is 0 or 1.

## Try it
- Change `.pingPong()` to `.loop()`: the sweep jumps back to its first
  frame and does not return through the others.
- Change the walk's `2, .15` to `2, .5` for slower steps.
- Change `vec2(.05, 0)` to `vec2(.15, 0)`: the walker moves three times
  as fast while its steps keep their pace.
- Change `time*4%2` to `time*12%2` to speed up the one done by hand.

## See also
Sprite Atlas names the tiles of a sheet, Texture Sheet and Texture
Atlas load frames from other images, and Tween animates numbers. Look
up `SpriteAnimation`, `SpriteAnimator` and `TileInfo`.
*/
