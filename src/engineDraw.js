/**
 * LittleJS Drawing System
 * - Hybrid system with both Canvas2D and WebGL available
 * - Super fast tile sheet rendering with WebGL
 * - Can apply rotation, mirror, color and additive color
 * - Font rendering system with built in engine font
 * - Many useful utility functions
 *
 * LittleJS uses a hybrid rendering solution with the best of both Canvas2D and WebGL.
 * There are 3 canvas/contexts available to draw to...
 * mainCanvas - 2D background canvas, non WebGL stuff like tile layers are drawn here.
 * glCanvas - Used by the accelerated WebGL batch rendering system.
 *
 * The WebGL rendering system is very fast with some caveats...
 * - Switching blend modes (additive) or textures causes another draw call which is expensive in excess
 * - Group additive rendering together using renderOrder to mitigate this issue
 *
 * The LittleJS rendering solution is intentionally simple, feel free to adjust it for your needs!
 * @namespace Draw
 */

'use strict';

/** The primary 2D canvas visible to the user
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let mainCanvas;

/** 2d context for mainCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let mainContext;

/** The default 2d context to use for drawing, usually mainContext
 *  @type {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}
 *  @memberof Draw */
let drawContext;

/** Offscreen canvas that can be used for image processing
 *  @type {OffscreenCanvas}
 *  @memberof Draw */
let workCanvas;

/** Offscreen canvas that can be used for image processing
 *  @type {OffscreenCanvasRenderingContext2D}
 *  @memberof Draw */
let workContext;

/** Offscreen canvas with willReadFrequently that can be used for image processing
 *  @type {OffscreenCanvas}
 *  @memberof Draw */
let workReadCanvas;

/** Offscreen canvas with willReadFrequently that can be used for image processing
 *  @type {OffscreenCanvasRenderingContext2D}
 *  @memberof Draw */
let workReadContext;

/** The size of the main canvas (and other secondary canvases)
 *  @type {Vector2}
 *  @memberof Draw */
let mainCanvasSize = vec2();

/** Array containing texture info for batch rendering system
 *  @type {Array<TextureInfo>}
 *  @memberof Draw */
let textureInfos = [];

/** Keeps track of how many draw calls there were each frame for debugging
 *  @type {number}
 *  @memberof Draw */
let drawCount;

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a tile info object using a grid based system
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {Vector2|number} [pos=0] - Position of the tile in pixels, or tile index
 * @param {Vector2|number} [size] - Size of tile in pixels
 * @param {number} [textureIndex] - Texture index to use
 * @param {number} [padding] - How many pixels padding around tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw */
function tile(pos=new Vector2, size=tileDefaultSize, textureIndex=0, padding=tileDefaultPadding)
{
    if (headlessMode)
        return new TileInfo;

    // if size is a number, make it a vector
    if (typeof size === 'number')
    {
        ASSERT(size > 0);
        size = new Vector2(size, size);
    }

    // create tile info object
    const tileInfo = new TileInfo(new Vector2, size, textureIndex, padding);

    // get the position of the tile
    const textureInfo = textureInfos[textureIndex];
    ASSERT(!!textureInfo, 'Texture not loaded');
    const sizePaddedX = size.x + padding*2;
    const sizePaddedY = size.y + padding*2;
    if (typeof pos === 'number')
    {
        const cols = textureInfo.size.x / sizePaddedX |0;
        ASSERT(cols > 0, 'Tile size is too big for texture');
        const posX = pos % cols, posY = (pos / cols) |0;
        tileInfo.pos.set(posX*sizePaddedX+padding, posY*sizePaddedY+padding);
    }
    else
        tileInfo.pos.set(pos.x*sizePaddedX+padding, pos.y*sizePaddedY+padding);
    return tileInfo;
}

