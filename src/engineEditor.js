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

// what a click paints, the tool, the layer being painted, the cell under the mouse, the last cell of a stroke
const editorBrush = {tile: 0, direction: 0, mirror: false};
let editorTool = 'pencil', editorLayer, editorHover, editorLastCell;

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
    const url = editorFetchedURLs.get(map), data = editorTileLayerData(map.layers);
    const fileName = url?.split(/[?#]/)[0].split('/').pop() || 'level.json';
    const record = {map, url, fileName, key: editorMapKey(map, url), hash: editorMapHash(data),
        original: data.map((layer)=> [...layer]), layers: []};
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
    return map;
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

// a map's name for its autosave, the file it was fetched from, or its size and layer names
function editorMapKey(map, url)
{ return url ?? `${map.width}x${map.height} ` + map.layers.map((layer)=> layer.name).join(); }

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
    if (before === gid) return before;
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

// the brush takes the tile in a cell, an empty cell picks the eraser
function editorPick(layer, pos)
{
    const t = editorGidToTile(layer.source.data[pos.x + (layer.live.size.y - 1 - pos.y) * layer.live.size.x]);
    if (t)
    {
        Object.assign(editorBrush, t);
        editorTool = 'pencil';
    }
    else
        editorTool = 'eraser';
}

// paint every cell on the line from the last cell, so a fast drag leaves no gaps
function editorPaintLine(layer, pos)
{
    const from = editorLastCell ?? pos, steps = max(abs(pos.x - from.x), abs(pos.y - from.y));
    const {tile, direction, mirror} = editorBrush;
    const gid = editorTool === 'eraser' ? 0 : editorTileToGid(tile, direction, mirror);
    for (let i = 0; i <= steps; ++i)
        editorPaint(layer, from.lerp(pos, steps ? i / steps : 1).floor(), gid);
    editorLastCell = pos;
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
        if (keyWasPressed('KeyR')) editorBrush.direction = (editorBrush.direction + (shift ? 3 : 1)) % 4;
        if (keyWasPressed('KeyM')) editorBrush.mirror = !editorBrush.mirror;
        if (keyWasPressed('KeyB')) editorTool = 'pencil';
        if (keyWasPressed('KeyE')) editorTool = 'eraser';
        if (keyWasPressed('KeyI')) editorTool = 'pick';
    }

    // the right or middle button drags the view, the wheel zooms on the point under the mouse
    if (mouseIsDown(1) || mouseIsDown(2))
        editorCameraPos = editorCameraPos.subtract(screenToWorldDelta(mouseDeltaScreen));
    if (mouseWheel)
    {
        const before = screenToWorld(mousePosScreen);
        editorCameraScale = clamp(editorCameraScale * (1 - mouseWheel/10), 1, 1e3);
        editorApplyCamera();
        editorCameraPos = editorCameraPos.add(before.subtract(screenToWorld(mousePosScreen)));
    }
    editorApplyCamera();

    // the left button paints, or picks with the pick tool or Alt held
    const layer = editorLayer?.live.destroyed ? undefined : editorLayer;
    editorHover = layer && editorCellAt(layer.live, screenToWorld(mousePosScreen));
    if (mouseIsDown(0) && editorHover)
    {
        if (editorTool === 'pick' || keyIsDown('AltLeft') || keyIsDown('AltRight'))
            editorPick(layer, editorHover);
        else
            editorPaintLine(layer, editorHover);
    }
    if (!mouseIsDown(0))
    {
        editorStrokeEnd();
        editorLastCell = undefined;
    }
}

function editorPreRender() { editMode && editorApplyCamera(); }

// the layer's edge, a grid when zoomed in, the map's tiles the layer does not show, and the brush under the mouse
function editorRender()
{
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

    // the brush where it would paint
    if (editorHover)
    {
        const center = live.pos.add(editorHover).add(vec2(.5));
        if (editorTool === 'pencil')
            drawTile(center, vec2(1), editorTileInfo(live, editorBrush.tile), hsl(0, 0, 1, .7),
                editorBrush.direction * PI/2, editorBrush.mirror);
        drawRect(center, vec2(1), hsl(.55, 1, .6, .25));
    }
}

debug && engineAddPlugin(editorUpdate, editorRender, undefined, undefined, editorPreRender);
