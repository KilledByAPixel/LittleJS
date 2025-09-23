/** 
 * LittleJS Tile Layer System
 * - Caches arrays of tiles to off screen canvas for fast rendering
 * - Unlimited numbers of layers, allocates canvases as needed
 * - Tile layers can be drawn to using their context with canvas2d
 * - Drawn directly to the main canvas without using WebGL
 * - Tile layers can also have collision with EngineObjects
 * @namespace TileCollision
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Tile Layer System

/** Keep track of all tile layers with collision
 *  @type {Array<TileCollisionLayer>} 
 *  @memberof TileCollision */
let tileCollisionLayers = [];

/** Get tile collision data for a given cell in the grid
*  @param {Vector2} pos
*  @return {number}
*  @memberof TileCollision */
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
 *  @memberof TileCollision */
function tileCollisionTest(pos, size=vec2(), object, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        if (layer.collisionTest(pos, size, object))
            return layer;
    }
}

/** Return the center of first tile hit, undefined if nothing was hit.
 *  This does not return the exact intersection, but the center of the tile hit.
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object] - An object or undefined for generic test
 *  @param {boolean}      [solidOnly=true] - Only check solid layers if true
 *  @return {Vector2}
 *  @memberof TileCollision */
function tileCollisionRaycast(posStart, posEnd, object, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        {
            const hitPos = layer.collisionRaycast(posStart, posEnd, object)
            if (hitPos)
                return hitPos;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Load tile layers from exported data
 *  @param {object}   tileMapData - Level data from exported data
 *  @param {TileInfo} [tileInfo] - Default tile info (used for size and texture)
 *  @param {number}   [renderOrder] - Render order of the top layer
 *  @param {boolean}  [draw] - Should the layer be drawn automatically
 *  @return {Array<TileCollisionLayer>}
 *  @memberof TileCollision */
function tileCollisionLoad(tileMapData, tileInfo=tile(), renderOrder=0, draw=true)
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
    for (let i=layerCount; i--;)
    {
        const dataLayer = tileMapData.layers[i];
        ASSERT(dataLayer.data && dataLayer.data.length);
        ASSERT(levelSize.area() == dataLayer.data.length);

        const layerRenderOrder = renderOrder - (layerCount - 1 - i);
        const tileLayer = new TileCollisionLayer(vec2(), levelSize, tileInfo, layerRenderOrder);
        tileLayers[i] = tileLayer;
        for (let x=levelSize.x; x--;) 
        for (let y=levelSize.y; y--;)
        {
            const pos = vec2(x, levelSize.y-1-y);
            const data = dataLayer.data[x + y*levelSize.x];
            if (data)
            {
                const layerData = new TileLayerData(data-1);
                tileLayer.setData(pos, layerData);
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
        this.color     = color;
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = this.direction = 0; this.mirror = false; this.color = new Color; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Layer - cached rendering system for tile layers
 * - Each Tile layer is rendered to an off screen canvas
 * - To allow dynamic modifications, layers are rendered using canvas 2d
 * - Some devices like mobile phones are limited to 4k texture resolution
 * - For with 16x16 tiles this limits layers to 256x256 on mobile devices
 * @extends EngineObject
 * @example
 * const tileLayer = new TileLayer(vec2(), vec2(200,100));
 */
class TileLayer extends EngineObject
{
    /** Create a tile layer object
    *  @param {Vector2}  [position=(0,0)] - World space position
    *  @param {Vector2}  [size=(1,1)]     - World space size
    *  @param {TileInfo} [tileInfo]       - Default tile info for layer (used for size and texture)
    *  @param {Vector2}  [scale=(1,1)]    - How much to scale this layer when rendered
    *  @param {number}   [renderOrder]    - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), scale=vec2(1), renderOrder=0)
    {
        super(position, size, tileInfo, 0, undefined, renderOrder);

        /** @property {HTMLCanvasElement} - The canvas used by this tile layer */
        this.canvas = document.createElement('canvas');
        /** @property {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this tile layer */
        this.context = this.canvas.getContext('2d');
        /** @property {Vector2} - How much to scale this layer when rendered */
        this.scale = scale;
        /** @property {boolean} - If true this layer will render to overlay canvas and appear above all objects */
        this.isOverlay = false;
        /** @property {WebGLTexture} - Texture if using webgl for this layer */
        this.glTexture = undefined;
        // set no friction by default, applied friction is max of both objects
        this.friction = 0;
        // set no restitution by default, applied restitution is max of both objects
        this.restitution = 0;

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
     *  @param {boolean}       [redraw] - Force the tile to redraw if true */
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
        ASSERT(mainContext != this.context, 'must call redrawEnd() after drawing tiles!');
        if (this.glTexture)
        {
            // draw the tile layer using cached webgl texture
            const pos = this.pos.add(this.size.multiply(this.scale).scale(.5)).floor();
            glSetTexture(this.glTexture);
            glDraw(pos.x, pos.y, this.size.x, this.size.y); 
        }
        else
        {
            if (!glOverlay && !this.isOverlay)
            {
                // flush and copy gl canvas because tile canvas does not use webgl
                glCopyToContext(mainContext);
            }
            
            // draw the entire cached level onto the canvas
            const pos = worldToScreen(this.pos.add(vec2(0,this.size.y*this.scale.y))).floor();
            (this.isOverlay ? overlayContext : mainContext).drawImage
            (
                this.canvas, pos.x, pos.y,
                cameraScale*this.size.x*this.scale.x, cameraScale*this.size.y*this.scale.y
            );
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
     *  @param {boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        // save current render settings
        /** @type {[HTMLCanvasElement, CanvasRenderingContext2D, Vector2, Vector2, number]} */
        this.savedRenderSettings = [mainCanvas, mainContext, mainCanvasSize, cameraPos, cameraScale];

        // use webgl rendering system to render the tiles if enabled
        // this works by temporally taking control of the rendering system
        mainCanvas = this.canvas;
        mainContext = this.context;
        mainCanvasSize = this.size.multiply(this.tileInfo.size);
        cameraPos = this.size.scale(.5);
        cameraScale = this.tileInfo.size.x;

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
        [mainCanvas, mainContext, mainCanvasSize, cameraPos, cameraScale] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position in the tile grid
     *  This can be used to clear out tiles when they are destroyed
     *  Tiles can also be redrawn if inside a redrawStart/End block
     *  @param {Vector2} layerPos 
     *  @param {boolean} [clear] - should the old tile be cleared out
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

        // draw the tile if it has layer data
        const d = this.getData(layerPos);
        if (d.tile != undefined)
        {
            ASSERT(mainContext == this.context, 'must call redrawStart() before drawing tiles');
            const pos = layerPos.add(vec2(.5));
            const tileInfo = tile(d.tile, s, this.tileInfo.textureIndex, this.tileInfo.padding);
            drawTile(pos, vec2(1), tileInfo, d.color, d.direction*PI/2, d.mirror);
        }
    }

    /** Draw directly to the 2D canvas in world space (bypass webgl)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {number}   angle
     *  @param {boolean}  mirror
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
     *  @param {number}   [angle=0]
     *  @param {boolean}  [mirror=0] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            const textureInfo = tileInfo && tileInfo.getTextureInfo();
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
     *  @param {number}  [angle=0] */
    drawRect(pos, size, color, angle) 
    { this.drawTile(pos, size, undefined, color, angle); }

    /** Create or update the webgl texture for this layer
     *  @param {boolean} [enable] - enable webgl rendering and update the texture */
    useWebGL(enable = true)
    {
        if (enable)
        {
            if (!this.glTexture)
                this.glTexture = glCreateTexture();
            glSetTextureData(this.glTexture, this.canvas);
        }
        else
            this.glTexture = undefined;
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Tile Collision Layer - a tile layer with collision
 * - adds collision data and functions to TileLayer
 * - there can be multiple tile collision layers
 * - tile collison layers should not overlap each other
 * @extends TileLayer
 */
class TileCollisionLayer extends TileLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  [position=(0,0)] - World space position
    *  @param {Vector2}  [size=(0,0)]     - World space size
    *  @param {TileInfo} [tileInfo]       - Tile info for layer
    *  @param {number}   [renderOrder]    - Objects are sorted by renderOrder
    */
    constructor(position, size, tileInfo=tile(), renderOrder=0)
    {
        const scale = vec2(1); // collision layers are not scaled
        super(position, size.floor(), tileInfo, scale, renderOrder);

        /** @property {Array<number>} - The tile collision grid */
        this.collisionData = [];
        this.initCollision(this.size);

        // keep track of all collision layers
        tileCollisionLayers.push(this);

        // tile collision layers are solid by default
        this.isSolid = true;
    }

    /** Destroy this collision layer */
    destroy()
    { 
        if (this.destroyed)
            return;

        // remove from collision layers array and destroy
        const index = tileCollisionLayers.indexOf(this);
        ASSERT(index >= 0, 'tile collision layer not found in array');
        tileCollisionLayers.splice(index, 1);
        super.destroy();
    }

    /** Clear and initialize tile collision to new size
    *  @param {Vector2} size - width and height of tile collision 2d grid */
    initCollision(size)
    {
        this.size = size.floor();
        this.collisionData = [];
        this.collisionData.length = size.area();
        this.collisionData.fill(0);
    }

    /** Set tile collision data for a given cell in the grid
    *  @param {Vector2} pos
    *  @param {number}  [data] */
    setCollisionData(pos, data=1)
    {
        const i = (pos.y|0)*this.size.x + pos.x|0;
        pos.arrayCheck(this.size) && (this.collisionData[i] = data);
    }

    /** Get tile collision data for a given cell in the grid
    *  @param {Vector2} pos
    *  @return {number} */
    getCollisionData(pos)
    {
        const i = (pos.y|0)*this.size.x + pos.x|0;
        return pos.arrayCheck(this.size) ? this.collisionData[i] : 0;
    }

    /** Check if collision with another object should occur
    *  @param {Vector2}      pos
    *  @param {Vector2}      [size=(0,0)]
    *  @param {EngineObject} [object]
    *  @return {boolean} */
    collisionTest(pos, size=vec2(), object)
    {
        const minX = max(pos.x - size.x/2|0, 0);
        const minY = max(pos.y - size.y/2|0, 0);
        const maxX = min(pos.x + size.x/2, this.size.x);
        const maxY = min(pos.y + size.y/2, this.size.y);
        for (let y = minY; y < maxY; ++y)
        for (let x = minX; x < maxX; ++x)
        {
            // check if the object should collide with this tile
            const tileData = this.collisionData[y*this.size.x+x];
            if (tileData && (!object || object.collideWithTile(tileData, vec2(x, y))))
                return true;
        }
        return false;
    }

    /** Return the center of first tile hit, undefined if nothing was hit.
    *  This does not return the exact intersection, but the center of the tile hit.
    *  @param {Vector2}      posStart
    *  @param {Vector2}      posEnd
    *  @param {EngineObject} [object]
    *  @return {Vector2} */
    collisionRaycast(posStart, posEnd, object)
    {
        // test if a ray collides with tiles from start to end
        // todo: a way to get the exact hit point, it must still be inside the hit tile
        const delta = posEnd.subtract(posStart);
        const totalLength = delta.length();
        const normalizedDelta = delta.normalize();
        const unit = vec2(1/normalizedDelta.x, 1/normalizedDelta.y).abs();
        const flooredPosStart = posStart.floor();

        // setup iteration variables
        let pos = flooredPosStart;
        let xi = unit.x * (delta.x < 0 ? posStart.x - pos.x : pos.x - posStart.x + 1);
        let yi = unit.y * (delta.y < 0 ? posStart.y - pos.y : pos.y - posStart.y + 1);

        // use line drawing algorithm to test for collisions
        while (true)
        {
            // check for tile collision
            const tileData = this.getCollisionData(pos);
            if (tileData && (!object || object.collideWithTile(tileData, pos)))
            {
                debugRaycast && debugLine(posStart, posEnd, '#f00', .02);
                debugRaycast && debugPoint(pos.add(vec2(.5)), '#ff0');
                return pos.add(vec2(.5));
            }

            // check if past the end
            if (xi > totalLength && yi > totalLength)
                break;

            // get coordinates of next tile to check
            if (xi > yi)
                pos.y += sign(delta.y), yi += unit.y;
            else
                pos.x += sign(delta.x), xi += unit.x;
        }

        debugRaycast && debugLine(posStart, posEnd, '#00f', .02);
    }
}