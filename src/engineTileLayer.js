/**
 * LittleJS Tile Layer System
 * - Renders large tile-based levels efficiently using cached canvases
 * - Unlimited tile layers with automatic canvas allocation
 * - Layers support both rendering and collision detection
 * - Direct canvas2d drawing access for custom tile rendering
 * - TileLayer for rendering, TileCollisionLayer for physics
 * - Collision callbacks for tile interactions with objects
 * - Optimized raycast support for tile-based physics
 * - Integration with Box2D physics via Box2DTileLayer plugin
 * @namespace TileLayers
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Tile Layer System

/** Keep track of all tile layers with collision
 *  @type {Array<TileCollisionLayer>}
 *  @memberof TileLayers */
const tileCollisionLayers = [];

// a tile collision layer's position is whole numbers, so its cells are the world grid the physics lands objects on
function tileCollisionAssertWhole(layer)
{ ASSERT(layer.pos.x % 1 === 0 && layer.pos.y % 1 === 0, 'a tile collision layer must sit at a whole number position', layer.pos); }

// the test a tile query applies to a cell's data: the callback, the object's collideWithTile, or solid data
function tileCollisionTester(callbackObject)
{
    ASSERT(!callbackObject || typeof callbackObject === 'function' || callbackObject instanceof EngineObject, 'callbackObject must be a function or EngineObject');
    return !callbackObject ? (tileData)=> tileData > 0 :
        typeof callbackObject === 'function' ? (tileData, pos)=> callbackObject(tileData, pos) :
        (tileData, pos)=> callbackObject.collideWithTile(tileData, pos);
}

/** Get tile collision data for a given cell in the grid
*  @param {Vector2} pos
*  @param {boolean} [solidOnly] - Only check solid layers?
*  @return {number}
*  @memberof TileLayers */
function tileCollisionGetData(pos, solidOnly=true)
{
    // check all tile collision layers, in scalars since particles ask this every frame
    // solid (positive) data wins, a negative marker is returned only when no layer is solid there
    let found = 0;
    for (const layer of tileCollisionLayers)
        if (!solidOnly || layer.isSolid)
        {
            // world pos to the layer's cell
            const x = pos.x - layer.pos.x, y = pos.y - layer.pos.y, size = layer.size;
            if (x >= 0 && y >= 0 && x < size.x && y < size.y)
            {
                const data = layer.collisionData[(y|0)*size.x + (x|0)];
                if (data > 0) return data;
                if (data && !found) found = data;
            }
        }
    return found;
}

/** Check if a tile layer collides with another object
 *  @param {Vector2} pos
 *  @param {Vector2} [size=vec2()]
 *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
 *  @param {boolean} [solidOnly] - Only check solid layers?
 *  @return {TileCollisionLayer|undefined}
 *  @memberof TileLayers */
function tileCollisionTest(pos, size=vec2(), callbackObject, solidOnly=true)
{
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        if (layer.collisionTest(pos, size, callbackObject))
            return layer;
    }
}

/**
 *  @callback TileCollisionCallback - Decides whether a tile counts as solid for a collision test or raycast
 *  @param {number} tileData - the value of the tile at the position
 *  @param {Vector2} pos - world space position of tile where the collision occurred
 *  @return {boolean} - true for a hit; a callback that returns nothing lets everything through
 *  @memberof TileLayers
 */

/** Return the exact position of the boundary of first tile hit, undefined if nothing was hit.
 *  The point will be inside the colliding tile if it hits
 *  @param {Vector2} posStart
 *  @param {Vector2} posEnd
 *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
 *  @param {Vector2} [normal] - Optional normal of the surface hit
 *  @param {boolean} [solidOnly=true] - Only check solid layers?
 *  @return {Vector2|undefined} - where the ray meets the first tile hit, nudged just inside it, or undefined if no hit
 *  @memberof TileLayers */
