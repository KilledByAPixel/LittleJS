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
            row[j] = i < 40 || trackGap < 0
                && trackX <= j && j < trackX + trackWidth;
    }

    // player control and physics
    playerPos.x += keyDirection().x * .1;
    playerPos.y += playerYSpeed -= .006;
    playerZ += min(.5, .2 + playerZ/5e3);

    // land and jump
    if (trackRows[playerZ + cameraDistance | 0][round(playerPos.x + 3)])
    if (playerPos.y < 0 && playerPos.y > -.3)
        playerPos.y = playerYSpeed = keyIsDown('Space') && .1;
}

function gameRender()
{
    // background sky gradient
    drawRectGradient(vec2(), getCameraSize(),
        hsl(.5, .8, .7), hsl(.7, .8, .2));

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
        const c = hsl(0, 0, 0, .5);
        drawEllipse(p, vec2(s/2, s/4), c);
    }

    // draw player
    const p = project(playerPos.x, playerPos.y + .25, cameraDistance);
    for (let i = 99; i--;)
    {
        const c = hsl(0, .9, 1 - i/150);
        drawCircle(p.add(vec2(-i*s/1e3)), i*s/150, c);
    }
}