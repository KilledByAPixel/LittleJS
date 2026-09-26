/**
 * LittleJS Drawing Utilities Plugin
 * - Extra drawing functions for LittleJS
 * - Nine slice and three slice drawing, and TileSlice to keep one as a style, like a UI skin
 * @namespace DrawUtilities
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Draw a scalable nine-slice UI element in screen space, drawNineSlice with screenSpace set
 *  - Draws with the 2D context by default, on top of what WebGL drew, like drawTextScreen
 *  - With no angle its pieces land on whole pixels and meet exactly, so pixel art lines up and extraSpace is not used
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - Top-left tile of the 3x3 block to sample (see drawNineSlice)
 *  @param {Color} [color=WHITE] - Color to modulate with
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL] - Use WebGL for rendering
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawNineSliceScreen(pos, size, startTile, color=WHITE, borderSize=32, additiveColor, extraSpace=2, angle=0, useWebGL=false, context)
{
    drawNineSlice(pos, size, startTile, color, borderSize, additiveColor, extraSpace, angle, useWebGL, true, context);
}

/** Draw a scalable nine-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  The nine-slice samples a 3x3 block of tiles from the tilesheet, it does not
 *  subdivide a single tile. Pass the top-left tile of that block as startTile;
 *  the other 8 tiles (edges, corners, and center) are taken automatically from
 *  the 3x3 grid of tiles extending right and down from it. borderSize only sets
 *  the rendered thickness of the edges and corners, not how the texture is cut.
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - Top-left tile of the 3x3 block to sample the nine-slice from
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawNineSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup nine slice tiles - startTile is the top-left of a 3x3 tile block,
    // so the center tile is one tile down and right from it, stepping over
    // the padding around each tile the way tile() lays out the grid
    const step = startTile.size.add(vec2(startTile.padding*2));
    if (screenSpace && !angle)
    {
        // on whole pixels, the pieces in the screen's rows and columns of the block
        drawSliceSnapped(pos, size, borderSize, (col, row)=>
            [startTile.offset(step.multiply(vec2(col, row))), 0], color, additiveColor, useWebGL, context);
        return;
    }
    borderSize = min(borderSize, abs(size.x)/2, abs(size.y)/2); // a box too small for two borders splits between them
    const centerTile = startTile.offset(step);
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
        const sideTile = centerTile.offset(step.multiply(vec2(i===1?1:i===3?-1:0,i===0?-flip:i===2?flip:0)))
        drawTile(pos.add(sidePos.rotate(rotateAngle)), sideSize, sideTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }
    for (let i=4; i--;)
    {
        // corners
        const flipX = i>1;
        const flipY = i && i<3;
        const cornerPos = cornerOffset.multiply(vec2(flipX?-1:1, flipY?-1:1));
        const cornerTile = centerTile.offset(step.multiply(vec2(flipX?-1:1,flipY?flip:-flip)));
        drawTile(pos.add(cornerPos.rotate(rotateAngle)), cornerSize, cornerTile, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }
}

/** Draw a scalable three-slice UI element in screen space, drawThreeSlice with screenSpace set
 *  - Draws with the 2D context by default, on top of what WebGL drew, like drawTextScreen
 *  - With no angle its pieces land on whole pixels and meet exactly, so pixel art lines up and extraSpace is not used
 *  @param {Vector2} pos - Screen space position
 *  @param {Vector2} size - Screen space size
 *  @param {TileInfo} startTile - First of 3 consecutive tiles: corner, side, center (see drawThreeSlice)
 *  @param {Color} [color=WHITE] - Color to modulate with
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL] - Use WebGL for rendering
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawThreeSliceScreen(pos, size, startTile, color=WHITE, borderSize=32, additiveColor, extraSpace=2, angle=0, useWebGL=false, context)
{
    drawThreeSlice(pos, size, startTile, color, borderSize, additiveColor, extraSpace, angle, useWebGL, true, context);
}

/** Draw a scalable three-slice UI element in world space
 *  This function can apply color and additive color if WebGL is enabled
 *  The three-slice samples 3 consecutive tiles from the tilesheet, it does not
 *  subdivide a single tile. Pass the first tile as startTile; the three tiles
 *  are used in order as corner, side, and center, then rotated and mirrored to
 *  build all four edges and corners. borderSize only sets the rendered thickness.
 *  @param {Vector2} pos - World space position
 *  @param {Vector2} size - World space size
 *  @param {TileInfo} startTile - First of 3 consecutive tiles (corner, side, center) for the three-slice
 *  @param {Color} [color] - Color to modulate with
 *  @param {number} [borderSize] - Rendered thickness of the border sections
 *  @param {Color} [additiveColor] - Additive color
 *  @param {number} [extraSpace] - Extra spacing adjustment
 *  @param {number} [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
 *  @param {boolean} [screenSpace] - Use screen space coordinates
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use
 *  @memberof DrawUtilities */
