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

/** Tile sheet for batch rendering system
 *  @type {CanvasImageSource}
 *  @memberof Draw */
const tileImage = new Image;

// Engine internal variables not exposed to documentation
let tileImageSize, tileImageFixBleed, drawCount;

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
function screenToWorld(screenPos)
{
    ASSERT(mainCanvasSize.x && mainCanvasSize.y, 'mainCanvasSize is invalid');
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
    ASSERT(mainCanvasSize.x && mainCanvasSize.y, 'mainCanvasSize is invalid');
    return new Vector2
    (
        (worldPos.x - cameraPos.x) *  cameraScale + mainCanvasSize.x/2 - .5,
        (worldPos.y - cameraPos.y) * -cameraScale + mainCanvasSize.y/2 - .5
    );
}

/** Draw textured tile centered in world space, with color applied if using WebGL
 *  @param {Vector2} pos                            - Center of the tile in world space
 *  @param {Vector2} [size=Vector2(1,1)]            - Size of the tile in world space
 *  @param {Number}  [tileIndex=-1]                 - Tile index to use, negative is untextured
 *  @param {Vector2} [tileSize=tileSizeDefault]     - Tile size in source pixels
 *  @param {Color}   [color=Color()]                - Color to modulate with
 *  @param {Number}  [angle=0]                      - Angle to rotate by
 *  @param {Boolean} [mirror=0]                     - If true image is flipped along the Y axis
 *  @param {Color}   [additiveColor=Color(0,0,0,0)] - Additive color to be applied
 *  @param {Boolean} [useWebGL=glEnable]            - Use accelerated WebGL rendering
 *  @param {Boolean} [screenSpace=0]                - If true the pos and size are in screen space
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileIndex=-1, tileSize=tileSizeDefault, color=new Color,
    angle=0, mirror, additiveColor=new Color(0,0,0,0), useWebGL=glEnable, screenSpace)
{
    showWatermark && ++drawCount;
    
    if (glEnable && useWebGL)
    {
        if (screenSpace)
        {
            // convert to world space
            pos = screenToWorld(pos);
            size = size.scale(1/cameraScale);
        }
        if (tileIndex < 0 || !tileImage.width)
        {
            // if negative tile index or image not found, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, color.rgbaInt()); 
        }
        else
        {
            // calculate uvs and render
            const cols = tileImageSize.x / tileSize.x |0;
            const uvSizeX = tileSize.x / tileImageSize.x;
            const uvSizeY = tileSize.y / tileImageSize.y;
            const uvX = (tileIndex%cols)*uvSizeX, uvY = (tileIndex/cols|0)*uvSizeY;
            
            glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, 
                uvX + tileImageFixBleed.x, uvY + tileImageFixBleed.y, 
                uvX - tileImageFixBleed.x + uvSizeX, uvY - tileImageFixBleed.y + uvSizeY, 
                color.rgbaInt(), additiveColor.rgbaInt()); 
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // if negative tile index, force untextured
                context.fillStyle = color;
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                // calculate uvs and render
                const cols = tileImageSize.x / tileSize.x |0;
                const sX = (tileIndex%cols)*tileSize.x   + tileFixBleedScale;
                const sY = (tileIndex/cols|0)*tileSize.y + tileFixBleedScale;
                const sWidth  = tileSize.x - 2*tileFixBleedScale;
                const sHeight = tileSize.y - 2*tileFixBleedScale;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(tileImage, sX, sY, sWidth, sHeight, -.5, -.5, 1, 1);
            }
        }, undefined, screenSpace);
    }
}

/** Draw colored rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=Vector2(1,1)]
 *  @param {Color}   [color=Color()]
 *  @param {Number}  [angle=0]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=0]
 *  @memberof Draw */
function drawRect(pos, size, color, angle, useWebGL, screenSpace)
{ drawTile(pos, size, -1, tileSizeDefault, color, angle, 0, undefined, useWebGL, screenSpace); }

/** Draw colored polygon using passed in points
 *  @param {Array}   points - Array of Vector2 points
 *  @param {Color}   [color=Color()]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=0]
 *  @memberof Draw */
function drawPoly(points, color=new Color, useWebGL=glEnable, screenSpace)
{
    if (useWebGL)
        glDrawPoints(screenSpace ? points.map(screenToWorld) : points, color.rgbaInt());
    else
    {
        // draw using canvas
        mainContext.fillStyle = color;
        mainContext.beginPath();
        for (const point of screenSpace ? points : points.map(worldToScreen))
            mainContext.lineTo(point.x, point.y);
        mainContext.fill();
    }
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Number}  [thickness=.1]
 *  @param {Color}   [color=Color()]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=0]
 *  @memberof Draw */
function drawLine(posA, posB, thickness=.1, color, useWebGL)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle(), useWebGL, screenSpace);
}

/** Draw directly to a 2d canvas context in world space
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {Number}   angle
 *  @param {Boolean}  mirror
 *  @param {Function} drawFunction
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @param {Boolean} [screenSpace=0]
 *  @memberof Draw */
