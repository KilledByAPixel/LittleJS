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
    }
    else
    {
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

// called by tileLayersLoad before it reads a map, keeps a record of a map it has not seen
function editorMapRestore(map)
{
    if (!editorMapList.some((record)=> record.map === map))
    {
        const url = editorFetchedURLs.get(map);
        const fileName = url?.split(/[?#]/)[0].split('/').pop() || 'level.json';
        editorMapList.push({map, url, layers: [], fileName});
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
    }
}

function editorPreRender() { editMode && editorApplyCamera(); }

function editorRender() {}

debug && engineAddPlugin(editorUpdate, editorRender, undefined, undefined, editorPreRender);
