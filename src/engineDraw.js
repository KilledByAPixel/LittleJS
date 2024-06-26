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
 * Create a tile info object
 * - This can take vecs or floats for easier use and conversion
 * - If an index is passed in, the tile size and index will determine the position
 * @param {(Number|Vector2)} [pos=Vector2()]         - Top left corner of tile in pixels or index
 * @param {(Number|Vector2)} [size=tileSizeDefault]  - Size of tile in pixels
 * @param {Number} [textureIndex=0]                  - Texture index to use
 * @return {TileInfo}
 * @example
 * tile(2)                       // a tile at index 2 using the default tile size of 16
 * tile(5, 8)                    // a tile at index 5 using a tile size of 8
 * tile(1, 16, 3)                // a tile at index 1 of size 16 on texture 3
 * tile(vec2(4,8), vec2(30,10))  // a tile at pixel location (4,8) with a size of (30,10)
 * @memberof Draw
 */
function tile(pos=vec2(), size=tileSizeDefault, textureIndex=0)
{
    // if size is a number, make it a vector
    if (size.x == undefined)
    {
        ASSERT(size > 0);
        size = vec2(size);
    }

    // if pos is a number, use it as a tile index
    if (pos.x == undefined)
    {
        const textureInfo = textureInfos[textureIndex];
        if (textureInfo)
        {
            const cols = textureInfo.size.x / size.x |0;
            pos = vec2((pos%cols)*size.x, (pos/cols|0)*size.y);
        }
        else
            pos = vec2();
    }

    // return a tile info object
    return new TileInfo(pos, size, textureIndex); 
}

/** 
 * Tile Info - Stores info about how to draw a tile
 */
class TileInfo
{
    /** Create a tile info object
     *  @param {Vector2} [pos=Vector2()]        - Top left corner of tile in pixels
     *  @param {Vector2} [size=tileSizeDefault] - Size of tile in pixels
     *  @param {Number}  [textureIndex=0]       - Texture index to use
     */
    constructor(pos=vec2(), size=tileSizeDefault, textureIndex=0)
    {
        /** @property {Vector2} - Top left corner of tile in pixels */
        this.pos = pos;
        /** @property {Vector2} - Size of tile in pixels */
        this.size = size;
        /** @property {Number} - Texture index to use */
        this.textureIndex = textureIndex;
    }

    /** Returns an offset copy of this tile, useful for animation
    *  @param {Vector2} offset - Offset to apply in pixels
    *  @return {TileInfo}
    */
    offset(offset)
    { return new TileInfo(this.pos.add(offset), this.size, this.textureIndex); }

    /** Returns the texture info for this tile
    *  @return {TextureInfo}
    */
    getTextureInfo()
    { return textureInfos[this.textureIndex]; }
}

