/**
 * LittleJS Level Editor
 * - Paint the game's tile layers while it is paused, then keep playing with the changes
 * - Press 0 while the debug overlay is open to edit, 0 again to play, or call levelEditor.open() and close()
 * - Edits the Tiled map the game loaded, saves it back as Tiled JSON, and autosaves every change
 * - Debug builds only, the release build has stubs for its names in engineRelease.js and none of its code
 * @namespace Editor
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// the level editor

/**
 *  @callback EditorTileCallback - What the game does when the level editor paints a tile
 *  @param {TileLayer} layer - The layer painted
 *  @param {Vector2} pos - The cell's position in the layer
 *  @param {number|undefined} tile - The tile painted, undefined when erased
 *  @memberof Editor
 */

/**
 * The level editor, open it to pause the game and edit its level, close it to play on with the changes
 * - One of it, levelEditor, 0 on the debug overlay opens and closes it too
 * - In release builds levelEditor is a stub that never opens, and its hooks are never called
 * @memberof Editor
 * @example
 * levelEditor.onRestart = ()=> loadLevel(); // adds a Restart button that rebuilds the level
 * levelEditor.onTile = (layer, pos, tile)=> layer.setCollisionData(pos, tile === ladderTile ? -1 : tile ? 1 : 0);
 */
class LevelEditor
{
    constructor()
    {
        /** @property {EditorTileCallback|undefined} - What the game does when the editor paints a tile, like
         *  setting its collision or its look the way the game does when it loads the level; without one, the
         *  collision layer gets collision 1 where there is a tile
         *  @type {EditorTileCallback|undefined} */
        this.onTile = undefined;
        /** @property {Function|undefined} - Rebuild the level from the map the editor changed, a Restart button
         *  calls it after closing the editor; without one there is no Restart button
         *  @type {(function():void)|undefined} */
        this.onRestart = undefined;
    }

    /** True while the editor is open, the game is paused under it
     *  @return {boolean} */
    get isOpen() { return editorIsOpen; }

    /** Open the editor, pausing the game */
    open() { editorSetOpen(true); }

    /** Close the editor, the game carries on with the changes */
    close() { editorSetOpen(false); }
}

/** The level editor, levelEditor.open() to edit the level, levelEditor.close() to play on with the changes
 *  @type {LevelEditor}
 *  @memberof Editor */
const levelEditor = new LevelEditor;

// if the editor is open
let editorIsOpen = false;

// the game's pause and camera from before the editor opened, handed back when it closes
let editorGameState;

// the editor's own view, so the game's camera is left where the game had it
let editorCameraPos = vec2(), editorCameraScale = 32;

// the layer being painted, the cell under the mouse, the last cell of a stroke, the last cell a stamp was
// placed on, for a Shift line
let editorLayer, editorHover, editorLastCell, editorLastPlaced;

// the selected area, cells of the layer being edited from min to max, the right button's press while it is held,
// and a left press that only cleared a selection, which paints nothing until let go
let editorSelection, editorRightPress, editorLeftSpent;

// if selection edits, Delete, Ctrl+C and Ctrl+X, act on every tile layer of the edited layer's map
let editorAllLayers = false;

// the grid drawn over the layer, G, and the list of keys in the panel, ?
let editorGrid = true, editorHelp = false;

// open or close the editor, the game is paused while it is open and carries on with the changes after
function editorSetOpen(open)
{
    if (!debug || editorIsOpen === !!open) return;
    editorIsOpen = !!open;
    if (editorIsOpen)
    {
        editorGameState = {paused, cameraPos: cameraPos.copy(), cameraScale, cameraAngle};
        editorCameraPos = cameraPos.copy();
        editorCameraScale = cameraScale;
        setPaused(true);
        setDebugOverlay(false); // out of the way of the level
        const layers = editorLayers();
        editorLayer = layers.find((layer)=> layer.live.isSolid) ?? layers.at(-1);
    }
    else
    {
        editorStrokeEnd();
        editorSelection = editorRightPress = undefined;
        const state = editorGameState;
        setPaused(state.paused);
        setCameraPos(state.cameraPos);
        setCameraScale(state.cameraScale);
        setCameraAngle(state.cameraAngle);
    }
}

// the editor's view, applied before it reads the mouse and before each render, since a game may move the
// camera from gameUpdatePost, which runs while paused
function editorApplyCamera()
{
    setCameraPos(editorCameraPos);
    setCameraScale(editorCameraScale);
    setCameraAngle(0); // painting is on the grid as the level is laid out
}

///////////////////////////////////////////////////////////////////////////////
// tiles as Tiled gids

// a tile, its quarter turns and mirror as a Tiled gid, its flips in the top bits as tileLayersLoad reads them,
// 0 for an empty cell; unsigned, as Tiled writes it
function editorTileToGid(tile, direction=0, mirror=false)
{
    if (tile === undefined) return 0;
    const flips = tileLayersTiledFlips.findIndex(([d, m])=> d === direction && !!m === !!mirror);
    return ((flips << 29) | (tile + 1)) >>> 0;
}

// a gid back to a tile, its quarter turns and mirror, undefined for an empty cell
function editorGidToTile(gid)
{
    if (!gid) return;
    const [direction, mirror] = tileLayersTiledFlips[gid >>> 29];
    return {tile: (gid & 0x0fffffff) - 1, direction, mirror: !!mirror};
}

///////////////////////////////////////////////////////////////////////////////
// maps

// every map the game loaded, and one for each layer it made in code; the editor changes a map's data in place,
// so a game that loads the same map object again, as a restart does, gets the changes
const editorMapList = [];


// the tile layers' data arrays of a map in the order tileLayersLoad makes them, groups flattened
function editorTileLayerData(layers, list=[])
{
    for (const layer of layers)
    {
        if (layer.type === 'group')
            editorTileLayerData(layer.layers || [], list);
        else if (!layer.type || layer.type === 'tilelayer')
            list.push(layer.data);
    }
    return list;
}