/**
 * Tile Info - Stores info about how to draw a tile
 * @memberof Draw
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=(0,0)] - Top left corner of tile in pixels
     *  @param {Vector2} [size] - Size of tile in pixels
     *  @param {number}  [textureIndex] - Texture index to use
     *  @param {number}  [padding] - How many pixels padding around tiles
     *  @param {number}  [bleed] - How many pixels smaller to draw tiles
     */
    constructor(pos=vec2(), size=tileDefaultSize, textureIndex=0, padding=tileDefaultPadding, bleed=tileDefaultBleed)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {number} - Texture index to use */
        this.textureIndex = textureIndex;
        /** @property {number} - How many pixels padding around tiles */
        this.padding = padding;
        /** @property {TextureInfo} - The texture info for this tile */
        this.textureInfo = textureInfos[this.textureIndex];
        /** @property {number} - Shrinks tile by this many pixels to prevent neighbors bleeding */
        this.bleed = bleed;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureIndex, this.padding, this.bleed); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  @param {number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame === 'number');
        return this.offset(new Vector2(frame*(this.size.x+this.padding*2), 0));
    }

    /**
     * Set this tile to use a full image in a texture info
     * @param {TextureInfo} textureInfo
     * @return {TileInfo}
     */
    setFullImage(textureInfo)
    {
        this.pos = new Vector2;
        this.size = textureInfo.size.copy();
        this.textureInfo = textureInfo;
        // do not use padding or bleed
        this.bleed = this.padding = 0;
        return this;
    }
}

/**
 * Tile Info - Stores info about each texture
 * @memberof Draw
 */
class TextureInfo
{
    /**
     * Create a TextureInfo, called automatically by the engine
     * @param {HTMLImageElement|OffscreenCanvas} image
     * @param {boolean} [useWebGL] - Should use WebGL if available?
     */
    constructor(image, useWebGL=true)
    {
        /** @property {HTMLImageElement|OffscreenCanvas} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = image ? vec2(image.width, image.height) : vec2();
        /** @property {Vector2} - inverse of the size, cached for rendering */
        this.sizeInverse = image ? vec2(1/image.width, 1/image.height) : vec2();
        /** @property {WebGLTexture} - WebGL texture */
        this.glTexture = undefined;
        useWebGL && this.createWebGLTexture();
    }

    /** Creates the WebGL texture, updates if already created */
    createWebGLTexture() { glRegisterTextureInfo(this); }

    /** Destroys the WebGL texture */
    destroyWebGLTexture() { glUnregisterTextureInfo(this); }

    /** Check if the texture is webgl enabled
     * @return {boolean} */
    hasWebGL() { return !!this.glTexture; }
}

///////////////////////////////////////////////////////////////////////////////
// Drawing functions

