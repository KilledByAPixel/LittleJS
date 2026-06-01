/**
 * LittleJS Drawing Utilities Plugin
 * - Extra drawing functions for LittleJS
 * - Nine slice and three slice drawing
 * @namespace DrawUtilities
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Draw a scalable nine-slice UI element to the main canvas in screen space
 *  This function can not apply color because it draws using the 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Starting tile for the nine-slice pattern
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawNineSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawNineSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true);
}

/** Draw a scalable nine-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - Starting tile for the nine-slice pattern
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup nine slice tiles
    const centerTile = startTile.offset(startTile.size);
    const centerSize = size.add(vec2(extraSpace-borderSize*2));
    const cornerSize = vec2(borderSize);
    const cornerOffset = size.scale(.5).subtract(cornerSize.scale(.5));
    const flip = screenSpace ? -1 : 1;
    const rotateAngle = screenSpace ? -angle : angle;

    // center
    drawTile(pos, centerSize, centerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    for (let i=4; i--;)
    {
        // sides
        const horizontal = i%2;
        const sidePos = cornerOffset.multiply(vec2(horizontal?i===1?1:-1:0, horizontal?0:i?-1:1));
        const sideSize = vec2(horizontal ? borderSize : centerSize.x, horizontal ? centerSize.y : borderSize);
        const sideTile = centerTile.offset(startTile.size.multiply(vec2(i===1?1:i===3?-1:0,i===0?-flip:i===2?flip:0)))
        drawTile(pos.add(sidePos.rotate(rotateAngle)), sideSize, sideTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }
    for (let i=4; i--;)
    {
        // corners
        const flipX = i>1;
        const flipY = i && i<3;
        const cornerPos = cornerOffset.multiply(vec2(flipX?-1:1, flipY?-1:1));
        const cornerTile = centerTile.offset(startTile.size.multiply(vec2(flipX?-1:1,flipY?flip:-flip)));
        drawTile(pos.add(cornerPos.rotate(rotateAngle)), cornerSize, cornerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }
}

/** Draw a scalable three-slice UI element to the main canvas in screen space
 *  This function can not apply color because it draws using the 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Starting tile for the three-slice pattern
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawThreeSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawThreeSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true);
}

/** Draw a scalable three-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - Starting tile for the three-slice pattern
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup three slice tiles
    const cornerTile = startTile.frame(0);
    const sideTile   = startTile.frame(1);
    const centerTile = startTile.frame(2);
    const centerSize = size.add(vec2(extraSpace-borderSize*2));
    const cornerSize = vec2(borderSize);
    const cornerOffset = size.scale(.5).subtract(cornerSize.scale(.5));
    const flip = screenSpace ? -1 : 1;
    const rotateAngle = screenSpace ? -angle : angle;

    // center
    drawTile(pos, centerSize, centerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    for (let i=4; i--;)
    {
        // sides
        const a = angle + i*PI/2;
        const horizontal = i%2;
        const sidePos = cornerOffset.multiply(vec2(horizontal?i===1?1:-1:0, horizontal?0:i?-flip:flip));
        const sideSize = vec2(horizontal ? centerSize.y : centerSize.x, borderSize);
        drawTile(pos.add(sidePos.rotate(rotateAngle)), sideSize, sideTile, color, a, false, additiveColor, useWebGL, screenSpace, context);
    }
    for (let i=4; i--;)
    {
        // corners
        const a = angle + i*PI/2;
        const flipX = !i || i>2;
        const flipY = i>1;
        const cornerPos = cornerOffset.multiply(vec2(flipX?-1:1, flipY?-flip:flip));
        drawTile(pos.add(cornerPos.rotate(rotateAngle)), cornerSize, cornerTile, color, a, false, additiveColor, useWebGL, screenSpace, context);
    }
}

/** Draw a crescent / moon-phase shape built from a polygon
 *  Routes through drawPoly, so it supports WebGL, screen space, color, and outlines
 *  @param {Vector2} pos - Center position
 *  @param {number}  [size] - Diameter
 *  @param {number}  [percent] - Moon phase over a full cycle (0=new, .25=first quarter, .5=full, .75=last quarter), wraps
 *  @param {Color}   [color] - Fill color
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [invert] - Flip which side is illuminated
 *  @param {number}  [lineWidth] - Outline width, 0 for no outline
 *  @param {Color}   [lineColor] - Outline color
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawCrescent(pos, size=1, percent=0, color=WHITE, angle=0, invert=false, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    // build local-space points and let drawPoly apply pos/angle so screen space works
    const points = getCrescentPoints(vec2(), size, percent, 0, invert);
    drawPoly(points, color, lineWidth, lineColor, pos, angle, useWebGL, screenSpace, context);
}

/** Get the list of points that make up a crescent / moon-phase shape
 *  Returns world-space points with pos and angle baked in, ready for drawPoly or other use
 *  @param {Vector2} pos - Center position
 *  @param {number}  [size] - Diameter
 *  @param {number}  [percent] - Moon phase over a full cycle (0=new, .25=first quarter, .5=full, .75=last quarter), wraps
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [invert] - Flip which side is illuminated
 *  @param {number}  [sides=glCircleSides] - Number of sides for a full circle (halved per arc)
 *  @return {Array<Vector2>} - List of points making up the crescent
 *  @memberof DrawUtilities */
function getCrescentPoints(pos, size=1, percent=0, angle=0, invert=false, sides=glCircleSides)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size) && isNumber(percent), 'size and percent must be numbers');

    // map phase to a signed terminator curve: -1 new, 0 half, 1 full
    let p = mod(percent*4, 4); // quarter phase 0..4
    if (p >= 2)                // second half of cycle flips orientation
        angle += PI;
    p = p <= 2 ? p-1 : 3-p;
    if (invert)                // flip the illuminated side
    {
        p = -p;
        angle += PI;
    }

    // build the crescent: outer semicircle, then inner half-ellipse traced back
    const points = [];
    const segs = max(3, sides>>1);
    const radius = size/2;
    for (let i=0; i<=segs; i++)
    {
        const t = i/segs*PI;
        points.push(vec2(radius*cos(t), radius*sin(t)).rotate(angle).add(pos));
    }
    for (let i=segs; i>=0; i--)
    {
        const t = i/segs*PI;
        points.push(vec2(radius*cos(t), -radius*p*sin(t)).rotate(angle).add(pos));
    }
    return points;
}