function tileCollisionRaycast(posStart, posEnd, callbackObject, normal, solidOnly=true)
{
    // check every layer and keep the closest hit so a far hit in an
    // earlier-registered layer doesn't shadow a closer hit in a later one
    let closestHit, closestDistSq, closestNormal;
    const scratchNormal = normal && vec2();
    for (const layer of tileCollisionLayers)
    {
        if (!solidOnly || layer.isSolid)
        {
            const hitPos = layer.collisionRaycast(posStart, posEnd, callbackObject, scratchNormal);
            if (hitPos)
            {
                const d = posStart.distanceSquared(hitPos);
                if (closestHit === undefined || d < closestDistSq)
                {
                    closestHit = hitPos;
                    closestDistSq = d;
                    if (normal) closestNormal = scratchNormal.copy();
                }
            }
        }
    }
    if (closestHit && normal) normal.setFrom(closestNormal);
    return closestHit;
}

///////////////////////////////////////////////////////////////////////////////
// Tiled's flip flags, horizontal, vertical and diagonal as bits 2, 1 and 0, as [direction, mirror]
const tileLayersTiledFlips = [[0,0], [3,1], [2,1], [3,0], [0,1], [1,0], [2,0], [1,1]];

/**
 * Load tile layers from exported data
 * - Tiled maps come in as they are, flipped and turned tiles included, from one tileset image (a second tileset's
 *   tiles continue its numbering), finite maps in the CSV or array layer format; layer offsets and parallax are not read
 * - Group layers are flattened in order, each replaced by the layers inside it, so the layer indices
 *   (collisionLayer and the returned array) count that flattened list; a group's tint, opacity and
 *   visibility carry to the layers inside it
 * - An object or image layer keeps its index, with its slot in the returned array left empty
 * - A hidden layer (visible false) is loaded, its collision included, but not drawn; its render
 *   is a no-op, delete that and call redraw() to show it
 *  @param {Object}   tileMapData - Level data from exported data
 *  @param {TileInfo} [tileInfo] - Default tile info (used for size and texture), tile() by default, none when no image is loaded
 *  @param {number}   [renderOrder] - Render order of the top layer
 *  @param {number}   [collisionLayer] - Layer to use for collision if any
 *  @param {boolean}  [draw] - Should the layer be drawn automatically
 *  @return {Array<TileCollisionLayer>}
 *  @memberof TileLayers */
