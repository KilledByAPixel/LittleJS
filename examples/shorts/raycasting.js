let playerPos = vec2(), playerAngle = 0;
const levelTest = (pos)=> ((pos.x|0)**2|(pos.y|0)**4)%3>1;

function raycast(pos, angle)
{
    const maxDistance = 40, delta = .05;
    const rayDir = vec2(0,delta).rotate(angle);
    pos = pos.copy();
    for (let distance = 0; distance<maxDistance; distance+=delta)
    {
        if (levelTest(pos))
            return distance/maxDistance;
        pos.x += rayDir.x;
        pos.y += rayDir.y;
    }
    return 1;
}

function gameUpdate()
{
    // update camera angle with mouse pointer lock
    if (mouseWasPressed(0))
        pointerLockRequest();
    if (keyWasPressed('Escape'))
        pointerLockExit()
    if (pointerLockIsActive() || isTouchDevice)
        playerAngle += mouseDelta.x * .003;

    // update player movement, prevent walking through walls
    const velocity = keyDirection().scale(.1).rotate(playerAngle);
    const newPos = playerPos.add(velocity);
    if (!levelTest(newPos))
        playerPos = newPos;
}

function gameRender()
{
    // draw horizontal slizes to create floor and ceiling
    const h=9;
    for (let y=-h; y<h; y+=.1)
    {
        const p = 1.01-abs(y/h)
        drawRect(vec2(0,y), vec2(39,.11), hsl(.1,y>0?0:.5,.7-p*.7));
    }

    // draw vertical slices to create the walls
    const w=20;
    for (let x=-w; x<w; x+=.1)
    {
        const p = raycast(playerPos, playerAngle + x/w);
        drawRect(vec2(x,0), vec2(.11,.4/p), hsl(.6,.5,.7-p*.7));
    }

    // draw instructions and pointer lock status
    const instructions = pointerLockIsActive() ? 'Mouse Control Active - ESC To Exit' : 'Click To Enable Mouse Control';
    if (!isTouchDevice)
        drawTextScreen(instructions, vec2(mainCanvasSize.x/2, 50), 24, pointerLockIsActive() ? GREEN : WHITE);
}