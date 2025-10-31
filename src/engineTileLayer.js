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
 *  @param {Vector2}      [size=(0,0)]
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
     *  @param {number}  [tile]      - The tile to use, untextured if undefined
     *  @param {number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {boolean} [mirror]    - If the tile should be mirrored along the x axis
     *  @param {Color}   [color]     - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {number}  - The tile to use, untextured if undefined */
        this.tile      = tile;
        /** @property {number}  - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {boolean} - If the tile should be mirrored along the x axis */
        this.mirror    = mirror;
        /** @property {Color}   - Color of the tile */
        this.color     = color.copy();
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Canvas Layer - cached off screen rendering system
 * - Contains an offscreen canvas that can be rendered to
 * - WebGL rendering is optional, call useWebGL to enable
 * @extends EngineObject
 * @memberof TileLayers
 * @example
 * const canvasLayer = new CanvasLayer(vec2(), vec2(200,100));
 */
class CanvasLayer extends EngineObject
{
    /** Create a canvas layer object
     *  @param {Vector2}  [position] - World space position of the layer
     *  @param {Vector2}  [size] - World space size of the layer
     *  @param {number}   [angle] - Angle the layer is rotated by
     *  @param {number}   [renderOrder] - Objects sorted by renderOrder
     *  @param {Vector2}  [canvasSize] - Default size of canvas, can be changed later
    */
    constructor(position, size, angle=0, renderOrder=0, canvasSize=vec2(512))
    {
        ASSERT(isVector2(canvasSize), 'canvasSize must be a Vector2');
        super(position, size, undefined, angle, WHITE, renderOrder);

        /** @property {HTMLCanvasElement} - The canvas used by this layer */
        this.canvas = headlessMode ? undefined : new OffscreenCanvas(canvasSize.x, canvasSize.y);
        /** @property {OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this layer */
        this.context = this.canvas?.getContext('2d');
        /** @property {TextureInfo} - Texture info to use for this object rendering */
        const useWebGL = false; // do not use webgl by default
        this.textureInfo = new TextureInfo(this.canvas, useWebGL);
        /** @property {boolean} - True if WebGL texture needs to be refreshed */
        this.refreshWebGL = false;

        // disable physics by default
        this.mass = this.gravityScale = this.friction = this.restitution = 0;
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
        this.draw(this.pos, this.size, this.angle, this.color, this.mirror, this.additiveColor);
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
    draw(pos, size, angle=0, color=WHITE, mirror=false, additiveColor, screenSpace=false, context)
    {
        const useWebGL = glEnable && this.textureInfo.hasWebGL();
        if (useWebGL && this.refreshWebGL)
        {
            // update the WebGL texture
            this.textureInfo.createWebGLTexture();
            this.refreshWebGL = false;
        }

        // draw the canvas layer as a single tile that uses the whole texture
        const tileInfo = new TileInfo().setFullImage(this.textureInfo);
        drawTile(pos, size, tileInfo, color, angle, mirror, additiveColor, useWebGL, screenSpace, context);
    }

    /**
     * @callback Canvas2DDrawCallback - Function that draws to a canvas 2D context
     * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context
     * @memberof TileLayers
     */

    /** Draw onto the layer canvas in world space (bypass WebGL)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {number}   angle
     *  @param {boolean}  mirror
     *  @param {Canvas2DDrawCallback} drawFunction */
    drawCanvas2D(pos, size, angle, mirror, drawFunction)
    {
        if (!this.context) return;

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

    /** Draw a tile onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=(1,1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=(1,1,1,1)]
     *  @param {number}   [angle=0]
     *  @param {boolean}  [mirror=false] */
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
                context.fillStyle = color.toString();
                context.fillRect(-.5, -.5, 1, 1);
            }
        });
    }

    /** Draw a rectangle onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=(1,1)]
     *  @param {Color}   [color=(1,1,1,1)]
     *  @param {number}  [angle=0] */
    drawRect(pos, size, color, angle)
    { this.drawTile(pos, size, undefined, color, angle); }

    /** Create or update the WebGL texture for this layer
     *  @param {boolean} [enable] - enable WebGL rendering and update the texture 
     *  @param {boolean} [immediate] - shoulkd the texture be updated immediately
     */
    useWebGL(enable=true, immediate=false)
    {
        if (!immediate && enable && this.textureInfo.hasWebGL())
        {
            // refresh the texture when needed
            this.refreshWebGL = true;
            return;
        }

        if (enable)
            this.textureInfo.createWebGLTexture();
        else
            this.textureInfo.destroyWebGLTexture();
    }
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
    *  @param {Vector2}  position      - World space position
    *  @param {Vector2}  size          - World space size
    *  @param {TileInfo} [tileInfo]    - Default tile info for layer (used for size and texture)
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), renderOrder=0)
    {
        const canvasSize = tileInfo ? size.multiply(tileInfo.size) : size;
        super(position, size, 0, renderOrder, canvasSize);

        // set tile info
        this.tileInfo = tileInfo;

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
            this.useWebGL     = () => {};
        }
    }

    /** Set data at a given position in the array
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data     - Data to set
     *  @param {boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        ASSERT(data instanceof TileLayerData, 'data must be a TileLayerData');
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
    { 
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; 
    }

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(drawContext !== this.context, 'must call redrawEnd() after drawing tiles!');

        if (this.refreshWebGL)
        {
            // update the WebGL texture
            this.textureInfo.createWebGLTexture();
            this.refreshWebGL = false;
        }

        // draw the tile layer as a single tile
        const tileInfo = new TileInfo().setFullImage(this.textureInfo);
        const size = this.drawSize || this.size;
        const pos = this.pos.add(size.scale(.5));
        const useWebGL = glEnable && this.textureInfo.hasWebGL();
        drawTile(pos, size, tileInfo, WHITE, 0, false, CLEAR_BLACK, useWebGL);
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
        this.useWebGL();
    }

    /** Call to start the redraw process
     *  - This can be used to manually update small parts of the level
     *  @param {boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        if (!this.context) return;

        // save current render settings
        /** @type {[HTMLCanvasElement|OffscreenCanvas, CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D, Vector2, Vector2, number, Color]} */
        this.savedRenderSettings = [drawCanvas, drawContext, mainCanvasSize, cameraPos, cameraScale, canvasClearColor];

        // set the draw canvas and context to this layer
        // use camera settings to match this layer's canvas
        drawCanvas = this.canvas;
        drawContext = this.context;
        cameraPos = this.size.scale(.5);
        const tileSize = this.tileInfo ? this.tileInfo.size : vec2(1);
        cameraScale = tileSize.x;
        canvasClearColor = CLEAR_BLACK;
        mainCanvasSize = this.size.multiply(tileSize);
        if (clear)
        {
            // clear and set size
            drawCanvas.width  = mainCanvasSize.x;
            drawCanvas.height = mainCanvasSize.y;
        }

        // disable smoothing for pixel art
        this.context.imageSmoothingEnabled = !tilesPixelated;

        // setup gl rendering if enabled
        glPreRender();
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        if (!this.context) return;

        ASSERT(drawContext === this.context, 'must call redrawStart() before drawing tiles');
        glCopyToContext(drawContext);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [drawCanvas, drawContext, mainCanvasSize, cameraPos, cameraScale, canvasClearColor] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile grid
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if inside a redrawStart/End block
     *  @param {Vector2} layerPos
     *  @param {boolean} [clear] - should the old tile be cleared out
     */
    drawTileData(layerPos, clear=true)
    {
        if (!this.context) return;
        
        // clear out where the tile was, for full opaque tiles this can be skipped
        const s = this.tileInfo.size;
        if (clear)
        {
            const pos = layerPos.multiply(s);
            this.context.clearRect(pos.x, this.canvas.height-pos.y, s.x, -s.y);
        }

        // draw the tile if it has layer data
        const d = this.getData(layerPos);
        if (d.tile !== undefined)
        {
            ASSERT(drawContext === this.context, 'must call redrawStart() before drawing tiles');
            const pos = layerPos.add(vec2(.5));
            const tileInfo = tile(d.tile, s, this.tileInfo.textureIndex, this.tileInfo.padding);
            drawTile(pos, vec2(1), tileInfo, d.color, d.direction*PI/2, d.mirror);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Collision Layer - a tile layer with collision
 * - adds collision data and functions to TileLayer
 * - there can be multiple tile collision layers
 * - tile collision layers should not overlap each other
 * @extends TileLayer
 * @memberof TileLayers
 */
class TileCollisionLayer extends TileLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  position      - World space position
    *  @param {Vector2}  size          - World space size
    *  @param {TileInfo} [tileInfo]    - Tile info for layer
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), renderOrder=0)
    {
        super(position, size.floor(), tileInfo, renderOrder);

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
        if (this.destroyed)
            return;

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

    /** Set tile collision data for a given cell in the grid
    *  @param {Vector2} gridPos
    *  @param {number}  [data] */
    setCollisionData(gridPos, data=1)
    {
        ASSERT(isVector2(gridPos), 'gridPos must be a Vector2');
        const i = (gridPos.y|0)*this.size.x + gridPos.x|0;
        gridPos.arrayCheck(this.size) && (this.collisionData[i] = data);
    }

    /** Get tile collision data for a given cell in the grid
    *  @param {Vector2} gridPos
    *  @return {number} */
    getCollisionData(gridPos)
    {
        ASSERT(isVector2(gridPos), 'gridPos must be a Vector2');
        const i = (gridPos.y|0)*this.size.x + gridPos.x|0;
        return gridPos.arrayCheck(this.size) ? this.collisionData[i] : 0;
    }

    /** Check if collision with another object should occur
    *  @param {Vector2}      pos
    *  @param {Vector2}      [size=(0,0)]
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