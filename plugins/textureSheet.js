/**
 * LittleJS Texture Sheet Plugin
 * - Packs images into texture sheets as they are loaded
 * - Sprites are placed automatically, callers get a TileInfo
 * - Sheets are created and filled as needed
 * - Sheets fill in call order, images decode in parallel
 * - Animation frames keep layout and wrap across rows as needed
 * - WebGL textures upload once per batch of loads
 * @namespace TextureSheets
 */

'use strict';

/** Width and height in pixels of texture sheets created by loadSprite
 *  @type {number}
 *  @default
 *  @memberof Settings */
let textureSheetSize = 2048;

/** Default padding pixels around each frame packed by loadSprite
 *  @type {number}
 *  @default
 *  @memberof Settings */
let textureSheetPadding = 1;

/** Array of texture sheets created by loadSprite
 *  @type {Array<TextureSheet>}
 *  @memberof TextureSheets */
let textureSheets = [];

// pending loads pack through a queue so sheets fill in call order
let textureSheetQueue = Promise.resolve();
let textureSheetPendingCount = 0;

/**
 * Texture Sheet - A texture that images are packed into as they load
 * Uses shelf packing, images are placed left to right then wrap to a new row
 * @memberof TextureSheets
 */
class TextureSheet
{
    /** Create a texture sheet, called automatically by loadSprite
     *  @param {number} [size] - Width and height of the sheet in pixels */
    constructor(size=textureSheetSize)
    {
        ASSERT(size > 0, 'texture sheet size must be positive');

        /** @property {number} - Width and height of the sheet in pixels */
        this.size = size;
        /** @property {OffscreenCanvas} - Canvas holding the packed images */
        this.canvas = headlessMode ? undefined : new OffscreenCanvas(size, size);
        /** @property {OffscreenCanvasRenderingContext2D} - 2d context for the canvas */
        this.context = this.canvas?.getContext('2d');
        /** @property {TextureInfo} - The texture info for this sheet */
        this.textureInfo = new TextureInfo(this.canvas);
        /** @property {Vector2} - Where the next image will be packed */
        this.cursor = vec2();
        /** @property {number} - Height of the row being packed */
        this.rowHeight = 0;
        /** @property {boolean} - Has the canvas changed since the last webgl upload? */
        this.glDirty = false;

        if (headlessMode)
        {
            // tiles still need bounds when there is no canvas to measure
            this.textureInfo.size = vec2(size);
            this.textureInfo.sizeInverse = vec2(1/size);
        }
    }

    /** Find a spot for an image on this sheet without drawing it
     *  @param {Vector2} imageSize - Size of the source image in pixels
     *  @param {Vector2} [frameSize] - Size of each frame, or the whole image if not passed
     *  @param {number} [padding] - How many pixels padding around each frame
     *  @return {TileInfo} Tile for the packed image, or undefined if the sheet is full */
    tryAdd(imageSize, frameSize=imageSize, padding=textureSheetPadding)
    {
        ASSERT(isVector2(imageSize) && isVector2(frameSize), 'sizes must be vec2');
        ASSERT(frameSize.x > 0 && frameSize.y > 0, 'frame size must be positive');
        ASSERT(imageSize.x % frameSize.x === 0 && imageSize.y % frameSize.y === 0,
            'image size must be a multiple of the frame size');

        const cellWidth = frameSize.x + padding*2;
        const cellHeight = frameSize.y + padding*2;
        const maxColumns = this.size / cellWidth | 0;
        ASSERT(maxColumns > 0, 'frame is too wide to fit on a texture sheet');

        // keep the layout of the source image, but narrow it if a row is too wide
        // frames wrap down to the next row, which TileInfo.frame handles via columns
        const sourceColumns = imageSize.x / frameSize.x;
        const frameCount = sourceColumns * (imageSize.y / frameSize.y);
        const columns = min(sourceColumns, maxColumns);
        const blockWidth = columns * cellWidth;
        const blockHeight = ceil(frameCount / columns) * cellHeight;

        // probe the placement using locals so a failed try leaves the sheet unchanged
        let x = this.cursor.x, y = this.cursor.y, rowHeight = this.rowHeight;
        if (x + blockWidth > this.size)
        {
            // start a new row if this one does not have enough space left
            x = 0;
            y += rowHeight;
            rowHeight = 0;
        }

        // out of space, the caller needs to use a different sheet
        if (y + blockHeight > this.size)
            return undefined;

        // commit the placement, tile pos points inside the padding to match how tile() works
        this.cursor.x = x + blockWidth;
        this.cursor.y = y;
        this.rowHeight = max(rowHeight, blockHeight);
        return new TileInfo(vec2(x + padding, y + padding), frameSize, this.textureInfo, padding, 0, columns);
    }