/** Draw textured tile centered in world space, with color applied if using WebGL
 *  @param {Vector2}  pos                 - Center of the tile in world space
 *  @param {Vector2}  [size=(1,1)]        - Size of the tile in world space
 *  @param {TileInfo} [tileInfo]          - Tile info to use, untextured if undefined
 *  @param {Color}    [color=(1,1,1,1)]   - Color to modulate with
 *  @param {number}   [angle]             - Angle to rotate by
 *  @param {boolean}  [mirror]            - Is image flipped along the Y axis?
 *  @param {Color}    [additiveColor]     - Additive color to be applied if any
 *  @param {boolean}  [useWebGL=glEnable] - Use accelerated WebGL rendering?
 *  @param {boolean}  [screenSpace=false] - Are the pos and size are in screen space?
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=new Vector2(1), tileInfo, color=WHITE,
    angle=0, mirror, additiveColor, useWebGL=glEnable, screenSpace, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!additiveColor || isColor(additiveColor), 'additiveColor must be a color');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    const textureInfo = tileInfo && tileInfo.textureInfo;
    const bleed = tileInfo?.bleed ?? 0;
    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        if (textureInfo)
        {
            // calculate uvs and render
            const sizeInverse = textureInfo.sizeInverse;
            const x = tileInfo.pos.x * sizeInverse.x;
            const y = tileInfo.pos.y * sizeInverse.y;
            const w = tileInfo.size.x * sizeInverse.x;
            const h = tileInfo.size.y * sizeInverse.y;
            glSetTexture(textureInfo.glTexture);
            if (bleed)
            {
                const bleedX = sizeInverse.x*bleed;
                const bleedY = sizeInverse.y*bleed;
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle,
                    x + bleedX,     y + bleedY,
                    x - bleedX + w, y - bleedY + h,
                    color.rgbaInt(), additiveColor && additiveColor.rgbaInt());
            }
            else
            {
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle,
                    x, y, x + w, y + h,
                    color.rgbaInt(), additiveColor && additiveColor.rgbaInt());
            }
        }
        else
        {
            // if no tile info, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, color.rgbaInt());
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        size = new Vector2(size.x, -size.y); // flip upside down sprites
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (textureInfo)
            {
                // calculate uvs and render
                const x = tileInfo.pos.x,  y = tileInfo.pos.y;
                const w = tileInfo.size.x, h = tileInfo.size.y;
                drawImageColor(context, textureInfo.image, x, y, w, h, -.5, -.5, 1, 1, color, additiveColor, bleed);
            }
            else
            {
                // if no tile info, use untextured rect
                const c = additiveColor ? color.add(additiveColor) : color;
                context.fillStyle = c.toString();
                context.fillRect(-.5, -.5, 1, 1);
            }
        }, screenSpace, context);
    }
}

/** Draw colored rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRect(pos, size, color, angle, useWebGL, screenSpace, context)
{
    drawTile(pos, size, undefined, color, angle, false, undefined, useWebGL, screenSpace, context);
}

/** Draw a rect centered on pos with a gradient from top to bottom
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [colorTop=(1,1,1,1)]
 *  @param {Color}   [colorBottom=(0,0,0,1)]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRectGradient(pos, size, colorTop=WHITE, colorBottom=BLACK, angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(colorTop) && isColor(colorBottom), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            size = size.scale(1/cameraScale);
            angle += cameraAngle;
        }
        // build 4 corner points for the rectangle
        const points = [], colors = [];
        const halfSizeX = size.x/2, halfSizeY = size.y/2;
        const colorTopInt = colorTop.rgbaInt();
        const colorBottomInt = colorBottom.rgbaInt();
        const c = cos(-angle), s = sin(-angle);
        for (let i=4; i--;)
        {
            const x = i & 1 ? halfSizeX : -halfSizeX;
            const y = i & 2 ? halfSizeY : -halfSizeY;
            const rx = x * c - y * s;
            const ry = x * s + y * c;
            const color = i & 2 ? colorTopInt : colorBottomInt;
            points.push(vec2(pos.x + rx, pos.y + ry));
            colors.push(color);
        }
        glDrawColoredPoints(points, colors);
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        size = new Vector2(size.x, -size.y); // fix upside down sprites
        drawCanvas2D(pos, size, angle, false, (context)=>
        {
            // if no tile info, use untextured rect
            const gradient = context.createLinearGradient(0, -.5, 0, .5);
            gradient.addColorStop(0, colorTop.toString());
            gradient.addColorStop(1, colorBottom.toString());
            context.fillStyle = gradient;
            context.fillRect(-.5, -.5, 1, 1);
        }, screenSpace, context);
    }
}

/** Draw connected lines between a series of points
 *  @param {Array<Vector2>} points
 *  @param {number}  [width]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {boolean} [wrap] - Should the last point connect to the first?
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLineList(points, width=.1, color, wrap=false, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace, context)
{
    ASSERT(isArray(points), 'points must be an array');
    ASSERT(isNumber(width), 'width must be a number');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        let size = vec2(1);
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        glDrawOutlineTransform(points, color.rgbaInt(), width, pos.x, pos.y, size.x, size.y, angle, wrap);
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        drawCanvas2D(pos, vec2(1), angle, false, (context)=>
        {
            context.strokeStyle = color.toString();
            context.lineWidth = width;
            context.beginPath();
            for (let i=0; i<points.length; ++i)
            {
                const point = points[i];
                if (i)
                    context.lineTo(point.x, point.y);
                else
                    context.moveTo(point.x, point.y);
            }
            if (wrap)
                context.closePath();
            context.stroke();
        }, screenSpace, context);
    }
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {number}  [width]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, width=.1, color, pos=vec2(), angle=0, useWebGL, screenSpace, context)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(width, halfDelta.length()*2);
    pos = pos.add(posA.add(halfDelta));
    if (screenSpace)
        halfDelta.y *= -1;  // flip angle Y if screen space
    angle += halfDelta.angle();
    drawRect(pos, size, color, angle, useWebGL, screenSpace, context);
}

/** Draw colored regular polygon using passed in number of sides
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)]
 *  @param {number}  [sides]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRegularPoly(pos, size=vec2(1), sides=3, color=WHITE, lineWidth=0, lineColor=BLACK, angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isNumber(sides), 'sides must be a number');

    // build regular polygon points
    const points = [];
    const sizeX = size.x/2, sizeY = size.y/2;
    for (let i=sides; i--;)
    {
        const a = (i/sides)*PI*2;
        points.push(vec2(sin(a)*sizeX, cos(a)*sizeY));
    }
    drawPoly(points, color, lineWidth, lineColor, pos, angle, useWebGL, screenSpace, context);
}

/** Draw colored polygon using passed in points
 *  @param {Array<Vector2>} points - Array of Vector2 points
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawPoly(points, color=WHITE, lineWidth=0, lineColor=BLACK, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context=undefined)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isArray(points), 'points must be an array');
    ASSERT(isColor(color) && isColor(lineColor), 'color is invalid');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        let size = vec2(1);
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        glDrawPointsTransform(points, color.rgbaInt(), pos.x, pos.y, size.x, size.y, angle);
        if (lineWidth > 0)
            glDrawOutlineTransform(points, lineColor.rgbaInt(), lineWidth, pos.x, pos.y, size.x, size.y, angle);
    }
    else
    {
        drawCanvas2D(pos, vec2(1), angle, false, context=>
        {
            context.fillStyle = color.toString();
            context.beginPath();
            for (const point of points)
                context.lineTo(point.x, point.y);
            context.closePath();
            context.fill();
            if (lineWidth)
            {
                context.strokeStyle = lineColor.toString();
                context.lineWidth = lineWidth;
                context.stroke();
            }
        }, screenSpace, context);
    }
}

/** Draw colored ellipse using passed in point
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)] - Width and height diameter
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawEllipse(pos, size=vec2(1), color=WHITE, angle=0, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(color) && isColor(lineColor), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(lineWidth >= 0 && lineWidth < size.x && lineWidth < size.y, 'invalid lineWidth');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (useWebGL && glEnable)
    {
        // draw as a regular polygon
        const sides = glCircleSides;
        drawRegularPoly(pos, size, sides, color, lineWidth, lineColor, angle, useWebGL, screenSpace, context);
    }
    else
    {
        drawCanvas2D(pos, vec2(1), angle, false, context=>
        {
            context.fillStyle = color.toString();
            context.beginPath();
            context.ellipse(0, 0, size.x/2, size.y/2, 0, 0, 9);
            context.fill();
            if (lineWidth)
            {
                context.strokeStyle = lineColor.toString();
                context.lineWidth = lineWidth;
                context.stroke();
            }
        }, screenSpace, context);
    }
}

/** Draw colored circle using passed in point
 *  @param {Vector2} pos
 *  @param {number}  [size=1] - Diameter
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircle(pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isNumber(size), 'size must be a number');
    drawEllipse(pos, vec2(size), color, 0, lineWidth, lineColor, useWebGL, screenSpace, context);
}

/**
 * @callback Canvas2DDrawFunction - A function that draws to a 2D canvas context
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
 * @memberof Draw
 */