/** Texture Info - Stores info about each texture */
class TextureInfo
{
    // create a TextureInfo, called automatically by the engine
    constructor(image)
    {
        /** @property {CanvasImageSource} - image source */
        this.image = image;
        /** @property {Vector2} - size of the image */
        this.size = vec2(image.width, image.height);
        /** @property {WebGLTexture} - webgl texture */
        this.glTexture = glEnable && glCreateTexture(image);
        /** @property {Vector2} - size to adjust tile to fix bleeding */
        this.fixBleedSize = vec2(tileFixBleedScale).divide(this.size);
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

/** Draw textured tile centered in world space, with color applied if using WebGL
 *  @param {Vector2} pos                            - Center of the tile in world space
 *  @param {Vector2} [size=Vector2(1,1)]            - Size of the tile in world space
 *  @param {TileInfo}[tileInfo]                     - Tile info to use, untextured if undefined
 *  @param {Vector2} [tileSize=tileSizeDefault]     - Tile size in source pixels
 *  @param {Color}   [color=Color()]                - Color to modulate with
 *  @param {Number}  [angle=0]                      - Angle to rotate by
 *  @param {Boolean} [mirror=0]                     - If true image is flipped along the Y axis
 *  @param {Color}   [additiveColor=Color(0,0,0,0)] - Additive color to be applied
 *  @param {Boolean} [useWebGL=glEnable]            - Use accelerated WebGL rendering
 *  @param {Boolean} [screenSpace=0]                - If true the pos and size are in screen space
 *  @param {CanvasRenderingContext2D} [context]     - Canvas 2D context to draw to
 *  @memberof Draw */
function drawTile(pos, size=vec2(1), tileInfo, color=new Color,
    angle=0, mirror, additiveColor=new Color(0,0,0,0), useWebGL=glEnable, screenSpace, context)
{
    ASSERT(!context || !useWebGL); // context only supported in canvas 2D mode
    ASSERT(typeof tileInfo !== 'number' || !tileInfo); // prevent old style calls
    // to fix old calls, replace with tile(tileIndex, tileSize)

    showWatermark && ++drawCount;
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
            const x = tileInfo.pos.x / textureInfo.size.x;
            const y = tileInfo.pos.y / textureInfo.size.y;
            const w = tileInfo.size.x / textureInfo.size.x;
            const h = tileInfo.size.y / textureInfo.size.y;
            const tileImageFixBleed = textureInfo.fixBleedSize;
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
 *  @param {Vector2} [size=Vector2(1,1)]
 *  @param {Color}   [color=Color()]
 *  @param {Number}  [angle=0]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=0]
 *  @param {CanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawRect(pos, size, color, angle, useWebGL, screenSpace, context)
{ 
    drawTile(pos, size, undefined, color, angle, 0, undefined, useWebGL, screenSpace, context); 
}

/** Draw colored polygon using passed in points
 *  @param {Array}   points - Array of Vector2 points
 *  @param {Color}   [color=Color()]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=0]
 *  @param {CanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawPoly(points, color=new Color, useWebGL=glEnable, screenSpace, context)
{
    ASSERT(!context || !useWebGL); // context only supported in canvas 2D mode

    if (useWebGL)
        glDrawPoints(screenSpace ? points.map(screenToWorld) : points, color.rgbaInt());
    else
    {
        // draw using canvas
        if (!context)
            context = mainContext;
        context.fillStyle = color;
        context.beginPath();
        for (const point of screenSpace ? points : points.map(worldToScreen))
            context.lineTo(point.x, point.y);
        context.fill();
    }
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Number}  [thickness=.1]
 *  @param {Color}   [color=Color()]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {Boolean} [screenSpace=0]
 *  @param {CanvasRenderingContext2D} [context]
 *  @memberof Draw */
function drawLine(posA, posB, thickness=.1, color, useWebGL, screenSpace, context)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle(), useWebGL, screenSpace, context);
}

/** Draw directly to a 2d canvas context in world space
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {Number}   angle
 *  @param {Boolean}  mirror
 *  @param {Function} drawFunction
 *  @param {Boolean} [screenSpace=0]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
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
    context.scale(mirror ? -size.x : size.x, size.y);
    drawFunction(context);
    context.restore();
}

/** Enable normal or additive blend mode
 *  @param {Boolean} [additive=0]
 *  @param {Boolean} [useWebGL=glEnable]
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function setBlendMode(additive, useWebGL=glEnable, context)
{
    ASSERT(!context || !useWebGL); // context only supported in canvas 2D mode
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
     *  @param {CanvasRenderingContext2D} [context=overlayContext] - context to draw to
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


///////////////////////////////////////////////////////////////////////////////
// Splash screen and logo

/** Draw the LittleJS splash screen
    *  @param {Number}  [backgroundHue=.7]
    *  @param {Number}  [backgroundSat=.1]
    *  @memberof Draw
    */
function drawEngineSplashScreen(backgroundHue=.7, backgroundSat=.1)
{
    const p = time / 2;
    // fix pixels on edge somehow getting through
    mainCanvas.style.opacity = glCanvas.style.opacity = min(1,p);
    if (p<0 || p>1)
        return;

    // background
    const x = overlayContext;
    const w = mainCanvasSize.x, h = mainCanvasSize.y;
    const p3 = percent(p, 1, .8);
    const p4 = percent(p, 0, .5);
    const g = x.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.hypot(w,h)*.7);
    g.addColorStop(0,hsl(backgroundHue,backgroundSat,lerp(p4,0,.5*p3),p3));
    g.addColorStop(1,hsl(0,0,0,p3));
    x.fillStyle = g;
    x.fillRect(0,0,w,h);

    // logo - fade in and out
    drawEngineLogo(x, wave(1,1,p));
}

/** Draw the LittleJS logo
    *  @param {CanvasRenderingContext2D}  [context = mainContext]
    *  @param {Number}                    [alpha=.1]
    *  @memberof Draw
    */
