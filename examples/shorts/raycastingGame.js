let playerPos = vec2(), playerAngle = 0;

// a simple function to create the level
const levelTest = (p)=> (floor(p.x)**3&floor(p.y)**2)%30>5;

function gameUpdate()
{
    // update camera angle with mouse pointer lock
    if (mouseWasPressed(0))
        pointerLockRequest();
    if (keyWasPressed('Escape'))
        pointerLockExit();
    if (pointerLockIsActive() || isTouchDevice)
        playerAngle += mouseDelta.x * .03;

    // update player movement, prevent walking through walls
    const velocity = keyDirection().rotate(playerAngle).scale(.05);
    const normal = vec2();
    let newPos = playerPos.add(velocity);
    if (lineTest(playerPos, newPos, levelTest, normal))
    {
        // adjust velocity to slide along wall
        const d = velocity.dot(normal);
        newPos = newPos.subtract(vec2(d*normal.x, d*normal.y));
        if (!levelTest(newPos))
            playerPos = newPos;
    }
    else
        playerPos = newPos;
}

function gameRender()
{
    {
        // draw horizontal slices to create floor and ceiling
        const h = 9;
        let pos = vec2(), size = vec2(39, .15), color = hsl();
        for (let y=-h; y<h; y+=.1)
        {
            const p = 1.01 - abs(y/h)
            color.setHSLA(.1, y>0?0:.5, .7-p*.7);
            pos.y = y;
            drawRect(pos, size, color);
        }
    }
    {
        // draw vertical slices to create the walls
        // create objects in advance for optimal performance
        const w = 15;
        const maxDistance = 50;
        const pos = vec2(), endPos = vec2(), size = vec2(.15);
        const wall = tile(10).pos; // the brick tile, a column at a time
        const tileInfo = new TileInfo(wall.copy(), vec2(1,16));
        const normal = vec2(), light = vec2().setAngle(2);
        const color = hsl();
        for (pos.x=-w; pos.x<w; pos.x+=.1)
        {
            // cast ray for this slice
            const angle = playerAngle + pos.x/w/2;
            endPos.setAngle(angle, maxDistance);
            endPos.x += playerPos.x;
            endPos.y += playerPos.y;
            const p = lineTest(playerPos, endPos, levelTest, normal);
            if (!p) continue;

            // get texture coordinate
            const t = mod(p.x+p.y, 1);
            tileInfo.pos.x = wall.x + 1 + 14*t;

            // the distance straight ahead, not along the ray, so flat walls
            // stay flat instead of bowing like a fisheye lens
            const d = p.distance(playerPos)*cos(pos.x/w/2)/maxDistance;

            // apply fog and lighting
            const l = max(0, normal.dot(light));
            size.y = .5/d;
            color.setHSLA(.6, 1-d, .7-d+l*.3);

            // draw the section of the wall
            drawTile(pos, size, tileInfo, color);
        }
    }
    
    // draw instructions and pointer lock status
    const instructions = pointerLockIsActive() ? 
        'Mouse Control Active - ESC To Exit' : 
        'Click To Enable Mouse Control';
    const textPos = vec2(mainCanvasSize.x/2, 50);
    const textSize = 30;
    const textColor = pointerLockIsActive() ? GREEN : WHITE;
    if (!isTouchDevice)
        drawTextScreen(instructions, textPos, textSize, textColor);
}

