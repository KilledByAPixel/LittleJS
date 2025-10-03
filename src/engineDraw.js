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
 * overlayCanvas - Another 2D canvas that appears on top of the other 2 canvases.
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

/** A canvas that appears on top of everything the same size as mainCanvas
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let overlayCanvas;

/** 2d context for overlayCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let overlayContext;

/** The default canvas to use for drawing, usually mainCanvas
 *  @type {HTMLCanvasElement|OffscreenCanvas}
 *  @memberof Draw */
let drawCanvas;

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

/** The size of the main canvas (and other secondary canvases)
 *  @type {Vector2}
 *  @memberof Draw */
let mainCanvasSize = vec2();

/** Array containing texture info for batch rendering system
 *  @type {Array<TextureInfo>}
 *  @memberof Draw */
let textureInfos = [];

// Keep track of how many draw calls there were each frame for debugging
let drawCount;

///////////////////////////////////////////////////////////////////////////////

/**
 * Create a tile info object using a grid based system
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {Vector2|number} [pos=0] - Index of tile in sheet
 * @param {Vector2|number} [size=tileSizeDefault] - Size of tile in pixels
 * @param {number} [textureIndex] - Texture index to use
 * @param {number} [padding] - How many pixels padding around tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw */
function tile(pos=new Vector2, size=tileSizeDefault, textureIndex=0, padding=0)
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
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=(0,0)]            - Top left corner of tile in pixels
     *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
     *  @param {number}  [textureIndex]         - Texture index to use
     *  @param {number}  [padding]              - How many pixels padding around tiles
     */
    constructor(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0)
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
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureIndex); }

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
     * Set this tile to use a full image
     * @param {HTMLImageElement|OffscreenCanvas} image
     * @param {WebGLTexture} [glTexture] - WebGL texture
     * @return {TileInfo}
     */
    setFullImage(image, glTexture)
    {
        this.pos = new Vector2;
        this.size = new Vector2(image.width, image.height);
        this.textureInfo = new TextureInfo(image, glTexture);
        return this;
    }
}

/** Texture Info - Stores info about each texture */
class TextureInfo
{
    /**
     * Create a TextureInfo, called automatically by the engine
     * @param {HTMLImageElement|OffscreenCanvas} image
     * @param {WebGLTexture} [glTexture] - WebGL texture
     */
    constructor(image, glTexture)
    {
        /** @property {HTMLImageElement} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = vec2(image.width, image.height);
        /** @property {Vector2} - inverse of the size, cached for rendering */
        this.sizeInverse = vec2(1/image.width, 1/image.height);
        /** @property {WebGLTexture} - WebGL texture */
        this.glTexture = glTexture;
    }

