/** 
 * LittleJS Tile Layer System
 * <br> - Caches arrays of tiles to off screen canvas for fast rendering
 * <br> - Unlimted numbers of layers, allocates canvases as needed
 * <br> - Interfaces with EngineObject for collision
 * <br> - Collision layer is separate from visible layers
 * <br> - It is recommended to have a visible layer that matches the collision
 * <br> - Tile layers can be drawn to using their context with canvas2d
 * <br> - Drawn directly to the main canvas without using WebGL
 * @namespace TileCollision
 */

'use strict';

/** The tile collision layer array, use setTileCollisionData and getTileCollisionData to access
 *  @memberof TileCollision */
let tileCollision = [];

/** Size of the tile collision layer
 *  @type {Vector2} 
 *  @memberof TileCollision */
let tileCollisionSize = vec2();

/** Clear and initialize tile collision
 *  @param {Vector2} size
 *  @memberof TileCollision */
function initTileCollision(size)
{
    tileCollisionSize = size;
    tileCollision = [];
    for (let i=tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}

/** Set tile collision data
 *  @param {Vector2} pos
 *  @param {Number}  [data=0]
 *  @memberof TileCollision */
const setTileCollisionData = (pos, data=0)=>
    pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);

/** Get tile collision data
 *  @param {Vector2} pos
 *  @return {Number}
 *  @memberof TileCollision */
const getTileCollisionData = (pos)=>
    pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;

/** Check if collision with another object should occur
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=new Vector2(1,1)]
 *  @param {EngineObject} [object]
 *  @return {Boolean}
 *  @memberof TileCollision */
function tileCollisionTest(pos, size=vec2(), object)
{
    const minX = max(pos.x - size.x/2|0, 0);
    const minY = max(pos.y - size.y/2|0, 0);
    const maxX = min(pos.x + size.x/2, tileCollisionSize.x);
    const maxY = min(pos.y + size.y/2, tileCollisionSize.y);
    for (let y = minY; y < maxY; ++y)
    for (let x = minX; x < maxX; ++x)
    {
        const tileData = tileCollision[y*tileCollisionSize.x+x];
        if (tileData && (!object || object.collideWithTile(tileData, new Vector2(x, y))))
            return 1;
    }
}

/** Return the center of tile if any that is hit (this does not return the exact hit point)
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object]
 *  @return {Vector2}
 *  @memberof TileCollision */
function tileCollisionRaycast(posStart, posEnd, object)
{
    // test if a ray collides with tiles from start to end
    // todo: a way to get the exact hit point, it must still register as inside the hit tile
    posStart = posStart.floor();
    posEnd = posEnd.floor();
    const posDelta = posEnd.subtract(posStart);
    const dx = abs(posDelta.x),  dy = -abs(posDelta.y);
    const sx = sign(posDelta.x), sy = sign(posDelta.y);
    let e = dx + dy;

    for (let x = posStart.x, y = posStart.y;;)
    {
        const tileData = getTileCollisionData(vec2(x,y));
        if (tileData && (object ? object.collideWithTileRaycast(tileData, new Vector2(x, y)) : tileData > 0))
        {
            debugRaycast && debugLine(posStart, posEnd, '#f00',.02, 1);
            debugRaycast && debugPoint(new Vector2(x+.5, y+.5), '#ff0', 1);
            return new Vector2(x+.5, y+.5);
        }

        // update Bresenham line drawing algorithm
        if (x == posEnd.x & y == posEnd.y) break;
        const e2 = 2*e;
        if (e2 >= dy) e += dy, x += sx;
        if (e2 <= dx) e += dx, y += sy;
    }
    debugRaycast && debugLine(posStart, posEnd, '#00f',.02, 1);
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
     *  @param {Number}  [tile]                   - The tile to use, untextured if undefined
     *  @param {Number}  [direction=0]            - Integer direction of tile, in 90 degree increments
     *  @param {Boolean} [mirror=0]               - If the tile should be mirrored along the x axis
     *  @param {Color}   [color=new Color(1,1,1)] - Color of the tile */
    constructor(tile, direction=0, mirror=0, color=new Color)
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
    clear() { this.tile = this.direction = this.mirror = 0; color = new Color; }
}

/**
 * Tile layer object - cached rendering system for tile layers
 * <br> - Each Tile layer is rendered to an off screen canvas
 * <br> - To allow dynamic modifications, layers are rendered using canvas 2d
 * <br> - Some devices like mobile phones are limited to 4k texture resolution
 * <br> - So with 16x16 tiles this limits layers to 256x256 on mobile devices
 * @extends EngineObject
 * @example
 * // create tile collision and visible tile layer
 * initTileCollision(vec2(200,100));
 * const tileLayer = new TileLayer();
 */
