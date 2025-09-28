let playerPos = vec2(), playerAngle = 0;

// a simple function to generate a level
const levelTest = (X,Y)=> ((X|0)**3&(Y|0)**2)%30>5;

// cast a ray and return the distance to the first wall hit (0-1)
function raycast(pos, angle)
{
    const maxDistance = 40, delta = .05;
    const rayX = delta*Math.sin(angle);
    const rayY = delta*Math.cos(angle);
    let posX = pos.x, posY = pos.y;
    for (let distance = 0; distance < maxDistance; distance += delta)
    {
        if (levelTest(posX, posY))
            return distance/maxDistance;
        posX += rayX;
        posY += rayY;
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
    if (!levelTest(newPos.x, newPos.y))
        playerPos = newPos;
}

function gameRender()
{
    {
        // draw horizontal slizes to create floor and ceiling
        const h = 9;
        let pos = vec2(), size = vec2(39, .11), color = WHITE;
        for (let y=-h; y<h; y+=.1)
        {
            const p = 1.01-abs(y/h)
            pos.y = y;
            color.setHSLA(.1, y>0?0:.5, .7-p*.7);
            drawRect(pos, size, color);
        }
    }
    {
        // draw vertical slices to create the walls
        const w = 20;
        let pos = vec2(), size = vec2(.11), color = WHITE;
        for (let x=-w; x<w; x+=.1)
        {
            const p = raycast(playerPos, playerAngle + x/w);
            pos.x = x;
            size.y = .4/p;
            color.setHSLA(.6, .5, .7-p*.7);
            drawRect(pos, size, color);
        }
    }
    // draw instructions and pointer lock status
    const instructions = pointerLockIsActive() ? 'Mouse Control Active - ESC To Exit' : 'Click To Enable Mouse Control';
    if (!isTouchDevice)
        drawTextScreen(instructions, vec2(mainCanvasSize.x/2, 50), 24, pointerLockIsActive() ? GREEN : WHITE);
}