    createWebGLTexture()
    {
        ASSERT(!this.glTexture);
        if (glEnable)
            this.glTexture = glCreateTexture(this.image);
    }
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
function drawTile(pos, size=new Vector2(1), tileInfo, color=new Color,
    angle=0, mirror, additiveColor, useWebGL=glEnable, screenSpace, context)
{
    ASSERT(isVector2(pos) && pos.isValid(), 'drawTile pos should be a vec2');
    ASSERT(isVector2(size) && size.isValid(), 'drawTile size should be a vec2');
    ASSERT(isColor(color) && (!additiveColor || isColor(additiveColor)), 'drawTile color is invalid');
    ASSERT(isNumber(angle), 'drawTile angle should be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');

    const textureInfo = tileInfo && tileInfo.textureInfo;
    if (useWebGL)
    {
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            size = size.scale(1/cameraScale);
        }
        if (textureInfo)
        {
            // calculate uvs and render
            const sizeInverse = textureInfo.sizeInverse;
            const x = tileInfo.pos.x * sizeInverse.x;
            const y = tileInfo.pos.y * sizeInverse.y;
            const w = tileInfo.size.x * sizeInverse.x;
            const h = tileInfo.size.y * sizeInverse.y;
            glSetTexture(textureInfo.glTexture);
            if (tileFixBleedScale)
            {
                const tileImageFixBleedX = sizeInverse.x*tileFixBleedScale;
                const tileImageFixBleedY = sizeInverse.y*tileFixBleedScale;
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle,
                    x + tileImageFixBleedX,     y + tileImageFixBleedY,
                    x - tileImageFixBleedX + w, y - tileImageFixBleedY + h,
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
        showWatermark && ++drawCount;
        size = new Vector2(size.x, -size.y); // fix upside down sprites
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (textureInfo)
            {
                // calculate uvs and render
                const x = tileInfo.pos.x,  y = tileInfo.pos.y;
                const w = tileInfo.size.x, h = tileInfo.size.y;
                drawImageColor(context, textureInfo.image, x, y, w, h, -.5, -.5, 1, 1, color, additiveColor);
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

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {number}  [thickness]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Vector2} [pos=(0,0)] - Offset to apply
 *  @param {number}  [angle] - Angle to rotate by
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, thickness=.1, color, pos=vec2(), angle=0, useWebGL, screenSpace, context)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    pos = pos.add(posA.add(halfDelta));
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
function drawRegularPoly(pos, size=vec2(1), sides=3, color=new Color, angle=0, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    // build regular polygon points
    const points = [];
    for (let i=sides; i--;)
    {
        const a = (i/sides)*PI*2;
        points.push(vec2(Math.sin(a)*size.x, Math.cos(a)*size.y));
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
function drawPoly(points, color=new Color, lineWidth=0, lineColor=BLACK, pos=vec2(), angle=0, useWebGL=glEnable, screenSpace=false, context=undefined)
{
    ASSERT(isVector2(pos) && pos.isValid(), 'drawPoly pos should be a vec2');
    ASSERT(Array.isArray(points), 'drawPoly points should be an array');
    ASSERT(isColor(color) && isColor(lineColor), 'drawPoly color is invalid');
    ASSERT(isNumber(lineWidth), 'drawPoly lineWidth should be a number');
    ASSERT(isNumber(angle), 'drawPoly angle should be a number');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');
    if (useWebGL)
    {
        let scale = 1;
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            scale = 1/cameraScale;
        }
        glDrawPointsTransform(points, color.rgbaInt(), pos.x, pos.y, scale, scale, angle);
        if (lineWidth > 0)
            glDrawOutlineTransform(points, lineColor.rgbaInt(), lineWidth, pos.x, pos.y, scale, scale, angle);
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
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [angle]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawEllipse(pos, size=vec2(1), color=new Color, angle=0, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{
    ASSERT(isVector2(pos) && pos.isValid(), 'drawEllipse pos should be a vec2');
    ASSERT(isVector2(size) && size.isValid(), 'drawEllipse size should be a vec2');
    ASSERT(isColor(color) && isColor(lineColor), 'drawEllipse color is invalid');
    ASSERT(isNumber(angle), 'drawEllipse angle should be a number');
    ASSERT(isNumber(lineWidth), 'drawEllipse lineWidth should be a number');
    ASSERT(lineWidth >= 0 && lineWidth < size.x && lineWidth < size.y, 'drawEllipse invalid lineWidth');
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');
    if (useWebGL)
    {
        // draw as a regular polygon
        const sides = glCircleSides;
        drawRegularPoly(pos, size, sides, color, angle, lineWidth, lineColor, useWebGL, screenSpace, context);
    }
    else
    {
        drawCanvas2D(pos, vec2(1), angle, false, context=>
        {
            context.fillStyle = color.toString();
            context.beginPath();
            context.ellipse(0, 0, size.x, size.y, 0, 0, 9);
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
 *  @param {number}  [radius=1]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {boolean} [useWebGL=glEnable]
 *  @param {boolean} [screenSpace]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawCircle(pos, radius=1, color=new Color, lineWidth=0, lineColor=BLACK, useWebGL=glEnable, screenSpace=false, context)
{ drawEllipse(pos, vec2(radius), color, 0, lineWidth, lineColor, useWebGL, screenSpace, context); }

/** Draw directly to a 2d canvas context in world space
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {number}   angle
 *  @param {boolean}  [mirror]
 *  @param {Function} [drawFunction]
 *  @param {boolean}  [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawCanvas2D(pos, size, angle=0, mirror=false, drawFunction, screenSpace=false, context=drawContext)
{
    if (!screenSpace)
    {
        // transform from world space to screen space
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
    }
    context.save();
    context.translate(pos.x+.5, pos.y+.5);
    context.rotate(angle-cameraAngle);
    context.scale(mirror ? -size.x : size.x, -size.y);
    drawFunction(context);
    context.restore();
}

///////////////////////////////////////////////////////////////////////////////
// Text Drawing Functions

/** Draw text on main canvas in world space
 *  Automatically splits new lines into rows
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {number}  [maxWidth]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, maxWidth, context=drawContext)
{
    drawTextScreen(text, worldToScreen(pos), size*cameraScale, color, lineWidth*cameraScale, lineColor, textAlign, font, maxWidth, context);
}

/** Draw text on overlay canvas in world space
 *  Automatically splits new lines into rows
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {string}  [font=fontDefault]
 *  @param {number}  [maxWidth]
 *  @memberof Draw */
function drawTextOverlay(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, maxWidth)
{
    drawText(text, pos, size, color, lineWidth, lineColor, textAlign, font, maxWidth, overlayContext);
}

/** Draw text on overlay canvas in screen space
 *  Automatically splits new lines into rows
 *  @param {string}  text
 *  @param {Vector2} pos
 *  @param {number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {string}  [font=fontDefault]
 *  @param {number}  [maxWidth]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=new Color, lineWidth=0, lineColor=BLACK, textAlign='center', font=fontDefault, maxWidth, context=overlayContext)
{
    context.fillStyle = color.toString();
    context.strokeStyle = lineColor.toString();
    context.lineWidth = lineWidth;
    context.textAlign = textAlign;
    context.font = size + 'px '+ font;
    context.textBaseline = 'middle';
    context.lineJoin = 'round';

    const lines = (text+'').split('\n');
    let posY = pos.y;
    posY -= (lines.length-1) * size/2; // center text vertically
    lines.forEach(line=>
    {
        lineWidth && context.strokeText(line, pos.x, posY, maxWidth);
        context.fillText(line, pos.x, posY, maxWidth);
        posY += size;
    });
}

///////////////////////////////////////////////////////////////////////////////
// Drawing utilities

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    let cameraPosRelativeX = (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale;
    let cameraPosRelativeY = (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const cos = Math.cos(-cameraAngle), sin = Math.sin(-cameraAngle);
        const rotatedX = cameraPosRelativeX * cos - cameraPosRelativeY * sin;
        const rotatedY = cameraPosRelativeX * sin + cameraPosRelativeY * cos;
        cameraPosRelativeX = rotatedX;
        cameraPosRelativeY = rotatedY;
    }
    return new Vector2(cameraPosRelativeX + cameraPos.x, cameraPosRelativeY + cameraPos.y);
}

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreen(worldPos)
{
    let cameraPosRelativeX = worldPos.x - cameraPos.x;
    let cameraPosRelativeY = worldPos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const cos = Math.cos(cameraAngle), sin = Math.sin(cameraAngle);
        const rotatedX = cameraPosRelativeX * cos - cameraPosRelativeY * sin;
        const rotatedY = cameraPosRelativeX * sin + cameraPosRelativeY * cos;
        cameraPosRelativeX = rotatedX;
        cameraPosRelativeY = rotatedY;
    }
    return new Vector2
    (
        cameraPosRelativeX *  cameraScale + mainCanvasSize.x/2 - .5,
        cameraPosRelativeY * -cameraScale + mainCanvasSize.y/2 - .5
    );
}

/** Get the camera's visible area in world space
 *  @return {Vector2}
 *  @memberof Draw */
function getCameraSize() { return mainCanvasSize.scale(1/cameraScale); }

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

/** Combines all LittleJS canvases onto the main canvas and clears them
 *  This is necessary for things like saving a screenshot
 *  @memberof Draw */
function combineCanvases()
{
    // combine canvases
    glCopyToContext(mainContext);
    mainContext.drawImage(overlayCanvas, 0, 0);

    // clear canvases
    glClearCanvas();
    overlayCanvas.width |= 0;
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
 *  @memberof Draw */
function drawImageColor(context, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight, color, additiveColor)
{
    function isWhite(c) { return c.r >= 1 && c.g >= 1 && c.b >= 1; }
    function isBlack(c) { return c.r <= 0 && c.g <= 0 && c.b <= 0 && c.a <= 0; }
    const sx2 = tileFixBleedScale;
    const sy2 = tileFixBleedScale;
    const sWidth2  = sWidth  - 2*tileFixBleedScale;
    const sHeight2 = sHeight - 2*tileFixBleedScale;
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
        workCanvas.width = sWidth;
        workCanvas.height = sHeight;
        workContext.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        // tint image using offscreen work context
        const imageData = workContext.getImageData(0, 0, sWidth, sHeight);
        const data = imageData.data;
        if (additiveColor && !isBlack(additiveColor))
        {
            // slower path with additive color
            const colorMultiply = [color.r, color.g, color.b, color.a];
            const colorAdd = [additiveColor.r * 255, additiveColor.g * 255, additiveColor.b * 255, additiveColor.a * 255];
            for (let i = 0; i < data.length; ++i)
                data[i] = data[i] * colorMultiply[i&3] + colorAdd[i&3] |0;
            workContext.putImageData(imageData, 0, 0);
            context.drawImage(workCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
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
            workContext.putImageData(imageData, 0, 0);
            context.globalAlpha = color.a;
            context.drawImage(workCanvas, sx2, sy2, sWidth2, sHeight2, dx, dy, dWidth, dHeight);
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
 * @example
 * // use built in font
 * const font = new FontImage;
 *
 * // draw text
 * font.drawTextScreen("LittleJS\nHello World!", vec2(200, 50));
 */
class FontImage
{
    /** Create an image font
     *  @param {HTMLImageElement} [image]    - Image for the font, if undefined default font is used
     *  @param {Vector2} [tileSize=(8,8)]    - Size of the font source tiles
     *  @param {Vector2} [paddingSize=(0,1)] - How much extra space to add between characters
     */
    constructor(image, tileSize=vec2(8), paddingSize=vec2(0,1), context=overlayContext)
    {
        // load default font image
        if (!engineFontImage)
        {
            engineFontImage = new Image;
            engineFontImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAYAQAAAAA9+x6JAAAAAnRSTlMAAHaTzTgAAAGiSURBVHjaZZABhxxBEIUf6ECLBdFY+Q0PMNgf0yCgsSAGZcT9sgIPtBWwIA5wgAPEoHUyJeeSlW+gjK+fegWwtROWpVQEyWh2npdpBmTUFVhb29RINgLIukoXr5LIAvYQ5ve+1FqWEMqNKTX3FAJHyQDRZvmKWubAACcv5z5Gtg2oyCWE+Yk/8JZQX1jTTCpKAFGIgza+dJCNBF2UskRlsgwitHbSV0QLgt9sTPtsRlvJjEr8C/FARWA2bJ/TtJ7lko34dNDn6usJUMzuErP89UUBJbWeozrwLLncXczd508deAjLWipLO4Q5XGPcJvPu92cNDaN0P5G1FL0nSOzddZOrJ6rNhbXGmeDvO3TF7DeJWl4bvaYQTNHCTeuqKZmbjHaSOFes+IX/+IhHrnAkXOAsfn24EM68XieIECoccD4KZLk/odiwzeo2rovYdhvb2HYFgyznJyDpYJdYOmfXgVdJTaUi4xA2uWYNYec9BLeqdl9EsoTw582mSFDX2DxVLbNt9U3YYoeatBad1c2Tj8t2akrjaIGJNywKB/7h75/gN3vCMSaadIUTAAAAAElFTkSuQmCC';
        }

        this.image = image || engineFontImage;
        this.tileSize = tileSize;
        this.paddingSize = paddingSize;
    }

    /** Draw text in world space using the image font
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale=.25]
     *  @param {boolean} [center]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}[context=drawContext] 
     */
    drawText(text, pos, scale=1, center, context=drawContext)
    {
        this.drawTextScreen(text, worldToScreen(pos).floor(), scale*cameraScale|0, center, context);
    }

    /** Draw text on overlay canvas in world space using the image font
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale]
     *  @param {boolean} [center]
     */
    drawTextOverlay(text, pos, scale=4, center)
    { this.drawText(text, pos, scale, center, overlayContext); }

    /** Draw text on overlay canvas in screen space using the image font
     *  @param {string}  text
     *  @param {Vector2} pos
     *  @param {number}  [scale]
     *  @param {boolean} [center]
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=drawContext]
     */
    drawTextScreen(text, pos, scale=4, center, context=overlayContext)
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