    /** Draw an image into this sheet at a tile returned by tryAdd
     *  @param {HTMLImageElement} image - Source image to copy from
     *  @param {TileInfo} tileInfo - Where to put it, from tryAdd
     *  @param {boolean} [update] - Upload to webgl now, pass false when batching */
    drawImage(image, tileInfo, update=true)
    {
        ASSERT(!!this.context, 'texture sheet has no canvas');

        // copy frames in order, reading the source left to right, top to bottom
        // the destination wraps at tileInfo.columns which may be narrower than the source
        const frameSize = tileInfo.size;
        const sourceColumns = image.width / frameSize.x;
        const frameCount = sourceColumns * (image.height / frameSize.y);
        const columns = tileInfo.columns || frameCount;
        const cellWidth = frameSize.x + tileInfo.padding*2;
        const cellHeight = frameSize.y + tileInfo.padding*2;
        for (let i = frameCount; i--;)
        {
            const sourceX = (i % sourceColumns) * frameSize.x;
            const sourceY = (i / sourceColumns | 0) * frameSize.y;
            this.context.drawImage(image,
                sourceX, sourceY, frameSize.x, frameSize.y,
                tileInfo.pos.x + (i % columns) * cellWidth,
                tileInfo.pos.y + (i / columns | 0) * cellHeight,
                frameSize.x, frameSize.y);
        }

        // upload now unless the caller is batching more images
        this.glDirty = true;
        update && this.updateTexture();
    }

    /** Upload the canvas to webgl if it has changed since the last upload
     *  Only needed after batching, drawImage uploads automatically by default */
    updateTexture()
    {
        if (!this.glDirty) return;
        this.glDirty = false;
        this.textureInfo.createWebGLTexture();
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Load an image and pack it into a texture sheet
 *  - Returns a TileInfo immediately which is filled in when the image loads
 *  - Nothing is visible until it loads, use spritesReady to wait for it
 *  - Pass frameSize for animations, then step through them with TileInfo.frame
 *  - Grid images keep their layout and frames wrap down to the next row
 *  @param {string} src - Image source path
 *  @param {Vector2|number} [frameSize] - Size of each animation frame in pixels
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @return {TileInfo}
 *  @example
 *  const playerTile = loadSprite('player.png');     // a single sprite
 *  const runTile = loadSprite('run.png', vec2(16)); // a 16x16 frame animation
 *  @memberof TextureSheets */
function loadSprite(src, frameSize, padding=textureSheetPadding)
{
    ASSERT(isStringLike(src), 'image src must be a string');
    ASSERT(!frameSize || isVector2(frameSize) || isNumber(frameSize), 'frameSize must be a vec2 or number');
    ASSERT(isNumber(padding), 'padding must be a number');

    if (isNumber(frameSize))
        frameSize = vec2(frameSize);

    // start with an empty tile that gets filled in when the image loads
    const tileInfo = new TileInfo(vec2(), vec2(), undefined, padding, 0);
    if (headlessMode) return tileInfo;

    // point at a sheet right away so drawing before it loads picks up empty pixels
    tileInfo.textureInfo = (textureSheets[0] || textureSheetCreate()).textureInfo;

    // start decoding right away, images decode in parallel
    const image = new Image;
    const imagePromise = new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = src;
    });

    // pack through a queue so sheets fill in call order, not decode order
    ++textureSheetPendingCount;
    textureSheetQueue = textureSheetQueue.then(async ()=>
    {
        await imagePromise;
        if (image.width)
        {
            // use the first sheet with enough space, or make a new one
            const imageSize = vec2(image.width, image.height);
            let sheet, tile;
            for (sheet of textureSheets)
                if (tile = sheet.tryAdd(imageSize, frameSize, padding))
                    break;
            if (!tile)
            {
                sheet = textureSheetCreate();
                tile = sheet.tryAdd(imageSize, frameSize, padding);
                ASSERT(!!tile, 'image is too large to fit on a texture sheet');
            }

            // fill in the tile that was already handed out, copying every field the
            // packer set, so nothing is missed if TileInfo gains more of them later
            Object.assign(tileInfo, tile);
            sheet.drawImage(image, tileInfo, false); // upload once per batch below
        }
        else
        {
            // leave the tile empty if the image failed to load
            LOG('loadSprite failed to load image:', src);
        }

        // upload to webgl once per batch, when the last pending load finishes
        if (!--textureSheetPendingCount)
            textureSheets.forEach(s=> s.updateTexture());
    });

    return tileInfo;
}

/** Wait for every sprite started by loadSprite to finish packing
 *  @return {Promise}
 *  @example
 *  async function gameInit()
 *  {
 *      playerTile = loadSprite('player.png');
 *      runTile = loadSprite('run.png', vec2(16));
 *      await spritesReady();
 *  }
 *  @memberof TextureSheets */
async function spritesReady()
{
    // keep waiting until the queue drains, more sprites may load while waiting
    while (textureSheetPendingCount)
        await textureSheetQueue;
}

// create a new texture sheet and add it to the list
function textureSheetCreate()
{
    const sheet = new TextureSheet;
    textureSheets.push(sheet);
    return sheet;
}

///////////////////////////////////////////////////////////////////////////////
// Texture sheet setting setters

/** Set width and height in pixels of texture sheets created by loadSprite
 *  @param {number} size
 *  @memberof Settings */
function setTextureSheetSize(size) { textureSheetSize = size; }

/** Set default padding pixels around each frame packed by loadSprite
 *  @param {number} padding
 *  @memberof Settings */
function setTextureSheetPadding(padding) { textureSheetPadding = padding; }
