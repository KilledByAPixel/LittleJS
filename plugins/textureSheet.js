/**
 * LittleJS Texture Sheet Plugin
 * - Packs images into texture sheets as they are loaded
 * - Sprites are placed automatically, callers get a TileInfo
 * - Sheets are created and filled as needed
 * - Sheets fill in call order, images decode in parallel
 * - Animation frames keep layout and wrap across rows as needed
 * - WebGL textures upload once per batch of loads
 * - loadAtlas imports pre-packed atlases (TexturePacker and Aseprite json)
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
     *  @param {number} [sourcePadding] - How many pixels padding around each frame in the source image
     *  @return {TileInfo} Tile for the packed image, or undefined if the sheet is full */
    tryAdd(imageSize, frameSize=imageSize, padding=textureSheetPadding, sourcePadding=0)
    {
        ASSERT(isVector2(imageSize) && isVector2(frameSize), 'sizes must be vec2');
        ASSERT(frameSize.x > 0 && frameSize.y > 0, 'frame size must be positive');
        ASSERT(isNumber(sourcePadding) && sourcePadding >= 0, 'sourcePadding must be a number >= 0');

        // the source may have its own padding baked in around each frame
        const sourceCellWidth = frameSize.x + sourcePadding*2;
        const sourceCellHeight = frameSize.y + sourcePadding*2;
        ASSERT(imageSize.x % sourceCellWidth === 0 && imageSize.y % sourceCellHeight === 0,
            'image size must be a multiple of the padded frame size');

        const cellWidth = frameSize.x + padding*2;
        const cellHeight = frameSize.y + padding*2;
        const maxColumns = this.size / cellWidth | 0;
        ASSERT(maxColumns > 0, 'frame is too wide to fit on a texture sheet');

        // keep the layout of the source image, but narrow it if a row is too wide
        // frames wrap down to the next row, which TileInfo.frame handles via columns
        const sourceColumns = imageSize.x / sourceCellWidth;
        const frameCount = sourceColumns * (imageSize.y / sourceCellHeight);
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
     *  @param {boolean} [update] - Upload to webgl now, pass false when batching
     *  @param {number} [sourcePadding] - How many pixels padding around each frame in the source image */
    drawImage(image, tileInfo, update=true, sourcePadding=0)
    {
        ASSERT(!!this.context, 'texture sheet has no canvas');

        // copy frames in order, reading the source left to right, top to bottom
        // the destination wraps at tileInfo.columns which may be narrower than the source
        const frameSize = tileInfo.size;
        const sourceCellWidth = frameSize.x + sourcePadding*2;
        const sourceCellHeight = frameSize.y + sourcePadding*2;
        const sourceColumns = image.width / sourceCellWidth;
        const frameCount = sourceColumns * (image.height / sourceCellHeight);
        const columns = tileInfo.columns || frameCount;
        const cellWidth = frameSize.x + tileInfo.padding*2;
        const cellHeight = frameSize.y + tileInfo.padding*2;
        for (let i = frameCount; i--;)
        {
            const sourceX = (i % sourceColumns) * sourceCellWidth + sourcePadding;
            const sourceY = (i / sourceColumns | 0) * sourceCellHeight + sourcePadding;
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
 *  - Pass sourcePadding if the source image has padding baked in around frames
 *  @param {string} src - Image source path
 *  @param {Vector2|number} [frameSize] - Size of each animation frame in pixels
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @param {number} [sourcePadding] - How many pixels padding around each frame in the source image
 *  @return {TileInfo}
 *  @example
 *  const playerTile = loadSprite('player.png');     // a single sprite
 *  const runTile = loadSprite('run.png', vec2(16)); // a 16x16 frame animation
 *  @memberof TextureSheets */
function loadSprite(src, frameSize, padding=textureSheetPadding, sourcePadding=0)
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
            // pack onto a sheet, then fill in the tile that was already handed out,
            // copying every field so nothing is missed if TileInfo gains more of them
            const imageSize = vec2(image.width, image.height);
            const {sheet, tile} = textureSheetAdd(imageSize, frameSize, padding, sourcePadding);
            Object.assign(tileInfo, tile);
            sheet.drawImage(image, tileInfo, false, sourcePadding); // upload once per batch below
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

/** Load a pre-packed texture atlas and repack it onto texture sheets
 *  - Supports TexturePacker json (hash and array) and Aseprite json
 *  - Returns an empty object which is filled with TileInfos when loaded
 *  - Frames are named by the json, animations are grouped automatically
 *  - Aseprite frame tags become animations, so do names like run_0, run_1
 *  - Trimmed frames are restored to their full source size when packed
 *  - Rotated frames are rotated back upright when packed
 *  @param {string} imageSrc - Atlas image path
 *  @param {string|Object} jsonSrc - Atlas json path, or already parsed json data
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @return {Object} Object mapping frame and animation names to TileInfos
 *  @example
 *  const atlas = loadAtlas('sprites.png', 'sprites.json');
 *  await spritesReady();
 *  drawTile(pos, size, atlas.player);          // a single frame
 *  drawTile(pos, size, atlas.run.frame(2));    // frame 2 of the run animation
 *  @memberof TextureSheets */
function loadAtlas(imageSrc, jsonSrc, padding=textureSheetPadding)
{
    ASSERT(isStringLike(imageSrc), 'atlas image src must be a string');
    ASSERT(isStringLike(jsonSrc) || typeof jsonSrc === 'object', 'atlas json must be a path or object');
    ASSERT(isNumber(padding), 'padding must be a number');

    const atlas = {};
    if (headlessMode) return atlas;

    // start fetching the json and decoding the image right away, in parallel
    const jsonPromise = typeof jsonSrc === 'object' ? Promise.resolve(jsonSrc) :
        fetch(jsonSrc).then(r=> r.ok && r.json()).catch(()=> undefined);
    const image = new Image;
    const imagePromise = new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = imageSrc;
    });

    // pack through a queue so sheets fill in call order, not decode order
    ++textureSheetPendingCount;
    textureSheetQueue = textureSheetQueue.then(async ()=>
    {
        const data = await jsonPromise;
        await imagePromise;
        if (image.width && data)
        {
            for (const group of parseAtlas(data))
            {
                // reserve a block of full size cells, one per frame
                const sourceSize = group.frames[0].sourceSize;
                const blockSize = vec2(sourceSize.x*group.frames.length, sourceSize.y);
                const {sheet, tile} = textureSheetAdd(blockSize, sourceSize, padding);

                // draw each frame untrimmed into its cell
                const context = sheet.context;
                const cellWidth = sourceSize.x + padding*2;
                const cellHeight = sourceSize.y + padding*2;
                group.frames.forEach((f, i)=>
                {
                    const x = tile.pos.x + (i % tile.columns)*cellWidth + f.offset.x;
                    const y = tile.pos.y + (i / tile.columns |0)*cellHeight + f.offset.y;
                    if (f.rotated)
                    {
                        // stored rotated 90 degrees clockwise, draw it back upright
                        context.save();
                        context.translate(x, y);
                        context.rotate(-PI/2);
                        context.drawImage(image, f.pos.x, f.pos.y, f.size.y, f.size.x,
                            -f.size.y, 0, f.size.y, f.size.x);
                        context.restore();
                    }
                    else
                        context.drawImage(image, f.pos.x, f.pos.y, f.size.x, f.size.y,
                            x, y, f.size.x, f.size.y);
                });
                sheet.glDirty = true;
                atlas[group.name] = tile;
            }
        }
        else
        {
            // leave the atlas empty if either file failed to load
            LOG('loadAtlas failed to load:', imageSrc, jsonSrc);
        }

        // upload to webgl once per batch, when the last pending load finishes
        if (!--textureSheetPendingCount)
            textureSheets.forEach(s=> s.updateTexture());
    });

    return atlas;
}

/** Parse atlas json into a list of named frame groups, used by loadAtlas
 *  - Accepts TexturePacker json (hash and array) and Aseprite json
 *  - Frames tagged in Aseprite or named like run_0, run_1 group into animations
 *  @param {Object} data - Parsed atlas json data
 *  @return {Array<Object>} List of {name, frames} groups in atlas order
 *  @memberof TextureSheets */
function parseAtlas(data)
{
    ASSERT(!!data?.frames, 'unrecognized atlas format, expected TexturePacker or Aseprite json');

    // normalize both hash and array frame layouts into a single list
    const frames = (isArray(data.frames) ?
        data.frames.map(f=> [f.filename, f]) : Object.entries(data.frames))
        .map(([name, f])=> ({
            name: name.replace(/\.[^.\\/]+$/, ''), // strip file extension
            pos:        vec2(f.frame.x, f.frame.y),
            size:       vec2(f.frame.w, f.frame.h),
            offset:     vec2(f.spriteSourceSize?.x ?? 0, f.spriteSourceSize?.y ?? 0),
            sourceSize: vec2(f.sourceSize?.w ?? f.frame.w, f.sourceSize?.h ?? f.frame.h),
            rotated:    !!f.rotated,
        }));

    const groups = [];
    const tags = data.meta?.frameTags;
    if (tags?.length)
    {
        // aseprite tags are authoritative, untagged frames stay individual
        const tagged = new Set;
        for (const tag of tags)
        {
            groups.push({name: tag.name, frames: frames.slice(tag.from, tag.to + 1)});
            for (let i = tag.from; i <= tag.to; ++i)
                tagged.add(i);
        }
        frames.forEach((f, i)=> tagged.has(i) || groups.push({name: f.name, frames: [f]}));
        return groups;
    }

    // group frames that share a name stem with contiguous trailing numbers
    // run_0.png and run_1.png become a 2 frame animation named run
    const stems = new Map;
    for (const f of frames)
    {
        let match = f.name.match(/^(.+?)([-_ ])?(\d+)$/);
        if (match && !match[2] && /\d$/.test(match[1]))
            match = undefined; // all digit tails like 10 are a name, not frame 0 of 1
        const stem = match ? match[1] : f.name;
        f.groupIndex = match ? Number(match[3]) : undefined;
        stems.has(stem) || stems.set(stem, []);
        stems.get(stem).push(f);
    }
    for (const [stem, list] of stems)
    {
        // only group 2 or more frames with contiguous indices and matching sizes
        list.sort((a, b)=> a.groupIndex - b.groupIndex);
        const grouped = list.length > 1 &&
            list.every((f, i)=> f.groupIndex === list[0].groupIndex + i) &&
            list.every(f=> f.sourceSize.x === list[0].sourceSize.x &&
                           f.sourceSize.y === list[0].sourceSize.y);
        if (grouped)
            groups.push({name: stem, frames: list});
        else
            list.forEach(f=> groups.push({name: f.name, frames: [f]}));
    }
    return groups;
}

/** Wait for everything started by loadSprite and loadAtlas to finish packing
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

// use the first sheet with enough space, or make a new one
function textureSheetAdd(imageSize, frameSize, padding, sourcePadding)
{
    let sheet, tile;
    for (sheet of textureSheets)
        if (tile = sheet.tryAdd(imageSize, frameSize, padding, sourcePadding))
            break;
    if (!tile)
    {
        sheet = textureSheetCreate();
        tile = sheet.tryAdd(imageSize, frameSize, padding, sourcePadding);
        ASSERT(!!tile, 'image is too large to fit on a texture sheet');
    }
    return {sheet, tile};
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
