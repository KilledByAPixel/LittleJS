const cameraDistance = 3, focalLength = .7;
let playerPos = vec2(), playerYSpeed = 0, playerZ = 0
let trackX = 0, trackWidth = 3, trackGap = 0;
let trackRows = [];

function project(px, py, dz)
{
    const s = getCameraSize().y * focalLength / dz;
    const lift = dz**2 / 50;
    const sway = (dz - cameraDistance)**2 * cos((playerZ + dz) / 50) / 50;
    return vec2((px - playerPos.x + sway) * s, (py - 2 + lift) * s);
}

function gameUpdate()
{
    if (playerPos.y < -4)
        return;
    
    // create more track if needed
    for (let i = trackRows.length; i <= playerZ + 50; )
    {
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

    // land and jump
    if (trackRows[playerZ + cameraDistance | 0][round(playerPos.x + 3)])
    if (playerPos.y < 0 && playerPos.y > -.3)
        playerPos.y = playerYSpeed = mouseWasPressed(0) && .1;
}

function gameRender()
{
    // background sky gradient
    drawRectGradient(vec2(), vec2(30), hsl(.5,1,.7), hsl(.7,1,.2));

    // draw track from far to near
    for (let r = playerZ + 40 | 0; r > playerZ; r--)
    for (let i = 7; i--;)
    {
        const dz = r - playerZ;
        const p = [
            project(i - 3.5, 0, dz),
            project(i - 2.5, 0, dz),
            project(i - 2.5, 0, dz + 1),
            project(i - 3.5, 0, dz + 1)];
        const c = hsl(.3, .6, r+i&1?.4:.9);
        if (trackRows[r][i])
           drawPoly(p, c);
    }

    // draw player shadow
    const s = getCameraSize().y * focalLength / cameraDistance;
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