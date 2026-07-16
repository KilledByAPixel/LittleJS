cameraInFront = 3;
focalLength = .7;
shipPos = vec2();
shipVelY = cameraZ = trackGap = 0;
trackStartX = trackWidth = 3;
trackRows = [];

function project(px, py, dz)
{
    const scale = getCameraSize().y * focalLength / dz;
    const sway = (dz - cameraInFront)**2 / 50 * cos((cameraZ + dz) / 49);
    return [vec2(
        (px - shipPos.x + sway) * scale,
        (py - 2 + dz*dz/50) * scale), scale];
}

function generateTrack(maxRow)
{
    for (let i = trackRows.length; i <= maxRow; )
    {
        if (trackGap < -8 && rand() < min(.2, i/1e4))
            trackGap = min(6, 2 + i/400);
        if (rand() < .1)
        {
            trackWidth = randInt(2,5);
            trackStartX = max(0, min(7 - trackWidth, trackStartX + randInt(-2,3)));
        }
        trackGap--;

        const row = trackRows[i++] = [];
        for (let j = 7; j--;)
            row[j] = i < 40 || trackGap < 0 
            && rand() > clamp(cameraZ/1e4, .2, .5);
    }
}

function gameUpdate()
{
    if (shipPos.y < -4)
        return;

    generateTrack(cameraZ + 42 | 0);

    // steer with arrow/WASD keys or mouse
    shipPos.x += keyDirection().x*.1 || (mousePosScreen.x/mainCanvasSize.x - .5)/2;

    // gravity and forward speed ramp
    shipVelY -= .006;
    shipPos.y += shipVelY;
    cameraZ += min(.5, .2 + cameraZ/5e3);

    // land and hop while jump is held
    const jump = mouseIsDown(0) || keyIsDown('Space') ? .1 : 0;
    const landRow = trackRows[cameraZ + cameraInFront | 0];
    if (shipPos.y < 0 && shipPos.y > -.3 && landRow && landRow[round(shipPos.x + 3)])
        shipPos.y = shipVelY = jump;
}

function gameRenderPost()
{
    // sky gradient
    drawRectGradient(vec2(), getCameraSize(),
        hsl((170 + cameraZ)/360, .7, .7), hsl((225 + cameraZ)/360, .7, .2));

    // track from far to near
    for (r = cameraZ + 40 | 0; r > cameraZ; r--)
    {
        row = trackRows[r];
        if (!row)
            continue;

        for (i = 7; i--;)
        {
            if (!row[i])
                continue;

            dz = r - cameraZ;
            [a] = project(i - 3.5, 0, dz);
            [b] = project(i - 2.5, 0, dz);
            [e] = project(i - 3.5, 0, dz + 1);
            [f] = project(i - 2.5, 0, dz + 1);
            hue = (99 + (r >> 7) * 70) / 360;
            checker = r + i & 1;
            height = 40 - r + cameraZ;

            // front face
            drawPoly([a, b, f, e], hsl(hue, .7, .6 + checker*.5));
        }
    }

    // draw player shadow
    playerTrack = trackRows[cameraZ + cameraInFront | 0][round(shipPos.x + 3)];
    if (shipPos.y >= 0 && playerTrack)
    {
        [p, s] = project(shipPos.x, 0, cameraInFront);
        drawEllipse(p, vec2(s/2, s*2/9), hsl(0, 0, 0, .5));
    }

    // draw player
    for (i = 99; i--;)
    {
        [p, s] = project(shipPos.x + .1 - i/1e3, shipPos.y + .35 - i/1e3, cameraInFront);
        drawCircle(p, i*s/150, hsl((cameraZ/9 - i)/360, .9, .99 - i*.007));
    }
}
