const levelMap = `
################################
#                              #
#                              #
#                  ooo         #
#       ####      #####        #
#                          o   #
#  @         o          ####   #
#          #####               #
#    oo                   o    #
#   ####         ###     ###   #
#                              #
################################`;
let player;

// a box the 2D physics moves, drawn as a 3D object
function makeBody(pos, size, mesh, color)
{
    const body = new EngineObject3D(vec3(pos.x, pos.y), mesh, undefined, color);
    body.sync2D = true;  // pos and angle drive pos3D and rotation3D
    body.size = size;    // the 2D box it collides as
    body.scale3D = vec3(size.x, size.y, size.x);
    body.mass = 1;       // so the 2D physics moves it
    body.setCollision(); // with the other bodies and the tiles, in 2D
    return body;
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky();
    render3D.shadows = true;
    setGravity(vec2(0, -.01));

    // 2D tile collision for each #, and a 3D block to show it
    const rows = levelMap.trim().split('\n');
    const size = vec2(rows[0].length, rows.length);
    const tiles = new TileCollisionLayer(vec2(), size);
    for (let x = size.x; x--;)
    for (let y = size.y; y--;)
    {
        const c = rows[size.y - 1 - y][x], pos = vec2(x + .5, y + .5);
        if (c == '#')
        {
            tiles.setCollisionData(vec2(x, y));
            const color = hsl(.3, .3, .3 + (x + y) % 2 * .05);
            const mesh = render3D.boxMesh;
            new EngineObject3D(vec3(pos.x, pos.y), mesh, undefined, color);
        }
        if (c == 'o') // a crate to push around
            makeBody(pos, vec2(.9), render3D.boxMesh, hsl(.08, .6, .5));
        if (c == '@')
            player = makeBody(pos, vec2(.8), render3D.sphereMesh,
                hsl(.6, .8, .6));
    }
}

function gameUpdate()
{
    // run, and jump from the ground, with the 2D velocity
    const input = keyDirection();
    player.velocity.x = input.x * .12;
    const jump = keyWasPressed('Space') || keyWasPressed('ArrowUp');
    if (player.groundObject && jump)
        player.velocity.y = .3;
}

function gameUpdatePost()
{
    // a 3D camera chasing the player from a little above
    render3D.camera.follow(player.pos3D, vec3(0, 2, 10), .1);
}

function gameRenderPost()
{
    const text = 'arrows move, space jumps, push the crates';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}

/* info
A 2D game with 3D looks: 2D physics and tile collision move everything,
and `sync2D` copies each 2D position into its 3D object. Arrow keys or
WASD run, space or up jumps, and the crates can be pushed around.

## How it works
Every `EngineObject3D` is also an `EngineObject`, with the 2D `pos`,
`size`, `velocity` and `angle`. Normally nothing uses them. With
`sync2D = true` the object runs the 2D physics, and each frame its `pos`
and `angle` are copied into `pos3D` and `rotation3D`. The game is the
platformer it would be in 2D, on the plane where z is 0.

### makeBody
This makes the player and the crates.

- The object starts at `vec3(pos.x, pos.y)`, z left at 0. The third
  argument is a tile, `undefined` here, and the color is fourth.
- `size` is the 2D box it collides as. A 3D object's 2D size starts at
  zero, so it must be set.
- `scale3D` sizes what is drawn to match. `render3D.boxMesh` and
  `render3D.sphereMesh` are one unit across.
- `mass = 1` has the physics move it. A 3D object starts with mass 0.
- `setCollision()` makes it solid, and a `sync2D` object collides in 2D
  with the other bodies and with the tile layer.

`setGravity(vec2(0, -.01))` in `gameInit` is the 2D gravity, which is
what pulls a `sync2D` object. `render3D.gravity` is for the others.

### The level
`levelMap` is the level as text. `trim()` drops the empty first line and
`split` makes a row of each line. A `TileCollisionLayer` of that many
cells, 32 by 12, has its corner at `vec2()` and cells one unit wide.

Row 0 of the text is the top, and y goes up in the world, so cell
`(x, y)` reads `rows[size.y - 1 - y][x]`. For each `#`:

- `setCollisionData(vec2(x, y))` marks the cell solid. The layer is
  given no tiles to draw, it is only there to collide with.
- A box at the cell's center, `(x + .5, y + .5)`, shows it in 3D. These
  boxes have no collision of their own.

An `o` makes a crate and `@` the player, a ball.

### Moving and the camera
`keyDirection()` is the arrow keys or WASD as a vector, and its x times
.12 is the player's speed in units per frame. `groundObject` is what the
player stands on, set by the 2D physics, so a jump only starts from the
ground. It sets the upward speed to .3 and gravity brings it back.

`gameUpdatePost` runs after the physics. There
`camera.follow(target, offset, percent)` moves the camera a tenth of the
way toward a spot 2 units above the player and 10 out along z, and turns
it to look at the player.

## Try it
- Add crates to a row of `levelMap`, keeping the row the same length.
- Run faster: `input.x * .12` to `input.x * .2`.
- Jump higher: `player.velocity.y = .3` to `.45`.
- Set the gravity to `vec2(0, -.003)` and everything falls slowly.
- Pull the camera back and up: `vec3(0, 2, 10)` to `vec3(0, 8, 20)`.

## See also
Platformer Game is this kind of game in plain 2D, and Tile Layer shows
the layer's own drawing. 3D Layers draws 3D objects in front of and
behind a 2D scene, and 3D Collision is collision done in 3D.
*/
