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
 *  @type {Array}
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
 * @param {Number} [textureIndex]                   - Texture index to use
 * @param {Number} [padding]                        - How many pixels padding around tiles
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at index (4,8) with a size of (30,10)
 * @memberof Draw
 */
function tile(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0)
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
    const textureInfo = textureInfos[textureIndex];
    ASSERT(textureInfo, 'Texture not loaded');
    const sizePadded = size.add(vec2(padding*2));
    const cols = textureInfo.size.x / sizePadded.x |0;
    if (typeof pos === 'number')
        pos = vec2(pos%cols, pos/cols|0);
    pos = vec2(pos.x*sizePadded.x+padding, pos.y*sizePadded.y+padding);

    // return a tile info object
    return new TileInfo(pos, size, textureIndex, padding); 
}

/** 
 * Tile Info - Stores info about how to draw a tile
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=(0,0)]            - Top left corner of tile in pixels
     *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
     *  @param {Number}  [textureIndex]         - Texture index to use
     *  @param {Number}  [padding]              - How many pixels padding around tiles
     */
    constructor(pos=vec2(), size=tileSizeDefault, textureIndex=0, padding=0)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos.copy();
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size.copy();
        /** @property {Number} - Texture index to use */
        this.textureIndex = textureIndex;
        /** @property {Number} - How many pixels padding around tiles */
        this.padding = padding;
    }

    /** Returns a copy of this tile offset by a vector
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureIndex); }

    /** Returns a copy of this tile offset by a number of animation frames
    *  @param {Number} frame - Offset to apply in animation frames
    *  @return {TileInfo}
    */
    frame(frame)
    {
        ASSERT(typeof frame == 'number');
        return this.offset(vec2(frame*(this.size.x+this.padding*2), 0));
    }

    /** Returns the texture info for this tile
    *  @return {TextureInfo}
    */
    getTextureInfo()
    { return textureInfos[this.textureIndex]; }
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
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    return new Vector2
    (
        (screenPos.x - mainCanvasSize.x/2 + .5) /  cameraScale + cameraPos.x,
        (screenPos.y - mainCanvasSize.y/2 + .5) / -cameraScale + cameraPos.y
    );
}

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
function worldToScreen(worldPos)
{
    return new Vector2
    (
        (worldPos.x - cameraPos.x) *  cameraScale + mainCanvasSize.x/2 - .5,
        (worldPos.y - cameraPos.y) * -cameraScale + mainCanvasSize.y/2 - .5
    );
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
 *  @param {Color}   [additiveColor=(0,0,0,0)]  - Additive color to be applied
 *  @param {Boolean} [useWebGL=glEnable]        - Use accelerated WebGL rendering
 *  @param {Boolean} [screenSpace=false]        - If true the pos and size are in screen space
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileInfo, color=new Color,
    angle=0, mirror, additiveColor=new Color(0,0,0,0), useWebGL=glEnable, screenSpace, context)
{
    ASSERT(!context || !useWebGL, 'context only supported in canvas 2D mode'); 
    ASSERT(typeof tileInfo !== 'number' || !tileInfo, 
        'this is an old style calls, to fix replace it with tile(tileIndex, tileSize)');

    const textureInfo = tileInfo && tileInfo.getTextureInfo();
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
            const sizeInverse = vec2(1).divide(textureInfo.size);
            const x = tileInfo.pos.x * sizeInverse.x;
            const y = tileInfo.pos.y * sizeInverse.y;
            const w = tileInfo.size.x * sizeInverse.x;
            const h = tileInfo.size.y * sizeInverse.y;
            const tileImageFixBleed = sizeInverse.scale(tileFixBleedScale);
            glSetTexture(textureInfo.glTexture);
            glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, 
                x + tileImageFixBleed.x,     y + tileImageFixBleed.y, 
                x - tileImageFixBleed.x + w, y - tileImageFixBleed.y + h, 
                color.rgbaInt(), additiveColor.rgbaInt()); 
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
    }
    context.save();
    context.translate(pos.x+.5, pos.y+.5);
    context.rotate(angle);
    context.scale(mirror ? -size.x : size.x, -size.y);
    drawFunction(context);
    context.restore();
}

