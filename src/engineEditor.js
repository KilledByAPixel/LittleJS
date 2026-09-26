/**
 * LittleJS Level Editor
 * - Paint the game's tile layers while it is paused, then keep playing with the changes
 * - Press 0 while the debug overlay is open to edit, 0 again to play, or call setEditMode
 * - Edits the Tiled map the game loaded, saves it back as Tiled JSON, and autosaves every change
 * - Debug builds only, the release build has stubs for its names in engineRelease.js and none of its code
 * @namespace Editor
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// edit mode

/** True while the editor is open, the game is paused under it, setEditMode(enable=true)
 *  @type {boolean}
 *  @default
 *  @memberof Editor */
let editMode = false;

// the game's pause and camera from before the editor opened, handed back when it closes
let editorGameState;

// the editor's own view, so the game's camera is left where the game had it
let editorCameraPos = vec2(), editorCameraScale = 32;

// the layer being painted, the cell under the mouse, the last cell of a stroke, the last cell a stamp was
// placed on, for a Shift line, and if the press is an Alt pick
let editorLayer, editorHover, editorLastCell, editorLastPlaced, editorPicking;

/** Open or close the editor, the game is paused while it is open and carries on with the changes after
 *  - Does nothing in release builds
 *  @param {boolean} [enable]
 *  @memberof Editor */
function setEditMode(enable=true)
{
    if (!debug || editMode === !!enable) return;
    editMode = !!enable;
    if (editMode)
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

// the game's rules for a painted tile, set by setEditorTileCallback
let editorTileCallback;

/** Set what the game does when the editor paints a tile, like setting its collision or its look the way the
 *  game does when it loads the level; without one, the collision layer gets collision 1 where there is a tile
 *  - Called with the layer, the cell's layer position, and the tile, undefined for an empty cell
 *  - Does nothing in release builds
 *  @param {function(TileLayer, Vector2, number|undefined):void} [callback]
 *  @memberof Editor
 *  @example
 *  setEditorTileCallback((layer, pos, tile)=> layer.setCollisionData(pos, tile === ladderTile ? -1 : tile ? 1 : 0)); */
function setEditorTileCallback(callback) { editorTileCallback = callback; }

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

    const url = editorFetchedURLs.get(map), data = editorTileLayerData(map.layers), hash = editorMapHash(data);
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
        editorLayer = undefined;
}

// called by tileLayersLoad with the layers it made, a map loaded again keeps its layer records, with the new layers
function editorMapLoaded(map, tileLayers, flatLayers)
{
    const record = editorMapList.find((record)=> record.map === map);
    tileLayers.forEach((live, i)=>
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
    editorStrokeEnd();
    saveText(editorMapJSON(record), record.fileName, 'application/json');
}

///////////////////////////////////////////////////////////////////////////////
// autosave

// every page keeps its own autosaves, one for each map by its key
function editorSaveName() { return 'LittleJS editor ' + (globalThis.location?.pathname ?? ''); }
const editorSaves = ()=> readSaveData(editorSaveName(), {});

// a map's name for its autosave, the file it was fetched from, or its size, layer names and data as loaded; a map with
// no file can not tell a changed map from another one, so each is its own
function editorMapKey(map, url, hash)
{ return url ?? `${map.width}x${map.height} ` + map.layers.map((layer)=> layer.name).join() + ' #' + hash; }

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
    writeSaveData(editorSaveName(), saves);
}

// paint every cell of a map's layers from a list of tile data, the tile layers of the map in order
function editorPaintData(record, data)
{
    const all = editorTileLayerData(record.map.layers);
    for (const layer of record.layers)
    {
        const gids = data[all.indexOf(layer.source.data)], {x: width, y: height} = layer.live.size;
        if (gids?.length === width * height)
            gids.forEach((gid, i)=> editorPaint(layer, vec2(i % width, height - 1 - (i / width | 0)), gid));
    }
    editorStroke ? editorStrokeEnd() : editorAutosave(record);
}

// the autosaved edits of a file that changed since, applied as one undo
function editorApplyPending(record)
{
    const saved = record.pending;
    record.pending = undefined;
    saved && editorPaintData(record, saved.layers);
}

// drop the autosaved edits of a file that changed since
function editorDiscardPending(record)
{
    record.pending = undefined;
    const saves = editorSaves();
    delete saves[record.key];
    writeSaveData(editorSaveName(), saves);
}

// put every layer back to the file, as one undo
function editorRevert(record)
{
    record.pending = undefined;
    editorPaintData(record, record.original);
}

///////////////////////////////////////////////////////////////////////////////
// cells and undo

// the strokes that can be undone and redone, each a list of cells with the gid before and after
const editorUndoList = [], editorRedoList = [];
let editorStroke;

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

    const t = editorGidToTile(gid);
    live.setData(pos, t ? new TileLayerData(t.tile, t.direction, t.mirror, color) : new TileLayerData, true);
    if (editorTileCallback)
        editorTileCallback(live, pos.copy(), t?.tile);
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
    for (const cell of redo ? stroke : [...stroke].reverse())
        editorSetCell(cell.layer, cell.pos, redo ? cell.after : cell.before);
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
// panel

