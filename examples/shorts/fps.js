let playerPos = vec2(), playerAngle = 0;
setTileFixBleedScale(0);

// a simple function to create the level
const levelTest = (p)=> (Math.floor(p.x)**3&Math.floor(p.y)**2)%30>5;

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
        // draw horizontal slizes to create floor and ceiling
        const h = 9;
        let pos = vec2(), size = vec2(39, .15), color = rgb();
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
        const tileInfo = new TileInfo(vec2(), vec2(0,16));
        const normal = vec2(), light = vec2().setAngle(2);
        const color = rgb();
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
            tileInfo.pos.x = 161 + 14*t;

            // apply fog and lighting
            const d = p.distance(playerPos)/maxDistance;
            const l = max(0, normal.dot(light));
            size.y = .5/d;
            color.setHSLA(.6, 1-d, .7-d+l*.3);

            // draw the section the wall
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