/** Draw directly to a 2d canvas context in world space
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {number}   angle
 *  @param {boolean}  [mirror]
 *  @param {Canvas2DDrawFunction} [drawFunction]
 *  @param {boolean}  [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawCanvas2D(pos, size, angle=0, mirror=false, drawFunction, screenSpace=false, context=drawContext)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(typeof drawFunction === 'function', 'drawFunction must be a function');

    if (!screenSpace)
    {
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
        angle -= cameraAngle;
    }
    context.save();
    context.translate(pos.x+.5, pos.y+.5);
    context.rotate(angle);
    context.scale(mirror ? -size.x : size.x, -size.y);
    drawFunction(context);
    context.restore();
}

///////////////////////////////////////////////////////////////////////////////
// Text Drawing Functions

/** Draw text on main canvas in world space
 *  Automatically splits new lines into rows
 *  @param {string|number}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, fontStyle, maxWidth, angle=0, context=drawContext)
{
    // convert to screen space
    pos = worldToScreen(pos);
    size *= cameraScale;
    lineWidth *= cameraScale;
    angle -= cameraAngle;
    angle *= -1;

    drawTextScreen(text, pos, size, color, lineWidth, lineColor, textAlign, font, fontStyle, maxWidth, angle, context);
}

/** Draw text in screen space
 *  Automatically splits new lines into rows
 *  @param {string|number}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, fontStyle='', maxWidth, angle=0, context=drawContext)
{
    ASSERT(isString(text), 'text must be a string');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isColor(color), 'color must be a color');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(isColor(lineColor), 'lineColor must be a color');
    ASSERT(['left','center','right'].includes(textAlign), 'align must be left, center, or right');
    ASSERT(isString(font), 'font must be a string');
    ASSERT(isString(fontStyle), 'fontStyle must be a string');
    ASSERT(isNumber(angle), 'angle must be a number');
    
    context.fillStyle = color.toString();
    context.strokeStyle = lineColor.toString();
    context.lineWidth = lineWidth;
    context.textAlign = textAlign;
    context.font = fontStyle + ' ' + size + 'px '+ font;
    context.textBaseline = 'middle';

    const lines = (text+'').split('\n');
    const posY = pos.y - (lines.length-1) * size/2; // center vertically
    context.save();
    context.translate(pos.x, posY);
    context.rotate(-angle);
    let yOffset = 0;
    lines.forEach(line=>
    {
        lineWidth && context.strokeText(line, 0, yOffset, maxWidth);
        context.fillText(line, 0, yOffset, maxWidth);
        yOffset += size;
    });
    context.restore();
}

///////////////////////////////////////////////////////////////////////////////
// Drawing utilities

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    ASSERT(isVector2(screenPos), 'screenPos must be a vec2');

    let x = (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale;
    let y = (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = cos(-cameraAngle), s = sin(-cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x + cameraPos.x, y + cameraPos.y);
}

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreen(worldPos)
{
    ASSERT(isVector2(worldPos), 'worldPos must be a vec2');

    let x = worldPos.x - cameraPos.x;
    let y = worldPos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2
    (
        x *  cameraScale + mainCanvasSize.x/2 - .5,
        y * -cameraScale + mainCanvasSize.y/2 - .5
    );
}

/** Convert from screen to world space coordinates for a directional vector (no translation)
 *  @param {Vector2} screenDelta
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorldDelta(screenDelta)
{
    ASSERT(isVector2(screenDelta), 'screenDelta must be a vec2');

    let x = screenDelta.x /  cameraScale;
    let y = screenDelta.y / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = cos(-cameraAngle), s = sin(-cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x, y);
}

/** Convert from screen to world space coordinates for a directional vector (no translation)
 *  @param {Vector2} worldDelta
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreenDelta(worldDelta)
{
    ASSERT(isVector2(worldDelta), 'worldDelta must be a vec2');

    let x = worldDelta.x;
    let y = worldDelta.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x *  cameraScale, y * -cameraScale);
}

/** Convert screen space transform to world space
 *  @param {Vector2} screenPos
 *  @param {Vector2} screenSize  
 *  @param {number} [screenAngle]
 *  @return {[Vector2, Vector2, number]} - [pos, size, angle]
 *  @memberof Draw */
