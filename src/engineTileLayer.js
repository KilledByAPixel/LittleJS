/** 
 * LittleJS Tile Layer System
 * - Caches arrays of tiles to off screen canvas for fast rendering
 * - Unlimited numbers of layers, allocates canvases as needed
 * - Interfaces with EngineObject for collision
 * - Collision layer is separate from visible layers
 * - It is recommended to have a visible layer that matches the collision
 * - Tile layers can be drawn to using their context with canvas2d
 * - Drawn directly to the main canvas without using WebGL
 * @namespace TileCollision
 */

'use strict';

/** The tile collision layer grid, use setTileCollisionData and getTileCollisionData to access
 *  @type {Array}
 *  @memberof TileCollision */
let tileCollision = [];

/** Size of the tile collision layer 2d grid
 *  @type {Vector2}
 *  @memberof TileCollision */
let tileCollisionSize = vec2();

/** Clear and initialize tile collision
 *  @param {Vector2} size - width and height of tile collision 2d grid
 *  @memberof TileCollision */
function initTileCollision(size)
{
    tileCollisionSize = size;
    tileCollision = [];
    for (let i=tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}

/** Set tile collision data for a given cell in the grid
 *  @param {Vector2} pos
 *  @param {Number}  [data]
 *  @memberof TileCollision */
function setTileCollisionData(pos, data=1)
{
    pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);
}

/** Get tile collision data for a given cell in the grid
 *  @param {Vector2} pos
 *  @return {Number}
 *  @memberof TileCollision */
function getTileCollisionData(pos)
{
    return pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;
}

/** Check if collision with another object should occur
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=(0,0)]
 *  @param {EngineObject} [object]
 *  @param {Boolean}      [solidOnly] - Ignored, all tiles are solid in this version
 *  @return {Boolean}
 *  @memberof TileCollision */
function tileCollisionTest(pos, size=vec2(), object, solidOnly=true)
{
    const minX = max(pos.x - size.x/2|0, 0);
    const minY = max(pos.y - size.y/2|0, 0);
    const maxX = min(pos.x + size.x/2, tileCollisionSize.x);
    const maxY = min(pos.y + size.y/2, tileCollisionSize.y);
    for (let y = minY; y < maxY; ++y)
    for (let x = minX; x < maxX; ++x)
    {
        const tileData = tileCollision[y*tileCollisionSize.x+x];
        if (tileData && (!object || object.collideWithTile(tileData, vec2(x, y))))
            return true;
    }
    return false;
}

/** Return the exact position of the boundary of the first tile hit, undefined if nothing was hit.
 *  The point will be inside the colliding tile if it hits
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object]
 *  @param {Vector2}      [normal] - If passed, set to the normal of the surface hit
 *  @param {Boolean}      [solidOnly] - Ignored, all tiles are solid in this version
 *  @return {Vector2}
 *  @memberof TileCollision */
function tileCollisionRaycast(posStart, posEnd, object, normal, solidOnly=true)
{
    // use line test against tile collision
    const hitPos = lineTest(posStart, posEnd, (pos)=>
    {
        const tileData = getTileCollisionData(pos);
        return tileData && (!object || object.collideWithTile(tileData, pos));
    }, normal);

    if (debugRaycast)
    {
        debugLine(posStart, posEnd, hitPos ? '#f00' : '#00f', .02);
        hitPos && debugPoint(hitPos, '#ff0');
        hitPos && normal && debugLine(hitPos, hitPos.add(normal), '#ff0', .02);
    }
    return hitPos;
}

///////////////////////////////////////////////////////////////////////////////
// Tile Layer Rendering System

/**
 * Tile layer data object stores info about how to render a tile
 * @example
 * // create tile layer data with tile index 0 and random orientation and color
 * const tileIndex = 0;
 * const direction = randInt(4)
 * const mirror = randInt(2);
 * const color = randColor();
 * const data = new TileLayerData(tileIndex, direction, mirror, color);
 */
class TileLayerData
{
    /** Create a tile layer data object, one for each tile in a TileLayer
     *  @param {Number}  [tile]      - The tile to use, untextured if undefined
     *  @param {Number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {Boolean} [mirror]    - If the tile should be mirrored along the x axis
     *  @param {Color}   [color]     - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {Number}  - The tile to use, untextured if undefined */
        this.tile      = tile;
        /** @property {Number}  - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {Boolean} - If the tile should be mirrored along the x axis */
        this.mirror    = mirror;
        /** @property {Color}   - Color of the tile */
        this.color     = color;
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

/**
 * Tile Layer - cached rendering system for tile layers
 * - Each Tile layer is rendered to an off screen canvas
 * - To allow dynamic modifications, layers are rendered using canvas 2d
 * - Some devices like mobile phones are limited to 4k texture resolution
 * - So with 16x16 tiles this limits layers to 256x256 on mobile devices
 * @extends EngineObject
 * @example
 * // create tile collision and visible tile layer
 * initTileCollision(vec2(200,100));
 * const tileLayer = new TileLayer();
 */
class TileLayer extends EngineObject
{
    /** Create a tile layer object
    *  @param {Vector2}  position     - World space position
    *  @param {Vector2}  size         - World space size
    *  @param {TileInfo} [tileInfo]   - Tile info for layer
    *  @param {Number}   [renderOrder] - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), renderOrder=0)
    {
        super(position, size, tileInfo, 0, undefined, renderOrder);

        /** @property {HTMLCanvasElement} - The canvas used by this tile layer */
        this.canvas = document.createElement('canvas');
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this tile layer */
        this.context = this.canvas.getContext('2d');

