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
        drawCircle(nodePos(n), nodeSize*2, hsl(n/9, 1, .5));

    // draw player trail
    for (let i = trail.length; i--;)
        drawCircle(trail[i], i/trail.length, hsl(i/300, 1, .5));

    // draw player
    drawCircle(playerPos, .7);

    // draw distance traveled
    drawTextScreen(playerPos.x/nodeSpread.x|0, vec2(70), 70);
}