let editorPanel, editorPanelParts;

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
    button(top, 'Play', ()=> setEditMode(false), '0');
    button(top, 'Undo', ()=> editorUndo(), 'Ctrl+Z');
    button(top, 'Redo', ()=> editorUndo(true), 'Ctrl+Y');

    // a file that changed under its autosave
    const pending = editorElement('div', editorPanel, 'padding:4px;margin:4px 0;background:#630;border-radius:3px');
    editorElement('div', pending, '', 'The level file changed since your autosaved edits');
    const pendingRow = editorElement('div', pending, 'display:flex;gap:4px;margin-top:4px');
    button(pendingRow, 'Apply edits', ()=> editorApplyPending(editorLayer.record));
    button(pendingRow, 'Drop them', ()=> editorDiscardPending(editorLayer.record));

    const layerSelect = editorElement('select', editorPanel, 'width:100%;margin:4px 0;background:#222;color:#eee');
    layerSelect.onchange = ()=>
    {
        editorLayer = editorLayers()[layerSelect.selectedIndex];
        layerSelect.blur(); // a focused select takes the keys
    };

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

    const file = row();
    button(file, 'Save', ()=> editorSave(editorLayer.record), 'Download the level as Tiled JSON');
    button(file, 'Revert', ()=> editorRevert(editorLayer.record), 'Back to the file, can be undone');
    const status = editorElement('div', editorPanel, 'color:#aaa;margin-top:4px;min-height:1em');
    editorElement('div', editorPanel, 'color:#777;margin-top:4px',
        'Right button erases, Alt+click picks, middle drag pans, wheel zooms');

    editorPanelParts = {pending, layerSelect, palette, status, layers: undefined};
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
    if (!editMode)
    {
        editorPanel && (editorPanel.style.display = 'none');
        return;
    }
    editorPanel || editorPanelInit();
    editorPanel.style.display = '';
    const p = editorPanelParts, layers = editorLayers();

    // the layer list, made again when layers came or went
    if (!p.layers || layers.length !== p.layers.length || layers.some((layer, i)=> layer !== p.layers[i]))
    {
        p.layers = layers;
        p.layerSelect.replaceChildren(...layers.map((layer, i)=>
            editorElement('option', undefined, '', `${layer.source.name || 'Layer ' + i} (${layer.record.fileName})`)));
    }
    p.layerSelect.selectedIndex = layers.indexOf(editorLayer);
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
// plugin

function editorUpdate()
{
    if (!editMode) return;
    editorApplyCamera();

    // 0 plays again, the overlay's 0 does it while the overlay is open; cleared so debugKeysAlways
    // does not toggle it back in the same step
    if (!debugOverlay && keyWasPressed('Digit0'))
    {
        inputClearKey('Digit0');
        setEditMode(false);
        return;
    }

    // keys, the paused game's update does not see them
    const ctrl = keyIsDown('ControlLeft') || keyIsDown('ControlRight') ||
        keyIsDown('MetaLeft') || keyIsDown('MetaRight');
    const shift = keyIsDown('ShiftLeft') || keyIsDown('ShiftRight');
    if (ctrl && keyWasPressed('KeyZ')) editorUndo(shift);
    if (ctrl && keyWasPressed('KeyY')) editorUndo(true);
    if (!ctrl)
    {
        if (keyWasPressed('KeyR')) editorBrush = editorStampTurn(editorBrush, shift);
        if (keyWasPressed('KeyM')) editorBrush = editorStampMirror(editorBrush);
        if (keyWasPressed('KeyE')) editorBrush = editorStampTile(0);
    }

    // the middle button drags the view, the wheel zooms on the point under the mouse
    if (mouseIsDown(1))
        editorCameraPos = editorCameraPos.subtract(screenToWorldDelta(mouseDeltaScreen));
    if (mouseWheel)
    {
        const before = screenToWorld(mousePosScreen);
        editorCameraScale = clamp(editorCameraScale * (1 - mouseWheel/10), 1, 1e3);
        editorApplyCamera();
        editorCameraPos = editorCameraPos.add(before.subtract(screenToWorld(mousePosScreen)));
    }
    editorApplyCamera();

    // the left button paints, or picks with the pick tool or Alt held, the right button erases; a quick click
    // let go before this step still reads as pressed
    const layer = editorLayer?.live.destroyed ? undefined : editorLayer;
    editorHover = layer && editorCellAt(layer.live, screenToWorld(mousePosScreen));
    const left = mouseIsDown(0) || mouseWasPressed(0), right = mouseIsDown(2) || mouseWasPressed(2);
    if (mouseWasPressed(0))
        editorPicking = keyIsDown('AltLeft') || keyIsDown('AltRight');
    if (!editorHover)
        editorLastCell = undefined; // off the layer, coming back in starts the line again
    else if (right)
        editorPaintLine(layer, editorHover, editorStampTile(0));
    else if (editorPicking)
        mouseWasPressed(0) && editorPick(layer, editorHover); // a pick is the press, holding on does not paint
    else if (left)
        editorPaintLine(layer, editorHover);
    if (!mouseIsDown(0) && !mouseIsDown(2))
    {
        editorStrokeEnd();
        editorLastCell = undefined;
    }
}

// called by the engine before the camera goes to WebGL, so the level is drawn with the editor's view, a game may move
// the camera from gameUpdatePost, which runs while paused
function editorPreRender() { editMode && editorApplyCamera(); }

// the layer's edge, a grid when zoomed in, the map's tiles the layer does not show, and the brush under the mouse
function editorRender()
{
    headlessMode || editorPanelUpdate();
    if (!editMode || headlessMode) return;
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
    if (editorCameraScale >= 12)
    {
        for (let x = x0; x <= x1; ++x)
            drawLine(live.pos.add(vec2(x, y0)), live.pos.add(vec2(x, y1)), thin, line);
        for (let y = y0; y <= y1; ++y)
            drawLine(live.pos.add(vec2(x0, y)), live.pos.add(vec2(x1, y)), thin, line);
    }

    // the layer's edge
    const edge = hsl(.55, 1, .6, .8), corners = [vec2(), vec2(width, 0), vec2(width, height), vec2(0, height)];
    corners.forEach((c, i)=> drawLine(live.pos.add(c), live.pos.add(corners[(i + 1) % 4]), thin * 2, edge));

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
