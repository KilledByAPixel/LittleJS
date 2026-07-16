const cameraInFront = 3, focalLength = .7;

// project a point at forward distance dz
function project(px, py, dz)
{
    const scale = mainCanvasSize.y * focalLength / dz;
    const sway = (dz - cameraInFront)**2 / 50 * cos((cameraZ + dz) / 49);
    return [vec2(
        mainCanvasSize.x/2 + (px - shipPos.x + sway) * scale,
        mainCanvasSize.y/2 - (py - 2 + dz*dz/50) * scale), scale];
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
            row[j] = i < 40
                || rand() > .9
                || trackGap < 0 
                && trackStartX <= j && j < trackStartX + trackWidth
                && rand() > min(.2, cameraZ/1e4); // holes grow with distance
    }
}

function resetGame()
{
    shipPos = vec2();
    shipVelY = cameraZ = trackGap = 0;
    trackStartX = trackWidth = 3;
    trackRows = [];
}

function gameInit()
{
    resetGame();
}

function gameUpdate()
{
    // once fallen off, wait for a click or jump press to restart
    if (shipPos.y < -4)
    {
        if (mouseWasPressed(0) || keyWasPressed('Space'))
            resetGame();
        return;
    }

    generateTrack(cameraZ + 42 | 0);

    // steer with arrow/WASD keys, or with the mouse when no key is held
    const steer = keyDirection().x + keyDirection('KeyW','KeyS','KeyA','KeyD').x;
    shipPos.x += steer ? steer*.1 : (mousePosScreen.x/mainCanvasSize.x - .5)/2;

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
    const W = mainCanvasSize.x, H = mainCanvasSize.y;

    // sky gradient
    drawRectGradient(vec2(W/2, H/2), vec2(W, H),
        hsl((170 + cameraZ)/360, .7, .7), hsl((225 + cameraZ)/360, .7, .2), 0, glEnable, true);

    // stars
    for (let i = 500; i--;)
    {
        const starSize = i%4 * H/500;
        drawRect(vec2((i*i + cameraZ*i/20) % W, i**3.3 % H), vec2(starSize), WHITE, 0, glEnable, true);
    }

    // track from far to near (pass 1 = back faces, pass 2 = front faces and tops)
    for (let r = cameraZ + 40 | 0; r > cameraZ; r--)
    {
        const row = trackRows[r];
        if (!row)
            continue;

        for (let j = 2; j--;)
        for (let i = 7; i--;)
        {
            if (!row[i])
                continue;

            const dz = r - cameraZ;
            const [a] = project(i - 3.5, 0, dz);
            const [b] = project(i - 2.5, 0, dz);
            const [e] = project(i - 3.5, 0, dz + 1);
            const [f] = project(i - 2.5, 0, dz + 1);
            const hue = (99 + (r >> 7) * 70) / 360;
            const checker = r + i & 1;
            const height = (40 - r + cameraZ) / 30 * H;

            if (j) // back face (far edge)
                drawRect(vec2((e.x + f.x)/2, e.y + height/2), vec2(f.x - e.x, height),
                    hsl(hue, .7, .3 + checker*.09), 0, 1, 1);
            else
            {
                // front face (near edge) and top surface
                drawRect(vec2((a.x + b.x)/2, a.y + height/2), vec2(b.x - a.x, height),
                    hsl(hue, .7, .09 + checker*.05), 0, 1, 1);

                // top quad (Y negated because screen space is y-down)
                const top = [vec2(a.x,-a.y), vec2(b.x,-b.y), vec2(f.x,-f.y), vec2(e.x,-e.y)];
                drawPoly(top, hsl(hue, .7, .6 + checker*.3), 0, BLACK, vec2(), 0, 1, 1);
            }
        }
    }

    // shadow when above solid track
    if (shipPos.y >= 0 && trackRows[cameraZ + cameraInFront | 0][round(shipPos.x + 3)])
    {
        [p, s] = project(shipPos.x, 0, cameraInFront);
        drawEllipse(p, vec2(s/2, s*2/9), hsl(0, 0, 0, .5), 0, 0, BLACK, 1, 1);
    }

    // glowing player orb
    for (i = 99; i--;)
    {
        [p, s] = project(shipPos.x + .1 - i/1e3, shipPos.y + .35 - i/1e3, cameraInFront);
        drawCircle(p, i*s/150, hsl((cameraZ/9 - i)/360, .9, .99 - i*.007), 0, BLACK, 1, 1);
    }
}
