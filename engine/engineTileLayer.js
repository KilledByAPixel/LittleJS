/*
    LittleJS Tile Layer System
    - Caches arrays of tiles to offscreen canvas for fast rendering
    - Unlimted numbers of layers, allocates canvases as needed
    - Interfaces with EngineObject for collision
    - Collision layer is separate from visible layers
    - Tile layers can be drawn to using their context with canvas2d
    - It is recommended to have a visible layer that matches the collision
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Tile Collision

let tileCollision = [];
let tileCollisionSize = vec2();
const tileLayerCanvasCache = [];

function initTileCollision(size)
{
    tileCollisionSize = size;
    tileCollision = [];
    for (let i=tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}

// set and get collision data
const setTileCollisionData = (pos, data=0)=>
    pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);
const getTileCollisionData = (pos)=>
    pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;

// check if there is collision in a given area
function tileCollisionTest(pos, size=vec2(), object)
{
    const minX = max(Math.floor(pos.x - size.x/2), 0);
    const minY = max(Math.floor(pos.y - size.y/2), 0);
    const maxX = min(pos.x + size.x/2, tileCollisionSize.x-1);
    const maxY = min(pos.y + size.y/2, tileCollisionSize.y-1);
    for (let y = minY; y < maxY; ++y)
    for (let x = minX; x < maxX; ++x)
    {
        const tileData = tileCollision[y*tileCollisionSize.x+x];
        if (tileData && (!object || object.collideWithTile(tileData, new Vector2(x, y))))
            return 1;
    }
}

// return the center of tile if any that is hit (this does not return the exact hit point)
// todo: a way to get the exact hit point, it must still register as inside the hit tile
function tileCollisionRaycast(posStart, posEnd, object)
{
    // test if a ray collides with tiles from start to end
    posStart = posStart.int();
    posEnd = posEnd.int();
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

class TileLayerData
{
    constructor(tile=-1, direction=0, mirror=0, color=new Color)
    {
        this.tile      = tile;
        this.direction = direction;
        this.mirror    = mirror;
        this.color     = color;
    }
    clear() { this.tile = this.direction = this.mirror = 0; color = new Color; }
}

class TileLayer extends EngineObject
{
    constructor(pos, size, scale=vec2(1), layer=0)
    {
        super(pos, size);

        // create new canvas if necessary
        this.canvas = tileLayerCanvasCache.length ? tileLayerCanvasCache.pop() : document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        this.scale = scale;
        this.tileSize = defaultTileSize.copy();
        this.layer = layer;
        this.renderOrder = layer;
        this.flushGLBeforeRender = 1;

        // init tile data
        this.data = [];
        for (let j = this.size.area(); j--;)
            this.data.push(new TileLayerData());
    }

    destroy()
    {
        // add canvas back to the cache
        tileLayerCanvasCache.push(this.canvas);
        super.destroy();
    }
    
    setData(layerPos, data, redraw)
    {
        if (layerPos.arrayCheck(this.size))
        {
            this.data[(layerPos.y|0)*this.size.x+layerPos.x|0] = data;
            redraw && this.drawTileData(layerPos);
        }
    }
    
    getData(layerPos)
    { return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; }
    
    update() {} // tile layers are not updated
    render()
    {
        ASSERT(mainContext != this.context); // must call redrawEnd() after drawing tiles

        // flush and copy gl canvas because tile canvas does not use gl
        this.flushGLBeforeRender && glEnable && glCopyToContext(mainContext);
        
        // draw the entire cached level onto the main canvas
        const pos = worldToScreen(this.pos.add(vec2(0,this.size.y*this.scale.y)));
        mainContext.drawImage
        (
            this.canvas, pos.x, pos.y,
            cameraScale*this.size.x*this.scale.x, cameraScale*this.size.y*this.scale.y
        );
    }

    redraw()
    {
        // draw all the tile data to an offscreen canvas using webgl if possible
        this.redrawStart();
        this.drawAllTileData();
        this.redrawEnd();
    }

    redrawStart(clear = 1)
    {
        // clear and set size
        const width = this.size.x * this.tileSize.x;
        const height = this.size.y * this.tileSize.y;
        if (clear)
        {
            this.canvas.width  = width;
            this.canvas.height = height;
        }

        // save current render settings
        this.savedRenderSettings = [mainCanvasSize, mainCanvas, mainContext, cameraScale, cameraPos];

        // set camera transform for renering
        cameraScale = this.tileSize.x;
        cameraPos = this.size.scale(.5);
        mainCanvas = this.canvas;
        mainContext = this.context;
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art
        mainCanvasSize = vec2(width, height);
        glPreRender(width, height);
    }

    redrawEnd()
    {
        ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
        glCopyToContext(mainContext, 1);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [mainCanvasSize, mainCanvas, mainContext, cameraScale, cameraPos] = this.savedRenderSettings;
    }

    drawTileData(layerPos)
    {
        // first clear out where the tile was
        const pos = layerPos.int().add(this.pos).add(vec2(.5));
        this.drawCanvas2D(pos, vec2(1), 0, 0, (context)=>context.clearRect(-.5, -.5, 1, 1));

        // draw the tile
        const d = this.getData(layerPos);
        ASSERT(d.tile < 0 || mainContext == this.context); // must call redrawStart() before drawing tiles
        d.tile < 0 || drawTile(pos, vec2(1), d.tile || -1, this.tileSize, d.color, d.direction*PI/2, d.mirror);
    }

    drawAllTileData()
    {
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
             this.drawTileData(vec2(x,y));
    }

    // draw directly to the 2d canvas in world space (bipass webgl)
    drawCanvas2D(pos, size, angle, mirror, drawFunction)
    {
        const context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileSize);
        size = size.multiply(this.tileSize);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror?-size.x:size.x, size.y);
        drawFunction(context);
        context.restore();
    }

    // draw a tile directly onto the layer canvas
    drawTile(pos, size=vec2(1), tileIndex=0, tileSize=defaultTileSize, color=new Color, angle=0, mirror)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context)=>
        {
            if (tileIndex < 0)
            {
                // untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                const cols = tileImage.width/tileSize.x;
                context.globalAlpha = color.a; // full color not supported in this mode
                context.drawImage(tileImage, 
                    (tileIndex%cols)*tileSize.x, (tileIndex/cols|0)*tileSize.x, 
                    tileSize.x, tileSize.y, -.5, -.5, 1, 1);
            }
        });
    }

    drawRect(pos, size, color, angle) { this.drawTile(pos, size, -1, 0, color, angle, 0); }
}