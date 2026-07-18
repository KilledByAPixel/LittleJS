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
            trackX = randInt(0, 7-trackWidth);
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