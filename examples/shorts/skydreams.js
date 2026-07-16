const cameraInFront = 3, focalLength = .7;

let shipPos, shipVelY, cameraZ;
let trackGap, trackStartX, trackWidth, trackRows;

// hsl using css-style degrees and percent
function hslDeg(h, s, l, a=1) { return hsl(h/360, s/100, l/100, a); }

// draw a screen-space rect from a top-left corner and size
function fillRect(x, y, w, h, color)
{
    drawRect(vec2(x + w/2, y + h/2), vec2(abs(w), abs(h)), color, 0, glEnable, true);
}

// draw a screen-space quad from four pixel points (Y negated because screen space is y-down)
function fillQuad(a, b, c, d, color)
{
    const points = [vec2(a.x,-a.y), vec2(b.x,-b.y), vec2(c.x,-c.y), vec2(d.x,-d.y)];
    drawPoly(points, color, 0, BLACK, vec2(), 0, glEnable, true);
}

// project a point at forward distance dz to [screen position, scale]
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
            trackGap = 2 + min(4, i/400);
        if (rand() < .1)
        {
            trackWidth = 2 + rand(3) | 0;
            trackStartX = max(0, min(7 - trackWidth, trackStartX - 2 + rand(5) | 0));
        }
        trackGap--;

        const row = trackRows[i++] = [];
        for (let j = 7; j--;)
            row[j] = i < 40                    // solid start area
                | rand() > .9                  // pillars
                | trackGap < 0                 // outside a gap
                & trackStartX <= j & j < trackStartX + trackWidth
                & rand() > min(.2, cameraZ/1e4); // holes grow with distance
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
        hslDeg(170 + cameraZ, 70, 70), hslDeg(225 + cameraZ, 70, 20), 0, glEnable, true);

    // stars
    for (let i = 500; i--;)
    {
        const starSize = i%4 * H/500;
        fillRect((i*i + cameraZ*i/20) % W, i**3.3 % H, starSize, starSize, WHITE);
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
            const hue = 99 + (r >> 7) * 70;
            const checker = r + i & 1;
            const height = (40 - r + cameraZ) / 30 * H;

            if (j)
                fillRect(e.x, e.y, f.x - e.x, height, hslDeg(hue, 70, 30 + checker*9));
            else
            {
                fillRect(a.x, a.y, b.x - a.x, height, hslDeg(hue, 70, 9 + checker*5));
                fillQuad(a, b, f, e, hslDeg(hue, 70, 60 + checker*30));
            }
        }
    }

    // shadow when above solid track
    const shadowRow = trackRows[cameraZ + cameraInFront | 0];
    if (shipPos.y >= 0 && shadowRow && shadowRow[round(shipPos.x + 3)])
    {
        const [p, s] = project(shipPos.x, 0, cameraInFront);
        drawEllipse(p, vec2(s/2, s*2/9), hslDeg(0, 0, 0, .5), 0, 0, BLACK, glEnable, true);
    }

    // glowing player orb
    for (let i = 99; i--;)
    {
        const [p, s] = project(shipPos.x + .1 - i/1e3, shipPos.y + .35 - i/1e3, cameraInFront);
        drawCircle(p, i*s/150, hslDeg(cameraZ/9 - i, 90, 99 - i*.7), 0, BLACK, glEnable, true);
    }
}
