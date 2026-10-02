class Player extends EngineObject
{
    constructor(pos)
    {
        super(pos, vec2(1,2), 0, 0, RED);
        this.setCollision(); // make object collide
    }

    update()
    {
        // apply movement controls
        const moveInput = keyDirection();
        this.velocity.x += moveInput.x * (this.groundObject ? .1: .01);
        if (this.groundObject && moveInput.y > 0)
            this.velocity.y = .9; // jump

        // move camera with player
        cameraPos = vec2(this.pos.x, 9); 
    }
}

function gameInit()
{
    // setup level
    gravity.y = -.05;
    new Player(vec2(5,6));
    canvasClearColor = hsl(.6,.3,.5);

    // create tile layer
    const pos = vec2();
    const tileLayer = new TileCollisionLayer(pos, vec2(256));
    for (pos.x = tileLayer.size.x; pos.x--;)
    for (pos.y = tileLayer.size.y; pos.y--;)
    {
        // check if tile should be solid
        const levelHeight = pos.x<9 ? 2 : (pos.x/4|0)**3.1%7;
        if (pos.y > levelHeight)
            continue;
        
        // set tile data
        tileLayer.setData(pos, new TileLayerData(1));
        tileLayer.setCollisionData(pos);
    }
    tileLayer.redraw(); // redraw tile layer with new data
}

/* info
The smallest platformer: a red box that runs and jumps over a level of
steps. The left and right arrow keys run and the up arrow jumps. WASD
works as well.

## How it works
The level is a `TileCollisionLayer` and the player is an `EngineObject`
that collides with it. Gravity, landing and stopping at walls are all
the engine's physics. The game code is the controls and the level.

### Player
The player has no tile, so it draws as a rectangle of its size, one
unit wide and two tall, in `RED`. `setCollision()` has it collide with
the level's solid tiles.

`update` runs every frame, after the physics has moved the object:

- `keyDirection()` returns a vector from the arrow keys, `x` for left
  and right and `y` for down and up, each -1, 0 or 1.
- `groundObject` is what the object stands on, set by the physics each
  frame and `undefined` in the air. Here it is the tile layer.
- On the ground a key adds .1 to the sideways speed each frame, and in
  the air .01, so a jump can be steered only a little.
- The jump sets `velocity.y` to .9 and only works from the ground.
  Gravity then takes .05 off it every frame, so the jump rises for 17
  frames and gains about 7.65 units.

Nothing in the code slows the player down. The engine does that: an
object on the ground keeps a fraction of its sideways speed each frame,
its `friction`, which is .8 unless it is set. That is what gives the
run a top speed and stops the player when the key is let go.

The last line moves the camera sideways with the player and holds it
at a height of 9.

### gameInit
`gravity.y = -.05` is in world units per frame, added every frame, and
`canvasClearColor` is the sky.

The layer is 256 by 256 cells with its bottom left corner at
`vec2(0,0)`, and a cell is one world unit. The two loops visit every
cell, and `levelHeight` says how high the ground is in that column:

- The first 9 columns are at height 2, a flat place to start.
- After that `pos.x/4|0` numbers the columns in fours, so every step
  is 4 cells wide. Raising that number to the power 3.1 and taking the
  remainder over 7 gives a height from 0 to 7 that looks random and is
  the same on every run.

A cell above that height is skipped and stays empty. A cell at or under
it gets tile 1 of the tile sheet with `setData`, and is marked solid
with `setCollisionData`. `redraw()` then draws the tiles into the
layer's image, and they do not show until it is called.

The player starts at `vec2(5,6)`, in the air above the flat part, and
falls onto it.

## Try it
- Jump lower: `this.velocity.y = .9` to `.6`.
- Set gravity to `-.02` and the same jump goes much higher.
- Make the steps 8 cells wide: `pos.x/4|0` to `pos.x/8|0`.
- Build the level from bricks: `TileLayerData(1)` to `TileLayerData(10)`.

## See also
Tile Layer explains the layer and its data. Platforming Game in the
full examples is a whole game with a level made in an editor, and 3D
Sync 2D draws a platformer like this one in 3D. Look up `groundObject`,
`friction` and `keyDirection`.
*/
