const cameraDistance = 3, focalLength = .7;
let playerPos, playerYSpeed, playerZ;
let trackX, trackWidth, trackGap, trackRows;

function project(px, py, dz)
{
    // project a 3d point to 2d camera space
    const s = getCameraSize().y * focalLength / dz;
    const lift = dz**2 / 50;
    return vec2((px - playerPos.x) * s, (py - 2 + lift) * s);
}

function gameInit()
{
    playerPos = vec2();
    playerYSpeed = 0, playerZ = 0;
    trackX = 0, trackWidth = 3, trackGap = 0;
    trackRows = [];
}

function gameUpdate()
{
    if (playerPos.y < -4)
    {
        // restart when mouse is pressed
        if (!mouseWasPressed(0))
            return;
        gameInit();
        inputClearKey(0); // the click restarts and does not also jump
    }
    
    // create more track if needed
    for (let i = trackRows.length; i <= playerZ + 50; )
    {
        // randomize the track generation
        if (trackGap < -8 && rand() < .1)
            trackGap = randInt(2, 5);
        if (rand() < .1)
        {
            trackWidth = randInt(2, 5);
            trackX = randInt(8-trackWidth);
        }
        trackGap--;

        // fill in the row with track data
        let row = trackRows[i++] = [];
        for (let j = 7; j--;)
            row[j] = i < 30 || trackGap < 0
                && trackX <= j && j < trackX + trackWidth;
    }

    // player control and physics
    playerPos.x += mousePos.x * .01;
    playerPos.x = clamp(playerPos.x, -3.4, 3.4);
    playerPos.y += playerYSpeed -= .006;
    playerZ += min(.5, .2 + playerZ/5e3);

    // player land and jump
    if (playerPos.y < 0 && playerPos.y > -.3)
    if (trackRows[playerZ + cameraDistance | 0][round(playerPos.x + 3)])
        playerPos.y = playerYSpeed = mouseWasPressed(0) ? .1 : 0;
}

function gameRender()
{
    // background sky gradient
    const cameraSize = getCameraSize();
    drawRectGradient(vec2(), cameraSize, hsl(.5,1,.7), hsl(.75,1,.2));

    // draw track from far to near
    for (let r = playerZ + 40 | 0; r > playerZ; r--)
    for (let i = 7; i--;)
    {
        if (!trackRows[r][i])
            continue;

        // calculate grid points
        const dz = r - playerZ;
        const a = project(i - 3.5, 0, dz);
        const b = project(i - 2.5, 0, dz);
        const e = project(i - 3.5, 0, dz + 1);
        const f = project(i - 2.5, 0, dz + 1);

        // get tile color
        const color = hsl(.3, .7, (r+i&1 ? .4 : .9));

        // draw front face as projected rectangle
        const height = 40 - dz;
        const center = vec2((a.x + b.x)/2, a.y - height/2);
        const size = vec2(b.x - a.x, height);
        drawRect(center, size, color.scale(.2, 1));

        // draw top face as projected polygon
        drawPoly([a, b, f, e], color);
    }

    // draw player shadow
    const s = cameraSize.y * focalLength / cameraDistance;
    if (playerPos.y >= 0)
    if (trackRows[playerZ + cameraDistance | 0][round(playerPos.x + 3)])
    {
        const p = project(playerPos.x, 0, cameraDistance);
        drawEllipse(p, vec2(s/2, s/4), hsl(0,0,0,.5));
    }

    // draw player
    const p = project(playerPos.x, playerPos.y + .25, cameraDistance);
    for (let i = 99; i--;)
        drawCircle(p.add(vec2((99-i)*s/1e3)), i*s/150, hsl(0,1,1-i/150));
}

