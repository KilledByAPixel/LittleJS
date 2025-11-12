/**
 * LittleJS Tile Layer System
 * - Caches arrays of tiles to off screen canvas for fast rendering
 * - Unlimited numbers of layers, allocates canvases as needed
 * - Tile layers can be drawn to using their context with canvas2d
 * - Tile layers can also have collision with EngineObjects
 * @namespace TileLayers
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Tile Layer System

/** Keep track of all tile layers with collision
 *  @type {Array<TileCollisionLayer>}
 *  @memberof TileLayers */
const tileCollisionLayers = [];

/** Get tile collision data for a given cell in the grid
*  @param {Vector2} pos
*  @return {number}
*  @memberof TileLayers */
function tileCollisionGetData(pos)
{
    // check all tile collision layers
    for (const layer of tileCollisionLayers)
        if (pos.arrayCheck(layer.size))
            return layer.getCollisionData(pos);
    return 0;
}

/** Check if a tile layer collides with another object
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=vec2()]
 *  @param {EngineObject} [object] - An object or undefined for generic test
 *  @param {boolean}      [solidOnly] - Only check solid layers if true
 *  @return {TileCollisionLayer}
 *  @memberof TileLayers */
function tileCollisionTest(pos, size=vec2(), object, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        if (layer.collisionTest(pos, size, object))
            return layer;
    }
}

/** Return the exact position of the boundary of first tile hit, undefined if nothing was hit.
 *  The point will be inside the colliding tile if it hits (may have a tiny shift)
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object] - An object or undefined for generic test
 *  @param {Vector2}      [normal] - Optional normal of the surface hit
 *  @param {boolean}      [solidOnly=true] - Only check solid layers if true
 *  @return {Vector2|undefined} - position of the center of the tile hit or undefined if no hit
 *  @memberof TileLayers */