class TileLayer extends EngineObject
{
/** Create a tile layer object
    *  @param {Vector2} [position=new Vector2()]   - World space position
    *  @param {Vector2} [size=tileCollisionSize]   - World space size
    *  @param {Vector2} [tileSize=tileSizeDefault] - Size of tiles in source pixels
    *  @param {Vector2} [scale=new Vector2(1,1)]   - How much to scale this layer when rendered
    *  @param {Number}  [renderOrder=0]            - Objects sorted by renderOrder before being rendered
    */
constructor(pos, size=tileCollisionSize, tileSize=tileSizeDefault, scale=vec2(1), renderOrder=0)
    {
        super(pos, size, -1, tileSize, 0, undefined, renderOrder);

        /** @property {HTMLCanvasElement}        - The canvas used by this tile layer */
        this.canvas = document.createElement('canvas');
        /** @property {CanvasRenderingContext2D} - The 2D canvas context used by this tile layer */
        this.context = this.canvas.getContext('2d');
        /** @property {Vector2}                  - How much to scale this layer when rendered */
        this.scale = scale;
        /** @property {Boolean} [isOverlay=0]    - If true this layer will render to overlay canvas and appear above all objects */
        this.isOverlay;

        // init tile data
        this.data = [];
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData());
    }
    
    /** Set data at a given position in the array 
     *  @param {Vector2}       position   - Local position in array
     *  @param {TileLayerData} data       - Data to set
     *  @param {Boolean}       [redraw=0] - Force the tile to redraw if true */
    setData(layerPos, data, redraw)
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
        ASSERT(mainContext != this.context); // must call redrawEnd() after drawing tiles

        // flush and copy gl canvas because tile canvas does not use webgl
        glEnable && !glOverlay && !this.isOverlay && glCopyToContext(mainContext);
        
        // draw the entire cached level onto the canvas
        const pos = worldToScreen(this.pos.add(vec2(0,this.size.y*this.scale.y)));
        (this.isOverlay ? overlayContext : mainContext).drawImage
        (
            this.canvas, pos.x, pos.y,
            cameraScale*this.size.x*this.scale.x, cameraScale*this.size.y*this.scale.y
        );
    }

    /** Draw all the tile data to an offscreen canvas 
     *  - This may be slow in some browsers
    */
    redraw()
    {
        this.redrawStart(1);
        this.drawAllTileData();
        this.redrawEnd();
    }

    /** Call to start the redraw process
     *  @param {Boolean} [clear=0] - Should it clear the canvas before drawing */
    redrawStart(clear = 0)
    {
        if (clear)
        {
            // clear and set size
            this.canvas.width  = this.size.x * this.tileSize.x;
            this.canvas.height = this.size.y * this.tileSize.y;
        }

        // save current render settings
        this.savedRenderSettings = [mainCanvas, mainContext, cameraPos, cameraScale];

        // use normal rendering system to render the tiles
        mainCanvas = this.canvas;
        mainContext = this.context;
        cameraPos = this.size.scale(.5);
        cameraScale = this.tileSize.x;
        enginePreRender();
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
        glCopyToContext(mainContext, 1);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [mainCanvas, mainContext, cameraPos, cameraScale] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position
     *  @param {Vector2} layerPos */
    drawTileData(layerPos)
    {
        // first clear out where the tile was
        const pos = layerPos.floor().add(this.pos).add(vec2(.5));
        this.drawCanvas2D(pos, vec2(1), 0, 0, (context)=>context.clearRect(-.5, -.5, 1, 1));

        // draw the tile if not undefined
        const d = this.getData(layerPos);
        if (d.tile != undefined)
        {
            ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
            drawTile(pos, vec2(1), d.tile, this.tileSize, d.color, d.direction*PI/2, d.mirror);
        }
    }

    /** Draw all the tiles in this layer */
    drawAllTileData()
    {
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
             this.drawTileData(vec2(x,y));
    }

    /** Draw directly to the 2D canvas in world space (bipass webgl)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {Number}   [angle=0]
     *  @param {Boolean}  [mirror=0]
     *  @param {Function} drawFunction */
    drawCanvas2D(pos, size, angle=0, mirror, drawFunction)
    {
        const context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileSize);
        size = size.multiply(this.tileSize);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror ? -size.x : size.x, size.y);
        drawFunction(context);
        context.restore();
    }

    /** Draw a tile directly onto the layer canvas
     *  @param {Vector2} pos
     *  @param {Vector2} [size=new Vector2(1,1)]
     *  @param {Number}  [tileIndex=-1]
     *  @param {Vector2} [tileSize=tileSizeDefault]
     *  @param {Color}   [color=new Color(1,1,1)]
     *  @param {Number}  [angle=0]
     *  @param {Boolean} [mirror=0] */
    drawTile(pos, size=vec2(1), tileIndex=-1, tileSize=tileSizeDefault, color=new Color, angle, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // untextured
                context.fillStyle = color;
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                const cols = tileImage.width/tileSize.x;
                context.globalAlpha = color.a; // only alpha, no color, is supported in this mode
                context.drawImage(tileImage, 
                    (tileIndex%cols)*tileSize.x, (tileIndex/cols|0)*tileSize.x, 
                    tileSize.x, tileSize.y, -.5, -.5, 1, 1);
            }
        });
    }

    /** Draw a rectangle directly onto the layer canvas
     *  @param {Vector2} pos
     *  @param {Vector2} [size=new Vector2(1,1)]
     *  @param {Color}   [color=new Color(1,1,1)]
     *  @param {Number}  [angle=0] */
    drawRect(pos, size, color, angle) 
    { this.drawTile(pos, size, -1, 0, color, angle); }
}