function tileLayersLoad(tileMapData, tileInfo=tileLayerDefaultTile(), renderOrder=0, collisionLayer, draw=true)
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

    // flatten group layers in order, a group's color and visibility carry to the layers inside it
    /** @type {Array<{dataLayer: Object, color?: Color, visible?: boolean}>} */
    const layers = [];
    const addLayers = (dataLayers, groupColor, groupVisible)=>
    {
        for (const dataLayer of dataLayers)
        {
            const type = dataLayer.type;
            if (type && type !== 'tilelayer' && type !== 'group')
            {
                layers.push({dataLayer}); // an object or image layer has no tiles, its slot is left empty
                continue;
            }

            // apply layer color, Tiled writes a tint with alpha as #AARRGGBB
            const tint = dataLayer.tintcolor;
            const color = tint ?
                new Color().setHex(tint.length === 9 ? '#' + tint.slice(3) + tint.slice(1, 3) : tint) :
                (dataLayer.color || WHITE).copy();
            ASSERT(isColor(color), 'layer color is not a color');
            color.a *= dataLayer.opacity ?? 1;
            const visible = groupVisible && dataLayer.visible !== false;
            if (type === 'group')
                addLayers(dataLayer.layers || [], groupColor.multiply(color), visible);
            else
                layers.push({dataLayer, color: groupColor.multiply(color), visible});
        }
    };
    addLayers(tileMapData.layers, WHITE, true);

    // create tile layers and fill with data
    const tileLayers = [];
    const levelSize = vec2(tileMapData.width, tileMapData.height);
    const layerCount = layers.length;
    for (let layerIndex=layerCount; layerIndex--;)
    {
        const {dataLayer, color: layerColor, visible} = layers[layerIndex];
        if (!layerColor)
            continue;
        ASSERT(dataLayer.data && dataLayer.data.length, 'tile layer has no data, infinite maps and compressed layers are not supported');
        ASSERT(levelSize.area() === dataLayer.data.length);

        const layerRenderOrder = renderOrder - (layerCount - 1 - layerIndex);
        const tileLayer = new TileCollisionLayer(vec2(), levelSize, tileInfo, layerRenderOrder);
        tileLayer.isSolid = layerIndex === collisionLayer; // the others are art, the solid tests skip them
        tileLayers[layerIndex] = tileLayer;
        if (!visible)
            tileLayer.render = ()=> {}; // a hidden layer keeps its tiles and collision but is not drawn

        for (let x=levelSize.x; x--;)
        for (let y=levelSize.y; y--;)
        {
            const pos = vec2(x, levelSize.y-1-y);
            const data = dataLayer.data[x + y*levelSize.x];
            if (data)
            {
                // Tiled keeps a tile's flips in its top bits, horizontal, vertical and diagonal, the diagonal
                // applied first; each of the 8 is a quarter turn direction with or without a mirror
                const [direction, mirror] = tileLayersTiledFlips[data >>> 29];
                const tileIndex = (data & 0x0fffffff) - 1; // bit 28, a hexagonal turn, is not read
                const layerData = new TileLayerData(tileIndex, direction, !!mirror, layerColor);
                tileLayer.setData(pos, layerData);

                // set collision for top layer
                if (layerIndex === collisionLayer)
                    tileLayer.setCollisionData(pos, 1);
            }
        }
        if (draw && visible)
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
 * const mirror = randBool();
 * const color = randColor();
 * const data = new TileLayerData(tileIndex, direction, mirror, color);
 */
class TileLayerData
{
    /** Create a tile layer data object, one for each tile in a TileLayer
     *  @param {number}  [tile] - The tile to use, from 0 like tile(); undefined is an empty cell that draws nothing
     *  @param {number}  [direction] - Integer direction of tile, in 90 degree increments
     *  @param {boolean} [mirror] - If the tile should be mirrored along the x axis
     *  @param {Color}   [color] - Color of the tile */
    constructor(tile, direction=0, mirror=false, color=new Color)
    {
        /** @property {number|undefined} - The tile to use, from 0 like tile(); undefined is an empty cell that draws nothing
         *  @type {number|undefined} */
        this.tile = tile;
        /** @property {number} - Integer direction of tile, in 90 degree increments */
        this.direction = direction;
        /** @property {boolean} - If the tile should be mirrored along the x axis */
        this.mirror = mirror;
        /** @property {Color} - Color of the tile */
        this.color = color.copy();
    }

    /** Set this tile to clear, it will not be rendered */
    clear() { this.tile = undefined; this.direction = 0; this.mirror = false; this.color = new Color; }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Canvas Layer - cached off screen rendering system
 * - Contains an offscreen canvas that can be rendered to
 * - WebGL rendering is optional, call updateWebGL to enable/update
 * - A TileLayer using WebGL redraws into its texture and leaves this canvas blank, so drawing on its context
 *   only shows on a layer made with useWebGL=false (or with WebGL off); use drawLayerTile/drawLayerRect inside
 *   redrawStart/End for drawing that works both ways
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

        /** @property {OffscreenCanvasRenderingContext2D} - The 2D canvas context used by this layer */
        this.context = headlessMode ? undefined : createCanvasContext(canvasSize.x, canvasSize.y);
        /** @property {OffscreenCanvas} - The canvas used by this layer */
        this.canvas = this.context?.canvas;
        /** @property {TextureInfo} - Texture info to use for this object rendering */
        this.textureInfo = new TextureInfo(this.canvas, useWebGL);

        // a texture past the device's limit fails with only a WebGL warning and draws black, and phones often
        // allow 4096 where a desktop allows 16384, so say so in release builds too
        const maxSize = useWebGL && glContext ? glContext.getParameter(glContext.MAX_TEXTURE_SIZE) : 0;
        if (maxSize && max(canvasSize.x, canvasSize.y) > maxSize)
            console.warn(`LittleJS: a ${canvasSize.x}x${canvasSize.y} layer is over this device's ${maxSize} pixel texture limit and draws black, split it into smaller layers`);

        // disable physics by default
        this.mass = 0;
    }

    /** Destroy this canvas layer
     *  @param {boolean} [immediate] - Remove it now, as EngineObject.destroy does, children included */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        this.textureInfo.destroyWebGLTexture();
        super.destroy(immediate);
    }

    // Render the layer, called automatically by the engine
    render()
    {
        this.draw(this.pos, this.size, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Draw this canvas layer centered in world space
    *  @param {Vector2} pos - Center in world space
    *  @param {Vector2} [size] - Size in world space
    *  @param {Color}   [color] - Color to modulate with
    *  @param {number}  [angle] - Angle to rotate by
    *  @param {boolean} [mirror] - If true image is flipped along the Y axis
    *  @param {Color}   [additiveColor] - Additive color to be applied if any
    *  @param {boolean} [screenSpace] - If true the pos and size are in screen space
    *  @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} [context] - Canvas 2D context to draw to */
    draw(pos, size, color=WHITE, angle=0, mirror=false, additiveColor, screenSpace=false, context)
    {
        // the canvas may have been resized since, updateWebGL only refreshes the size for WebGL
        const t = this.textureInfo, c = this.canvas;
        if (c && !this.hasWebGL() && (c.width !== t.size.x || c.height !== t.size.y))
        {
            t.size = vec2(c.width, c.height);
            t.sizeInverse = vec2(1/c.width, 1/c.height);
        }

        // draw the canvas layer as a single tile that uses the whole texture
        const tileInfo = new TileInfo().setFullImage(t);
        const useWebGL = !context && this.hasWebGL(); // a context given is drawn to with Canvas2D
        drawTile(pos, size, tileInfo, color, angle, mirror, additiveColor, useWebGL, screenSpace, context);
    }

    /** Create WebGL texture if necessary and copy layer canvas to it */
    updateWebGL()
    { this.textureInfo.createWebGLTexture(); }

    /** Check if this layer is using WebGL
     *  @return {boolean} */
    hasWebGL()
    { return glEnable && this.textureInfo.hasWebGL(); }
}