/* info
A maze of brick walls seen in first person, drawn with nothing but 2D
rectangles and tiles: the raycasting trick of the first 3D shooters.
Click to let the mouse turn the view and press Escape to free it again.
The arrow keys or WASD walk forward and back and step sideways.

## How it works
The world is a flat grid seen from above, and the player is a point in
it with an angle. The view is built one thin column at a time. For each
column a ray goes out across the grid until it meets a wall, and the
farther the wall, the shorter the column is drawn.

### The level
`levelTest(p)` answers whether the grid cell at a point is a wall. No
map is stored: the cell's whole numbers go through a formula, `x` cubed
and `y` squared joined with a bitwise AND, and a remainder over 30 that
is above 5 makes a wall. The pattern goes on in every direction.
The cell at `vec2(0,0)`, where the player starts, comes out empty.

### gameUpdate
`pointerLockRequest()` asks the browser to hide the mouse and hand over
its movement alone, which a browser only allows after a click.
`pointerLockIsActive()` says whether it has, and then `mouseDelta.x`,
how far the mouse moved this frame, turns the player. On a touch device
the movement is used without a lock.

`keyDirection()` is the keys as a vector, `y` for forward and back and
`x` for sideways. `rotate(playerAngle)` turns it to the way the player
faces, where an angle of 0 is up the grid and angles go clockwise, and
`scale(.05)` makes it the step for one frame.

`lineTest(start, end, test, normal)` walks the grid cells from `start`
to `end` and returns the point where `test` first says yes, or
`undefined`. It also fills in `normal`, the direction the wall it hit
faces. Here it checks the step:

- No hit: the player takes the step.
- A hit: `velocity.dot(normal)` is how much of the step goes into the
  wall. Taking that part off leaves a step along the wall, so the
  player slides instead of sticking. That step is taken only when it
  does not end inside a wall, which is what happens in a corner.

### Floor and ceiling
The 2D camera never moves from `vec2(0,0)`. The view is drawn around
it in world units, about 30 wide.

The first loop stacks strips from `y` -9 to 9, each .15 tall. `p` is 1
at the middle of the screen and near 0 at its top and bottom, and the
lightness falls as `p` rises, so both halves fade to dark at the
horizon. The saturation is 0 above the middle and .5 below it, at a hue
of .1.

### Walls
The second loop goes across the screen in steps of .1 from -15 to 15,
300 columns:

1. The ray's angle is the player's plus `pos.x/w/2`, from half a radian
  left to half a radian right. The view is one radian wide, about 57
  degrees.
2. `endPos` is 50 units out along the ray, and `lineTest` gives the
  point `p` where it meets a wall. A ray that meets none draws nothing.
3. `mod(p.x+p.y, 1)` is how far along the wall's face the ray landed,
  from 0 to 1. It picks which column of the brick tile to draw. The
  `TileInfo` is one pixel wide and 16 tall, and moving its `pos.x`
  slides it across tile 10 of the tile sheet.
4. `d` is the distance as a fraction of the 50 units, measured straight
  ahead rather than along the ray: multiplied by `cos(pos.x/w/2)`, the
  cosine of the ray's angle from the middle of the view. With the
  distance along the ray, a flat wall seen at an angle would bow like a
  fisheye lens. The column's height is `.5/d`: half as tall at twice
  the distance.
5. `normal.dot(light)` is larger the more a wall faces the `light`
  direction, and `max` stops it below 0. It brightens the color, and
  `d` darkens it and takes its saturation away, which reads as fog.
6. `drawTile` draws the column at `pos.x`, centered on the middle of
  the screen, tinted with that color.

The message is drawn with `drawTextScreen`, in pixels from the top left
of the canvas. `mainCanvasSize.x/2` centers it.

## Try it
- Open the maze up: `%30>5` to `%30>15`.
- Widen the view: both `pos.x/w/2` to `pos.x/w`.
- See the fisheye: take out `*cos(pos.x/w/2)`.
- Make the walls twice as tall: `.5/d` to `1/d`.
- Walk faster: `scale(.05)` to `scale(.1)`.
- Turn the walls red: `setHSLA(.6,` to `setHSLA(0,`.

## See also
Tile Raycast and Object Raycast show the engine's own raycasts. Tilted
View Game and Ball Track Game fake depth in other ways, and 3D First
Person walks a maze in real 3D. Look up `lineTest`, `TileInfo` and
`pointerLockRequest`.
*/