        // init tile data
        this.data = [];
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData);

        if (headlessMode)
        {
            // disable rendering
            this.redraw       = () => {};
            this.render       = () => {};
            this.redrawStart  = () => {};
            this.redrawEnd    = () => {};
            this.drawTileData = () => {};
            this.drawCanvas2D = () => {};
        }
    }
    
    /** Set data at a given position in the array 
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data     - Data to set
     *  @param {Boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
        if (layerPos.arrayCheck(this.size))
        {
            this.data[(layerPos.y|0)*this.size.x+layerPos.x|0] = data;
            redraw && this.drawTileData(layerPos);
        }
    }
    
    /** Get data at a given position in the array 
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData} */
    getData(layerPos)
    { return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; }
    
    // Tile layers are not updated
    update() {}

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(mainContext != this.context, 'must call redrawEnd() after drawing tiles');

        // draw the entire cached level onto the canvas
        const context = mainContext;
        const sx = this.size.x, sy = this.size.y;
        const w = cameraScale*sx, h = cameraScale*sy;

        if (cameraAngle)
        {
            // the cache is axis aligned in layer space, so draw it from its
            // center and spin it about the camera to match everything else
            const center = worldToScreen(vec2(this.pos.x + sx/2, this.pos.y + sy/2));
            context.save();
            context.translate(center.x|0, center.y|0);
            context.rotate(-cameraAngle);
            context.drawImage(this.canvas, -w/2, -h/2, w, h);
            context.restore();
        }
        else
        {
            const pos = worldToScreen(vec2(this.pos.x, this.pos.y + sy));

            // fix canvas jitter in some browsers if position is not an integer
            context.drawImage(this.canvas, pos.x|0, pos.y|0, w, h);
        }
    }

    /** Draw all the tile data to an offscreen canvas 
     *  - This may be slow in some browsers but only needs to be done once */
    redraw()
    {
        this.redrawStart(true);
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
            this.drawTileData(vec2(x,y), false);
        this.redrawEnd();
    }

    /** Call to start the redraw process
     *  - This can be used to manually update small parts of the level
     *  @param {Boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        // save current render settings
        /** @type {[HTMLCanvasElement, CanvasRenderingContext2D, Vector2, Vector2, number, number]} */
        this.savedRenderSettings = [mainCanvas, mainContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle];

        // use webgl rendering system to render the tiles if enabled
        // this works by temporally taking control of the rendering system
        mainCanvas = this.canvas;
        mainContext = this.context;
        mainCanvasSize = this.size.multiply(this.tileInfo.size);
        cameraPos = this.size.scale(.5);
        cameraScale = this.tileInfo.size.x;

        // the cache is axis aligned in layer space, so ignore camera rotation
        // while drawing into it or the rotation gets baked into the image
        cameraAngle = 0;

        if (clear)
        {
            // clear and set size
            mainCanvas.width  = mainCanvasSize.x;
            mainCanvas.height = mainCanvasSize.y;
        }

        // disable smoothing for pixel art
        this.context.imageSmoothingEnabled = !tilesPixelated;

        // setup gl rendering if enabled
        glPreRender();
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        ASSERT(mainContext == this.context, 'must call redrawStart() before drawing tiles');
        glCopyToContext(mainContext, true);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [mainCanvas, mainContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile grid
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if inside a redrawStart/End block
     *  @param {Vector2} layerPos 
     *  @param {Boolean} [clear] - should the old tile be cleared out
     */
    drawTileData(layerPos, clear=true)
    {
        // clear out where the tile was, for full opaque tiles this can be skipped
        const s = this.tileInfo.size;
        if (clear)
        {
            const pos = layerPos.multiply(s);
            this.context.clearRect(pos.x, this.canvas.height-pos.y, s.x, -s.y);
        }

        // draw the tile if not undefined
        const d = this.getData(layerPos);
        if (d.tile != undefined)
        {
            ASSERT(mainContext == this.context, 'must call redrawStart() before drawing tiles');
            const pos = layerPos.add(vec2(.5));
            const tileInfo = tile(d.tile, s, this.tileInfo.textureInfo, this.tileInfo.padding);
            drawTile(pos, vec2(1), tileInfo, d.color, d.direction*PI/2, d.mirror);
        }
    }

    /** Draw directly to the 2D canvas in world space (bypass webgl)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {Number}   angle
     *  @param {Boolean}  mirror
     *  @param {Function} drawFunction */
    drawCanvas2D(pos, size, angle, mirror, drawFunction)
    {
        const context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileInfo.size);
        size = size.multiply(this.tileInfo.size);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror ? -size.x : size.x, size.y);
        drawFunction(context);
        context.restore();
    }

    /** Draw a tile directly onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=(1,1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=(1,1,1,1)]
     *  @param {Number}   [angle=0]
     *  @param {Boolean}  [mirror=0] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            const textureInfo = tileInfo && tileInfo.textureInfo;
            if (textureInfo)
            {
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(textureInfo.image, 
                    tileInfo.pos.x,  tileInfo.pos.y, 
                    tileInfo.size.x, tileInfo.size.y, -.5, -.5, 1, 1);
                context.globalAlpha = 1;
            }
            else
            {
                // untextured
                context.fillStyle = color;
                context.fillRect(-.5, -.5, 1, 1);
            }
        });
    }

    /** Draw a rectangle directly onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=(1,1)]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {Number}  [angle=0] */
    drawRect(pos, size, color, angle)
    { this.drawTile(pos, size, undefined, color, angle); }
}