function drawCanvas2D(pos, size, angle, mirror, drawFunction, context = mainContext, screenSpace)
{
    if (!screenSpace)
    {
        // create canvas transform from world space to screen space
        pos = worldToScreen(pos);
        size = size.scale(cameraScale);
    }
    context.save();
    context.translate(pos.x+.5|0, pos.y+.5|0);
    context.rotate(angle);
    context.scale(mirror ? -size.x : size.x, size.y);
    drawFunction(context);
    context.restore();
}

/** Enable normal or additive blend mode
 *  @param {Boolean} [additive=0]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @memberof Draw */
function setBlendMode(additive, useWebGL=glEnable)
{
    if (glEnable && useWebGL)
        glSetBlendMode(additive);
    else
        mainContext.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}

/** Draw text on overlay canvas in world space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size=1]
 *  @param {Color}   [color=Color()]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=Color(0,0,0)]
 *  @param {String}  [textAlign='center']
 *  @param {String}  [font=fontDefault]
 *  @param {CanvasRenderingContext2D} [context=overlayContext]
 *  @memberof Draw */
function drawText(text, pos, size=1, color, lineWidth=0, lineColor, textAlign, font, context)
{
    drawTextScreen(text, worldToScreen(pos), size*cameraScale, color, lineWidth*cameraScale, lineColor, textAlign, font, context);
}

/** Draw text on overlay canvas in screen space
 *  Automatically splits new lines into rows
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size=1]
 *  @param {Color}   [color=Color()]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=Color(0,0,0)]
 *  @param {String}  [textAlign='center']
 *  @param {String}  [font=fontDefault]
 *  @param {CanvasRenderingContext2D} [context=overlayContext]
 *  @memberof Draw */
function drawTextScreen(text, pos, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=fontDefault, context=overlayContext)
{
    context.fillStyle = color;
    context.lineWidth = lineWidth;
    context.strokeStyle = lineColor;
    context.textAlign = textAlign;
    context.font = size + 'px '+ font;
    context.textBaseline = 'middle';
    context.lineJoin = 'round';

    pos = pos.copy();
    (text+'').split('\n').forEach(line=>
    {
        lineWidth && context.strokeText(line, pos.x, pos.y);
        context.fillText(line, pos.x, pos.y);
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
     *  @param {HTMLImageElement} [image] - Image for the font, if undefined default font is used
     *  @param {Vector2} [tileSize=vec2(8)] - Size of the font source tiles
     *  @param {Vector2} [paddingSize=vec2(0,1)] - How much extra space to add between characters
     *  @param {Number}  [startTileIndex=0] - Tile index in image where font starts
     *  @param {CanvasRenderingContext2D} [context=overlayContext] - context to draw to
     */
    constructor(image, tileSize=vec2(8), paddingSize=vec2(0,1), startTileIndex=0, context=overlayContext)
    {
        // load default font image
        if (!engineFontImage)
            (engineFontImage = new Image).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAYAQAAAAA9+x6JAAAAAnRSTlMAAHaTzTgAAAGiSURBVHjaZZABhxxBEIUf6ECLBdFY+Q0PMNgf0yCgsSAGZcT9sgIPtBWwIA5wgAPEoHUyJeeSlW+gjK+fegWwtROWpVQEyWh2npdpBmTUFVhb29RINgLIukoXr5LIAvYQ5ve+1FqWEMqNKTX3FAJHyQDRZvmKWubAACcv5z5Gtg2oyCWE+Yk/8JZQX1jTTCpKAFGIgza+dJCNBF2UskRlsgwitHbSV0QLgt9sTPtsRlvJjEr8C/FARWA2bJ/TtJ7lko34dNDn6usJUMzuErP89UUBJbWeozrwLLncXczd508deAjLWipLO4Q5XGPcJvPu92cNDaN0P5G1FL0nSOzddZOrJ6rNhbXGmeDvO3TF7DeJWl4bvaYQTNHCTeuqKZmbjHaSOFes+IX/+IhHrnAkXOAsfn24EM68XieIECoccD4KZLk/odiwzeo2rovYdhvb2HYFgyznJyDpYJdYOmfXgVdJTaUi4xA2uWYNYec9BLeqdl9EsoTw582mSFDX2DxVLbNt9U3YYoeatBad1c2Tj8t2akrjaIGJNywKB/7h75/gN3vCMSaadIUTAAAAAElFTkSuQmCC';

        this.image = image || engineFontImage;
        this.tileSize = tileSize;
        this.paddingSize = paddingSize;
        this.startTileIndex = startTileIndex;
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
     *  @param {Number}  [scale=4]
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
                let charCode = line[j].charCodeAt();
                if (charCode < 32 || charCode > 127)
                    charCode = 127; // unknown character

                // get the character source location and draw it
                const tile = this.startTileIndex + charCode - 32;
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
function isFullscreen() { return document.fullscreenElement; }

/** Toggle fullsceen mode
 *  @memberof Draw */
function toggleFullscreen()
{
    if (isFullscreen())
    {
        if (document.exitFullscreen)
            document.exitFullscreen();
    }
    else if (document.body.requestFullscreen)
            document.body.requestFullscreen();
}
