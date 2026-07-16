// Sky Dreams - a pseudo-3D endless flyer drawn in screen space
// Inspired by the 1K game "Sky Dreams" by Frank Force (Killed By A Pixel).
// The track is projected far-to-near onto the screen, then everything is drawn
// with LittleJS screen-space draw functions (drawRect, drawPoly, drawCircle).

const cameraInFront = 3; // how far ahead of the ship the camera sits
const focalLength = .7;  // projection focal length

let shipX, shipY, shipZ, shipVelY;                // ship position and vertical speed
let trackGap, trackStartX, trackWidth, trackRows; // procedural track state
let resetTimer;                                   // delay before auto-reset after a fall

// css-style hsl (degrees, percent) to match the original source
function hslDeg(h, s, l, a=1) { return hsl(h/360, s/100, l/100, a); }

// draw a screen-space rect from a top-left corner and size (like canvas fillRect)
function fillRect(x, y, w, h, color)
{
    drawRect(vec2(x + w/2, y + h/2), vec2(abs(w), abs(h)), color, 0, glEnable, true);
}

// draw a screen-space quad from four pixel points
// (screen-space polys are drawn with Y negated because screen space is y-down)
function fillQuad(a, b, c, d, color)
{
    const points = [vec2(a.x,-a.y), vec2(b.x,-b.y), vec2(c.x,-c.y), vec2(d.x,-d.y)];
    drawPoly(points, color, 0, BLACK, vec2(), 0, glEnable, true);
}

// project a point (px, py) at forward distance dz to screen pixels
// returns [screen position, scale]
function project(px, py, dz)
{
    const scale = mainCanvasSize.y * focalLength / dz;
    const sway = (dz - cameraInFront)**2 / 50 * cos((shipZ + dz) / 49);
    return [vec2(
        mainCanvasSize.x/2 + (px - shipX + sway) * scale,
        mainCanvasSize.y/2 - (py - 2 + dz*dz/50) * scale), scale];
}

// build track rows up to maxRow if they do not exist yet
function generateTrack(maxRow)
{
    for (let i = trackRows.length; i <= maxRow; )
    {
        // occasionally open a gap in the track
        if (trackGap < -8 && rand() < min(.2, i/1e4))
            trackGap = 2 + min(4, i/400);

        // occasionally move and resize the track span (width 2-4)
        if (rand() < .1)
        {
            trackWidth = 2 + rand(3) | 0;
            trackStartX = max(0, min(7 - trackWidth, trackStartX - 2 + rand(5) | 0));
        }
        trackGap--;

        // build a row of 7 tiles (1 = solid, 0 = empty)
        const row = trackRows[i++] = [];
        for (let j = 7; j--;)
        {
            row[j] = i < 40                    // solid start area
                | rand() > .9                  // random pillars
                | trackGap < 0                 // outside a gap
                & trackStartX <= j & j < trackStartX + trackWidth  // within the span
                & rand() > min(.2, shipZ/1e4); // random holes grow with distance
        }
    }
}

function resetGame()
{
    shipX = shipY = shipZ = shipVelY = trackGap = 0;
    trackStartX = trackWidth = 3;
    trackRows = [];
    resetTimer.unset();
}

function gameInit()
{
    resetTimer = new Timer;
    resetGame();
}

function gameUpdate()
{
    // if the ship fell off, auto-reset after a moment (or on a fresh jump press)
    if (shipY < -4)
    {
        if (!resetTimer.isSet())
            resetTimer.set(1.5);
        if (resetTimer.elapsed() || mouseWasPressed(0) || keyWasPressed('Space'))
            resetGame();
        return;
    }

    // make sure the track exists far enough ahead
    generateTrack(shipZ + 42 | 0);

    // steer with the keyboard, or with horizontal mouse position
    if (keyIsDown('ArrowLeft') || keyIsDown('KeyA'))
        shipX -= .1;
    else if (keyIsDown('ArrowRight') || keyIsDown('KeyD'))
        shipX += .1;
    else
        shipX += (mousePosScreen.x / mainCanvasSize.x - .5) / 2;

    // apply gravity and ramp up forward speed with distance
    shipVelY -= .006;
    shipY += shipVelY;
    shipZ += min(.5, .2 + shipZ/5e3);

    // land on the track and hop (bounces while jump is held)
    const jump = mouseIsDown(0) || keyIsDown('Space') ? .1 : 0;
    const landRow = trackRows[shipZ + cameraInFront | 0];
    if (shipY < 0 && shipY > -.3 && landRow && landRow[round(shipX + 3)])
        shipY = shipVelY = jump;
}

function gameRenderPost()
{
    const W = mainCanvasSize.x, H = mainCanvasSize.y;

    // draw the sky gradient and stars
    for (let i = 500; i--;)
    {
        // sky band, hue slowly drifts as you fly forward
        fillRect(0, H*i/500, W, H/250, hslDeg(170 + i/9 + shipZ, 70, 70 - i/10));

        // scattered stars
        const starSize = i%4 * H/500;
        fillRect((i*i + shipZ*i/20) % W, i**3.3 % H, starSize, starSize, WHITE);
    }

    // draw the track from far to near
    for (let r = shipZ + 40 | 0; r > shipZ; r--)
    {
        const row = trackRows[r];
        if (!row)
            continue;

        // pass 1 draws the back faces, pass 2 the front faces and tops
        for (let j = 2; j--;)
        for (let i = 7; i--;)
        {
            if (!row[i])
                continue;

            // project the four corners of this tile
            const dz = r - shipZ;
            const [a] = project(i - 3.5, 0, dz);
            const [b] = project(i - 2.5, 0, dz);
            const [e] = project(i - 3.5, 0, dz + 1);
            const [f] = project(i - 2.5, 0, dz + 1);

            const hue = 99 + (r >> 7) * 70;      // hue shifts every 128 rows
            const checker = r + i & 1;           // checkerboard shading
            const height = (40 - r + shipZ) / 30 * H; // face height shrinks with distance

            if (j)
            {
                // back face (far edge)
                fillRect(e.x, e.y, f.x - e.x, height, hslDeg(hue, 70, 30 + checker*9));
            }
            else
            {
                // front face (near edge)
                fillRect(a.x, a.y, b.x - a.x, height, hslDeg(hue, 70, 9 + checker*5));

                // top surface
                fillQuad(a, b, f, e, hslDeg(hue, 70, 60 + checker*30));
            }
        }
    }

    // draw the shadow when the ship is above solid track
    const shadowRow = trackRows[shipZ + cameraInFront | 0];
    if (shipY >= 0 && shadowRow && shadowRow[round(shipX + 3)])
    {
        const [p, s] = project(shipX, 0, cameraInFront);
        drawEllipse(p, vec2(s/2, s*2/9), hslDeg(0, 0, 0, .5), 0, 0, BLACK, glEnable, true);
    }

    // draw the glowing player orb as a stack of shrinking circles
    for (let i = 99; i--;)
    {
        const [p, s] = project(shipX + .1 - i/1e3, shipY + .35 - i/1e3, cameraInFront);
        drawCircle(p, i*s/150, hslDeg(shipZ/9 - i, 90, 99 - i*.7), 0, BLACK, glEnable, true);
    }
}