function tileCollisionRaycast(posStart, posEnd, object, normal, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        {
            const hitPos = layer.collisionRaycast(posStart, posEnd, object, normal)
            if (hitPos) return hitPos;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Load tile layers from exported data
 *  @param {Object}   tileMapData - Level data from exported data
 *  @param {TileInfo} [tileInfo] - Default tile info (used for size and texture)
 *  @param {number}   [renderOrder] - Render order of the top layer
 *  @param {number}   [collisionLayer] - Layer to use for collision if any
 *  @param {boolean}  [draw] - Should the layer be drawn automatically
 *  @return {Array<TileCollisionLayer>}
 *  @memberof TileLayers */
function tileLayersLoad(tileMapData, tileInfo=tile(), renderOrder=0, collisionLayer, draw=true)
{
    if (!tileMapData)
    {
        // default level data if loading failed
        const s = 50;
        tileMapData = {};
        tileMapData.height = tileMapData.width = s;
        tileMapData.layers = [{}];
        tileMapData.layers[0].data = new Array(s*s).fill(0);
    }

    // validate the tile map data
    ASSERT(tileMapData.width && tileMapData.height);
    ASSERT(tileMapData.layers && tileMapData.layers.length);

    // create tile layers and fill with data
    const tileLayers = [];
    const levelSize = vec2(tileMapData.width, tileMapData.height);
    const layerCount = tileMapData.layers.length;
    for (let layerIndex=layerCount; layerIndex--;)
    {
        const dataLayer = tileMapData.layers[layerIndex];
        ASSERT(dataLayer.data && dataLayer.data.length);
        ASSERT(levelSize.area() === dataLayer.data.length);

        const layerRenderOrder = renderOrder - (layerCount - 1 - layerIndex);
        const tileLayer = new TileCollisionLayer(vec2(), levelSize, tileInfo, layerRenderOrder);
        tileLayers[layerIndex] = tileLayer;

        // apply layer color
        const layerColor = dataLayer.tintcolor ?
            new Color().setHex(dataLayer.tintcolor) :
            dataLayer.color || WHITE;
        ASSERT(isColor(layerColor), 'layer color is not a color');

        for (let x=levelSize.x; x--;)
        for (let y=levelSize.y; y--;)
        {
            const pos = vec2(x, levelSize.y-1-y);
            const data = dataLayer.data[x + y*levelSize.x];
            if (data)
            {
                const layerData = new TileLayerData(data-1, 0, false, layerColor);
                tileLayer.setData(pos, layerData);

                // set collision for top layer
                if (layerIndex === collisionLayer)
                    tileLayer.setCollisionData(pos, 1);
            }
        }
        if (draw)
            tileLayer.redraw();
    }
    return tileLayers;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile layer data object stores info about how to draw a tile
 * @memberof TileLayers
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
     *  @param {number}  [tile] - The tile to use, untextured if undefined
     *  @param {number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {boolean} [mirror] - If the tile should be mirrored along the x axis
     *  @param {Color}   [color] - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {number} - The tile to use, untextured if undefined */
        this.tile = tile;
        /** @property {number} - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {boolean} - If the tile should be mirrored along the x axis */
        this.mirror = mirror;
        /** @property {Color} - Color of the tile */
        this.color = color.copy();
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Canvas Layer - cached off screen rendering system
 * - Contains an offscreen canvas that can be rendered to
 * - WebGL rendering is optional, call updateWebGL to enable/update
 * @extends EngineObject
 * @memberof TileLayers
 * @example
 * const canvasLayer = new CanvasLayer(vec2(), vec2(200,100));
 */
class CanvasLayer extends EngineObject
{
    /** Create a canvas layer object
     *  @param {Vector2}  [pos] - World space position of the layer
     *  @param {Vector2}  [size] - World space size of the layer
     *  @param {number}   [angle] - Angle the layer is rotated by
     *  @param {number}   [renderOrder] - Objects sorted by renderOrder
     *  @param {Vector2}  [canvasSize] - Default size of canvas, can be changed later
     *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, angle=0, renderOrder=0, canvasSize=vec2(512), useWebGL=true)
    {
        ASSERT(isVector2(canvasSize), 'canvasSize must be a Vector2');
        super(pos, size, undefined, angle, WHITE, renderOrder);

        /** @property {HTMLCanvasElement} - The canvas used by this layer */
        this.canvas = headlessMode ? undefined : new OffscreenCanvas(canvasSize.x, canvasSize.y);
        /** @property {OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this layer */
        this.context = this.canvas?.getContext('2d');
        /** @property {TextureInfo} - Texture info to use for this object rendering */
        this.textureInfo = new TextureInfo(this.canvas, useWebGL);

        // disable physics by default
        this.mass = 0;
    }

    /** Destroy this canvas layer */
    destroy()
    {
        if (this.destroyed) return;

        this.textureInfo.destroyWebGLTexture();
        super.destroy();
    }

    // Render the layer, called automatically by the engine
    render()
    {
        this.draw(this.pos, this.size, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Draw this canvas layer centered in world space, with color applied if using WebGL
    *  @param {Vector2} pos - Center in world space
    *  @param {Vector2} [size] - Size in world space
    *  @param {Color}   [color] - Color to modulate with
    *  @param {number}  [angle] - Angle to rotate by
    *  @param {boolean} [mirror] - If true image is flipped along the Y axis
    *  @param {Color}   [additiveColor] - Additive color to be applied if any
    *  @param {boolean} [screenSpace] - If true the pos and size are in screen space
    *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to
    *  @memberof Draw */
    draw(pos, size, color=WHITE, angle=0, mirror=false, additiveColor, screenSpace=false, context)
    {
        // draw the canvas layer as a single tile that uses the whole texture
        const tileInfo = new TileInfo().setFullImage(this.textureInfo);
        const useWebGL = this.hasWebGL();
        drawTile(pos, size, tileInfo, color, angle, mirror, additiveColor, useWebGL, screenSpace, context);
    }

    /** Draw a tile onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=vec2(1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=WHITE]
     *  @param {number}   [angle]
     *  @param {boolean}  [mirror] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle=0, mirror=false)
    {
        pos = pos.subtract(this.pos).multiply(this.tileInfo.size);
        size = size.multiply(this.tileInfo.size);
        pos.y = this.canvas.height - pos.y;

        // draw the tile onto the layer canvas
        const oldMainCanvasSize = mainCanvasSize;
        mainCanvasSize = vec2(this.canvas.width, this.canvas.height);
        const useWebGL = this.hasWebGL();
        useWebGL && glSetRenderTarget(this.textureInfo.glTexture);
        const drawContext = useWebGL ? undefined : this.context;
        drawTile(pos, size, tileInfo, color, angle, mirror, undefined, useWebGL, true, drawContext);
        useWebGL && glSetRenderTarget();
        mainCanvasSize = oldMainCanvasSize;
    }

    /** Draw a rectangle onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=vec2(1)]
     *  @param {Color}   [color=WHITE]
     *  @param {number}  [angle] */
    drawRect(pos, size, color, angle)
    { this.drawTile(pos, size, undefined, color, angle); }

    /** Create WebGL texture if necessary and copy layer canvas to it */
    updateWebGL()
    { this.textureInfo.createWebGLTexture(); }

    /** Check if this layer is using WebGL
     *  @return {boolean} */
    hasWebGL()
    { return glEnable && this.textureInfo.hasWebGL(); }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Layer - cached rendering system for tile layers
 * - Each Tile layer is rendered to an off screen canvas
 * - To allow dynamic modifications, layers are rendered using canvas 2d
 * - Some devices like mobile phones are limited to 4k texture resolution
 * - For with 16x16 tiles this limits layers to 256x256 on mobile devices
 * - Tile layers are centered on their corner, so normal levels are at (0,0)
 * @extends CanvasLayer
 * @memberof TileLayers
 * @example
 * const tileLayer = new TileLayer(vec2(), vec2(200,100));
 */
class TileLayer extends CanvasLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  pos - World space position
    *  @param {Vector2}  size - World space size
    *  @param {TileInfo} [tileInfo] - Default tile info for layer (used for size and texture)
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, tileInfo=tile(), renderOrder=0, useWebGL=true)
    {
        const canvasSize = tileInfo ? size.multiply(tileInfo.size) : size;
        super(pos, size, 0, renderOrder, canvasSize, useWebGL);
        
        /** @property {TileInfo} - Default tile info for layer */
        this.tileInfo = undefined;
        /** @property {Array<TileLayerData>} - Default tile info for layer */
        this.data = [];
        /** @property {boolean} - Is this layer using a webgl texture? */
        this.isUsingWebGL = false;

        if (headlessMode)
        {
            // disable rendering in headless mode
            this.render         = () => {};
            this.redraw         = () => {};
            this.redrawStart    = () => {};
            this.redrawEnd      = () => {};
            this.drawTileData   = () => {};
            this.redrawTileData = () => {};
            this.drawLayerTile  = () => {};
            this.drawLayerRect  = () => {};
            this.clearLayerRect = () => {};
            return;
        }
        
        if (tileInfo)
        {
            // set tile info
            this.tileInfo = tileInfo.frame(0);
            this.tileInfo.bleed = 0; // disable bleed for tile layers
        }

        // init tile data
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData);
    }

    /** Set data at a given position in the array
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data - Data to set
     *  @param {boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
        layerPos = layerPos.floor();
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        ASSERT(data instanceof TileLayerData, 'data must be a TileLayerData');

        if (!layerPos.arrayCheck(this.size)) return;
        this.data[(layerPos.y|0)*this.size.x+layerPos.x|0] = data;

        if (!redraw) return;
        const isRedraw = drawContext === this.context;
        isRedraw ? this.drawTileData(layerPos) : this.redrawTileData(layerPos);
    }

    /** Clear data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @param {boolean} [redraw] - Force the tile to redraw if true */
    clearData(layerPos, redraw=false)
    { this.setData(layerPos, new TileLayerData, redraw=false) }

    /** Get data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData} */
    getData(layerPos)
    { 
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0];
    }

    // Update the tile layer, refresh texture if needed
    update()
    {
        if (!glEnable && this.isUsingWebGL)
        {
            // redraw the layer if webgl was disabled or context lost
            this.isUsingWebGL = false;
            this.redraw();
        }
    }

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(drawContext !== this.context, 'must call redrawEnd() after drawing tiles!');

        const size = this.drawSize || this.size;
        const pos = this.pos.add(size.scale(.5));
        this.draw(pos, this.size, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Called after this layer is redrawn, does nothing by default */
    onRedraw() {}

    /** Draw all the tile data to an offscreen canvas
     *  - This may be slow if not using webgl but only needs to be done once */
    redraw()
    {
        this.redrawStart(true);
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
            this.drawTileData(vec2(x,y), false);
        this.isUsingWebGL && glFlush();
        this.onRedraw();
        this.redrawEnd();
    }

    /** Call to start the redraw process
     *  - This can be used to manually update parts of the level
     *  @param {boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        if (!this.context) return;
        ASSERT(drawContext !== this.context);
        
        // save current render settings
        /** @type {[CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D, Vector2, Vector2, number, Color]} */
        this.savedRenderSettings = [drawContext, mainCanvasSize, cameraPos, cameraScale, canvasClearColor];

        // set the draw canvas and context to this layer
        // use camera settings to match this layer's canvas
        drawContext = this.context;
        const tileSize = this.tileInfo?.size ?? vec2(1);
        mainCanvasSize = this.size.multiply(tileSize);
        canvasClearColor = CLEAR_BLACK;
        cameraPos = this.size.multiply(tileSize).scale(.5);
        cameraScale = 1;

        // set render target to this layer
        this.isUsingWebGL = this.hasWebGL();
        if (this.isUsingWebGL)
            glSetRenderTarget(this.textureInfo.glTexture, clear);
        else
        {
            // disable smoothing for pixel art
            this.context.imageSmoothingEnabled = !tilesPixelated;
            if (clear)
            {
                // clear and set size
                this.canvas.width  = mainCanvasSize.x;
                this.canvas.height = mainCanvasSize.y;
            }
        }
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        if (!this.context) return;
        ASSERT(drawContext === this.context);

        // set stuff back to normal
        if (this.isUsingWebGL)
            glSetRenderTarget();
        [drawContext, mainCanvasSize, cameraPos, cameraScale, canvasClearColor] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile layer
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if inside a redrawStart/End block
     *  @param {Vector2} layerPos
     *  @param {boolean} [clear] - should the old tile be cleared out
     */
    drawTileData(layerPos, clear=true)
    {
        if (!this.context) return;
        ASSERT(drawContext === this.context, 'must call redrawStart() before drawing tiles');
        
        // clear out where the tile was, can be skipped for fully opaque tiles
        const drawSize = this.tileInfo?.size ?? vec2(1);
        const drawPos = layerPos.multiply(drawSize);
        clear && this.clearLayerRect(drawPos, drawSize);

        // draw the tile if it has layer data
        const d = this.getData(layerPos);
        if (!d.tile) return;

        const tileInfo = this.tileInfo && this.tileInfo.tile(d.tile);
        this.drawLayerTile(drawPos, drawSize, tileInfo, d.color, d.direction*PI/2, d.mirror);
    }

    /** Draw the tile at a given position in the tile layer
     *  This can be used to clear tiles when they are destroyed
     *  For better performance use drawTileData inside a redrawStart/End block
     *  @param {Vector2} layerPos
     *  @param {boolean} [clear] - should the old tile be cleared
     */
    redrawTileData(layerPos, clear=true)
    {
        if (!this.context) return;
        ASSERT(drawContext !== this.context, 'redrawStart() should not be active when calling redrawTileData(), instead use drawTileData()');

        this.redrawStart();
        this.drawTileData(layerPos, clear);
        this.redrawEnd();
    }

    /** Draw textured tile in layer space
     *  @param {Vector2}  pos - Position in pixel coordinates
     *  @param {Vector2}  [size=vec2(1)] - Size of the tile
     *  @param {TileInfo} [tileInfo] - Tile info to use, untextured if undefined
     *  @param {Color}    [color=WHITE] - Color to modulate with
     *  @param {number}   [angle] - Angle to rotate by
     *  @param {boolean}  [mirror] - Is image flipped along the Y axis?
     *  @param {Color}    [additiveColor] - Additive color to be applied if any */
    drawLayerTile(pos, size=vec2(1), tileInfo, color=WHITE,
    angle=0, mirror, additiveColor)
    {
        const drawPos = pos.add(size.scale(.5));
        drawTile(drawPos, size, tileInfo, color, angle, mirror, additiveColor, this.isUsingWebGL);
    }

    /** Clear a rectangle in layer space
     *  @param {Vector2} pos
     *  @param {Vector2} size
     *  @param {Color} [color=WHITE] - Color to modulate with
     *  @param {number} [angle] - Angle to rotate by
     */
    drawLayerRect(pos, size, color, angle=0)
    { this.drawLayerTile(pos, size, undefined, color, angle); }

    /** Clear a rectangle in layer space
     *  @param {Vector2} pos - position in pixel coordinates
     *  @param {Vector2} size
     */
    clearLayerRect(pos, size)
    {
        ASSERT(drawContext === this.context, 'must call redrawStart() before clearing tiles');

        const x = pos.x, y = this.canvas.height - pos.y - size.y;
        const useWebGL = this.hasWebGL();
        if (useWebGL)
            glClearRect(x, y, size.x, size.y);
        else
            this.context.clearRect(x, y, size.x, size.y);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Collision Layer - a tile layer with collision
 * - adds collision data and functions to TileLayer
 * - there can be multiple tile collision layers
 * @extends TileLayer
 * @memberof TileLayers
 */
class TileCollisionLayer extends TileLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  pos - World space position
    *  @param {Vector2}  size - World space size
    *  @param {TileInfo} [tileInfo] - Tile info for layer
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, tileInfo=tile(), renderOrder=0, useWebGL=true)
    {
        super(pos, size.floor(), tileInfo, renderOrder, useWebGL);

        /** @property {Array<number>} - The tile collision grid */
        this.collisionData = [];
        this.initCollision(this.size);

        // keep track of all collision layers
        tileCollisionLayers.push(this);

        // tile collision layers are solid by default
        this.isSolid = true;
    }

    /** Destroy this tile layer */
    destroy()
    {
        if (this.destroyed) return;

        // remove from collision layers array and destroy
        const index = tileCollisionLayers.indexOf(this);
        ASSERT(index >= 0, 'tile collision layer not found in array');
        index >= 0 && tileCollisionLayers.splice(index, 1);
        super.destroy();
    }

    /** Clear and initialize tile collision to new size
    *  @param {Vector2} size - width and height of tile collision 2d grid */
    initCollision(size)
    {
        ASSERT(isVector2(size), 'size must be a Vector2');
        this.size = size.floor();
        this.collisionData = [];
        this.collisionData.length = size.area();
        this.collisionData.fill(0);
    }

    /** Set tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos
    *  @param {number}  [data] */
    setCollisionData(layerPos, data=1)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        const i = (layerPos.y|0)*this.size.x + layerPos.x|0;
        layerPos.arrayCheck(this.size) && (this.collisionData[i] = data);
    }

    /** Clear tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos */
    clearCollisionData(layerPos)
    { this.setCollisionData(layerPos, 0); }

    /** Get tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos
    *  @return {number} */
    getCollisionData(layerPos)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        const i = (layerPos.y|0)*this.size.x + layerPos.x|0;
        return layerPos.arrayCheck(this.size) ? this.collisionData[i] : 0;
    }

    /** Check if collision with another object should occur
    *  @param {Vector2}      pos
    *  @param {Vector2}      [size=vec2()]
    *  @param {EngineObject} [object]
    *  @return {boolean} */
    collisionTest(pos, size=new Vector2, object)
    {
        ASSERT(isVector2(pos) && isVector2(size), 'pos and size must be Vector2s');
        ASSERT(!object || object instanceof EngineObject, 'object must be an EngineObject');
        
        // transform to local layer space
        const posX = pos.x - this.pos.x;
        const posY = pos.y - this.pos.y;

        // check any tiles in the area for collision
        const minX = max(posX - size.x/2|0, 0);
        const minY = max(posY - size.y/2|0, 0);
        const maxX = min(posX + size.x/2, this.size.x);
        const maxY = min(posY + size.y/2, this.size.y);
        const hitPos = new Vector2;
        for (let y = minY; y < maxY; ++y)
        for (let x = minX; x < maxX; ++x)
        {
            // check if the object should collide with this tile
            const tileData = this.collisionData[y*this.size.x+x];
            if (tileData)
            if (!object || object.collideWithTile(tileData, 
                hitPos.set(x + this.pos.x, y + this.pos.y)))
                return true;
        }
        return false;
    }

    /** Return the exact position of the boundary of first tile hit, undefined if nothing was hit.
    *  The point will be inside the colliding tile if it hits (may have a tiny shift)
    *  @param {Vector2}      posStart
    *  @param {Vector2}      posEnd
    *  @param {EngineObject} [object] - An object or undefined for generic test
    *  @param {Vector2}      [normal] - Optional normal of the surface hit
    *  @return {Vector2|undefined} */
    collisionRaycast(posStart, posEnd, object, normal)
    {
        ASSERT(isVector2(posStart) && isVector2(posEnd), 'positions must be Vector2s');
        ASSERT(!object || object instanceof EngineObject, 'object must be an EngineObject');

        const localPos = new Vector2;
        const collisionTest = (pos)=>
        {
            // check for tile collision
            localPos.set(pos.x - this.pos.x, pos.y - this.pos.y);
            const tileData = this.getCollisionData(localPos);
            return tileData && (!object || object.collideWithTile(tileData, pos));
        }
        debugRaycast && debugLine(posStart, posEnd, '#00f', .02);
        const hitPos = lineTest(posStart, posEnd, collisionTest, normal);
        if (hitPos)
        {
            const tilePos = hitPos.floor().add(vec2(.5));
            debugRaycast && debugRect(tilePos, vec2(1), '#f008');
            debugRaycast && debugLine(posStart, hitPos, '#f00', .02);
            debugRaycast && debugPoint(hitPos, '#0f0');
            debugRaycast && normal && 
                debugLine(hitPos, hitPos.add(normal), '#ff0', .02);
            return hitPos;
        }
    }
}