///////////////////////////////////////////////////////////////////////////////
// a layer's default tile, none when no image is loaded, so a collision only layer works in a game with no images
function tileLayerDefaultTile() { return textureInfos[0]?.size.x ? tile() : undefined; }

/**
 * Tile Layer - cached rendering system for tile layers
 * - Tiles are drawn once into a texture, a WebGL render target, or the layer's canvas when WebGL is off
 *   or useWebGL is false, and the layer draws that as one image
 * - Some devices like mobile phones are limited to 4k textures, which with 16x16 tiles limits a layer to 256x256
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
    *  @param {TileInfo} [tileInfo] - Default tile info for layer (used for size and texture), tile() by default, none when no image is loaded
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, tileInfo=tileLayerDefaultTile(), renderOrder=0, useWebGL=true)
    {
        ASSERT(!tileInfo || tileInfo.size.x > 0 && tileInfo.size.y > 0,
            'the tile has no size yet, a loadSprite tile is filled in once spritesReady resolves');
        size = size.floor(); // whole cells, a fractional size would never finish filling the data
        const canvasSize = tileInfo ? size.multiply(tileInfo.size) : size;
        super(pos, size, 0, renderOrder, canvasSize, useWebGL);
        
        /** @property {TileInfo|undefined} - Default tile info for layer
         *  @type {TileInfo|undefined} */
        this.tileInfo = undefined;
        /** @property {Array<TileLayerData>} - Array of tile data for the layer */
        this.data = [];
        /** @property {boolean} - Is this layer using a webgl texture? */
        this.isUsingWebGL = false;
        // which side holds the whole layer, set by a full redraw, undefined before the first one; a partial redraw
        // or a render that finds WebGL turned on or off since then draws it all again on the side now in use
        this.tilesInWebGL = undefined;
        /** @property {boolean} - Show this layer's bounds and values when the debug overlay's Debug Tiles is on,
         *  turn it off for layers that only add noise */
        this.debugShow = true;

        if (tileInfo)
        {
            // set tile info
            this.tileInfo = tileInfo.frame(0);
            this.tileInfo.bleed = 0; // disable bleed for tile layers
        }

        // init tile data
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData);

        if (headlessMode)
        {
            // disable rendering in headless mode
            this.render         = ()=> {};
            this.redraw         = ()=> {};
            this.redrawStart    = ()=> {};
            this.redrawEnd      = ()=> {};
            this.drawTileData   = ()=> {};
            this.redrawTileData = ()=> {};
            this.drawLayerTile  = ()=> {};
            this.drawLayerRect  = ()=> {};
            this.drawTile       = ()=> {};
            this.drawRect       = ()=> {};
            this.clearLayerRect = ()=> {};
        }
    }

    /** Set data at a given position in the array
     *  @param {Vector2}       layerPos - Local position in array
     *  @param {TileLayerData} data - Data to set
     *  @param {boolean}       [redraw] - Force the tile to redraw if true */
    setData(layerPos, data, redraw=false)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        ASSERT(data instanceof TileLayerData, 'data must be a TileLayerData');
        layerPos = layerPos.floor();

        if (!layerPos.arrayCheck(this.size)) return;
        this.data[(layerPos.y|0)*this.size.x + (layerPos.x|0)] = data;

        if (!redraw) return;
        const isRedraw = drawContext === this.context;
        isRedraw ? this.drawTileData(layerPos) : this.redrawTileData(layerPos);
    }

    /** Clear data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @param {boolean} [redraw] - Force the tile to redraw if true */
    clearData(layerPos, redraw=false)
    { this.setData(layerPos, new TileLayerData, redraw) }

    /** Get data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData|undefined} */
    getData(layerPos)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        return layerPos.arrayCheck(this.size) ? this.data[(layerPos.y|0)*this.size.x + (layerPos.x|0)] : undefined;
    }

    // Update the tile layer, a layer has no physics
    update() {}

    // Render the tile layer, called automatically by the engine
    render()
    {
        ASSERT(drawContext !== this.context, 'must call redrawEnd() after drawing tiles!');

        // redraw here, not in update, which does not run while paused, if WebGL was turned off or lost, or came back
        this.redrawIfSwitched();

        const size = this.drawSize || this.size;
        const pos = this.pos.add(size.scale(.5));
        this.draw(pos, size, this.color, this.angle, this.mirror, this.additiveColor);
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
        this.tilesInWebGL = this.isUsingWebGL;
    }

    // draw the whole layer again if the side that holds it is not the one in use now
    redrawIfSwitched()
    {
        if (this.tilesInWebGL !== undefined && this.hasWebGL() !== this.tilesInWebGL)
            this.redraw();
    }

    /** Call to start the redraw process
     *  - This can be used to manually update parts of the level
     *  @param {boolean} [clear] - Should it clear the canvas before drawing */
    redrawStart(clear=false)
    {
        if (!this.context) return;
        ASSERT(drawContext !== this.context);
        clear || this.redrawIfSwitched(); // a partial redraw goes on top of the whole layer on the side in use
        
        // save current render settings
        /** @type {[CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D, Vector2, Vector2, number, number, Color, Shader|undefined]} */
        this.savedRenderSettings = [drawContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle, canvasClearColor, glCustomShader];
        setShader(); // the tiles are drawn plain, a layer's own Shader applies when the layer is drawn
        // a redraw from inside another target's pass, like the light system's shadow map, draws the tiles in color
        // and hands that target back after
        this.savedRenderTarget = [glRenderTarget, glColorMask, glColorAdditive, glSkipScreenSpace];
        glColorMask = -1;
        glColorAdditive = 0;
        glSkipScreenSpace = false; // screen space is the layer's own pixels here

        // set the draw canvas and context to this layer
        // use camera settings to match this layer's canvas
        drawContext = this.context;
        const tileSize = this.tileInfo?.size ?? vec2(1);
        mainCanvasSize = this.size.multiply(tileSize);
        canvasClearColor = CLEAR_BLACK;
        cameraPos = this.size.multiply(tileSize).scale(.5);
        cameraScale = 1;
        cameraAngle = 0; // the tiles are drawn flat, the world camera turns the whole layer later

        // set render target to this layer
        this.isUsingWebGL = this.hasWebGL();
        if (this.isUsingWebGL)
            glSetRenderTarget(this.textureInfo.glTexture, clear);
        else
        {
            if (clear)
            {
                // clear and set size
                this.canvas.width  = mainCanvasSize.x;
                this.canvas.height = mainCanvasSize.y;
            }
            // disable smoothing for pixel art, after the resize which resets it
            this.context.imageSmoothingEnabled = !tilesPixelated;
        }
    }

    /** Call to end the redraw process */
    redrawEnd()
    {
        if (!this.context) return;
        ASSERT(drawContext === this.context);

        // set stuff back to normal, the camera first, so a target that was drawing before gets its own transform back
        [drawContext, mainCanvasSize, cameraPos, cameraScale, cameraAngle, canvasClearColor, glCustomShader] = this.savedRenderSettings;
        const [target, colorMask, colorAdditive, skipScreenSpace] = this.savedRenderTarget;
        if (this.isUsingWebGL)
            glSetRenderTarget(target);
        glColorMask = colorMask;
        glColorAdditive = colorAdditive;
        glSkipScreenSpace = skipScreenSpace;
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
        const cellPixels = this.tileInfo?.size ?? vec2(1);
        const drawPos = layerPos.multiply(cellPixels);
        clear && this.clearLayerRect(drawPos, cellPixels);

        // draw the tile if it has layer data, an empty cell has no tile and tile 0 is a tile like any other
        const d = this.getData(layerPos);
        if (!d || d.tile === undefined) return;

        // a tileset packed by loadSprite keeps its own columns, counted from its first tile, not the sheet's grid
        const t = this.tileInfo, tileInfo = t && (t.columns ? t.frame(d.tile) : t.index(d.tile));
        this.drawLayerTile(drawPos, cellPixels, tileInfo, d.color, d.direction*PI/2, d.mirror);
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

    /** Draw a rectangle in layer space
     *  @param {Vector2} pos
     *  @param {Vector2} size
     *  @param {Color} [color=WHITE] - Color to modulate with
     *  @param {number} [angle] - Angle to rotate by
     */
    drawLayerRect(pos, size, color, angle=0)
    { this.drawLayerTile(pos, size, undefined, color, angle); }

    /** Draw a tile onto the layer canvas in world space
     *  @param {Vector2}  pos
     *  @param {Vector2}  [size=vec2(1)]
     *  @param {TileInfo} [tileInfo]
     *  @param {Color}    [color=WHITE]
     *  @param {number}   [angle]
     *  @param {boolean}  [mirror] */
    drawTile(pos, size=vec2(1), tileInfo, color=new Color, angle=0, mirror=false)
    {
        const tileSize = this.tileInfo?.size ?? vec2(1); // a layer made without a tile info draws a pixel a cell
        pos = pos.subtract(this.pos).multiply(tileSize);
        size = size.multiply(tileSize);
        // a screen position is the center of a pixel, so the layer pixel coordinate moves back half a pixel
        pos.x -= .5;
        pos.y = this.canvas.height - pos.y - .5;

        // draw the tile onto the layer canvas
        // in color and handing back a target that was drawing before, like the light system's shadow map
        const oldMainCanvasSize = mainCanvasSize, oldTarget = glRenderTarget, oldColorMask = glColorMask;
        const oldSkip = glSkipScreenSpace, oldColorAdditive = glColorAdditive, oldShader = glCustomShader;
        mainCanvasSize = vec2(this.canvas.width, this.canvas.height);
        glColorMask = -1;
        glColorAdditive = 0;
        setShader(); // plain, as a redraw draws, a layer's own Shader applies when the layer is drawn
        glSkipScreenSpace = false; // its screen space is the layer's own canvas
        const useWebGL = this.hasWebGL();
        useWebGL && glSetRenderTarget(this.textureInfo.glTexture);
        const drawContext = useWebGL ? undefined : this.context;
        drawTile(pos, size, tileInfo, color, angle, mirror, undefined, useWebGL, true, drawContext);
        mainCanvasSize = oldMainCanvasSize;
        useWebGL && glSetRenderTarget(oldTarget);
        glColorMask = oldColorMask;
        glColorAdditive = oldColorAdditive;
        glSkipScreenSpace = oldSkip;
        setShader(oldShader);
    }

    /** Draw a rectangle onto the layer canvas in world space
     *  @param {Vector2} pos
     *  @param {Vector2} [size=vec2(1)]
     *  @param {Color}   [color=WHITE]
     *  @param {number}  [angle] */
    drawRect(pos, size, color, angle)
    { this.drawTile(pos, size, undefined, color, angle); }

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
 * - its pos must be whole numbers, so its cells line up with the world grid objects land on
 * @extends TileLayer
 * @memberof TileLayers
 */
class TileCollisionLayer extends TileLayer
{
    /** Create a tile layer object
    *  @param {Vector2}  pos - World space position
    *  @param {Vector2}  size - World space size
    *  @param {TileInfo} [tileInfo] - Tile info for layer, tile() by default, none when no image is loaded
    *  @param {number}   [renderOrder] - Objects are sorted by renderOrder
    *  @param {boolean}  [useWebGL] - Should this layer use WebGL for rendering
    */
    constructor(pos, size, tileInfo=tileLayerDefaultTile(), renderOrder=0, useWebGL=true)
    {
        super(pos, size.floor(), tileInfo, renderOrder, useWebGL);

        /** @property {Array<number>} - The tile collision grid
         *  @type {Array<number>} */
        this.collisionData = [];
        this.initCollision(this.size);

        // keep track of all collision layers
        tileCollisionLayers.push(this);

        /** @property {boolean} - Solid layers block objects and particles, the solidOnly tests skip the others */
        this.isSolid = true;
        /** @property {boolean} - In the light system's shadow pass, cast only from the cells with collision, drawn
         *  as the layer shows them, so a floor in the same layer stays lit; false casts every tile */
        this.shadowSolidOnly = true;
    }

    /** Draw this layer's shadow shape: the cells with collision in the part the shadow map covers, each row of
     *  them in one draw from that part of the layer's texture, so see through pixels in a tile cast nothing;
     *  every tile when shadowSolidOnly is off, or when the layer is turned or mirrored */
    renderShadow()
    {
        if (!this.shadowSolidOnly || this.angle || this.mirror)
            return super.renderShadow();

        // the cells in view, which in the shadow pass is the shadow map
        const size = this.size, drawSize = this.drawSize || size;
        const cellWorld = drawSize.divide(size), cellPixels = this.tileInfo ? this.tileInfo.size : vec2(1);
        const view = getCameraSize().scale(.5), low = cameraPos.subtract(view), high = cameraPos.add(view);
        const x0 = max(0, floor((low.x - this.pos.x) / cellWorld.x)), x1 = min(size.x, ceil((high.x - this.pos.x) / cellWorld.x));
        const y0 = max(0, floor((low.y - this.pos.y) / cellWorld.y)), y1 = min(size.y, ceil((high.y - this.pos.y) / cellWorld.y));
        const textureHeight = size.y * cellPixels.y, useWebGL = this.hasWebGL();
        for (let y = y0; y < y1; ++y)
        for (let x = x0; x < x1; ++x)
        {
            if (!this.collisionData[y*size.x + x]) continue;
            let end = x + 1; // a run of solid cells along the row
            while (end < x1 && this.collisionData[y*size.x + end]) ++end;
            const count = end - x;
            const tileInfo = new TileInfo(vec2(x*cellPixels.x, textureHeight - (y+1)*cellPixels.y),
                vec2(count*cellPixels.x, cellPixels.y), this.textureInfo, 0, 0);
            const pos = vec2(this.pos.x + (x + count/2)*cellWorld.x, this.pos.y + (y + .5)*cellWorld.y);
            drawTile(pos, vec2(count*cellWorld.x, cellWorld.y), tileInfo, this.color, 0, false, undefined, useWebGL);
            x = end;
        }
    }

    /** Destroy this tile layer
     *  @param {boolean} [immediate] - Remove it now, as EngineObject.destroy does, children included */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        // remove from collision layers array and destroy
        const index = tileCollisionLayers.indexOf(this);
        ASSERT(index >= 0, 'tile collision layer not found in array');
        index >= 0 && tileCollisionLayers.splice(index, 1);
        super.destroy(immediate);
    }

    /** Clear and initialize tile collision, the size is the layer's own, the tile data and canvas keep it
    *  @param {Vector2} size - width and height of tile collision 2d grid */
    initCollision(size)
    {
        ASSERT(isVector2(size), 'size must be a Vector2');
        ASSERT(!this.collisionData.length || (size.x|0) === this.size.x && (size.y|0) === this.size.y, 'initCollision cannot resize a layer');
        this.size = size.floor();
        this.collisionData = new Array(this.size.area()).fill(0);
    }

    /** Set tile collision data for a given cell in the layer
    *  @param {Vector2} layerPos
    *  @param {number}  [data] */
    setCollisionData(layerPos, data=1)
    {
        ASSERT(isVector2(layerPos), 'layerPos must be a Vector2');
        const i = (layerPos.y|0)*this.size.x + (layerPos.x|0);
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
        const i = (layerPos.y|0)*this.size.x + (layerPos.x|0);
        return layerPos.arrayCheck(this.size) ? this.collisionData[i] : 0;
    }

    /** Check if collision with another object should occur
    *  @param {Vector2}      pos
    *  @param {Vector2}      [size=vec2()]
    *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
    *  @return {boolean} */
    collisionTest(pos, size=new Vector2, callbackObject)
    {
        ASSERT(isVector2(pos) && isVector2(size), 'pos and size must be Vector2s');
        tileCollisionAssertWhole(this);
        const collisionTest = tileCollisionTester(callbackObject);

        // check any tiles in the area for collision
        const posX = pos.x - this.pos.x;
        const posY = pos.y - this.pos.y;
        // reject AABBs entirely past either edge; without this, the negative
        // side leaks into row/col 0 because minX/minY clamp to 0 and the
        // point-test floor below forces maxX/maxY up to 1
        if (posX + size.x/2 < 0 || posX - size.x/2 > this.size.x) return false;
        if (posY + size.y/2 < 0 || posY - size.y/2 > this.size.y) return false;
        const minX = max(posX - size.x/2|0, 0);
        const minY = max(posY - size.y/2|0, 0);
        // a zero size is a point test, one cell even when pos lands exactly on an integer boundary
        const maxX = min(size.x ? posX + size.x/2 : minX + 1, this.size.x);
        const maxY = min(size.y ? posY + size.y/2 : minY + 1, this.size.y);
        for (let y = minY; y < maxY; ++y)
        for (let x = minX; x < maxX; ++x)
        {
            // check if the object should collide with this tile, the callback gets its own vector, one it can keep
            const tileData = this.collisionData[y*this.size.x+x];
            if (tileData && collisionTest(tileData, vec2(x+this.pos.x, y+this.pos.y)))
                return true;
        }
        return false;
    }

    /** Return the exact position of the boundary of first tile hit, undefined if nothing was hit.
    *  The point will be inside the colliding tile if it hits (may have a tiny shift)
    *  @param {Vector2} posStart
    *  @param {Vector2} posEnd
    *  @param {EngineObject|TileCollisionCallback} [callbackObject] - Callback, engine object, or undefined
    *  @param {Vector2} [normal] - Optional normal of the surface hit
    *  @return {Vector2|undefined} */
    collisionRaycast(posStart, posEnd, callbackObject, normal)
    {
        ASSERT(isVector2(posStart) && isVector2(posEnd), 'positions must be Vector2s');
        tileCollisionAssertWhole(this);
        const collisionTest = tileCollisionTester(callbackObject);
        // the line is walked in the layer's own space, so its cells are the tiles wherever the layer sits
        const offset = this.pos;
        const testFunction = (pos)=>
        {
            const tileData = this.getCollisionData(pos);
            return tileData && collisionTest(tileData, vec2(pos.x + offset.x, pos.y + offset.y));
        }
        const hitPos = lineTest(posStart.subtract(offset), posEnd.subtract(offset), testFunction, normal);
        if (hitPos)
            hitPos.x += offset.x, hitPos.y += offset.y;
        if (debugRaycast && hitPos)
        {
            const tilePos = hitPos.floor().add(vec2(.5));
            debugRect(tilePos, vec2(1), '#f008');
            debugLine(posStart, posEnd, '#00f', .02);
            debugLine(posStart, hitPos, '#f00', .02);
            debugPoint(hitPos, '#0f0');
            normal && debugLine(hitPos, hitPos.add(normal), '#ff0', .02);
        }
        return hitPos;
    }
}