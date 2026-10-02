const speed = .2, nodeSize = 2, nodeSpread = vec2(20, 6);
let playerPos, playerAngle, trail, seed, dead;
let nearNode, grabNode, grabRadius, grabPhi, grabSpin;

// get world position of a node
const nodePos = (n)=> nodeSpread.multiply(vec2(n, sin(n**3.3 + seed)));

// get first node index behind the camera
const firstNode = ()=> max(1, cameraPos.x/nodeSpread.x - 1 | 0);

function gameInit()
{
    playerPos = vec2();
    playerAngle = PI/2;
    trail = [];
    seed = rand(99);
    cameraPos.x = dead = grabNode = 0;
}

function gameUpdate()
{
    if (dead)
    {
        // restart when mouse is pressed
        if (mouseWasPressed(0))
            gameInit();
        return;
    }

    if (grabNode)
    {
        // swing around grabbed node
        grabPhi += grabSpin * speed / grabRadius;
        const grabOffset = vec2().setAngle(grabPhi, grabRadius);
        playerPos = nodePos(grabNode).add(grabOffset);
        playerAngle = grabPhi + grabSpin * PI/2;
    }
    else
    {
        const playerMove = vec2().setAngle(playerAngle, speed);
        playerPos = playerPos.add(playerMove);
    }

    // add to player trail
    trail.push(playerPos);
    if (trail.length > 100)
        trail.shift();

    // camera follows player
    cameraPos.x = playerPos.x + 8;

    // find nearest node to grab
    nearNode = 0;
    let nearDistance = 1e4;
    for (let n = firstNode(), i=5; i--; n++)
    {
        const distance = playerPos.distance(nodePos(n));
        if (distance < nearDistance)
            nearDistance = distance, nearNode = n;
    }

    // die when crashing into a wall or a node
    dead ||= abs(playerPos.y) > getCameraSize().y/2;
    dead ||= nearDistance < nodeSize;

    // mouse controls
    if (mouseWasPressed(0) && nearNode)
    {
        // grab nearest node and swing around it
        const delta = playerPos.subtract(nodePos(nearNode));
        grabPhi = delta.angle();
        const playerDirection = vec2().setAngle(playerAngle);
        grabSpin = delta.cross(playerDirection) < 0 ? 1 : -1;
        grabNode = nearNode;
        grabRadius = nearDistance;
    }
    if (mouseWasReleased(0))
        grabNode = 0;
}

function gameRender()
{
    // draw tether to target node
    const tetherColor = hsl(0, 0, grabNode ? 1 : .2);
    drawLine(playerPos, nodePos(grabNode || nearNode), .3, tetherColor);

    // draw nodes
    for (let n = firstNode(), i=5; i--; n++)
        drawCircle(nodePos(n), nodeSize*2, hsl(n/7, 1, .5));

    // draw player trail
    for (let i = trail.length; i--;)
        drawCircle(trail[i], i/trail.length, hsl(-i/99, 1, .5));

    // draw player
    drawCircle(playerPos, .7);

    // draw distance traveled
    drawTextScreen(playerPos.x/nodeSpread.x|0, vec2(70), 70);
}

/* info
A one button game. A ball flies in a straight line past a row of
colored nodes. Hold the mouse button to grab the nearest node and swing
around it, and let go to fly off straight again. Touching a node, or
leaving the top or bottom of the view, ends the run, and a click starts
a new one. The number is how many nodes the ball has passed.

## How it works
There are no engine objects here. The whole game is a few variables,
changed in `gameUpdate` and drawn in `gameRender`.

### The nodes
The nodes are never stored. `nodePos(n)` works out where node `n` is:
`n` times 20 units along `x`, and a height from `sin(n**3.3 + seed)`,
which jumps about like a random number from -1 to 1 and is scaled to 6
units up or down. The same `n` always gives the same place, and `seed`,
picked in `gameInit`, makes each run different.

`firstNode()` is the number of a node off the left of the view. The
update and the drawing both look at 5 nodes from there, which is enough
to cover the view. It is never below 1, because 0 is used to
mean no node in `grabNode` and `nearNode`.

### Flying and swinging
An angle of 0 is up and angles go clockwise, so `playerAngle = PI/2`
starts the ball flying right. `vec2().setAngle(angle, length)` makes
a vector of that length along the angle.

- Free, the ball moves `speed` units along `playerAngle` each frame.
- Grabbed, it moves on a circle around the node. `grabPhi` is the
  angle from the node to the ball and `grabRadius` the length of the
  tether. Each frame the angle grows by `speed / grabRadius`, which is
  the same `speed` measured along the circle, so a short tether swings
  faster around. `grabSpin` is 1 or -1 for clockwise or the other way.
- `playerAngle` is kept a quarter turn on from `grabPhi`, the way the
  ball is moving on the circle. Letting go needs no more code: the ball
  flies on along that angle.

### Grabbing
On the frame the button goes down, `delta` is the vector from the node
to the ball. Its `angle()` is the first `grabPhi` and the distance is
the radius, so the ball is on the circle already and does not jump.

The spin comes from `delta.cross(playerDirection)`. The cross product
of two 2D vectors is one number, and its sign says which side of the
first the second points to. That picks the way around that the ball is
already heading. `mouseWasReleased(0)` sets `grabNode` back to 0.

### The rest of gameUpdate
- `trail` keeps the ball's last 100 positions: `push` adds the newest
  and `shift` drops the oldest.
- `cameraPos.x` stays 8 units ahead of the ball.
- `getCameraSize()` is the size of the view in world units. The camera
  never moves up or down, so a `y` past half of it is off the screen.
- `dead ||= ...` sets `dead` once and keeps it. While it is set,
  `gameUpdate` returns at its top and everything holds still.

### gameRender
Later draws cover earlier ones. `drawLine` draws the tether .3 units
wide, white while grabbed and dark grey when it only points at the node
a click would take. `drawCircle` takes a diameter, so the nodes are
`nodeSize*2` across, and a ball center closer than `nodeSize` has hit
one. The trail is circles that shrink toward its old end, with the hue
changing along it.

`drawTextScreen` draws in pixels from the top left of the canvas, so
`vec2(70)` and the size of 70 keep the score in the corner whatever the
camera does.

## Try it
- Fly faster: `speed = .2` to `speed = .3`.
- Shrink the nodes: `nodeSize = 2` to `nodeSize = 1`.
- Bring the nodes closer: `vec2(20, 6)` to `vec2(12, 6)`.
- Keep a longer trail: `trail.length > 100` to `trail.length > 300`.

## See also
Vectors shows more vector math. Hill Glide Game is another
game of momentum with one button, and Ball Track Game also has a level
that never ends. Look up `setAngle`, `cross`, `drawLine` and
`drawTextScreen`.
*/