function screenToWorldTransform(screenPos, screenSize, screenAngle=0)
{
    ASSERT(isVector2(screenPos), 'screenPos must be a vec2');
    ASSERT(isVector2(screenSize), 'screenSize must be a vec2');
    ASSERT(isNumber(screenAngle), 'screenAngle must be a number');

    return [
        screenToWorld(screenPos),
        screenSize.scale(1/cameraScale),
        screenAngle + cameraAngle
    ];
}

/** Get the size of the camera window in world space
 *  @return {Vector2}
 *  @memberof Draw */
function getCameraSize() { return mainCanvasSize.scale(1/cameraScale); }

/** Check if a box, point, or circle is on screen with a circle test
 *  If size is a Vector2, uses the length as diameter
 *  This can be used to cull offscreen objects from render or update
 *  @param {Vector2} pos - world space position
 *  @param {Vector2|number} size - world space size or diameter
 *  @return {boolean}
 *  @memberof Draw */
function isOnScreen(pos, size=0)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size) || isNumber(size), 'size must be a vec2 or number');

    // optimized circle on screen test
    // pos = worldToScreen(pos);
    let x = pos.x - cameraPos.x;
    let y = pos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = cos(cameraAngle), s = sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    x *= cameraScale*2; y *= -cameraScale*2;

    if (size instanceof Vector2)
        size = size.length(); // use length of vector as diameter
    size *= cameraScale;

    // check against screen bounds
    const w = mainCanvasSize.x, h = mainCanvasSize.y;
    return x + size > -w && x - size < w &&
           y + size > -h && y - size < h;
}