// called by tileLayersLoad before it reads a map; a map it has not seen gets a record, and its autosave is copied
// in when the file is the one it was made over; a file that changed since keeps the autosave pending for the
// panel to apply or drop, and one that already has the autosaved data, saved from the editor, drops it
function editorMapRestore(map)
{
    if (editorMapList.some((record)=> record.map === map)) return map; // loaded again, it has the changes

    // a map object seen before, its record retired when its layers went, gets it back as it was, its data has the
    // changes already
    const retired = editorRetiredMaps.get(map);
    if (retired)
    {
        editorRetire((record)=> record.key === retired.key);
        editorMapList.push(retired);
        return map;
    }

    // a map it can not read as plain gids, an infinite one or one with typed arrays, is left to tileLayersLoad,
    // which asserts on what it can not load, and a layer made from it gets a map of its own when edited
    const data = map.layers ? editorTileLayerData(map.layers) : [];
    if (!map.layers || data.some((layer)=> !Array.isArray(layer))) return map;
    const url = editorFetchedURLs.get(map), hash = editorMapHash(data);
    const fileName = url?.split(/[?#]/)[0].split('/').pop() || 'level.json';
    const record = {map, url, fileName, key: editorMapKey(map, url, hash), hash,
        original: data.map((layer)=> [...layer]), layers: []};

    // a new copy of a map takes over from the one before, and maps whose layers are all gone step aside
    editorRetire((other)=> other.key === record.key ||
        other.layers.length && other.layers.every((layer)=> layer.live.destroyed));
    editorMapList.push(record);

    const saved = editorSaves()[record.key];
    if (!saved) return map;
    if (editorSameData(saved.layers, data))
        editorDiscardPending(record);
    else if (saved.hash !== record.hash || !editorCopyData(data, saved.layers))
    {
        record.pending = saved;
        console.warn(`LittleJS editor: ${record.fileName} changed since its autosaved edits, ` +
            'open the editor (Esc then 0) to apply or drop them');
    }
    else
        console.warn(`LittleJS editor: brought back unsaved edits to ${record.fileName}, ` +
            'Save in the editor (Esc then 0) writes them to the file');
    return map;
}

// the records of maps the game moved on from, by map object, for a map it loads again
const editorRetiredMaps = new WeakMap;

// take records out of the list, with the undo that would change them, so an undo never writes a map
// the game no longer shows; a map object loaded again gets its record back
function editorRetire(isRetired)
{
    const gone = editorMapList.filter(isRetired);
    if (!gone.length) return;
    for (const record of gone)
    {
        editorMapList.splice(editorMapList.indexOf(record), 1);
        record.synthetic || editorRetiredMaps.set(record.map, record);
    }
    for (const list of [editorUndoList, editorRedoList])
    for (let i = list.length; i--;)
        list[i].some((cell)=> gone.includes(cell.layer.record)) && list.splice(i, 1);
    if (gone.includes(editorLayer?.record))
        editorLayer = editorSelection = undefined; // the selection was an area of that layer
}

// called by tileLayersLoad with the layers it made, a map loaded again keeps its layer records, with the new layers
function editorMapLoaded(map, tileLayers, flatLayers)
{
    const record = editorMapList.find((record)=> record.map === map);
    record && tileLayers.forEach((live, i)=>
    {
        const {dataLayer: source, color} = flatLayers[i];
        const layer = record.layers.find((layer)=> layer.source === source);
        layer ? Object.assign(layer, {live, color}) : record.layers.push({record, source, live, color});
    });
}

// the editor's record of a live layer; a layer the game made in code gets a map of its own, from its tiles now
function editorLayerRecord(live)
{
    for (const record of editorMapList)
    for (const layer of record.layers)
        if (layer.live === live) return layer;

    const {x: width, y: height} = live.size, size = live.tileInfo?.size ?? vec2(16);
    const data = [];
    for (let y = height; y--;)
    for (let x = 0; x < width; ++x)
    {
        const d = live.getData(vec2(x, y));
        data.push(editorTileToGid(d.tile, d.direction, d.mirror));
    }
    const source = {type: 'tilelayer', id: 1, name: 'Tile Layer 1', x: 0, y: 0, width, height,
        opacity: 1, visible: true, data};
    const map = {type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
        width, height, tilewidth: size.x, tileheight: size.y, nextlayerid: 2, nextobjectid: 1,
        tilesets: editorTilesets(live), layers: [source]};
    const record = {map, synthetic: true, fileName: 'level.json', layers: []};
    const layer = {record, source, live, color: WHITE};
    record.layers.push(layer);
    editorMapList.push(record);
    return layer;
}

// a Tiled tileset for a layer made in code, from its image
function editorTilesets(live)
{
    const tileInfo = live.tileInfo, image = tileInfo?.textureInfo?.image;
    if (!image) return [];
    const {x: tilewidth, y: tileheight} = tileInfo.size, padding = tileInfo.padding;
    const columns = tileInfo.columns || floor(image.width / (tilewidth + padding*2));
    const rows = floor(image.height / (tileheight + padding*2));
    const file = image.src ? image.src.split('/').pop() : 'tiles.png';
    return [{firstgid: 1, name: file.replace(/\.\w+$/, ''), image: file, imagewidth: image.width,
        imageheight: image.height, tilewidth, tileheight, margin: padding, spacing: padding*2, columns,
        tilecount: columns * rows}];
}

// the file each json fetchJSON loaded came from, its name for saving and autosaving
const editorFetchedURLs = new WeakMap;
function editorJSONFetched(url, json)
{ json && typeof json === 'object' && editorFetchedURLs.set(json, String(url)); }

// a map as Tiled JSON, everything it was loaded with kept, the tile data as the editor left it
function editorMapJSON(record) { return JSON.stringify(record.map); }

// download a map as Tiled JSON, under the name of the file it came from
function editorSave(record)
{
    if (!record) return;
    editorStrokeEnd();
    saveText(editorMapJSON(record), record.fileName, 'application/json');
}

///////////////////////////////////////////////////////////////////////////////
// autosave

// every page keeps its own autosaves, one for each map by its key
function editorSaveName() { return 'LittleJS editor ' + (globalThis.location?.pathname ?? ''); }
const editorSaves = ()=> readSaveData(editorSaveName(), {});

// if the last autosave did not fit in storage, the panel says so
let editorSaveFailed = false;

// write the autosaves, noting whether storage took them
function editorWriteSaves(saves)
{
    try
    {
        localStorage.setItem(editorSaveName(), JSON.stringify(saves));
        editorSaveFailed = false;
    }
    catch { editorSaveFailed = true; }
}

// a map's name for its autosave, the file it was fetched from without a query, or its size, layer names and data as loaded; a map with
// no file can not tell a changed map from another one, so each is its own
function editorMapKey(map, url, hash)
{ return url?.split(/[?#]/)[0] ?? `${map.width}x${map.height} ` + map.layers.map((layer)=> layer.name).join() + ' #' + hash; }

// a quick hash of a map's tile data, to know when the file changed under its autosave
function editorMapHash(data)
{
    let hash = 2166136261;
    for (const layer of data)
    for (const gid of layer)
        hash = Math.imul(hash ^ gid, 16777619);
    return hash >>> 0;
}

const editorSameData = (a, b)=> JSON.stringify(a) === JSON.stringify(b);

// copy saved tile data into a map's layers in place, when every layer is the size it was
function editorCopyData(data, saved)
{
    if (saved.length !== data.length || saved.some((layer, i)=> layer.length !== data[i].length)) return false;
    saved.forEach((layer, i)=> { for (let j = layer.length; j--;) data[i][j] = layer[j]; });
    return true;
}

// remember a map's tile data, or forget it when it is back to the file
function editorAutosave(record)
{
    if (record.synthetic) return; // a layer made in code has no load to bring it back in, save it to a file
    const saves = editorSaves(), data = editorTileLayerData(record.map.layers);
    if (editorSameData(data, record.original))
        delete saves[record.key];
    else
        saves[record.key] = {hash: record.hash, layers: data};
    editorWriteSaves(saves);
}

// paint every cell of a map's layers from a list of tile data, the tile layers of the map in order
function editorPaintData(record, data)
{
    editorStrokeEnd();
    const all = editorTileLayerData(record.map.layers);
    editorBulkEdit(()=>
    {
        for (const layer of record.layers)
        {
            const gids = data[all.indexOf(layer.source.data)], {x: width, y: height} = layer.live.size;
            if (gids?.length === width * height)
                gids.forEach((gid, i)=> editorPaint(layer, vec2(i % width, height - 1 - (i / width | 0)), gid));
        }
    });
    editorStroke ? editorStrokeEnd() : editorAutosave(record);
}

// the autosaved edits of a file that changed since, applied as one undo
function editorApplyPending(record)
{
    const saved = record?.pending;
    if (!saved) return;
    record.pending = undefined;
    editorPaintData(record, saved.layers);
}

// drop the autosaved edits of a file that changed since
function editorDiscardPending(record)
{
    if (!record) return;
    record.pending = undefined;
    const saves = editorSaves();
    delete saves[record.key];
    editorWriteSaves(saves);
}

// put every layer back to the file, as one undo
function editorRevert(record)
{
    if (!record) return;
    record.pending = undefined;
    editorPaintData(record, record.original);
}

///////////////////////////////////////////////////////////////////////////////
// cells and undo

// the strokes that can be undone and redone, each a list of cells with the gid before and after
const editorUndoList = [], editorRedoList = [];
let editorStroke;

// during a big edit, the layers whose cell by cell redraws are held off, with the redraw each had of its own
let editorHeldRedraws;

// make a big edit, a fill, clear, undo, apply or revert, with each layer's cell by cell redraws held off, a game's
// tile callback's included; the stroke's end draws each layer it touched again whole
function editorBulkEdit(edit)
{
    const held = editorHeldRedraws = new Map;
    try { edit(); }
    finally
    {
        editorHeldRedraws = undefined;
        for (const [live, own] of held)
            own ? live.redrawTileData = own : delete live.redrawTileData;
    }
}

// set a cell to a gid, in the map and on the live layer, with the game's rules, and return the gid it had
function editorSetCell(layer, pos, gid)
{
    const {source, live, color} = layer;
    const index = pos.x + (live.size.y - 1 - pos.y) * live.size.x;
    const before = source.data[index];
    if (before === gid && (!gid || live.destroyed || live.getData(pos).tile !== undefined))
        return before; // the same, unless the layer lost the tile in play, a ghost painted with its own tile
    source.data[index] = gid;
    if (live.destroyed) return before; // a layer the game let go of, the map still has the change

    if (editorHeldRedraws && !editorHeldRedraws.has(live))
    {
        editorHeldRedraws.set(live, live.hasOwnProperty('redrawTileData') ? live.redrawTileData : undefined);
        live.redrawTileData = ()=> {};
    }
    const t = editorGidToTile(gid);
    live.setData(pos, t ? new TileLayerData(t.tile, t.direction, t.mirror, color) : new TileLayerData, true);
    if (levelEditor.onTile)
        levelEditor.onTile(live, pos.copy(), t?.tile);
    else if (live instanceof TileCollisionLayer && live.isSolid)
        live.setCollisionData(pos, gid ? 1 : 0); // as tileLayersLoad gives it
    return before;
}

// paint a cell as part of the stroke being made
function editorPaint(layer, pos, gid)
{
    const before = editorSetCell(layer, pos, gid);
    if (before === gid) return;
    (editorStroke ||= []).push({layer, pos: pos.copy(), before, after: gid});
}

// the stroke is done, it can be undone as one
function editorStrokeEnd()
{
    if (!editorStroke) return;
    editorUndoList.push(editorStroke);
    editorRedoList.length = 0;
    editorChanged(editorStroke);
    editorStroke = undefined;
}

// undo the last stroke, or redo the last one undone
function editorUndo(redo=false)
{
    editorStrokeEnd();
    const stroke = (redo ? editorRedoList : editorUndoList).pop();
    if (!stroke) return;
    (redo ? editorUndoList : editorRedoList).push(stroke);
    editorBulkEdit(()=>
    {
        for (const cell of redo ? stroke : [...stroke].reverse())
            editorSetCell(cell.layer, cell.pos, redo ? cell.after : cell.before);
    });
    editorChanged(stroke);
}

// after a change the layers it touched draw again whole, so a game's onRedraw decoration sees the new tiles
function editorChanged(stroke)
{
    for (const layer of new Set(stroke.map((cell)=> cell.layer)))
        layer.live.destroyed || layer.live.redraw();
    for (const record of new Set(stroke.map((cell)=> cell.layer.record)))
        editorAutosave(record);
}

///////////////////////////////////////////////////////////////////////////////
// editing

// every tile layer in the game, as the editor's records, in render order
function editorLayers()
{
    return engineObjects.filter((o)=> o instanceof TileLayer && !o.destroyed)
        .sort((a, b)=> a.renderOrder - b.renderOrder).map(editorLayerRecord);
}

// the cell of a layer at a world position, undefined off the layer
function editorCellAt(live, worldPos)
{
    const pos = worldPos.subtract(live.pos).floor();
    return pos.arrayCheck(live.size) ? pos : undefined;
}

// the cell of a layer nearest a world position, clamped onto the layer
function editorCellClamped(live, worldPos)
{
    const pos = worldPos.subtract(live.pos).floor();
    return vec2(clamp(pos.x, 0, live.size.x - 1), clamp(pos.y, 0, live.size.y - 1));
}

// the area between two cells, corners in any order
function editorArea(a, b)
{ return {min: vec2(min(a.x, b.x), min(a.y, b.y)), max: vec2(max(a.x, b.x), max(a.y, b.y))}; }

// the tile info a layer draws a tile with, as TileLayer.drawTileData picks it
function editorTileInfo(live, tile)
{
    const t = live.tileInfo;
    return t && (t.columns ? t.frame(tile) : t.index(tile));
}

///////////////////////////////////////////////////////////////////////////////
// stamps

// the brush is a stamp: its size and, for each layer it paints, a grid of gids from its bottom row up, undefined
// see-through; one grid paints the layer being edited, one copied from all layers has a grid for each layer of the
// map, in order; the last one copied is kept for Ctrl+V
let editorBrush = editorStampTile(editorTileToGid(0)), editorClipboard;

// a stamp of one tile, gid 0 is the Erase brush
function editorStampTile(gid) { return {width: 1, height: 1, grids: [[gid]]}; }

// the gid in a cell of a layer, as the map holds it
function editorGidAt(layer, cell)
{ return layer.source.data[cell.x + (layer.live.size.y - 1 - cell.y) * layer.live.size.x]; }

// each layer a stamp paints with its grid: a stamp of one grid paints the layer being edited, one copied from all
// layers paints the layers of that layer's map, as many as it has
function editorStampTargets(layer, stamp)
{
    return stamp.grids.length > 1 ?
        layer.record.layers.slice(0, stamp.grids.length).map((target, i)=> [target, stamp.grids[i]]) :
        [[layer, stamp.grids[0]]];
}

// the grid of a stamp that paints a layer
function editorStampGrid(layer, stamp)
{ return stamp.grids.length > 1 ? stamp.grids[layer.record.layers.indexOf(layer)] ?? [] : stamp.grids[0]; }

// paint a stamp with its bottom left on a cell, its see-through cells and cells off the layer leave things as they are
function editorPaintStamp(layer, pos, stamp=editorBrush)
{
    if (layer.record.pending) return; // its autosaved edits wait to be applied or dropped first
    for (const [target, grid] of editorStampTargets(layer, stamp))
    for (let y = stamp.height; y--;)
    for (let x = stamp.width; x--;)
    {
        const gid = grid[x + y * stamp.width], cell = pos.add(vec2(x, y));
        gid === undefined || !cell.arrayCheck(target.live.size) || editorPaint(target, cell, gid);
    }
    editorLastPlaced = {layer, pos: pos.copy()};
}

// paint a stamp on every cell of the line between two cells
function editorPaintBetween(layer, from, to, stamp=editorBrush)
{
    const steps = max(abs(to.x - from.x), abs(to.y - from.y));
    for (let i = 0; i <= steps; ++i)
        editorPaintStamp(layer, from.lerp(to, steps ? i / steps : 1).floor(), stamp);
}

// paint a stamp along a drag from its last cell, so a fast drag leaves no gaps
function editorPaintLine(layer, pos, stamp=editorBrush)
{
    editorPaintBetween(layer, editorLastCell ?? pos, pos, stamp);
    editorLastCell = pos;
}

// a gid turned a quarter turn clockwise on screen: Tiled draws direction one that way, flipped diagonally then
// horizontally, and tileLayersLoad reads it the same, so a turned stamp looks the same in both
function editorGidTurn(gid)
{
    const t = editorGidToTile(gid);
    return t ? editorTileToGid(t.tile, (t.direction + 1) % 4, t.mirror) : gid;
}

// a gid mirrored left to right, Tiled's horizontal flip: a mirror over a turn is the mirror under the turn the
// other way
function editorGidMirror(gid)
{
    const t = editorGidToTile(gid);
    return t ? editorTileToGid(t.tile, (4 - t.direction) % 4, !t.mirror) : gid;
}

// a stamp turned a quarter turn clockwise on screen, or back, its cells and their tiles together; cell (x, y) goes
// to (y, width - 1 - x), so the bottom row becomes the left column, its left end at the top
function editorStampTurn(stamp, back=false)
{
    for (let turns = back ? 3 : 1; turns--;)
    {
        const {width, height} = stamp;
        stamp = {width: height, height: width, grids: stamp.grids.map((grid)=>
        {
            const turned = [];
            for (let y = height; y--;)
            for (let x = width; x--;)
                turned[y + (width - 1 - x) * height] = editorGidTurn(grid[x + y * width]);
            return turned;
        })};
    }
    return stamp;
}

// a stamp mirrored left to right, its cells and their tiles together
function editorStampMirror(stamp)
{
    const {width, height} = stamp;
    return {width, height, grids: stamp.grids.map((grid)=>
    {
        const mirrored = [];
        for (let y = height; y--;)
        for (let x = width; x--;)
            mirrored[width - 1 - x + y * width] = editorGidMirror(grid[x + y * width]);
        return mirrored;
    })};
}

// the brush's tile when it is one tile, with its turn and mirror, undefined for the Erase brush or a bigger stamp
function editorBrushTile()
{
    const {width, height, grids} = editorBrush;
    return width === 1 && height === 1 && grids.length === 1 ? editorGidToTile(grids[0][0]) : undefined;
}

// the brush takes the tile in a cell, an empty cell gives the Erase brush
function editorPick(layer, pos) { editorBrush = editorStampTile(editorGidAt(layer, pos) || 0); }

// a palette slot into the brush: slot 0 is the Erase brush, slot n tile n - 1, keeping a one tile brush's turn
function editorPalettePick(slot)
{
    const t = editorBrushTile();
    editorBrush = editorStampTile(slot ? editorTileToGid(slot - 1, t?.direction, t?.mirror) : 0);
}

///////////////////////////////////////////////////////////////////////////////
// selection

// the layers the selection acts on, the one being edited, or all of its map's with All Layers on
function editorSelectionLayers()
{ return !editorLayer ? [] : editorAllLayers ? editorLayer.record.layers : [editorLayer]; }

// call back for each selected cell that is on a layer
function editorSelectionCells(live, callback)
{
    const {min: a, max: b} = editorSelection;
    for (let y = a.y; y <= b.y; ++y)
    for (let x = a.x; x <= b.x; ++x)
    {
        const cell = vec2(x, y);
        cell.arrayCheck(live.size) && callback(cell);
    }
}

// fill with the brush: the selection when there is one, or the cells joined to the one under the mouse that
// match it exactly, on the layer being edited; a stamp repeats across it, as one undo
function editorFill()
{
    const layer = editorLayer, stamp = editorBrush, {width: w, height: h} = stamp;
    if (!layer || layer.live.destroyed || layer.record.pending) return;
    editorStrokeEnd(); // a drag held while F is pressed is an undo of its own
    const paint = (target, grid, cell, anchor)=>
    {
        const x = ((cell.x - anchor.x) % w + w) % w, y = ((cell.y - anchor.y) % h + h) % h;
        const gid = grid[x + y * w];
        gid === undefined || editorPaint(target, cell, gid);
    };
    editorBulkEdit(()=>
    {
        if (editorSelection)
        {
            for (const [target, grid] of editorStampTargets(layer, stamp))
                editorSelectionCells(target.live, (cell)=> paint(target, grid, cell, editorSelection.min));
        }
        else if (editorHover)
        {
            const grid = editorStampGrid(layer, stamp), start = editorHover;
            for (const cell of editorFloodCells(layer, start))
                paint(layer, grid, cell, start);
        }
    });
    editorStrokeEnd();
}

// the cells joined through their sides to a cell, holding the same gid, turn and mirror included
function editorFloodCells(layer, start)
{
    // cells by index, x + y * width, each looked at once
    const {x: width, y: height} = layer.live.size, gid = editorGidAt(layer, start);
    const seen = new Uint8Array(width * height), cells = [], open = [start.x + start.y * width];
    while (open.length)
    {
        const i = open.pop();
        if (seen[i]) continue;
        seen[i] = 1;
        const x = i % width, y = i / width | 0, cell = vec2(x, y);
        if (editorGidAt(layer, cell) !== gid) continue;
        cells.push(cell);
        x + 1 < width && open.push(i + 1);
        x && open.push(i - 1);
        y + 1 < height && open.push(i + width);
        y && open.push(i - width);
    }
    return cells;
}

// clear the selected area, as one undo
function editorClear()
{
    if (!editorSelection) return;
    editorStrokeEnd(); // a drag held while Delete is pressed is an undo of its own
    editorBulkEdit(()=>
    {
        for (const layer of editorSelectionLayers())
            layer.record.pending || editorSelectionCells(layer.live, (cell)=> editorPaint(layer, cell, 0));
    });
    editorStrokeEnd();
}

// the selected area into the brush as a stamp, its empty cells see-through, and the selection cleared so the
// next click paints it
function editorCopy()
{
    const area = editorSelection;
    if (!area || !editorLayer) return false;
    const width = area.max.x - area.min.x + 1, height = area.max.y - area.min.y + 1;
    const grids = editorSelectionLayers().map((layer)=>
    {
        const grid = [];
        for (let y = height; y--;)
        for (let x = width; x--;)
        {
            const cell = area.min.add(vec2(x, y));
            grid[x + y * width] = cell.arrayCheck(layer.live.size) && editorGidAt(layer, cell) || undefined;
        }
        return grid;
    });
    if (grids.every((grid)=> grid.every((gid)=> gid === undefined)))
        return false; // nothing there, the brush stays as it was
    editorBrush = editorClipboard = {width, height, grids};
    editorSelection = undefined;
    return true;
}

// copy the selected area, then clear it, as one undo
function editorCut()
{
    const area = editorSelection;
    if (!editorCopy()) return false;
    editorSelection = area;
    editorClear();
    editorSelection = undefined;
    return true;
}

// the last copied stamp back into the brush
function editorPaste()
{
    if (!editorClipboard) return false;
    editorBrush = editorClipboard;
    return true;
}

///////////////////////////////////////////////////////////////////////////////
// panel

let editorPanel, editorPanelParts;

// the list of keys ? shows
const editorHelpLines =
[
    'Left: paint · Shift+Left: line from the last tile',
    'Right click: pick a tile · Right drag: select',
    'Middle drag or Space+drag: pan · Wheel or pinch: zoom',
    '1-9: layer · 0: play',
    'F: fill · Delete: clear the selection',
    'Ctrl+C / X / V: copy, cut, paste · Ctrl+Z / Y: undo, redo',
    'R, Shift+R: turn · M: mirror · E: erase · G: grid · ?: keys',
];

// the hint line, for what is held and whether there is a selection
function editorHint()
{
    if (keyIsDown('Space')) return 'Drag to pan';
    if (editorSelection) return 'Selection: F fill · Delete clear · Ctrl+C copy · Ctrl+X cut · click to clear';
    if (keyIsDown('ShiftLeft') || keyIsDown('ShiftRight')) return 'Shift: line from the last tile';
    return 'Left paint · Right pick / drag select · F fill · Space or middle drag pans · ? keys';
}

// what the brush is, in words
function editorBrushLabel()
{
    const {width, height, grids} = editorBrush, t = editorBrushTile();
    if (t)
        return `Brush: tile ${t.tile}` + (t.direction ? `, turned ${t.direction * 90}°` : '') +
            (t.mirror ? ', mirrored' : '');
    if (width === 1 && height === 1 && grids.length === 1) return grids[0][0] === 0 ? 'Brush: Erase' : 'Brush: empty';
    return `Brush: ${width}x${height} stamp` + (grids.length > 1 ? `, ${grids.length} layers` : '');
}

function editorElement(tag, parent, style='', text='')
{
    const element = document.createElement(tag);
    element.style.cssText = style;
    element.textContent = text;
    parent?.appendChild(element);
    return element;
}

// the panel, made the first time the editor opens, on the left so it can sit beside the tweakables panel
function editorPanelInit()
{
    editorPanel = editorElement('div', document.body,
        'position:fixed;top:8px;left:8px;width:260px;max-height:calc(100% - 16px);overflow-y:auto;' +
        'box-sizing:border-box;padding:8px;background:#111d;color:#eee;font:12px monospace;' +
        'border-radius:4px;z-index:9999;user-select:none');

    // a click or touch on the panel is not the game's, a mouse up still goes on so a drag can let go
    for (const type of ['mousedown','wheel','touchstart','touchmove','touchend','touchcancel'])
        editorPanel.addEventListener(type, (e)=> e.stopPropagation());

    const row = ()=> editorElement('div', editorPanel, 'display:flex;gap:4px;margin:4px 0');
    const button = (parent, text, onclick, title='')=>
    {
        const b = editorElement('button', parent, 'flex:1;padding:3px;cursor:pointer', text);
        b.onclick = (e)=> { onclick(e); b.blur(); }; // the keys go back to the editor
        b.title = title;
        return b;
    };

    editorElement('div', editorPanel, 'font-weight:bold', 'Level Editor');
    const top = row();
    button(top, 'Play', ()=> levelEditor.close(), '0');
    const restart = button(top, 'Restart', editorRestart, 'Close the editor and rebuild the level');
    const undo = row();
    button(undo, 'Undo', ()=> editorUndo(), 'Ctrl+Z');
    button(undo, 'Redo', ()=> editorUndo(true), 'Ctrl+Y');
    button(undo, 'Keys', ()=> editorHelp = !editorHelp, 'Every control, ?');

    // a file that changed under its autosave
    const pending = editorElement('div', editorPanel, 'padding:4px;margin:4px 0;background:#630;border-radius:3px');
    editorElement('div', pending, '', 'The level file changed since your autosaved edits');
    const pendingRow = editorElement('div', pending, 'display:flex;gap:4px;margin-top:4px');
    button(pendingRow, 'Apply edits', ()=> editorApplyPending(editorLayer?.record));
    button(pendingRow, 'Drop them', ()=> editorDiscardPending(editorLayer?.record));

    // the layers as numbered buttons, made again when layers come or go, and All Layers
    const layerRow = editorElement('div', editorPanel, 'display:flex;gap:4px;margin:4px 0;flex-wrap:wrap');
    const allLayers = editorElement('button', editorPanel, 'width:100%;padding:3px;cursor:pointer;margin-bottom:4px');
    allLayers.title = 'Delete, Ctrl+C and Ctrl+X act on every layer of the map';
    allLayers.onclick = ()=> { editorAllLayers = !editorAllLayers; allLayers.blur(); };

    const turns = row();
    button(turns, 'Turn', ()=> editorBrush = editorStampTurn(editorBrush), 'R, Shift+R turns back');
    button(turns, 'Mirror', ()=> editorBrush = editorStampMirror(editorBrush), 'M');

    // the layer's tiles in a grid, a click picks one
    const palette = editorElement('canvas', editorPanel,
        'display:block;background:#333;cursor:crosshair;margin:4px 0');
    palette.onclick = (e)=>
    {
        const cell = editorPaletteCell, slot = (e.offsetY / cell | 0) * editorPaletteColumns + (e.offsetX / cell | 0);
        slot <= editorPaletteTiles(editorLayer).length && e.offsetX < editorPaletteColumns * cell &&
            editorPalettePick(slot);
    };
    const brush = editorElement('div', editorPanel, 'color:#ccc;margin:2px 0');

    const file = row();
    button(file, 'Save', ()=> editorSave(editorLayer?.record), 'Download the level as Tiled JSON');
    button(file, 'Revert', ()=> editorRevert(editorLayer?.record), 'Back to the file, can be undone');
    const storage = editorElement('div', editorPanel, 'color:#f86;margin-top:4px',
        'Autosave failed, storage is full: Save to a file');
    const status = editorElement('div', editorPanel, 'color:#aaa;margin-top:4px;min-height:1em');
    const hint = editorElement('div', editorPanel, 'color:#8ab;margin-top:4px');
    const help = editorElement('div', editorPanel, 'color:#aaa;margin-top:4px;border-top:1px solid #444;padding-top:4px');
    for (const line of editorHelpLines)
        editorElement('div', help, 'margin:2px 0', line);
    button(help, 'Close', ()=> editorHelp = false, '?');

    editorPanelParts = {restart, pending, layerRow, allLayers, palette, brush, status, storage, hint, help, layers: undefined};
}

// the palette's cell size in pixels and how many to a row
const editorPaletteCell = 30, editorPaletteColumns = 8;

// a layer's tiles in order, as the tile infos it draws them with, up to the image's edge and without the blank
// ones at the end, a tile of one flat color; found once for each layer
function editorPaletteTiles(layer)
{
    const live = layer?.live, image = live?.tileInfo?.textureInfo?.image;
    if (!image) return [];
    if (layer.palette?.image === image) return layer.palette.tiles;

    const tiles = [];
    for (let i = 0; i < 4096; ++i)
    {
        const t = editorTileInfo(live, i);
        if (t.pos.x + t.size.x > image.width || t.pos.y + t.size.y > image.height) break;
        tiles.push(t);
    }
    try
    {
        // an image from a file page can not be read back, then every tile is kept
        const context = createCanvasContext(image.width, image.height, true);
        context.drawImage(image, 0, 0);
        const blank = (t)=>
        {
            const pixels = new Uint32Array(context.getImageData(t.pos.x, t.pos.y, t.size.x, t.size.y).data.buffer);
            return pixels.every((p)=> p === pixels[0]);
        };
        while (tiles.length > 1 && blank(tiles.at(-1)))
            tiles.pop();
    }
    catch {}
    layer.palette = {image, tiles};
    return tiles;
}

// draw the palette again, for a new layer or brush tile
function editorPaletteDraw(canvas, layer)
{
    const tiles = editorPaletteTiles(layer), cell = editorPaletteCell, columns = editorPaletteColumns;
    const image = layer?.live.tileInfo?.textureInfo?.image, slots = tiles.length + 1;
    canvas.style.display = tiles.length ? '' : 'none';
    canvas.width = columns * cell;
    canvas.height = ceil(slots / columns) * cell;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    // slot 0 is the Erase brush, a red cross, the tiles follow
    context.strokeStyle = '#e44';
    context.lineWidth = 2;
    context.strokeRect(4, 4, cell - 8, cell - 8);
    context.beginPath();
    context.moveTo(8, 8), context.lineTo(cell - 8, cell - 8);
    context.moveTo(cell - 8, 8), context.lineTo(8, cell - 8);
    context.stroke();
    tiles.forEach((t, i)=>
    {
        const slot = i + 1, x = slot % columns * cell, y = (slot / columns | 0) * cell;
        context.drawImage(image, t.pos.x, t.pos.y, t.size.x, t.size.y, x + 2, y + 2, cell - 4, cell - 4);
    });

    // the brush's slot outlined, when it is one tile or Erase
    const t = editorBrushTile(), erase = !t && editorBrush.width === 1 && editorBrush.height === 1 &&
        editorBrush.grids[0][0] === 0, selected = erase ? 0 : t ? t.tile + 1 : -1;
    if (selected < 0) return;
    context.strokeStyle = '#4af';
    context.strokeRect(selected % columns * cell + 1, (selected / columns | 0) * cell + 1, cell - 2, cell - 2);
}

// shows or hides the panel, and shows what changed since the last frame
function editorPanelUpdate()
{
    if (!editorIsOpen)
    {
        editorPanel && (editorPanel.style.display = 'none');
        return;
    }
    editorPanel || editorPanelInit();
    editorPanel.style.display = '';
    const p = editorPanelParts, layers = editorLayers();

    // the layer buttons, made again when layers came or went
    if (!p.layers || layers.length !== p.layers.length || layers.some((layer, i)=> layer !== p.layers[i]))
    {
        p.layers = layers;
        p.layerRow.replaceChildren(...layers.map((layer, i)=>
        {
            const b = editorElement('button', undefined, 'flex:1;min-width:28px;padding:3px;cursor:pointer',
                i < 9 ? String(i + 1) : '·');
            b.title = `${layer.source.name || 'Layer ' + (i + 1)} (${layer.record.fileName})`;
            b.onclick = ()=> { editorStrokeEnd(); editorLayer = layer; editorLastCell = undefined; b.blur(); };
            return b;
        }));
    }
    layers.forEach((layer, i)=> p.layerRow.children[i].style.outline = layer === editorLayer ? '2px solid #4af' : '');
    p.allLayers.textContent = editorAllLayers ? 'All Layers: on' : 'All Layers: off';
    p.brush.textContent = editorBrushLabel();
    p.hint.textContent = editorHint();
    p.help.style.display = editorHelp ? '' : 'none';
    p.storage.style.display = editorSaveFailed ? '' : 'none';
    p.restart.style.display = levelEditor.onRestart ? '' : 'none';
    p.pending.style.display = editorLayer?.record.pending ? '' : 'none';

    // the palette, drawn again when the layer or the brush changed, a change makes a new brush
    const live = editorLayer?.live;
    if (p.paletteLayer !== editorLayer || p.paletteBrush !== editorBrush)
    {
        p.paletteLayer = editorLayer;
        p.paletteBrush = editorBrush;
        editorPaletteDraw(p.palette, editorLayer);
    }

    const t = editorHover && editorGidToTile(editorLayer.source.data[editorHover.x +
        (live.size.y - 1 - editorHover.y) * live.size.x]);
    p.status.textContent = editorHover ? `cell ${editorHover.x}, ${editorHover.y}` +
        (t ? `  tile ${t.tile}` : '') : '';
}

///////////////////////////////////////////////////////////////////////////////
// keys and wheel

// letter shortcuts, by the key's label so they follow the letter printed on any keyboard layout, each called
// with whether Shift is held; one that returns false did nothing, and leaves the key to the browser
const editorKeys =
{
    r: (shift)=> editorBrush = editorStampTurn(editorBrush, shift),
    m: ()=> editorBrush = editorStampMirror(editorBrush),
    e: ()=> editorBrush = editorStampTile(0),
    g: ()=> { editorGrid = !editorGrid; },
    '?': ()=> { editorHelp = !editorHelp; },
    f: ()=> editorFill(),
    Delete: ()=> editorClear(),
    Backspace: ()=> editorClear(),
};
const editorCtrlKeys =
{
    z: (shift)=> editorUndo(shift),
    y: ()=> editorUndo(true),
    c: ()=> editorCopy(),
    x: ()=> editorCut(),
    v: ()=> editorPaste(),
};

// a field that takes typed keys, as the engine counts one: a checkbox, slider or button left with focus, as a
// tweak is, does not take them
function editorIsTextField(target)
{
    const field = target?.closest?.('input,textarea,select,[contenteditable]');
    return !!field && !(field.tagName === 'INPUT' &&
        /^(button|checkbox|color|file|image|radio|range|reset|submit)$/i.test(field.type));
}

// the editor's own key listener, a key typed into a field is the field's, and Alt with Ctrl is AltGr typing
// a character; a letter that is not a Latin one, on a Cyrillic or Greek keyboard, goes by the key's position
function editorOnKeyDown(e)
{
    if (!editorIsOpen || e.repeat || e.altKey || editorIsTextField(e.target)) return;
    let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key.length === 1 && !/[a-z?]/.test(key))
        key = e.code?.match(/^Key([A-Z])$/)?.[1].toLowerCase() ?? key;
    const action = (e.ctrlKey || e.metaKey ? editorCtrlKeys : editorKeys)[key];
    if (action && action(e.shiftKey) !== false)
        e.preventDefault();
}

// the wheel zooms toward the mouse by how far it moved; a trackpad pinch is a wheel with ctrlKey, which the engine
// leaves alone
function editorOnWheel(e)
{
    if (!editorIsOpen || editorIsTextField(e.target)) return;
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    editorZoom(Math.exp(-pixels * (e.ctrlKey ? .01 : .002)));
}

// zoom by a factor, keeping the point under the mouse where it is
function editorZoom(factor)
{
    editorApplyCamera();
    const before = screenToWorld(mousePosScreen);
    editorCameraScale = clamp(editorCameraScale * factor, 1, 1e3);
    editorApplyCamera();
    editorCameraPos = editorCameraPos.add(before.subtract(screenToWorld(mousePosScreen)));
    editorApplyCamera();
}

///////////////////////////////////////////////////////////////////////////////
// plugin

function editorUpdate()
{
    if (!editorIsOpen) return;
    editorApplyCamera();

    // 0 plays again, the overlay's 0 does it while the overlay is open; cleared so debugKeysAlways
    // does not toggle it back in the same step
    if (!debugOverlay && keyWasPressed('Digit0'))
    {
        inputClearKey('Digit0');
        levelEditor.close();
        return;
    }

    // 1 to 9 pick a layer from the back; taken, so debugKeysAlways does not also flip the debug views, the overlay
    // keeps them while it is open
    for (let i = 1; !debugOverlay && i <= 9; ++i)
    {
        if (!keyWasPressed('Digit' + i)) continue;
        inputClearKey('Digit' + i);
        const layer = editorLayers()[i - 1];
        if (layer && layer !== editorLayer)
        {
            editorStrokeEnd();
            editorLayer = layer;
            editorLastCell = undefined; // a drag does not carry across layers
        }
    }

    // the middle button, or Space with the left, drags the view
    const space = keyIsDown('Space');
    if (mouseIsDown(1) || space && mouseIsDown(0))
        editorCameraPos = editorCameraPos.subtract(screenToWorldDelta(mouseDeltaScreen));
    editorApplyCamera();

    const layer = editorLayer?.live.destroyed ? undefined : editorLayer, mouse = screenToWorld(mousePosScreen);
    editorHover = layer && editorCellAt(layer.live, mouse);

    // the right button: a click picks the tile under the mouse, or clears the selection off the layer, a drag
    // selects an area; a release within half a cell of the press, or 4 pixels zoomed far out, is a click
    if (mouseWasPressed(2) && layer)
        editorRightPress = {screen: mousePosScreen.copy(), cell: editorCellClamped(layer.live, mouse), drag: false};
    const press = editorRightPress;
    if (press && layer)
    {
        press.drag ||= mousePosScreen.distance(press.screen) > max(4, editorCameraScale / 2); // a few pixels of wobble at any zoom
        if (press.drag)
            editorSelection = editorArea(press.cell, editorCellClamped(layer.live, mouse));
        if (!mouseIsDown(2))
        {
            if (!press.drag)
                editorHover ? editorPick(layer, editorHover) : editorSelection = undefined;
            editorRightPress = undefined;
        }
    }
    else
        editorRightPress = undefined;

    // the left button paints; the first press with a selection only clears it, Shift draws a line from the
    // last tile placed; a quick click let go before this step still reads as pressed
    if (mouseWasPressed(0) && !space && editorSelection)
    {
        editorSelection = undefined;
        editorLeftSpent = true;
    }
    const left = mouseIsDown(0) || mouseWasPressed(0);
    if (!editorHover)
        editorLastCell = undefined; // off the layer, coming back in starts the line again
    else if (left && !space && !editorLeftSpent && !editorRightPress)
    {
        const last = editorLastPlaced, shift = keyIsDown('ShiftLeft') || keyIsDown('ShiftRight');
        if (mouseWasPressed(0) && shift && last?.layer === layer)
        {
            editorPaintBetween(layer, last.pos, editorHover);
            editorLastCell = editorHover;
        }
        else
            editorPaintLine(layer, editorHover);
    }
    if (!mouseIsDown(0))
    {
        editorStrokeEnd();
        editorLastCell = undefined;
        editorLeftSpent = false;
    }
}

// close the editor and have the game rebuild its level from the changed map, when it has a hook for that
function editorRestart()
{
    if (!levelEditor.onRestart) return;
    levelEditor.close(); // ends a held stroke, and hands back the game's pause and camera
    levelEditor.onRestart();
}

// called by the engine before the camera goes to WebGL, so the level is drawn with the editor's view, a game may move
// the camera from gameUpdatePost, which runs while paused
function editorPreRender() { editorIsOpen && editorApplyCamera(); }

// the layer's edge, a grid when zoomed in, the map's tiles the layer does not show, and the brush under the mouse
function editorRender()
{
    headlessMode || editorPanelUpdate();
    if (!editorIsOpen || headlessMode) return;
    const layer = editorLayer;
    if (!layer || layer.live.destroyed) return;
    const {live, source} = layer, {x: width, y: height} = live.size;

    // the cells on screen
    const low = screenToWorld(vec2(0, mainCanvasSize.y)).subtract(live.pos);
    const high = screenToWorld(vec2(mainCanvasSize.x, 0)).subtract(live.pos);
    const x0 = max(0, floor(low.x)), y0 = max(0, floor(low.y));
    const x1 = min(width, ceil(high.x)), y1 = min(height, ceil(high.y));

    // ghosts, cells the map has that the layer does not show: markers a game made objects of, tiles broken in play
    const ghost = hsl(0, 0, 1, .4);
    for (let x = x0; x < x1; ++x)
    for (let y = y0; y < y1; ++y)
    {
        const t = editorGidToTile(source.data[x + (height - 1 - y) * width]);
        if (t && live.getData(vec2(x, y)).tile === undefined)
            drawTile(live.pos.add(vec2(x + .5, y + .5)), vec2(1), editorTileInfo(live, t.tile), ghost,
                t.direction * PI/2, t.mirror);
    }

    // a grid once the cells are big enough to see one
    const line = hsl(0, 0, 1, .12), thin = 1 / editorCameraScale;
    if (editorGrid && editorCameraScale >= 12)
    {
        for (let x = x0; x <= x1; ++x)
            drawLine(live.pos.add(vec2(x, y0)), live.pos.add(vec2(x, y1)), thin, line);
        for (let y = y0; y <= y1; ++y)
            drawLine(live.pos.add(vec2(x0, y)), live.pos.add(vec2(x1, y)), thin, line);
    }

    // the layer's edge
    const outline = (a, b, color, width)=>
    {
        const corners = [vec2(a.x, a.y), vec2(b.x, a.y), vec2(b.x, b.y), vec2(a.x, b.y)];
        corners.forEach((c, i)=> drawLine(live.pos.add(c), live.pos.add(corners[(i + 1) % 4]), width, color));
    };
    outline(vec2(), live.size, hsl(.55, 1, .6, .8), thin * 2);

    // the selection, and the line Shift would draw
    if (editorSelection)
        outline(editorSelection.min, editorSelection.max.add(vec2(1)), hsl(.15, 1, .6), thin * 3);
    const last = editorLastPlaced, shift = keyIsDown('ShiftLeft') || keyIsDown('ShiftRight');
    if (shift && editorHover && last?.layer === layer && !mouseIsDown(0))
        drawLine(live.pos.add(last.pos).add(vec2(.5)), live.pos.add(editorHover).add(vec2(.5)), thin * 2,
            hsl(.55, 1, .6, .6));

    // the brush where it would paint, the Erase brush's cells in red
    if (editorHover)
    {
        const grid = editorStampGrid(layer, editorBrush), {width: w, height: h} = editorBrush;
        for (let y = h; y--;)
        for (let x = w; x--;)
        {
            const gid = grid[x + y * w], t = editorGidToTile(gid);
            const center = live.pos.add(editorHover).add(vec2(x + .5, y + .5));
            if (t)
                drawTile(center, vec2(1), editorTileInfo(live, t.tile), hsl(0, 0, 1, .7), t.direction * PI/2, t.mirror);
            else if (gid === 0)
                drawRect(center, vec2(1), hsl(0, 1, .5, .3));
        }
        drawRect(live.pos.add(editorHover).add(vec2(w / 2, h / 2)), vec2(w, h), hsl(.55, 1, .6, .25));
    }
}

debug && engineAddPlugin(editorUpdate, editorRender);

// the editor's own listeners for letter shortcuts and the wheel, the engine's input reads keys by position
if (debug && globalThis.document?.addEventListener)
{
    document.addEventListener('keydown', editorOnKeyDown);
    document.addEventListener('wheel', editorOnWheel, {passive: true});
}
