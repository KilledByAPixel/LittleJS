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
 * @param {(Number|Vector2)} [pos=0]                - Index of tile in sheet
 * @param {(Number|Vector2)} [size=tileSizeDefault] - Size of tile in pixels
 * @param {Number|TextureInfo} [texture]            - Texture index or texture info to use
 * @param {Number} [padding]                        - How many pixels padding around tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw
 */
function tile(pos=vec2(), size=tileSizeDefault, texture=0, padding=0)
{
    if (headlessMode)
        return new TileInfo;

    // if size is a number, make it a vector
    if (typeof size === 'number')
    {
        ASSERT(size > 0);
        size = vec2(size);
    }

    // use pos as a tile index
    const textureInfo = typeof texture === 'number' ? textureInfos[texture] : texture;
    ASSERT(!!textureInfo, 'Texture not loaded');
    const sizePadded = size.add(vec2(padding*2));
    if (typeof pos === 'number')
    {
        const cols = textureInfo.size.x / sizePadded.x |0;
        pos = cols>0 ? vec2(pos%cols, pos/cols|0) : vec2();
    }
    pos = vec2(pos.x*sizePadded.x+padding, pos.y*sizePadded.y+padding);

    // return a tile info object
    return new TileInfo(pos, size, textureInfo, padding);
}

/**
 * Tile Info - Stores info about how to draw a tile
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=(0,0)]            - Top left corner of tile in pixels
     *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
     *  @param {TextureInfo} [textureInfo=textureInfos[0]] - Texture info to use
     *  @param {Number}  [padding]              - How many pixels padding around tiles
     */
    constructor(pos=vec2(), size=tileSizeDefault, textureInfo=textureInfos[0], padding=0)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {TextureInfo} - The texture info for this tile */
        this.textureInfo = textureInfo;
        /** @property {Number} - How many pixels padding around tiles */
        this.padding = padding;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureInfo, this.padding); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  @param {Number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame == 'number');
        return this.offset(vec2(frame*(this.size.x+this.padding*2), 0));
    }
}