/** Enable normal or additive blend mode
 *  @param {boolean} [additive]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function setBlendMode(additive=false, context)
{
    glAdditive = additive;
    context ||= drawContext;
    context.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}

/** Combines LittleJS canvases onto the main canvas
 *  This is necessary for things like screenshots and video
 *  @memberof Draw */
function combineCanvases()
{
    const w = mainCanvasSize.x, h = mainCanvasSize.y;
    workCanvas.width = w;
    workCanvas.height = h;
    workContext.fillRect(0,0,w,h); // remove background alpha
    glCopyToContext(workContext);
    workContext.drawImage(mainCanvas, 0, 0);
    mainCanvas.width |= 0;
    mainContext.drawImage(workCanvas, 0, 0);
}

/** Helper function to draw an image with color and additive color applied
 *  This is slower then normal drawImage when color is applied
    *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
    *  @param {HTMLImageElement|OffscreenCanvas} image
    *  @param {number} sx
    *  @param {number} sy
    *  @param {number} sWidth
    *  @param {number} sHeight
    *  @param {number} dx
    *  @param {number} dy
    *  @param {number} dWidth
    *  @param {number} dHeight
    *  @param {Color} color
    *  @param {Color} [additiveColor]
    *  @param {number} [bleed] - How many pixels to shrink the source, used to fix bleeding
 *  @memberof Draw */