function drawThreeSlice(pos, size, startTile, color, borderSize=1, additiveColor, extraSpace=.05, angle=0, useWebGL=glEnable, screenSpace, context)
{
    // setup three slice tiles - 3 tiles in a row starting at startTile
    const cornerTile = startTile.frame(0);
    const sideTile   = startTile.frame(1);
    const centerTile = startTile.frame(2);
    if (screenSpace && !angle)
    {
        // on whole pixels, each corner and side the top left one's tile turned a quarter more going clockwise
        const turns = [[0,0,1],[3,-1,1],[3,2,2]]; // by column in each row, -1 for the center
        drawSliceSnapped(pos, size, borderSize, (col, row)=>
        {
            const turn = turns[row][col], corner = col !== 1 && row !== 1;
            return turn < 0 ? [centerTile, 0] : [corner ? cornerTile : sideTile, turn*PI/2];
        }, color, additiveColor, useWebGL, context);
        return;
    }
    borderSize = min(borderSize, abs(size.x)/2, abs(size.y)/2); // a box too small for two borders splits between them
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

///////////////////////////////////////////////////////////////////////////////

/**
 * A tile drawn as a box of any size, kept as a style to draw with, like a UI skin
 * - 9 slices is a nine-slice from the 3x3 block of tiles at tileInfo, see drawNineSlice
 * - 3 slices is a three-slice from the 3 tiles in a row at tileInfo, see drawThreeSlice
 * - 1 slice is the whole tile stretched over the box, a plain image
 * - The UI system draws a widget's background with one, see uiSystem.defaultSlice
 * @memberof DrawUtilities
 * @example
 * const panel = new TileSlice(tile(0, 16), 9, 12);
 * panel.draw(vec2(0, 5), vec2(10, 4));
 * uiSystem.defaultSlice = panel; // every UI widget made after this
 */
class TileSlice
{
    /** Create a tile slice style
     *  @param {TileInfo} tileInfo - The tile, or the first of the tiles, to draw with
     *  @param {number} [slices] - 9 for a nine-slice, 3 for a three-slice, 1 for the whole tile
     *  @param {number} [borderSize] - Drawn thickness of the edges and corners, undefined for the draw's own default
     *  @param {number} [extraSpace] - Extra spacing adjustment of the slices, undefined for the draw's own default */
    constructor(tileInfo, slices=9, borderSize, extraSpace)
    {
        ASSERT(tileInfo instanceof TileInfo, 'tileInfo must be a TileInfo');
        ASSERT(slices === 9 || slices === 3 || slices === 1, 'slices must be 9, 3 or 1');
        ASSERT(borderSize === undefined || isNumber(borderSize), 'borderSize must be a number');

        /** @property {TileInfo} - The tile, or the first of the tiles, to draw with */
        this.tileInfo = tileInfo;
        /** @property {number} - 9 for a nine-slice, 3 for a three-slice, 1 for the whole tile */
        this.slices = slices;
        /** @property {number|undefined} - Drawn thickness of the edges and corners, undefined for the draw's default
         *  @type {number|undefined} */
        this.borderSize = borderSize;
        /** @property {number|undefined} - Extra spacing adjustment of the slices, undefined for the draw's default
         *  @type {number|undefined} */
        this.extraSpace = extraSpace;
    }

    /** Draw it as a box in world space, or in screen space
     *  @param {Vector2} pos - Center position
     *  @param {Vector2} size - Size of the box
     *  @param {Color} [color] - Color to modulate with
     *  @param {Color} [additiveColor] - Additive color
     *  @param {number} [angle] - Angle to rotate by
     *  @param {boolean} [useWebGL=glEnable] - Use WebGL for rendering
     *  @param {boolean} [screenSpace] - Are pos and size in screen space?
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use */
    draw(pos, size, color=WHITE, additiveColor, angle=0, useWebGL=glEnable, screenSpace=false, context)
    {
        if (this.slices === 9)
            drawNineSlice(pos, size, this.tileInfo, color, this.borderSize, additiveColor, this.extraSpace, angle, useWebGL, screenSpace, context);
        else if (this.slices === 3)
            drawThreeSlice(pos, size, this.tileInfo, color, this.borderSize, additiveColor, this.extraSpace, angle, useWebGL, screenSpace, context);
        else
            drawTile(pos, size, this.tileInfo, color, angle, false, additiveColor, useWebGL, screenSpace, context);
    }

    /** Draw it as a box in screen space, with the 2D context by default, on top of what WebGL drew, like drawTextScreen
     *  @param {Vector2} pos - Screen space center position
     *  @param {Vector2} size - Screen space size
     *  @param {Color} [color] - Color to modulate with
     *  @param {Color} [additiveColor] - Additive color
     *  @param {number} [angle] - Angle to rotate by
     *  @param {boolean} [useWebGL] - Use WebGL for rendering
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use */
    drawScreen(pos, size, color=WHITE, additiveColor, angle=0, useWebGL=false, context)
    {
        if (this.slices === 9)
            drawNineSliceScreen(pos, size, this.tileInfo, color, this.borderSize, additiveColor, this.extraSpace, angle, useWebGL, context);
        else if (this.slices === 3)
            drawThreeSliceScreen(pos, size, this.tileInfo, color, this.borderSize, additiveColor, this.extraSpace, angle, useWebGL, context);
        else
            drawTile(pos, size, this.tileInfo, color, angle, false, additiveColor, useWebGL, true, context);
    }
}

// draw a slice box in screen space with no angle on whole pixels: the edges and the border are rounded, and every
// piece is cut from them, so the pieces meet exactly and their texels line up where they do, with no overlap to hide
// a seam; pieceTile(col, row) gives the tile and angle for the piece in that column and row of the box, top left 0
function drawSliceSnapped(pos, size, borderSize, pieceTile, color, additiveColor, useWebGL, context)
{
    const border = max(1, round(borderSize));
    const edges = (center, length)=>
    {
        const start = round(center - length/2), end = start + round(length);
        const inner = min(start + border, floor((start + end)/2)); // a box too small for two borders splits
        return [start, inner, max(end - border, inner), end];
    };
    const xs = edges(pos.x, size.x), ys = edges(pos.y, size.y);
    const shift = useWebGL && glEnable && !context ? 0 : .5; // Canvas2D draws half a pixel over its position
    for (let row = 3; row--;)
    for (let col = 3; col--;)
    {
        const w = xs[col+1] - xs[col], h = ys[row+1] - ys[row];
        if (w <= 0 || h <= 0) continue;
        const [tileInfo, angle] = pieceTile(col, row);
        const turned = round(angle / (PI/2)) % 2; // a quarter turn swaps the sides it is drawn with
        const piecePos = vec2(xs[col] + w/2 - shift, ys[row] + h/2 - shift);
        drawTile(piecePos, turned ? vec2(h, w) : vec2(w, h), tileInfo, color, angle, false, additiveColor, useWebGL, true, context);
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
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas context to use
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