/** Enable normal or additive blend mode
 *  @param {Boolean} [additive]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function setBlendMode(additive, useWebGL=glEnable, context)
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
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @param {Number}  [maxWidth]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, context, maxWidth)
{
    drawTextScreen(text, worldToScreen(pos), size*cameraScale, color, lineWidth*cameraScale, lineColor, textAlign, font, context, maxWidth);
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
 *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext]
 *  @param {Number}  [maxWidth]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=fontDefault, context=overlayContext, maxWidth=undefined)
{
    context.fillStyle = color.toString();
    context.lineWidth = lineWidth;
    context.strokeStyle = lineColor.toString();
    context.textAlign = textAlign;
    context.font = size + 'px '+ font;
    context.textBaseline = 'middle';
    context.lineJoin = 'round';

    pos = pos.copy();
    (text+'').split('\n').forEach(line=>
    {
        lineWidth && context.strokeText(line, pos.x, pos.y, maxWidth);
        context.fillText(line, pos.x, pos.y, maxWidth);
        pos.y += size;
    });
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
 * const font = new ImageFont;
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
     *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context=overlayContext] - context to draw to
     */
    constructor(image, tileSize=vec2(8), paddingSize=vec2(0,1), context=overlayContext)
    {
        // load default font image
        if (!engineFontImage)
            (engineFontImage = new Image).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAYAQAAAAA9+x6JAAAAAnRSTlMAAHaTzTgAAAGiSURBVHjaZZABhxxBEIUf6ECLBdFY+Q0PMNgf0yCgsSAGZcT9sgIPtBWwIA5wgAPEoHUyJeeSlW+gjK+fegWwtROWpVQEyWh2npdpBmTUFVhb29RINgLIukoXr5LIAvYQ5ve+1FqWEMqNKTX3FAJHyQDRZvmKWubAACcv5z5Gtg2oyCWE+Yk/8JZQX1jTTCpKAFGIgza+dJCNBF2UskRlsgwitHbSV0QLgt9sTPtsRlvJjEr8C/FARWA2bJ/TtJ7lko34dNDn6usJUMzuErP89UUBJbWeozrwLLncXczd508deAjLWipLO4Q5XGPcJvPu92cNDaN0P5G1FL0nSOzddZOrJ6rNhbXGmeDvO3TF7DeJWl4bvaYQTNHCTeuqKZmbjHaSOFes+IX/+IhHrnAkXOAsfn24EM68XieIECoccD4KZLk/odiwzeo2rovYdhvb2HYFgyznJyDpYJdYOmfXgVdJTaUi4xA2uWYNYec9BLeqdl9EsoTw582mSFDX2DxVLbNt9U3YYoeatBad1c2Tj8t2akrjaIGJNywKB/7h75/gN3vCMSaadIUTAAAAAElFTkSuQmCC';

        this.image = image || engineFontImage;
        this.tileSize = tileSize;
        this.paddingSize = paddingSize;
        this.context = context;
    }

    /** Draw text in world space using the image font
     *  @param {String}  text
     *  @param {Vector2} pos
     *  @param {Number}  [scale=.25]
     *  @param {Boolean} [center]
     */
    drawText(text, pos, scale=1, center)
    {
        this.drawTextScreen(text, worldToScreen(pos).floor(), scale*cameraScale|0, center);
    }

    /** Draw text in screen space using the image font
     *  @param {String}  text
     *  @param {Vector2} pos
     *  @param {Number}  [scale]
     *  @param {Boolean} [center]
     */
    drawTextScreen(text, pos, scale=4, center)
    {
        const context = this.context;
        context.save();
        context.imageSmoothingEnabled = !canvasPixelated;

        const size = this.tileSize;
        const drawSize = size.add(this.paddingSize).scale(scale);
        const cols = this.image.width / this.tileSize.x |0;
        (text+'').split('\n').forEach((line, i)=>
        {
            const centerOffset = center ? line.length * size.x * scale / 2 |0 : 0;
            for(let j=line.length; j--;)
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

///////////////////////////////////////////////////////////////////////////////
// Fullscreen mode

/** Returns true if fullscreen mode is active
 *  @return {Boolean}
 *  @memberof Draw */
function isFullscreen() { return !!document.fullscreenElement; }

/** Toggle fullsceen mode
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