/* info
A ball rolls down a checkered track that runs off into the distance, in
3D made from 2D draws. Move the mouse left and right to steer, and
click to jump over the gaps. The ball speeds up as it goes. Fall off
and a click starts again.

## How it works
The game is a few numbers and a list of rows. The ball has a sideways
position and a height in `playerPos`, and `playerZ` is how far down the
track the camera has come, in rows. The ball is always `cameraDistance`
rows in front of the camera. All of the 3D is one small function.

### project
`project(px, py, dz)` turns a point in the track's space into a place
on the screen, where `dz` is how many rows the point is in front of the
camera.

- `s` is the scale at that distance: the height of the view times
  `focalLength`, divided by `dz`. Dividing by the distance is what
  perspective is: twice as far is half as big.
- `px - playerPos.x` puts the camera over the ball, and `py - 2` puts
  it 2 units above the track.
- `lift` raises a point by the square of its distance over 50, which
  bends the far track upward.

The 2D camera never moves from `vec2(0,0)`, so the result is a world
position measured from the middle of the screen.

### The track
`trackRows` is a list of rows, each a list of 7 cells that are track or
empty. `gameUpdate` adds rows until there are 50 beyond the camera, so
the track is made as it is needed and never ends.

- About the first 30 rows are full, a safe place to start.
- After that a row is track from `trackX` for `trackWidth` cells. Each
  row has one chance in ten to pick a new width of 2 to 4 and a new
  place for it, anywhere it fits in the 7 cells.
- `trackGap` counts down by one each row and a row is only track while
  it is below 0. Setting it to 2, 3 or 4 makes a gap that many rows
  long, and a new gap needs it to be below -8 first, so gaps are never
  close together.

### The ball
- `mousePos.x` is the mouse in world units, which here is its distance
  from the middle of the screen. A hundredth of it is added to the
  ball's `x` each frame, so the farther the mouse, the faster the ball
  moves that way. `clamp` keeps it over the 7 cells.
- `playerYSpeed` loses .006 each frame, which is gravity, and is added
  to the height.
- `playerZ` grows by .2 rows a frame at first, and by more the farther
  the ball has gone, up to .5.

The ball lands when its height is between -.3 and 0 and the cell under
it is track. `playerZ + cameraDistance | 0` is its row and
`round(playerPos.x + 3)` its cell, since cell `i` covers `x` from
`i - 3.5` to `i - 2.5`. Then the height and the speed are both set to
0, or to .1 on the frame of a click, which is the jump. A ball more
than .3 under the track is past saving, and below -4 the game waits for
a click and calls `gameInit`. `inputClearKey(0)` then clears mouse
button 0, so the ball, landing on the new track that frame, does not
take the same click as a jump.

### gameRender
`drawRectGradient` fills the view with a sky from one color at the top
to another at the bottom.

The track is drawn from the farthest row to the nearest, so near cells
cover far ones. For each cell, `project` gives the four corners of its
top: `a` and `b` on the near edge, `e` and `f` on the far one.

- `drawRect` draws a dark front face that hangs down from the near
  edge. `color.scale(.2, 1)` is the cell's color at a fifth of its
  brightness with its alpha kept.
- `drawPoly([a, b, f, e], color)` fills the top. The lightness is .4 or
  .9 by whether `r+i` is odd, which makes the checks.

The shadow is a flat `drawEllipse` at the ball's place on the track,
drawn only while the ball is at or above a cell. The ball is 99
circles, from large and dark red to small and white, each moved a
little up and to the right of the last, which shades it like a sphere
with a highlight.

## Try it
- Zoom out: `focalLength = .7` to `focalLength = .4`.
- Bend the track more: `dz**2 / 50` to `dz**2 / 20`.
- Jump higher: `? .1 : 0` to `? .15 : 0`.
- Lighten gravity: `playerYSpeed -= .006` to `playerYSpeed -= .003`.
- Make the track blue: `hsl(.3, .7,` to `hsl(.6, .7,`.

## See also
FPS Game and Tilted View Game are other ways to fake depth in 2D, and
Grapple Game also has a level that never ends. 3D Basics starts the
engine's real 3D. Look up `drawPoly`, `drawRectGradient`
and `getCameraSize`.
*/