function drawImageColor(context, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight, color, additiveColor, bleed=0)
{
    function isWhite(c) { return c.r >= 1 && c.g >= 1 && c.b >= 1; }
    function isBlack(c) { return c.r <= 0 && c.g <= 0 && c.b <= 0 && c.a <= 0; }
    const sx2 = bleed;
    const sy2 = bleed;
    sWidth  = max(1,sWidth|0);
    sHeight = max(1,sHeight|0);
    const sWidth2  = sWidth  - 2*bleed;
    const sHeight2 = sHeight - 2*bleed;
    if (!canvasColorTiles || (additiveColor ? isWhite(color.add(additiveColor)) && additiveColor.a <= 0 : isWhite(color)))
    {
        // white texture with no additive alpha, no need to tint
        context.globalAlpha = color.a;
        context.drawImage(image, sx+sx2, sy+sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
        context.globalAlpha = 1;
    }
    else
    {
        // copy to offscreen canvas
        workReadCanvas.width = sWidth;
        workReadCanvas.height = sHeight;
        workReadContext.drawImage(image, sx|0, sy|0, sWidth, sHeight, 0, 0, sWidth, sHeight);

        // tint image using offscreen work context
        const imageData = workReadContext.getImageData(0, 0, sWidth, sHeight);
        const data = imageData.data;
        if (additiveColor && !isBlack(additiveColor))
        {
            // slower path with additive color
            const colorMultiply = [color.r, color.g, color.b, color.a];
            const colorAdd = [additiveColor.r * 255, additiveColor.g * 255, additiveColor.b * 255, additiveColor.a * 255];
            for (let i = 0; i < data.length; ++i)
                data[i] = data[i] * colorMultiply[i&3] + colorAdd[i&3] |0;
            workReadContext.putImageData(imageData, 0, 0);
            context.drawImage(workReadCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
        }
        else
        {
            // faster path with no additive color
            for (let i = 0; i < data.length; i+=4)
            {
                data[i  ] *= color.r;
                data[i+1] *= color.g;
                data[i+2] *= color.b;
            }
            workReadContext.putImageData(imageData, 0, 0);
            context.globalAlpha = color.a;
            context.drawImage(workReadCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
            context.globalAlpha = 1;
        }
    }
}


/** Returns true if fullscreen mode is active
 *  @return {boolean}
 *  @memberof Draw */
function isFullscreen() { return !!document.fullscreenElement; }

/** Toggle fullscreen mode
 *  @memberof Draw */
function toggleFullscreen()
{
    const rootElement = mainCanvas.parentElement;
    if (isFullscreen())
    {
        if (document.exitFullscreen)
            document.exitFullscreen();
    }
    else if (rootElement.requestFullscreen)
        rootElement.requestFullscreen();
}

/** Set the cursor style
 *  @param {string}  [cursorStyle] - CSS cursor style (auto, none, crosshair, etc)
 *  @memberof Draw */
function setCursor(cursorStyle = 'auto')
{
    const rootElement = mainCanvas.parentElement;
    rootElement.style.cursor = cursorStyle;
}

///////////////////////////////////////////////////////////////////////////////

let engineFontImage;

/**
 * Font Image Object - Draw text on a 2D canvas by using characters in an image
 * - 96 characters (from space to tilde) are stored in an image
 * - Uses a default 8x8 font if none is supplied
 * - You can also use fonts from the main tile sheet
 * @memberof Draw
 * @example
 * // use built in font
 * const font = new FontImage;
 *
 * // draw text
 * font.drawTextScreen('LittleJS\nHello World!', vec2(200, 50));
 */
class FontImage
{
    /** Create an image font
     *  @param {HTMLImageElement} [image] - Image for the font, default if undefined
     *  @param {Vector2} [tileSize=(8,8)] - Size of the font source tiles
     *  @param {Vector2} [paddingSize=(0,1)] - How much space between characters
     */
    constructor(image, tileSize=vec2(8), paddingSize=vec2(0,1))
    {
        // load default font image
        if (!image && !engineFontImage)
        {
            engineFontImage = new Image;
            engineFontImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAYAQAAAAA9+x6JAAAAAnRSTlMAAHaTzTgAAAGiSURBVHjaZZABhxxBEIUf6ECLBdFY+Q0PMNgf0yCgsSAGZcT9sgIPtBWwIA5wgAPEoHUyJeeSlW+gjK+fegWwtROWpVQEyWh2npdpBmTUFVhb29RINgLIukoXr5LIAvYQ5ve+1FqWEMqNKTX3FAJHyQDRZvmKWubAACcv5z5Gtg2oyCWE+Yk/8JZQX1jTTCpKAFGIgza+dJCNBF2UskRlsgwitHbSV0QLgt9sTPtsRlvJjEr8C/FARWA2bJ/TtJ7lko34dNDn6usJUMzuErP89UUBJbWeozrwLLncXczd508deAjLWipLO4Q5XGPcJvPu92cNDaN0P5G1FL0nSOzddZOrJ6rNhbXGmeDvO3TF7DeJWl4bvaYQTNHCTeuqKZmbjHaSOFes+IX/+IhHrnAkXOAsfn24EM68XieIECoccD4KZLk/odiwzeo2rovYdhvb2HYFgyznJyDpYJdYOmfXgVdJTaUi4xA2uWYNYec9BLeqdl9EsoTw582mSFDX2DxVLbNt9U3YYoeatBad1c2Tj8t2akrjaIGJNywKB/7h75/gN3vCMSaadIUTAAAAAElFTkSuQmCC';
        }

        this.image = image || engineFontImage;
        this.tileSize = tileSize;
        this.paddingSize = paddingSize;
    }

    /** Draw text in world space using the image font
     *  @param {string|number}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale=.25]
     *  @param {boolean} [center]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext] 
     */
    drawText(text, pos, scale=1, center, context=drawContext)
    {
        this.drawTextScreen(text, worldToScreen(pos).floor(), scale*cameraScale|0, center, context);
    }

    /** Draw text in screen space using the image font
     *  @param {string|number}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale]
     *  @param {boolean} [center]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     */
    drawTextScreen(text, pos, scale=4, center=true, context=drawContext)
    {
        context.save();
        const size = this.tileSize;
        const drawSize = size.add(this.paddingSize).scale(scale);
        const cols = this.image.width / this.tileSize.x |0;
        (text+'').split('\n').forEach((line, i)=>
        {
            const centerOffset = center ? line.length * size.x * scale / 2 |0 : 0;
            for (let j=line.length; j--;)
            {
                // draw each character
                let charCode = line[j].charCodeAt(0);
                if (charCode < 32 || charCode > 127)
                    charCode = 127; // unknown character

                // get the character source location and draw it
                const tile = charCode - 32;
                const x = tile % cols;
                const y = tile / cols |0;
                const drawPos = pos.add(vec2(j,i).multiply(drawSize));
                context.drawImage(this.image, x * size.x, y * size.y, size.x, size.y,
                    drawPos.x - centerOffset, drawPos.y, size.x * scale, size.y * scale);
            }
        });
        context.restore();
    }
}