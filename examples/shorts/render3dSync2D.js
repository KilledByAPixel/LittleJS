// a 2D game with 3D looks: 2D physics and tile collision move
// everything, and sync2D copies each 2D position into its 3D object

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
    body.pos = pos;      // the 2D position the physics moves
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
