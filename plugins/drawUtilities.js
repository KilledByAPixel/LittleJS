/**
 * LittleJS Drawing Utilities Plugin
 * - Extra drawing functions for LittleJS
 * - Nine slice and three slice drawing
 * @namespace DrawUtilities
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Draw a scalable nine-slice UI element to the overlay canvas in screen space
 *  This function can not apply color because it draws using the overlay 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Starting tile for the nine-slice pattern
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawNineSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawNineSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true, overlayContext);
}

/** Draw a scalable nine-slice UI element in world space
 *  This function can apply color and additive color if webgl is enabled
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

/** Draw a scalable three-slice UI element to the overlay canvas in screen space
 *  This function can not apply color because it draws using the overlay 2d context
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Starting tile for the three-slice pattern
 *  @param {number} [borderSize] - Width of the border sections
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @memberof DrawUtilities */
function drawThreeSliceScreen(pos, size, startTile, borderSize=32, extraSpace=2, angle=0)
{
    drawThreeSlice(pos, size, startTile, WHITE, borderSize, BLACK, extraSpace, angle, false, true, overlayContext);
}

/** Draw a scalable three-slice UI element in world space
 *  This function can apply color and additive color if webgl is enabled
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