/** Texture Info - Stores info about each texture */
class TextureInfo
{
    /**
     * Create a TextureInfo, called automatically by the engine
     * @param {HTMLImageElement} image
     */
    constructor(image)
    {
        /** @property {HTMLImageElement} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = vec2(image.width, image.height);
        /** @property {WebGLTexture} - webgl texture */
        this.glTexture = glEnable && glCreateTexture(image);
        /** @property {Vector2} - inverse of the size for rendering */
        this.sizeInverse = vec2(1/image.width, 1/image.height);
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    let x = (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale;
    let y = (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale;
    if (cameraAngle)
    {
        // apply camera rotation
        const c = Math.cos(-cameraAngle), s = Math.sin(-cameraAngle);
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
    let x = worldPos.x - cameraPos.x;
    let y = worldPos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = Math.cos(cameraAngle), s = Math.sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2
    (
        x *  cameraScale + mainCanvasSize.x/2 - .5,
        y * -cameraScale + mainCanvasSize.y/2 - .5
    );
}

/** Convert a screen space delta to world space, applying camera rotation but not position
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
        const c = Math.cos(-cameraAngle), s = Math.sin(-cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x, y);
}

/** Convert a world space delta to screen space, applying camera rotation but not position
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
        const c = Math.cos(cameraAngle), s = Math.sin(cameraAngle);
        const xr = x * c - y * s, yr = x * s + y * c;
        x = xr; y = yr;
    }
    return new Vector2(x * cameraScale, y * -cameraScale);
}

/** Returns true if a world space circle is at least partly on screen
 *  @param {Vector2} pos
 *  @param {Vector2|Number} [size] - Diameter, or a vec2 whose length is used
 *  @return {Boolean}
 *  @memberof Draw */
function isOnScreen(pos, size=0)
{
    ASSERT(isVector2(pos), 'pos must be a vec2');
    ASSERT(isVector2(size) || isNumber(size), 'size must be a vec2 or number');

    // cameraScale of 0 collapses world coords, nothing is visible
    if (!cameraScale) return false;

    // optimized circle on screen test
    let x = pos.x - cameraPos.x;
    let y = pos.y - cameraPos.y;
    if (cameraAngle)
    {
        // apply inverse camera rotation
        const c = Math.cos(cameraAngle), s = Math.sin(cameraAngle);
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

/** Get the camera's visible area in world space
 *  @return {Vector2}
 *  @memberof Draw */
function getCameraSize() { return mainCanvasSize.scale(1/cameraScale); }

/** Draw textured tile centered in world space, with color applied if using WebGL
 *  @param {Vector2} pos                        - Center of the tile in world space
 *  @param {Vector2} [size=(1,1)]               - Size of the tile in world space
 *  @param {TileInfo}[tileInfo]                 - Tile info to use, untextured if undefined
 *  @param {Color}   [color=(1,1,1,1)]          - Color to modulate with
 *  @param {Number}  [angle]                    - Angle to rotate by
 *  @param {Boolean} [mirror]                   - If true image is flipped along the Y axis
 *  @param {Color}   [additiveColor]            - Additive color to be applied
 *  @param {Boolean} [useWebGL=glEnable]        - Use accelerated WebGL rendering
 *  @param {Boolean} [screenSpace=false]        - If true the pos and size are in screen space
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileInfo, color=new Color,
    angle=0, mirror, additiveColor, useWebGL=glEnable, screenSpace, context)
{
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode'); 
    ASSERT(typeof tileInfo !== 'number' || !tileInfo, 
        'this is an old style calls, to fix replace it with tile(tileIndex, tileSize)');

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
            if (tileFixBleedScale)
            {
                const tileImageFixBleed = sizeInverse.scale(tileFixBleedScale);
                glSetTexture(textureInfo.glTexture);
                glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, 
                    x + tileImageFixBleed.x,     y + tileImageFixBleed.y, 
                    x - tileImageFixBleed.x + w, y - tileImageFixBleed.y + h, 
                    color.rgbaInt(), additiveColor && additiveColor.rgbaInt()); 
            }
            else
            {
                glSetTexture(textureInfo.glTexture);
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
        size = vec2(size.x, -size.y); // fix upside down sprites
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (textureInfo)
            {
                // calculate uvs and render
                const x = tileInfo.pos.x + tileFixBleedScale;
                const y = tileInfo.pos.y + tileFixBleedScale;
                const w = tileInfo.size.x - 2*tileFixBleedScale;
                const h = tileInfo.size.y - 2*tileFixBleedScale;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(textureInfo.image, x, y, w, h, -.5, -.5, 1, 1);
                context.globalAlpha = 1; // set back to full alpha
            }
            else
            {
                // if no tile info, force untextured
                context.fillStyle = color;
                context.fillRect(-.5, -.5, 1, 1);
            }
        }, screenSpace, context);
    }
}

/** Draw colored rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=(1,1)]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [angle]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRect(pos, size, color, angle, useWebGL, screenSpace, context)
{ 
    drawTile(pos, size, undefined, color, angle, false, undefined, useWebGL, screenSpace, context); 
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Number}  [thickness]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, thickness=.1, color, useWebGL, screenSpace, context)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle(), useWebGL, screenSpace, context);
}

/** Draw colored polygon using passed in points
 *  @param {Array}   points - Array of Vector2 points
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawPoly(points, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), screenSpace, context=mainContext)
{
    context.fillStyle = color.toString();
    context.beginPath();
    for (const point of screenSpace ? points : points.map(worldToScreen))
        context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
    if (lineWidth)
    {
        context.strokeStyle = lineColor.toString();
        context.lineWidth = screenSpace ? lineWidth : lineWidth*cameraScale;
        context.stroke();
    }
}

/** Draw colored ellipse using passed in point
 *  @param {Vector2} pos
 *  @param {Number}  [width=1]
 *  @param {Number}  [height=1]
 *  @param {Number}  [angle=0]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawEllipse(pos, width=1, height=1, angle=0, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), screenSpace, context=mainContext)
{
    if (!screenSpace)
    {
        pos = worldToScreen(pos);
        width *= cameraScale;
        height *= cameraScale;
        lineWidth *= cameraScale;
    }
    context.fillStyle = color.toString();
    context.beginPath();
    context.ellipse(pos.x, pos.y, width, height, angle, 0, 9);
    context.fill();
    if (lineWidth)
    {
        context.strokeStyle = lineColor.toString();
        context.lineWidth = lineWidth;
        context.stroke();
    }
}

/** Draw colored circle using passed in point
 *  @param {Vector2} pos
 *  @param {Number}  [radius=1]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawCircle(pos, radius=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), screenSpace, context=mainContext)
{ drawEllipse(pos, radius, radius, 0, color, lineWidth, lineColor, screenSpace, context); }

/** Draw directly to a 2d canvas context in world space
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {Number}   angle
 *  @param {Boolean}  mirror
 *  @param {Function} drawFunction
 *  @param {Boolean} [screenSpace=false]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawCanvas2D(pos, size, angle, mirror, drawFunction, screenSpace, context=mainContext)
{
    if (!screenSpace)
    {
        // transform from world space to screen space
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

/** Draw text on main canvas in world space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {String}  [font=fontDefault]
 *  @param {Number}  [maxWidth]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, maxWidth, context=mainContext)
{
    drawTextScreen(text, worldToScreen(pos), size*cameraScale, color, lineWidth*cameraScale, lineColor, textAlign, font, maxWidth, context);
}

/** Draw text on overlay canvas in world space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign='center']
 *  @param {String}  [font=fontDefault]
 *  @param {Number}  [maxWidth]
 *  @memberof Draw */
function drawTextOverlay(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, maxWidth)
{
    drawText(text, pos, size, color, lineWidth, lineColor, textAlign, font, maxWidth, overlayContext);
}

/** Draw text on overlay canvas in screen space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size]
 *  @param {Color}   [color=(1,1,1,1)]
 *  @param {Number}  [lineWidth]
 *  @param {Color}   [lineColor=(0,0,0,1)]
 *  @param {CanvasTextAlign}  [textAlign]
 *  @param {String}  [font=fontDefault]
 *  @param {Number}  [maxWidth]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=fontDefault, maxWidth=undefined, context=overlayContext)
{
    context.fillStyle = color.toString();
    context.strokeStyle = lineColor.toString();
    context.lineWidth = lineWidth;
    context.textAlign = textAlign;
    context.font = size + 'px '+ font;
    context.textBaseline = 'middle';
    context.lineJoin = 'round';

    const lines = (text+'').split('\n');
    pos = pos.copy();
    pos.y -= (lines.length-1) * size/2; // center text vertically
    lines.forEach(line=>
    {
        lineWidth && context.strokeText(line, pos.x, pos.y, maxWidth);
        context.fillText(line, pos.x, pos.y, maxWidth);
        pos.y += size;
    });
}

/** Enable normal or additive blend mode
 *  @param {Boolean} [additive]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function setAdditiveBlendMode(additive=true, useWebGL=glEnable, context)
{
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode');
    if (useWebGL)
        glAdditive = additive;
    else
    {
        if (!context)
            context = mainContext;
        context.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    }
}

/** Combines all LittleJS canvases onto the main canvas and clears them
 *  This is necessary for things like saving a screenshot
 *  @memberof Draw */
function combineCanvases()
{
    // combine canvases
    glCopyToContext(mainContext, true);
    mainContext.drawImage(overlayCanvas, 0, 0);

    // clear canvases
    glClearCanvas();
    overlayCanvas.width |= 0;
}

///////////////////////////////////////////////////////////////////////////////
// Display functions

/** Returns true if fullscreen mode is active
 *  @return {Boolean}
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
 *  @param {String}  cursorStyle - CSS cursor style (auto, none, crosshair, etc)
 *  @memberof Draw */
function setCursor(cursorStyle = 'auto')
{
    const rootElement = mainCanvas.parentElement;
    rootElement.style.cursor = cursorStyle;
}