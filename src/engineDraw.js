/**
 * LittleJS Drawing System
 * - Hybrid rendering with both Canvas2D and WebGL support
 * - Optimized tile sheet sprite rendering using WebGL batching
 * - Primitive drawing for polygons, ellipses, and lines
 * - Tile-based rendering with TileInfo and TextureInfo classes
 * - Text rendering with custom fonts and ImageFont support
 * - Color and additive color blending for effects
 * - Rotation, mirroring, and scaling transformations
 * - Camera system with position, scale, and rotation
 * - Multiple canvas support (main, WebGL, work canvases)
 * - Gradient fills and outlined shapes
 * - Image manipulation and color tinting
 *
 * Rendering Architecture:
 * - glCanvas: WebGL canvas for accelerated sprite batch rendering
 * - mainCanvas: Canvas2D overlay for text, UI, and custom drawing
 * - All draw functions default to WebGL when enabled, can force Canvas2D with useWebGL parameter
 *
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

/** Keeps track of how many primitives were drawn each frame for debugging
 *  A single draw call can render many primitives (e.g. a WebGL sprite batch).
 *  @type {number}
 *  @memberof Draw */
let primitiveCount;

// internal predicates for tint short-circuiting in canvas2D draw paths
// isWhite ignores alpha because alpha is applied via globalAlpha, not multiply
// isBlack includes alpha so additive colors that only contribute alpha are not skipped
/** @param {Color} c */ function isWhite(c) { return c.r >= 1 && c.g >= 1 && c.b >= 1; }
/** @param {Color} c */ function isBlack(c) { return c.r <= 0 && c.g <= 0 && c.b <= 0 && c.a <= 0; }

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a tile info object using a grid based system
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {Vector2|number} [index=0] - Index of the tile in 1d or 2d form
 * @param {Vector2|number} [size] - Size of tile in pixels
 * @param {TextureInfo|number} [texture] - Texture index or info to use
 * @param {number} [padding] - How many pixels padding around tiles
 * @param {number} [bleed] - How many pixels smaller to draw tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw */
function tile(index=0, size=tileDefaultSize, texture=0, padding=tileDefaultPadding, bleed=tileDefaultBleed)
{
    ASSERT(isVector2(index) || typeof index === 'number', 'index must be a vec2 or number');
    ASSERT(isVector2(size) || typeof size === 'number', 'size must be a vec2 or number');
    ASSERT(isNumber(texture) || texture instanceof TextureInfo, 'texture must be a number or TextureInfo');
    ASSERT(isNumber(padding), 'padding must be a number');

    if (headlessMode) return new TileInfo;

    if (typeof size === 'number')
    {
        // if size is a number, make it a vector
        ASSERT(size > 0);
        size = new Vector2(size, size);
    }

    // create tile info object
    const textureInfo = typeof texture === 'number' ?
        textureInfos[texture] : texture;
    ASSERT(textureInfo instanceof TextureInfo, 'tile texture is not loaded');
    ASSERT(textureInfo.size.x > 0, 'tile texture is not loaded');

    // get the position of the tile
    const sizePaddedX = size.x + padding*2;
    const sizePaddedY = size.y + padding*2;
    let x, y;
    if (typeof index === 'number')
    {
        const cols = textureInfo.size.x / sizePaddedX |0;
        x = index % cols;
        y = index / cols |0;
    }
    else
    {
        x = index.x;
        y = index.y;
    }
    const pos = new Vector2(x*sizePaddedX + padding, y*sizePaddedY + padding);
    return new TileInfo(pos, size, textureInfo, padding, bleed);
}

