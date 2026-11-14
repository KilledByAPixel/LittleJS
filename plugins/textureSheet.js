/**
 * LittleJS Texture Sheet Plugin
 * - Packs images into texture sheets as they are loaded
 * - Sprites are placed automatically, callers get a TileInfo
 * - Sheets are created and filled as needed
 * - Sheets fill in call order, images decode in parallel
 * - Animation frames keep layout and wrap across rows as needed
 * - WebGL textures upload once per batch of loads
 * - loadAtlas imports pre-packed atlases (TexturePacker and Aseprite json)
 * - loadTiles packs separate tile images, or several tile sheets, into one tile set for tile layers and maps
 * @namespace TextureSheets
 */

'use strict';

/** Width and height in pixels of texture sheets created by loadSprite, loadAtlas and loadTiles
 *  @type {number}
 *  @default
 *  @memberof Settings */
let textureSheetSize = 2048;

/** Default padding pixels around each frame packed by loadSprite, loadAtlas and loadTiles
 *  @type {number}
 *  @default
 *  @memberof Settings */
let textureSheetPadding = 1;

/** Array of texture sheets created by loadSprite, loadAtlas and loadTiles
 *  @type {Array<TextureSheet>}
 *  @memberof TextureSheets */
let textureSheets = [];

// pending loads pack through a queue so sheets fill in call order
let textureSheetQueue = /* @__PURE__ */ Promise.resolve();
let textureSheetPendingCount = 0;
// what each load handed back by what it was given, so the same image loaded again is packed once
const textureSheetLoaded = /* @__PURE__ */ new Map;
// a load's key: what it was given, a vector by its numbers
const textureSheetLoadKey = (...parts)=> parts.map((p)=> isVector2(p) ? p.x + ',' + p.y : String(p)).join('|');
// a load whose file failed is forgotten, so loading it again tries again, as when the server comes back
const textureSheetLoadFailed = (key, loaded)=> textureSheetLoaded.get(key) === loaded && textureSheetLoaded.delete(key);

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
        /** @property {OffscreenCanvasRenderingContext2D} - 2d context for the canvas */
        this.context = headlessMode ? undefined : createCanvasContext(size);
        /** @property {OffscreenCanvas} - Canvas holding the packed images */
        this.canvas = this.context?.canvas;
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
     *  @param {Vector2} [frameSize] - Size of each frame, or the whole image less its source padding if not passed
     *  @param {number} [padding] - How many pixels padding around each frame
     *  @param {number|Vector2} [sourcePadding] - How many pixels padding around each frame in the source image
     *  @return {TileInfo|undefined} Tile for the packed image, or undefined if the sheet is full */
    tryAdd(imageSize, frameSize, padding=textureSheetPadding, sourcePadding=0)
    {
        // a number pads both axes the same
        const sourcePad = isNumber(sourcePadding) ?
            vec2(/** @type {number} */ (sourcePadding)) : /** @type {Vector2} */ (sourcePadding);
        ASSERT(isVector2(sourcePad) && sourcePad.x >= 0 && sourcePad.y >= 0,
            'sourcePadding must be a number or vec2 >= 0');
        ASSERT(isVector2(imageSize), 'sizes must be vec2');
        frameSize ||= imageSize.subtract(sourcePad.scale(2)); // the whole image, less the padding baked into it
        ASSERT(isVector2(frameSize), 'sizes must be vec2');
        ASSERT(frameSize.x > 0 && frameSize.y > 0, 'frame size must be positive');

        // the source may have its own padding baked in around each frame
        const sourceCellWidth = frameSize.x + sourcePad.x*2;
        const sourceCellHeight = frameSize.y + sourcePad.y*2;

        const cellWidth = frameSize.x + padding*2;
        const cellHeight = frameSize.y + padding*2;
        const maxColumns = this.size / cellWidth | 0;
        if (maxColumns < 1)
            return undefined; // a frame wider than a sheet fits on none, the caller says so and goes on

        // keep the layout of the source image, but narrow it if a row is too wide
        // frames wrap down to the next row, which TileInfo.frame handles via columns
        // whole frames only, a partial one left over at an edge is ignored
        const sourceColumns = imageSize.x / sourceCellWidth | 0;
        const frameCount = sourceColumns * (imageSize.y / sourceCellHeight | 0);
        if (!frameCount)
            return undefined; // smaller than a frame, there is nothing to pack
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
     *  @param {HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|ImageBitmap} image - Source image to copy from
     *  @param {TileInfo} tileInfo - Where to put it, from tryAdd
     *  @param {boolean} [update] - Upload to webgl now, pass false when batching
     *  @param {number|Vector2} [sourcePadding] - How many pixels padding around each frame in the source image */
    drawImage(image, tileInfo, update=true, sourcePadding=0)
    {
        ASSERT(!!this.context, 'texture sheet has no canvas');

        // a number pads both axes the same
        const sourcePad = isNumber(sourcePadding) ?
            vec2(/** @type {number} */ (sourcePadding)) : /** @type {Vector2} */ (sourcePadding);

        // copy frames in order, reading the source left to right, top to bottom
        // the destination wraps at tileInfo.columns which may be narrower than the source
        const frameSize = tileInfo.size;
        const sourceCellWidth = frameSize.x + sourcePad.x*2;
        const sourceCellHeight = frameSize.y + sourcePad.y*2;
        // whole frames only as tryAdd packed them, a fractional count would never end the loop
        const sourceColumns = image.width / sourceCellWidth | 0;
        const frameCount = sourceColumns * (image.height / sourceCellHeight | 0);
        const columns = tileInfo.columns || frameCount;
        const cellWidth = frameSize.x + tileInfo.padding*2;
        const cellHeight = frameSize.y + tileInfo.padding*2;
        for (let i = frameCount; i--;)
        {
            const sourceX = (i % sourceColumns) * sourceCellWidth + sourcePad.x;
            const sourceY = (i / sourceColumns | 0) * sourceCellHeight + sourcePad.y;
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
 *  - The same image loaded again with the same settings gives back what the first load did, packed once, unless
 *    that load failed
 *  @param {string} src - Image source path
 *  @param {Vector2|number} [frameSize] - Size of each animation frame in pixels, or the whole image less its
 *  source padding if not passed
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @param {number|Vector2} [sourcePadding] - How many pixels padding around each frame in the source image
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
    ASSERT(isNumber(sourcePadding) || isVector2(sourcePadding), 'sourcePadding must be a number or vec2');
    ASSERT(engineInitialized || headlessMode, 'call loadSprite after engineInit, e.g. in gameInit');

    if (isNumber(frameSize))
        frameSize = vec2(/** @type {number} */ (frameSize));
    const key = textureSheetLoadKey('sprite', src, frameSize, padding, sourcePadding);
    if (!headlessMode && textureSheetLoaded.has(key))
        return textureSheetLoaded.get(key);

    // start with an empty tile that gets filled in when the image loads
    const tileInfo = new TileInfo(vec2(), vec2(), undefined, padding, 0);
    if (headlessMode) return tileInfo;
    textureSheetLoaded.set(key, tileInfo);

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
    textureSheetQueueJob('loadSprite ' + src, async ()=>
    {
        await imagePromise;
        if (image.width)
        {
            // pack onto a sheet, then fill in the tile that was already handed out,
            // copying every field so nothing is missed if TileInfo gains more of them
            const imageSize = vec2(image.width, image.height);
            // whole frames are packed, in every build: one that does not divide the image leaves the rest out
            const pad = isNumber(sourcePadding) ? vec2(/** @type {number} */ (sourcePadding)) :
                /** @type {Vector2} */ (sourcePadding);
            const cell = frameSize && /** @type {Vector2} */ (frameSize).add(pad.scale(2));
            if (cell && (imageSize.x < cell.x || imageSize.y < cell.y))
            {
                console.warn('loadSprite image is smaller than one frame:', src, imageSize, frameSize);
                return;
            }
            debug && cell && (imageSize.x % cell.x || imageSize.y % cell.y) && console.warn(
                'loadSprite image is not a whole number of frames, the part past the last whole frame is left out:', src);
            const added = textureSheetAdd(imageSize, frameSize, padding, sourcePadding);
            if (!added)
            {
                // leave the tile empty, no sheet can hold it
                console.warn('loadSprite image is too large to fit on a texture sheet:', src);
                return;
            }
            Object.assign(tileInfo, added.tile);
            added.sheet.drawImage(image, tileInfo, false, sourcePadding); // upload once per batch below
        }
        else
        {
            // leave the tile empty if the image failed to load
            console.warn('loadSprite failed to load image:', src);
            textureSheetLoadFailed(key, tileInfo);
        }
    }, ()=> textureSheetLoadFailed(key, tileInfo));

    return tileInfo;
}

/** Load tile images and pack them into texture sheets as one tile set, for tile layers and maps
 *  - Each image is cut into tiles of tileSize, left to right then down, so an image of one tile is one tile and a
 *    sheet is all of its tiles; the tiles are numbered from 0 in the order the images are given
 *  - Returns a tile set at once, a TileInfo whose tiles fill in as the images load; wait for them with spritesReady
 *  - Give it to tileLayersLoad, a TileLayer or a TileCollisionLayer as its tile info: tile n draws tiles[n],
 *    wherever it was packed, and the level editor's palette offers each of them; frame and index do not read the
 *    list, use set.tiles[n] for one tile; make the layers after spritesReady, a layer made before draws nothing
 *  - An image that is not a whole number of tiles gives the whole tiles in it; a sheet with gaps between its tiles
 *    is not read, cut it into its tiles first
 *  - An image that fails to load, or that no sheet can hold, adds no tiles and says so in the console, so the tiles
 *    of the images after it move up
 *  - The same images loaded again with the same settings give back what the first load did, packed once, unless
 *    an image of it failed
 *  @param {Array<string>} sources - Image source paths
 *  @param {Vector2|number} [tileSize] - Size of a tile in pixels
 *  @param {number} [padding] - How many pixels padding around each tile on the sheet
 *  @return {TileInfo}
 *  @example
 *  const tiles = loadTiles(['grass.png', 'dirt.png', 'water.png', 'props.png'], 16);
 *  await spritesReady();
 *  tileLayersLoad(map, tiles); // tile 0 is grass, 1 dirt, 2 water, then the tiles of props.png
 *  @memberof TextureSheets */
function loadTiles(sources, tileSize=tileDefaultSize, padding=textureSheetPadding)
{
    ASSERT(isArray(sources) && sources.every((src)=> isStringLike(src)), 'sources must be a list of image paths');
    ASSERT(isVector2(tileSize) || isNumber(tileSize), 'tileSize must be a vec2 or number');
    ASSERT(isNumber(padding), 'padding must be a number');
    ASSERT(engineInitialized || headlessMode, 'call loadTiles after engineInit, e.g. in gameInit');
    const size = isNumber(tileSize) ? vec2(/** @type {number} */ (tileSize)) : /** @type {Vector2} */ (tileSize).copy();
    const key = textureSheetLoadKey('tiles', sources.join('\n'), size, padding);
    if (!headlessMode && textureSheetLoaded.has(key))
        return textureSheetLoaded.get(key);
    const set = new TileInfo(vec2(), size, undefined, 0, 0);
    set.tiles = [];
    if (headlessMode) return set;
    textureSheetLoaded.set(key, set);
    set.textureInfo = (textureSheets[0] || textureSheetCreate()).textureInfo;

    // every image decodes at once, and packs through the queue in the order given, so the tiles keep that order
    for (const src of sources)
    {
        const image = new Image;
        const imagePromise = new Promise((resolve)=>
        {
            image.onerror = image.onload = resolve;
            image.crossOrigin = 'anonymous';
            image.src = src;
        });
        textureSheetQueueJob('loadTiles ' + src, async ()=>
        {
            await imagePromise;
            // the whole tiles of it, an edge past the last one left out
            const columns = image.width / size.x | 0, rows = image.height / size.y | 0, count = columns * rows;
            const added = count && textureSheetAdd(vec2(columns * size.x, rows * size.y), size, padding, 0);
            image.width || textureSheetLoadFailed(key, set);
            if (!added)
                return console.warn('loadTiles: ' + src + (count ? ' does not fit on a texture sheet' :
                    ' failed to load, or is smaller than a tile') + ', its tiles are left out');
            added.sheet.drawImage(image, added.tile, false); // upload once per batch
            for (let k = 0; k < count; ++k)
                set.tiles.push(added.tile.frame(k));
        }, ()=> textureSheetLoadFailed(key, set));
    }
    return set;
}

/** Load a pre-packed texture atlas and repack it onto texture sheets
 *  - Supports TexturePacker json (hash and array) and Aseprite json
 *  - Returns an empty object which is filled with TileInfos when loaded
 *  - Frames are named by the json, animations are grouped automatically
 *  - Aseprite frame tags become animations, so do names like run_0, run_1, their frames in the file's order
 *    whichever way the tag plays, which parseAtlas gives as the group's direction
 *  - Trimmed frames are restored to their full source size when packed
 *  - Rotated frames are rotated back upright when packed
 *  - A frame outside the image or with no size is left out, and one load packs at most 16 times the image's area,
 *    or 8 sheets', of untrimmed frames, the rest left out with a warning
 *  - The same atlas loaded again by its paths, with the same padding, gives back what the first load did, packed
 *    once, unless that load failed
 *  @param {string} imageSrc - Atlas image path
 *  @param {string|Object} jsonSrc - Atlas json path, or already parsed json data
 *  @param {number} [padding] - How many pixels padding around each frame
 *  @return {Object<string, TileInfo>} Object mapping frame and animation names to TileInfos
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
    ASSERT(engineInitialized || headlessMode, 'call loadAtlas after engineInit, e.g. in gameInit');

    // json passed in as data may be another atlas each time, only one loaded by its path is kept
    const key = typeof jsonSrc === 'object' ? undefined : textureSheetLoadKey('atlas', imageSrc, jsonSrc, padding);
    if (!headlessMode && textureSheetLoaded.has(key))
        return textureSheetLoaded.get(key);

    /** @type {Object<string, TileInfo>} */
    const atlas = {};
    if (headlessMode) return atlas;
    key && textureSheetLoaded.set(key, atlas);

    // start fetching the json and decoding the image right away, in parallel
    const jsonPromise = typeof jsonSrc === 'object' ? Promise.resolve(jsonSrc) :
        fetchJSON(jsonSrc).catch((error)=> void console.warn('loadAtlas:', error.message)); // which file and why
    const image = new Image;
    const imagePromise = new Promise(resolve =>
    {
        image.onerror = image.onload = resolve;
        image.crossOrigin = 'anonymous';
        image.src = imageSrc;
    });

    // pack through a queue so sheets fill in call order, not decode order
    textureSheetQueueJob('loadAtlas ' + imageSrc, async ()=>
    {
        const data = await jsonPromise;
        await imagePromise;
        if (image.width && data)
        {
            // a frame's rect lies in the image, turned when it is stored turned, and its untrimmed size is a size;
            // that may be bigger than the image, a glow trimmed down, so it is not bound by the image, but the cells
            // one load packs are, by area, well past any real atlas, 16 times the image's or 8 sheets', so a small
            // json can not ask for a thousand sheets of empty cells
            const w = image.width, h = image.height;
            // charged by cells and by whole sheets made, the more of the two, so cells a hair over half a sheet,
            // a sheet each, can not make hundreds of sheets
            const budget = max(16 * w * h, 8 * textureSheetSize ** 2), sheetsBefore = textureSheets.length;
            let spent = 0;
            const isSize = (n)=> Number.isFinite(n) && n > 0;
            const inImage = (f)=> f.pos.x >= 0 && f.pos.y >= 0 && isSize(f.sourceSize.x) && isSize(f.sourceSize.y) &&
                f.pos.x + (f.rotated ? f.size.y : f.size.x) <= w && f.pos.y + (f.rotated ? f.size.x : f.size.y) <= h &&
                // and its trimmed part inside its untrimmed size, or it draws into the next sprite's cell
                f.offset.x >= 0 && f.offset.y >= 0 && f.offset.x + f.size.x <= f.sourceSize.x &&
                f.offset.y + f.size.y <= f.sourceSize.y;
            for (const group of parseAtlas(data))
            {
                // reserve a block of full size cells, one per frame
                if (!group.frames.length) continue; // a tag with no frames, the groups after it still load
                if (!group.frames.every(inImage))
                {
                    console.warn('loadAtlas frames lie outside the image or have no size, left out:', group.name);
                    continue;
                }
                const sourceSize = group.frames[0].sourceSize;
                const area = (sourceSize.x + padding*2) * (sourceSize.y + padding*2) * group.frames.length;
                if (spent + area > budget)
                {
                    console.warn('loadAtlas frames would take more sheet area than 16 times the image or 8 sheets, ' +
                        'left out:', group.name);
                    continue;
                }
                const blockSize = vec2(sourceSize.x*group.frames.length, sourceSize.y);
                const added = textureSheetAdd(blockSize, sourceSize, padding);
                if (!added)
                {
                    console.warn('loadAtlas frames are too large to fit on a texture sheet:', group.name);
                    continue;
                }
                // only what was packed counts, by its cells or the sheets made so far, whichever is more
                spent = max(spent + area, (textureSheets.length - sheetsBefore) * textureSheetSize ** 2);
                const {sheet, tile} = added;

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
                // as its own, a frame named __proto__ too, which assigned would set the atlas's prototype
                objectPropertySet(atlas, group.name, tile);
            }
        }
        else
        {
            // leave the atlas empty if either file failed to load
            console.warn('loadAtlas failed to load:', imageSrc, jsonSrc);
            textureSheetLoadFailed(key, atlas);
        }
    }, ()=> textureSheetLoadFailed(key, atlas));

    return atlas;
}

// run a load in the queue: a load that throws is reported, let go of so the next call loads it again (failed), as
// one whose file did not load is, and the loads after it carry on; the pending count always comes back down, and the
// sheets upload to webgl once per batch, when the last pending load finishes
function textureSheetQueueJob(name, job, failed)
{
    ++textureSheetPendingCount;
    textureSheetQueue = textureSheetQueue.then(async ()=>
    {
        try { await job(); }
        catch (e) { console.error(name + ' failed:', e); failed?.(); }
        finally
        {
            if (!--textureSheetPendingCount)
                for (const sheet of textureSheets)
                {
                    try { sheet.updateTexture(); }
                    catch (e) { console.error('texture sheet upload failed:', e); }
                }
        }
    });
}

/** A frame of an atlas, as parseAtlas reads it, in pixels
 *  @typedef {Object} AtlasFrame
 *  @property {string} name - Its name in the atlas, without the file extension
 *  @property {Vector2} pos - Its place in the image
 *  @property {Vector2} size - Its size in the image, trimmed
 *  @property {Vector2} offset - Where the trimmed frame sits in the untrimmed one
 *  @property {Vector2} sourceSize - Its size before it was trimmed
 *  @property {boolean} rotated - The packer turned it
 *  @property {number} [groupIndex] - Its number in an animation named like run_0, run_1
 *  @memberof TextureSheets */

/** Parse atlas json into a list of named frame groups, used by loadAtlas
 *  - Accepts TexturePacker json (hash and array) and Aseprite json
 *  - Frames tagged in Aseprite or named like run_0, run_1 group into animations
 *  - A tag's frames are in the file's order, and its group keeps how Aseprite plays them, its direction: forward,
 *    reverse, pingpong or pingpong_reverse, for the game to play them that way
 *  @param {Object} data - Parsed atlas json data
 *  @return {Array<{name: string, frames: Array<AtlasFrame>, direction?: string}>} List of {name, frames} groups in
 *    atlas order, a tag's with its direction
 *  @memberof TextureSheets */
function parseAtlas(data)
{
    ASSERT(!!data?.frames, 'unrecognized atlas format, expected TexturePacker or Aseprite json');

    // normalize both hash and array frame layouts into a single list; an entry with no frame rect, or no name, is
    // left out, kept as a gap so a tag's frame numbers still match, and the rest load; the untrimmed size is whole
    // pixels, as its cells are, or a cell of 6.9 rounds so that the last frame lands outside the block
    const entries = isArray(data.frames) ? data.frames.map(f=> [f?.filename, f]) : Object.entries(data.frames);
    let bad = 0;
    const frames = entries.map(([name, f])=>
    {
        // and one whose numbers are not numbers, hand edited, as a NaN would stop the whole atlas in a debug build
        const finite = (o, keys)=> !o || keys.every((key)=> o[key] === undefined || Number.isFinite(o[key]));
        if (!f || typeof f.frame != 'object' || !f.frame || (typeof name != 'string' && typeof name != 'number') ||
            !['x', 'y', 'w', 'h'].every((key)=> Number.isFinite(f.frame[key])) ||
            !finite(f.spriteSourceSize, ['x', 'y', 'w', 'h']) || !finite(f.sourceSize, ['w', 'h']))
            return ++bad, undefined;
        // a frame rect bigger than its sprite: Aseprite's inner padding puts a border inside the rect on each side,
        // so the sprite is the middle of it, and one a pixel over, a scaled export's rounding, is the sprite's size
        const sw = f.spriteSourceSize?.w ?? f.frame.w, sh = f.spriteSourceSize?.h ?? f.frame.h;
        const size = vec2(min(f.frame.w, sw), min(f.frame.h, sh));
        const inset = (d)=> d >= 2 ? floor(d / 2) : 0, ix = inset(f.frame.w - size.x), iy = inset(f.frame.h - size.y);
        const offset = vec2(f.spriteSourceSize?.x ?? 0, f.spriteSourceSize?.y ?? 0);
        const sourceSize = vec2(ceil(f.sourceSize?.w ?? f.frame.w), ceil(f.sourceSize?.h ?? f.frame.h));
        // and a trimmed part placed a pixel over its untrimmed size, the same rounding, loses that pixel
        const over = (o, s, source)=> o + s - source > 0 && o + s - source <= 1 ? source - o : s;
        size.x = over(offset.x, size.x, sourceSize.x), size.y = over(offset.y, size.y, sourceSize.y);
        return {
            name: String(name).replace(/\.[^.\\/]+$/, ''), // strip file extension
            pos:        vec2(f.frame.x + (f.rotated ? iy : ix), f.frame.y + (f.rotated ? ix : iy)), // turned in the image
            size, offset, sourceSize,
            rotated:    !!f.rotated,
        };
    });
    bad && console.warn(`loadAtlas: ${bad} frame entries have no frame rect, no name or a field that is not a ` +
        'number, left out');

    const groups = [];
    const tags = data.meta?.frameTags;
    if (tags?.length)
    {
        // aseprite tags are authoritative, untagged frames stay individual
        const tagged = new Set;
        for (const tag of tags)
        {
            // a tag reaches only frames there are, whatever its numbers say
            const from = max(0, floor(tag.from) || 0), to = min(frames.length - 1, floor(tag.to) || 0);
            const list = frames.slice(from, to + 1).filter(Boolean), size = list[0]?.sourceSize;
            // its frames are packed in cells of one size, so a tag of frames of other sizes leaves them alone
            if (list.some((f)=> f.sourceSize.x !== size.x || f.sourceSize.y !== size.y))
            {
                console.warn('loadAtlas: the frames of tag ' + tag.name + ' differ in size, so they stay apart');
                continue;
            }
            const group = {name: tag.name, frames: list};
            typeof tag.direction === 'string' && (group.direction = tag.direction);
            groups.push(group);
            for (let i = from; i <= to; ++i)
                tagged.add(i);
        }
        frames.forEach((f, i)=> f && !tagged.has(i) && groups.push({name: f.name, frames: [f]}));
        // a tag numbers frames, and Aseprite exported with split layers has an entry for each layer of each frame,
        // so its tags would take the wrong entries; those entries are named with their layer in brackets, as
        // "hero (body) 0.aseprite", two layers or more among them, while a merged export names no entry by a layer,
        // or by one only, a title with a bracket; the layers listed, or with none listed one name under two brackets,
        // as "hero (body) 0" and "hero (arm) 0", which a merged sheet of several files, each a title with a bracket
        // of its own, never has
        const listed = isArray(data.meta?.layers) && data.meta.layers.length;
        const bracketsOf = new Map;
        for (const f of frames)
        {
            const bracket = f?.name.match(/\([^()]+\)/)?.[0];
            if (!bracket) continue;
            const rest = f.name.replace(bracket, ''), set = bracketsOf.get(rest) ?? new Set;
            bracketsOf.set(rest, set.add(bracket));
        }
        const split = listed ? data.meta.layers.map((layer)=> '(' + layer?.name + ')')
            .filter((layer)=> frames.some((f)=> f?.name.includes(layer))).length > 1 :
            [...bracketsOf.values()].some((set)=> set.size > 1);
        split &&
            console.warn('loadAtlas: the atlas looks exported with split layers, which its frame tags do not ' +
            'number; export it with the layers merged');
        return parseAtlasNamesCheck(groups);
    }

    // group frames that share a name stem with contiguous trailing numbers
    // run_0.png and run_1.png become a 2 frame animation named run, and so do the folder style run/0.png and run/1.png
    const stems = new Map;
    for (const f of frames.filter(Boolean))
    {
        let match = f.name.match(/^(.+?)([-_ /])?(\d+)$/);
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
    return parseAtlasNamesCheck(groups);
}

// an atlas's groups, with a warning for each name two of them have, as a sprite is looked up by name and the second
// takes the first's place
function parseAtlasNamesCheck(groups)
{
    const names = new Set;
    for (const {name} of groups)
        names.has(name) ? console.warn(`parseAtlas: two sprites are named ${name}, the second takes the first's place`) :
            names.add(name);
    return groups;
}

/** Wait for everything started by loadSprite, loadAtlas and loadTiles to finish packing
 *  @return {Promise<void>}
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

// use the first sheet with enough space, or make a new one,
// returns undefined if it would not fit even on an empty sheet
function textureSheetAdd(imageSize, frameSize, padding, sourcePadding)
{
    let sheet, tile;
    for (sheet of textureSheets)
        if (tile = sheet.tryAdd(imageSize, frameSize, padding, sourcePadding))
            break;
    if (!tile)
    {
        // probe an empty sheet first, a new one is a canvas and a texture kept for good
        const emptySheet = {size: textureSheetSize, cursor: vec2(), rowHeight: 0};
        if (!TextureSheet.prototype.tryAdd.call(emptySheet, imageSize, frameSize, padding, sourcePadding))
            return;
        sheet = textureSheetCreate();
        tile = sheet.tryAdd(imageSize, frameSize, padding, sourcePadding);
    }
    return {sheet, tile};
}

///////////////////////////////////////////////////////////////////////////////
// Texture sheet setting setters

/** Set width and height in pixels of texture sheets created by loadSprite, loadAtlas and loadTiles
 *  @param {number} size
 *  @memberof Settings */
function setTextureSheetSize(size) { textureSheetSize = size; }

/** Set default padding pixels around each frame packed by loadSprite
 *  @param {number} padding
 *  @memberof Settings */
function setTextureSheetPadding(padding) { textureSheetPadding = padding; }