function drawEngineLogo(context=mainContext, alpha=1)
{
    const x = context;
    const rect = (X, Y, W, H, C)=>
    {
        x.beginPath();
        x.rect(X,Y,W,C?H*p:H);
        x.fillStyle = C;
        C ? x.fill() : x.stroke();
    };
    const line = (X, Y, Z, W)=>
    {
        x.beginPath();
        x.lineTo(X,Y);
        x.lineTo(Z,W);
        x.stroke();
    };
    const circle = (X, Y, R, A=0, B=2*PI, C, F)=>
    {
        const D = (A+B)/2, E = p*(B-A)/2;
        x.beginPath();
        F && x.lineTo(X,Y);
        x.arc(X,Y,R,D-E,D+E);
        x.fillStyle = C;
        C ? x.fill() : x.stroke();
    };
    const color = (c=0, l=0) => hsl([.98,.3,.57,.14][c%4]-10,.8,[0,.3,.5,.8,.9][l]);
    const w = mainCanvasSize.x, h = mainCanvasSize.y;
    const p = percent(alpha, .1, .5);
    if (p <= 0)
        return;

    // setup
    x.save();
    x.translate(w/2,h/2);
    x.scale(5,5);
    x.translate(-40,-34);
    x.lineJoin = x.lineCap = 'round';
    x.textAlign = 'center';
    x.textBaseline = 'top';
    x.font = '900 16px arial';

    // draw effect
    const p2 = percent(alpha,.1,1);
    x.setLineDash([99*p2,99]);

    // text
    const s = 'LittleJS';
    x.lineWidth = 1+p*3
    x.fillStyle = color();
    //rect(11,53,61,12*p,color());
    let w2 = 0;
    for(let i=0; i<s.length; ++i)
        w2 += x.measureText(s[i]).width;
    for (let j=2; j--;)
    for (let i=0, X=41-w2/2; i<s.length; ++i)
    {
        x.fillStyle = color(i,2);
        const w = x.measureText(s[i]).width;
        x[j?'strokeText':'fillText'](s[i],X+w/2,55.5,17*p);
        X += w;
    }
    x.lineWidth = 1+p;

    // cab top
    rect(7,9,18,8,color(2,2));
    rect(7,9,18,4,color(2,3));
    rect(25,9,8,8,color(2,1));
    rect(7,9,18,8);
    rect(25,9,8,8);

    // cab
    rect(25,17,7,22,color());
    rect(11,17,14,22,color(1,1));
    rect(11,17,14,17,color(1,2));
    rect(11,17,14,9,color(1,3));
    rect(15,22,6,9,color(2,2));
    circle(15,23,5,0,PI/2,color(2,4),1);
    rect(11,17,14,23);
    rect(15,22,6,9);

    // little stack
    rect(37,14,9,6,color(3,2));
    rect(37,14,4,6,color(3,3));
    rect(37,14,9,6);

    // big stack
    rect(50,10,10,10,color(0,1));
    rect(50,10,6,10,color(0,2));
    rect(50,10,3,10,color(0,3));
    rect(50,10,10,10);
    circle(55,2,11,.5,PI-.5,color(3,3));
    circle(55,2,11,.5,PI/2,color(3,2),1);
    circle(55,2,11,.5,PI-.5);
    rect(45,0,20,7,color(0,2));
    rect(45,0,20,3,color(0,3));
    rect(45,0,20,7);

    //engine
    for (let i=5; i--;)
    {
        circle(60-i*6,30,10,0,2*PI,color(i+2,3));
        circle(60-i*6,30,10,-.5,PI+.5,color(i+2,2));
        circle(60-i*6,30,10,.5,PI-.5,color(i+2,1));
    }

    // engine outline
    circle(36,30,10,PI/2,PI*3/2);
    circle(47,30,10,PI/2,PI*3/2);
    circle(60,30,10);
    line(36,20,60,20);

    // engine front light
    circle(60,30,4,0,2*PI,color(3,3));
    circle(60,30,4,0,PI,color(3,2));
    circle(60,30,4);

    // front brush
    for (let i=6; i--;)
    {
        x.beginPath();
        x.lineTo(53,54);
        x.lineTo(53,40);
        x.lineTo(53+(1+i*2.9)*p,40);
        x.lineTo(53+(4+i*3.5)*p,54);
        x.fillStyle = color(0,i%2+2);
        x.fill() || i%2 && x.stroke();
    }

    // wheels
    rect(5,40,9,6,color());
    rect(15,54,38,-14,color())
    for (let i=3; i--;)
    for (let j=2; j--;)
    {
        circle(15*i+15,47,j?7:1,0,2*PI,color(i,3));
        x.stroke();
        circle(15*i+15,47,j?7:1,0,PI,color(i,2));
        x.stroke();
    }
    line(4,54,77,54); // bottom
    line(6,40,68,40); // center
    x.restore();
}