/**
 * Tile Info - Stores info about how to draw a tile
 * @memberof Draw
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=vec2()] - Top left corner of tile in pixels
     *  @param {Vector2} [size] - Size of tile in pixels
     *  @param {TextureInfo} [textureInfo] - Texture info to use
     *  @param {number} [padding] - How many pixels padding around all sides of each tile (increases grid size, does not affect tile size)
     *  @param {number} [bleed] - How many pixels smaller to shrink UVS of tiles (does not affect grid size, only UVs)
     */
    constructor(pos=vec2(), size=tileDefaultSize, textureInfo=textureInfos[0], padding=tileDefaultPadding, bleed=tileDefaultBleed)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {number} - How many pixels padding around tiles */
        this.padding = padding;
        /** @property {TextureInfo} - The texture info for this tile */
        this.textureInfo = textureInfo;
        /** @property {number} - Shrinks tile by this many pixels to prevent neighbors bleeding */
        this.bleed = bleed;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureInfo, this.padding, this.bleed); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  @param {number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame === 'number');
        const w = this.size.x + this.padding*2;
        const x = frame*w;
        ASSERT(x + this.size.x <= this.textureInfo.size.x, 'frame extends beyond texture width!');
        return this.offset(new Vector2(x));
    }

    /**
     * Set this tile to use a full image in a texture info
     * @param {TextureInfo} [textureInfo]
     * @return {TileInfo}
     */
    setFullImage(textureInfo=this.textureInfo)
    {
        this.textureInfo = textureInfo;
        this.pos = new Vector2;
        this.size = textureInfo.size.copy();
        this.bleed = this.padding = 0;
        return this;
    }

    /**
     * Returns a tile info for an index using this tile as reference
     * @param {Vector2|number} [index=0]
     * @return {TileInfo}
     */
    tile(index)
    { return tile(index, this.size, this.textureInfo, this.padding, this.bleed); }
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
     * @param {boolean} [wrap] - Should the texture wrap (REPEAT) or clamp (CLAMP_TO_EDGE)?
     */
    constructor(image, useWebGL=true, wrap=false)
    {
        /** @property {HTMLImageElement|OffscreenCanvas} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = image ? vec2(image.width, image.height) : vec2();
        /** @property {Vector2} - inverse of the size, cached for rendering */
        this.sizeInverse = image ? vec2(1/image.width, 1/image.height) : vec2();
        /** @property {WebGLTexture} - WebGL texture */
        this.glTexture = undefined;
        /** @property {boolean} - true for REPEAT wrap mode, false for CLAMP_TO_EDGE */
        this.wrap = wrap;
        useWebGL && this.createWebGLTexture();
    }

    /** Creates the WebGL texture, updates if already created */
    createWebGLTexture() { glRegisterTextureInfo(this); }

    /** Destroys the WebGL texture */
    destroyWebGLTexture() { glUnregisterTextureInfo(this); }

    /** Check if the texture is webgl enabled
     * @return {boolean} */
    hasWebGL() { return !!this.glTexture; }

    /** Set the wrap mode for this texture
     *  @param {boolean} [wrap] - true for REPEAT, false for CLAMP_TO_EDGE */
    setWrap(wrap=true)
    {
        this.wrap = wrap;
        glSetTextureWrap(this.glTexture, wrap);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Drawing functions

/** Draw textured tile centered in world space
 *  @param {Vector2}  pos - Center of the tile in world space
 *  @param {Vector2}  [size=vec2(1)] - Size of the tile in world space
 *  @param {TileInfo} [tileInfo] - Tile info to use, untextured if undefined
 *  @param {Color}    [color=WHITE] - Color to modulate with
 *  @param {number}   [angle] - Angle to rotate by
 *  @param {boolean}  [mirror] - Is image flipped along the Y axis?
 *  @param {Color}    [additiveColor] - Additive color to be applied if any
 *  @param {boolean}  [useWebGL=glEnable] - Use accelerated WebGL rendering?
 *  @param {boolean}  [screenSpace=false] - Are the pos and size are in screen space?
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileInfo, color=WHITE,
    angle=0, mirror, additiveColor, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!additiveColor || isColor(additiveColor), 'additiveColor must be a color');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    const textureInfo = tileInfo?.textureInfo;
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
            // untextured: fold color+additive to match the Canvas2D path's
            // color.add(additiveColor) on line ~337.
            const combined = additiveColor ? color.add(additiveColor) : color;
            glDrawUntextured(pos.x, pos.y, size.x, size.y, angle, combined.rgbaInt());
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        ++primitiveCount;
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
 *  @param {Vector2} [size=vec2(1)]
 *  @param {Color}   [color=WHITE]
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
 *  @param {Vector2} [size=vec2(1)]
 *  @param {Color}   [colorTop=WHITE]
 *  @param {Color}   [colorBottom=CLEAR_WHITE]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRectGradient(pos, size, colorTop=WHITE, colorBottom=CLEAR_WHITE, angle=0, useWebGL=glEnable, screenSpace=false, context)
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
        ++primitiveCount;
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

/** Draw a texture tiled (wrapped) across a rectangle in world space.
 *  Useful for backgrounds, repeating patterns, and seamless fills.
 *  The whole texture is tiled — sub-region (TileInfo) wrapping is not supported.
 *  @param {Vector2}  pos          - Center of the rect in world space
 *  @param {Vector2}  size         - Size of the rect in world space
 *  @param {Vector2}  wrapCount    - How many times the texture repeats (x, y)
 *  @param {TextureInfo|number} [texture=0] - TextureInfo or texture index into textureInfos
 *  @param {Color}    [color=WHITE] - Color to modulate with
 *  @param {number}   [angle=0] - Angle to rotate by
 *  @param {Color}    [additiveColor] - Additive color to be applied if any
 *  @param {boolean}  [useWebGL=glEnable] - Use accelerated WebGL rendering?
 *  @param {boolean}  [screenSpace=false] - Are pos and size in screen space?
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTextureWrapped(pos, size, wrapCount, texture=0, color=WHITE,
    angle=0, additiveColor, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isVector2(wrapCount), 'wrapCount must be a vec2');
    ASSERT(isColor(color), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!additiveColor || isColor(additiveColor), 'additiveColor must be a color');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');
    ASSERT(!(texture instanceof TileInfo),
        'pass a TextureInfo or texture index, not a TileInfo — use tileInfo.textureInfo');

    // short-circuit before texture lookup — textureInfos[0] is undefined in headless mode
    if (headlessMode) return;

    // resolve texture argument: TextureInfo or index
    const textureInfo = typeof texture === 'number' ? textureInfos[texture] : texture;
    ASSERT(textureInfo instanceof TextureInfo, 'texture not loaded');
    ASSERT(textureInfo.size.x > 0, 'texture not loaded');
    ASSERT(textureInfo.wrap,
        'drawTextureWrapped requires a wrap-enabled texture; call textureInfo.setWrap(true) first');

    if (useWebGL && glEnable)
    {
        ASSERT(!!glContext, 'WebGL is not enabled!');
        if (screenSpace)
            [pos, size, angle] = screenToWorldTransform(pos, size, angle);
        glSetTexture(textureInfo.glTexture);
        glDraw(pos.x, pos.y, size.x, size.y, angle,
            0, 0, wrapCount.x, wrapCount.y,
            color.rgbaInt(), additiveColor && additiveColor.rgbaInt());
        return;
    }

    // Canvas2D path — increment counts here (WebGL counts via glFlush)
    ++drawCount;
    ++primitiveCount;

    if (!screenSpace)
    {
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
        angle -= cameraAngle;
    }

    // pick image source: raw, or tinted bake. Match drawImageColor's
    // "no tint needed" predicate so behavior stays consistent.
    const noTint = !canvasColorTiles ||
        (additiveColor
            ? isWhite(color.add(additiveColor)) && additiveColor.a <= 0
            : isWhite(color));
    // alpha is baked into pixels by bakeTintedImage's additive branch;
    // in that case globalAlpha must NOT also apply color.a
    const alphaBaked = !noTint && additiveColor && !isBlack(additiveColor);
    const source = noTint
        ? textureInfo.image
        : bakeTintedImage(textureInfo.image, color, additiveColor);

    context = context || drawContext;
    context.save();
    context.translate(pos.x + .5, pos.y + .5);
    context.rotate(angle);
    context.globalAlpha = alphaBaked ? 1 : color.a;

    const pattern = context.createPattern(source, 'repeat');
    // map pattern-source pixels into user space so the rect contains
    // wrapCount.x × wrapCount.y repeats
    const m = new DOMMatrix()
        .translate(-size.x/2, -size.y/2)
        .scale(size.x / (wrapCount.x * source.width),
               size.y / (wrapCount.y * source.height));
    pattern.setTransform(m);
    context.fillStyle = pattern;
    context.fillRect(-size.x/2, -size.y/2, size.x, size.y);
    context.globalAlpha = 1;
    context.restore();
}

/** Draw connected lines between a series of points
 *  @param {Array<Vector2>} points
 *  @param {number}  [width]
 *  @param {Color}   [color=WHITE]
 *  @param {boolean} [wrap] - Should the last point connect to the first?
 *  @param {Vector2} [pos=vec2()] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLineList(points, width=.1, color=WHITE, wrap=false, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context)
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
        ++primitiveCount;
        drawCanvas2D(pos, vec2(1), angle, false, (context)=>
        {
            context.strokeStyle = color.toString();
            context.lineWidth = width;
            context.beginPath();
            for (let i=0; i<points.length; ++i)
            {
                const point = points[i];
                context.lineTo(point.x, point.y);
            }
            wrap && context.closePath();
            context.stroke();
        }, screenSpace, context);
    }
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {number}  [width]
 *  @param {Color}   [color=WHITE]
 *  @param {Vector2} [pos=vec2()] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, width=.1, color=WHITE, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context)
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
 *  @param {Vector2} [size=vec2(1)]
 *  @param {number}  [sides]
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {number}  [angle]
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
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {Vector2} [pos=vec2()] - Offset to apply
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
 *  @param {Vector2} [size=vec2(1)] - Width and height diameter
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
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
    ASSERT(lineWidth >= 0, 'lineWidth must be a positive value or 0');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    // clamp line width to prevent artifacts
    lineWidth = clamp(lineWidth, 0, min(size.x, size.y));

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
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth=0]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircle(pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isNumber(size), 'size must be a number');
    drawEllipse(pos, vec2(size), color, 0, lineWidth, lineColor, useWebGL, screenSpace, context);
}

/** Draw an ellipse filled with a radial gradient from the center to the rim
 *  - Best when batched with other untextured polys
 *  - If drawing mostly textured sprites, bake the gradient into a texture and use drawTile instead
 *  - Stacking gradients at the exact same position may show a faint vertical artifact
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2(1)] - Width and height diameter
 *  @param {Color}   [colorInner=WHITE]
 *  @param {Color}   [colorOuter=CLEAR_WHITE]
 *  @param {number}  [angle]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
let drawEllipseGradientOffset = 0;
function drawEllipseGradient(pos, size=vec2(1), colorInner=WHITE, colorOuter=CLEAR_WHITE, angle=0, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size), 'size must be a vec2');
    ASSERT(isColor(colorInner) && isColor(colorOuter), 'color is invalid');
    ASSERT(isNumber(angle), 'angle must be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    if (headlessMode) return;

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
        // fan as tristrip; rotate the boundary vertex by one slice per call
        // so back-to-back gradients at the same position have their hole
        // (from gpu edge-rule on the boundary line-degen) at different rim
        // verts and don't visibly stack
        const sides = glCircleSides;
        const radiusX = size.x/2, radiusY = size.y/2;
        const innerInt = colorInner.rgbaInt();
        const outerInt = colorOuter.rgbaInt();
        const offset = drawEllipseGradientOffset++;
        const c = cos(-angle), s = sin(-angle);
        const rim = (a) =>
        {
            const lx = sin(a)*radiusX, ly = cos(a)*radiusY;
            return vec2(pos.x + lx*c - ly*s, pos.y + lx*s + ly*c);
        };
        const startA = (offset%sides)/sides*PI*2;
        const points = [rim(startA)];
        const colors = [outerInt];
        for (let i=sides; i--;)
        {
            const a = ((i+offset)%sides)/sides*PI*2;
            points.push(pos);
            colors.push(innerInt);
            points.push(rim(a));
            colors.push(outerInt);
        }
        glDrawColoredPoints(points, colors);
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        ++drawCount;
        ++primitiveCount;
        drawCanvas2D(pos, size, angle, false, (context)=>
        {
            const gradient = context.createRadialGradient(0, 0, 0, 0, 0, .5);
            gradient.addColorStop(0, colorInner.toString());
            gradient.addColorStop(1, colorOuter.toString());
            context.fillStyle = gradient;
            context.beginPath();
            context.ellipse(0, 0, .5, .5, 0, 0, 9);
            context.fill();
        }, screenSpace, context);
    }
}

/** Draw a circle filled with a radial gradient from the center to the rim
 *  - Best when batched with other untextured polys
 *  - If drawing mostly textured sprites, bake the gradient into a texture and use drawTile instead
 *  - Stacking gradients at the exact same position may show a faint vertical artifact
 *  @param {Vector2} pos
 *  @param {number}  [size=1] - Diameter
 *  @param {Color}   [colorInner=WHITE]
 *  @param {Color}   [colorOuter=CLEAR_WHITE]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircleGradient(pos, size=1, colorInner=WHITE, colorOuter=CLEAR_WHITE, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isNumber(size), 'size must be a number');
    drawEllipseGradient(pos, vec2(size), colorInner, colorOuter, 0, useWebGL, screenSpace, context);
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
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, fontStyle='', maxWidth, angle=0, context=drawContext)
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
 *  @param {number}  size
 *  @param {Color}   [color=WHITE]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=BLACK]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {string}  [font=fontDefault]
 *  @param {string}  [fontStyle]
 *  @param {number}  [maxWidth]
 *  @param {number}  [angle]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size, color=WHITE, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, fontStyle='', maxWidth, angle=0, context=drawContext)
{
    ASSERT(isStringLike(text), 'text must be a string');
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isNumber(size), 'size must be a number');
    ASSERT(isColor(color), 'color must be a color');
    ASSERT(isNumber(lineWidth), 'lineWidth must be a number');
    ASSERT(isColor(lineColor), 'lineColor must be a color');
    ASSERT(['left','center','right'].includes(textAlign), 'align must be left, center, or right');
    ASSERT(isStringLike(font), 'font must be a string');
    ASSERT(isStringLike(fontStyle), 'fontStyle must be a string');
    ASSERT(isNumber(angle), 'angle must be a number');
    
    const lines = (text+'').split('\n');
    const posY = pos.y - (lines.length-1) * size/2; // center vertically
    // save before style mutations so caller's context state is preserved
    context.save();
    context.fillStyle = color.toString();
    context.strokeStyle = lineColor.toString();
    context.lineWidth = lineWidth;
    context.textAlign = textAlign;
    context.font = fontStyle + ' ' + size + 'px '+ font;
    context.textBaseline = 'middle';
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

/** Load a texture at a specific index
 *  @param {number} textureIndex - Index to store the texture at
 *  @param {string} [src] - Image source path
 *  @return {Promise} Promise that resolves when texture is loaded
 *  @memberof Draw */
async function loadTexture(textureIndex, src)
{
    ASSERT(isNumber(textureIndex), 'textureIndex must be a number');
    ASSERT(!textureInfos[textureIndex], 'textureIndex is already loaded!');
    ASSERT(!src || isStringLike(src), 'image src must be a string');
    
    const image = new Image;
    if (src)
    {
        await new Promise(resolve =>
        {
            image.onerror = image.onload = resolve;
            image.crossOrigin = 'anonymous';
            image.src = src;
        });
    }
    
    textureInfos[textureIndex] = new TextureInfo(image);
}

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

    // cameraScale of 0 collapses world coords; nothing is visible
    if (!cameraScale) return false;

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
function setBlendMode(additive=false, context=drawContext)
{
    glAdditive = additive;
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
    // remove background alpha — explicit fillStyle so a previous caller
    // leaving workContext.fillStyle transparent can't silently no-op this
    workContext.fillStyle = '#000';
    workContext.fillRect(0,0,w,h);
    glCopyToContext(workContext);
    workContext.drawImage(mainCanvas, 0, 0);
    mainContext.drawImage(workCanvas, 0, 0);
}

// Internal: bake a color/additive-color tint into workReadCanvas at the
// image's native resolution. Returns the work canvas, suitable for
// passing to context.createPattern. Used by drawTextureWrapped's
// Canvas2D path. Caller is responsible for short-circuiting when no
// tint is needed (i.e. color is white and additiveColor is black/none).
function bakeTintedImage(image, color, additiveColor)
{
    const w = image.width|0, h = image.height|0;
    workReadCanvas.width = w;
    workReadCanvas.height = h;
    workReadContext.drawImage(image, 0, 0);

    const imageData = workReadContext.getImageData(0, 0, w, h);
    const data = imageData.data;
    if (additiveColor && !isBlack(additiveColor))
    {
        // multiply + additive (slower)
        const colorMultiply = [color.r, color.g, color.b, color.a];
        const colorAdd = [additiveColor.r * 255, additiveColor.g * 255,
                          additiveColor.b * 255, additiveColor.a * 255];
        for (let i = 0; i < data.length; ++i)
            data[i] = data[i] * colorMultiply[i&3] + colorAdd[i&3] |0;
    }
    else
    {
        // RGB only, faster — alpha left intact for the caller
        for (let i = 0; i < data.length; i+=4)
        {
            data[i  ] *= color.r;
            data[i+1] *= color.g;
            data[i+2] *= color.b;
        }
    }
    workReadContext.putImageData(imageData, 0, 0);
    return workReadCanvas;
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

/** Engine font image, 8x8 font provided by the engine
 *  @type {ImageFont}
 *  @memberof Draw */
let engineImageFont;

/**
 * Image Font Object - Draw text by using tiles in an image
 * - 96 characters (from space to tilde) are stored in an image
 * - A 8x8 default engine font is supplied for general use
 * - This system is WebGL enabled for fast text rendering
 * - Fonts can also be colored and scaled along each axis
 *
 * @memberof Draw
 * @example
 * // use built in font
 * const font = engineImageFont;
 *
 * // draw text
 * font.drawTextScreen('LittleJS\nHello World!', vec2(200, 50));
 */
class ImageFont
{
    /** Create an image font
     *  @param {TileInfo} tileInfo - Tile info of first character in font
     */
    constructor(tileInfo)
    {
        ASSERT(!!tileInfo, 'tileInfo is required for ImageFont');
        
        /** @property {TileInfo} - Tile info for the font */
        this.tileInfo = tileInfo.frame(0);
    }

    /** Draw text in world space using the image font
     *  @param {string|number} text
     *  @param {Vector2} pos
     *  @param {Vector2|number} [size]
     *  @param {boolean} [center=true]
     *  @param {Color} [color=WHITE]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] 
     */
    drawText(text, pos, size=1, center, color, useWebGL, context)
    {
        ASSERT(isVector2(size) || typeof size === 'number', 'size must be a vec2 or number');

        if (typeof size === 'number')
        {
            // if size is a number, make it a vector
            ASSERT(size > 0);
            size *= cameraScale;
            size = new Vector2(size, size);
        }
        else
            size = size.scale(cameraScale);
        this.drawTextScreen(text, worldToScreen(pos), size, center, color, useWebGL, context);
    }

    /** Draw text in screen space using the image font
     *  @param {string|number} text
     *  @param {Vector2} pos
     *  @param {Vector2|number} size
     *  @param {boolean} [center]
     *  @param {Color} [color=WHITE]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
     */
    drawTextScreen(text, pos, size, center=true, color=WHITE, useWebGL=glEnable, context)
    {
        ASSERT(isStringLike(text), 'text must be a string');
        ASSERT(isVector2(pos), 'pos must be a vec2');
        ASSERT(isVector2(size) || typeof size === 'number', 'size must be a vec2 or number');
        ASSERT(isColor(color), 'color must be a color');

        // if size is a number, make it a vector
        size = typeof size === 'number' ? new Vector2(size, size) : size;

        // precache objects for drawing
        const drawPos = new Vector2;
        const tileInfo = this.tileInfo;
        const padding = tileInfo.padding;
        const sizePaddedX = tileInfo.size.x + padding*2;
        const sizePaddedY = tileInfo.size.y + padding*2;
        const cols = tileInfo.textureInfo.size.x / sizePaddedX |0;

        // draw each line of text
        (text+'').split('\n').forEach((line, j)=>
        {
            const centerOffset = center ? (line.length-1) * size.x / 2 : 0;
            for (let i=line.length; i--;)
            {
                // get the character index
                const charCode = line.charCodeAt(i);
                const index = charCode < 32 || charCode > 127 ?
                    95 : charCode - 32; // handle out of range characters

                // get the position of the tile
                const x = index % cols;
                const y = index / cols |0;
                tileInfo.pos.x = x*sizePaddedX + padding;
                tileInfo.pos.y = y*sizePaddedY + padding;

                // draw the tile
                drawPos.x = pos.x + i * size.x - centerOffset |0;
                drawPos.y = pos.y + j * size.y |0;
                drawTile(drawPos, size, tileInfo, color, 0, false, undefined, useWebGL, true, context);
            }
        });
    }
}

// load engine font, called automatically on startup
async function imageFontInit()
{
    const image = new Image;
    await new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAAeAQMAAABnrVXaAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAAjpJREFUOMu9kzFu2zAUhn+CAROgqrk+B2l0BWYxMjlXeYaAtFtbdA1sGgHqRQfI0CNkSG5AwYB0BQ8d5Bsomwah6CPVeGg6tEPzAxLwyI+P78cP4u9lNO9OoMKnLMOobG5020/yaj/MrRcCGh1gBbyiLTPJEYaIiom5KM9Jq7KgynMGtb6L4GL4MF2H4LQKCXTvDVw2I4MsgZT7QLExdiutH+D08VOP3INXRrWX1/mmpbkNgAPYRVANb4xpcegYvhiNbIXauQICEjBuYLfMakaakWQeXxiZ0VDtuJCKs3ztMV59QtsHJNcRxDzfdL21ty3PrfIcXTN+E+GFAv6T5nbT9jd50/WFxb5ksdAv49qS6ouymG66ji08UMT6moykYLAo+V0j23GN4m829ZySAD5K7QsBfQTvOG8eE+gTeGYRAmnNAubN3hf5Zv9tJWDHp/VTuaSm7SN4fyINQqaNO3RMVxvpSPXnOChnRNvFcGY0gnwiPswYwTKVPE0zVtX3mTEIOoFzaqLrGuJaV+Uqumb71fVk/VoOH3cdLNQP/FHi8hV0CQNoqBZsUPlLPMsdCJro9QAaQQ0woDy9BJm0eTxCFnO9srcYlhNVlfR2EyTrph1uUtbUtAJifwRgrKuYdXVHeb0YI3QpawohQHkloI3J5FuVwI5ORxC9k2Tuz9Ir1IjgeIPGMHYkAZe2RuYkmWFmt3gGbTPOmBUWVTmRmHtGrfpzG/yuQNOKa6gBB/WA9khitPgl6/GP+gl2Af6tCbvaygAAAABJRU5ErkJggg==';
    });
    
    const tilePos=vec2(), tileSize=vec2(8), padding=1, bleed=0;
    const textureInfo = new TextureInfo(image);
    const tileInfo = new TileInfo(tilePos, tileSize, textureInfo, padding, bleed);
    engineImageFont = new ImageFont(tileInfo);
}