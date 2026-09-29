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
 *  @callback EditorPlayFromCallback - Puts the player at a world position, for the level editor's Play from mouse
 *  @param {Vector2} pos - Where to start playing
 *  @memberof Editor
 */

/**
 *  @callback EditorRestartCallback - Rebuilds the level from the map the level editor changed
 *  @memberof Editor
 */

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
         *  calls it after switching to play; without one there is no Restart button
         *  @type {EditorRestartCallback|undefined} */
        this.onRestart = undefined;
        /** @property {Function|undefined} - Put the player at a world position; with it, the editor's Advanced
         *  section has Play from mouse, which starts play there, Escape at the mouse and Play at the view center
         *  @type {EditorPlayFromCallback|undefined} */
        this.onPlayFrom = undefined;
        /** @property {Array<number>|undefined} - The tiles the palette shows, in its order, for a sheet that also holds
         *  sprites and art that are not level tiles; undefined shows every tile of the sheet
         *  @type {Array<number>|undefined} */
        this.paletteTiles = undefined;
        /** @property {boolean|undefined} - Which level editor opens: true the 3D one, false the 2D one, undefined the
         *  3D one when a level was loaded with level3DLoad and there is a Render3DPlugin
         *  @type {boolean|undefined} */
        this.use3D = undefined;
    }

    /** True while the editor is open, the game is paused under it
     *  @return {boolean} */
    get isOpen() { return editorIsOpen; }

    /** Open the editor, pausing the game; until close(), Escape (the debug key) switches between playing and editing */
    open()
    {
        if (!editorSession)
            editorCameraScale = cameraScale; // a new session starts at the game's zoom, a return keeps the editor's
        editorSession = true;
        editorSetOpen(true);
    }

    /** Close the editor and end its session, the game carries on with the changes and Escape opens the debug
     *  overlay again */
    close()
    {
        editorSession = false;
        editorSetOpen(false);
    }
}

/** The level editor, levelEditor.open() to edit the level, levelEditor.close() to play on with the changes
 *  @type {LevelEditor}
 *  @memberof Editor */
const levelEditor = new LevelEditor;

// if the editor is open, and if it was opened and not exited, while Escape switches between playing and editing
let editorIsOpen = false, editorSession = false;

// if switching to play puts the player at the mouse, and if the panel's Advanced section is shown
let editorPlayFromMouse = false, editorAdvanced = false;

// switch to play in the session, with the player at a position when Play from mouse is on and the game has a hook
function editorPlay(pos)
{
    editorSetOpen(false);
    editorPlayFromMouse && pos && levelEditor.onPlayFrom?.(pos.copy());
}

// the game's pause and camera from before the editor opened, handed back when it closes
let editorGameState;

// the editor's own view, so the game's camera is left where the game had it
let editorCameraPos = vec2(), editorCameraScale = 32;

// the map being edited, the selected object layer's or tile layer's, a level of objects alone has no tile layer
const editorRecord = ()=> (editorObjectLayer ?? editorLayer)?.record;

// the layer being painted, the cell under the mouse, the last cell of a stroke, the last cell a stamp was
// placed on, for a Shift line
let editorLayer, editorHover, editorLastCell, editorLastPlaced;

// the selected area, cells of the layer being edited from min to max, the right button's press while it is held,
// and a left press that only cleared a selection, which paints nothing until let go
let editorSelection, editorRightPress, editorLeftSpent;

// a left drag moving the selection: the layer, the cell pressed and how far it moved, the area and its tiles as
// they were, and with All Layers the ids of the objects in it, by object layer
let editorSelectionDrag;

// if the mouse is over the panel, and where it was last on the level, which is where the editor reads it while it is
// over the panel, so a drag held across it stops at its edge and paints nothing behind it
let editorMouseOnPanel = false, editorMouseScreen = vec2();

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
        editorCameraPos = cameraPos.copy(); // where the game is, the zoom stays the editor's
        setPaused(true);
        setDebugOverlay(false); // out of the way of the level

        // the layer edited last, when it is still there, or the collision layer
        const layers = editorLayers();
        layers.includes(editorLayer) || (editorLayer = layers.find((layer)=> layer.live?.isSolid) ??
            layers.filter((layer)=> !layer.isObjects).at(-1));
        layers.includes(editorObjectLayer) || (editorObjectLayer = editorLayer ? undefined :
            layers.find((layer)=> layer.isObjects)); // a level of objects alone
    }
    else
    {
        editorStrokeEnd();
        editorSelection = editorSelectionDrag = editorRightPress = editorObjectDrag = editorObjectBox = undefined;
        editorObjectSelection.clear();
        editorMouseOnPanel = false; // the panel hides, with no mouseleave
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


// the tile layers of a map's Tiled layers in the order tileLayersLoad makes them, groups flattened
function editorTileLayers(layers, list=[])
{
    for (const layer of layers)
    {
        if (layer.type === 'group')
            editorTileLayers(layer.layers || [], list);
        else if (!layer.type || layer.type === 'tilelayer')
            list.push(layer);
    }
    return list;
}

// the tile layers' data arrays of a map, in the same order
const editorTileLayerData = (layers)=> editorTileLayers(layers).map((layer)=> layer.data);

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
    const objects = editorObjectGroups(map.layers).map((group)=> group.objects ?? []);
    const url = editorFetchedURLs.get(map), hash = editorMapHash(data, objects, editorMapLayout(map));
    const fileName = url?.split(/[?#]/)[0].split('/').pop() || 'level.json';
    const record = {map, url, fileName, key: editorMapKey(map, url, hash), hash,
        original: data.map((layer)=> [...layer]), originalObjects: editorObjectsCopy(objects),
        originalSize: {width: map.width, height: map.height}, layers: []};

    // a new copy of a map takes over from the one before, and maps whose layers are all gone step aside
    editorRetire((other)=> other.key === record.key || editorObjectsGone(other) ||
        other.layers.length && other.layers.every((layer)=> layer.live.destroyed));
    editorMapList.push(record);

    const saved = editorSaves()[record.key];
    if (!saved) return map;
    // an autosave from before the map's shape was in the hash matches on its tiles and objects, and one from before
    // objects were matches on its tiles; one of a resized map is resized to first
    const sameFile = saved.hash === record.hash || !saved.width &&
        (saved.hash === editorMapHash(data, objects) || !saved.objects && saved.hash === editorMapHash(data));
    if ((saved.width ?? map.width) === map.width && (saved.height ?? map.height) === map.height &&
        editorSameData(saved.layers, data) && editorSameData(saved.objects ?? [], objects))
        editorDiscardPending(record);
    else if (!sameFile || !editorResizeMap(map, saved.width ?? map.width, saved.height ?? map.height) ||
        !editorCopyData(data, saved.layers))
    {
        record.pending = saved;
        console.warn(`LittleJS editor: ${record.fileName} changed since its autosaved edits, ` +
            'open the editor (Esc then 0) to apply or drop them');
    }
    else
    {
        editorRestoreObjects(map, saved);
        console.warn(`LittleJS editor: brought back unsaved edits to ${record.fileName}, ` +
            'Save in the editor (Esc then 0) writes them to the file');
    }
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
        list[i].some((entry)=> gone.includes(editorEntryRecord(entry))) && list.splice(i, 1);
    if (gone.includes(editorLayer?.record))
        editorLayer = editorSelection = editorSelectionDrag = undefined; // the selection was an area of that layer
    if (gone.includes(editorObjectLayer?.record))
        editorObjectLayer = undefined;
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

// the files picked to save maps to, kept across reloads in IndexedDB by page and map, which is where a browser
// lets a page keep them; each resolves to undefined when the store can not be used
let editorFileStore =
{
    get: (key)=> editorFileStoreRequest('readonly', (store)=> store.get(key)),
    set: (key, handle)=> editorFileStoreRequest('readwrite', (store)=> handle ? store.put(handle, key) : store.delete(key)),
};

// a request on the editor's file store, resolves to its result, or undefined if anything failed
function editorFileStoreRequest(mode, request)
{
    return new Promise((resolve)=>
    {
        try
        {
            const open = indexedDB.open('LittleJS editor', 1);
            open.onupgradeneeded = ()=> open.result.createObjectStore('files');
            open.onerror = ()=> resolve(undefined);
            open.onsuccess = ()=>
            {
                const db = open.result, done = (result)=> { db.close(); resolve(result); };
                try
                {
                    const r = request(db.transaction('files', mode).objectStore('files'));
                    r.onsuccess = ()=> done(r.result);
                    r.onerror = ()=> done(undefined);
                }
                catch { done(undefined); }
            };
        }
        catch { resolve(undefined); }
    });
}

// the file a map was saved to on an earlier page load, when the browser gives permission to write it again
async function editorRememberedFile(record)
{
    const handle = await editorFileStore.get(editorFileKey(record)), mode = {mode: 'readwrite'};
    try
    {
        if (handle && (await handle.queryPermission(mode) === 'granted' ||
            await handle.requestPermission(mode) === 'granted'))
            return handle;
    }
    catch { } // a handle that can not ask, the picker instead
}
const editorFileKey = (record)=> (globalThis.location?.pathname ?? '') + ' ' + record.key;

// a map as a file Save wrote is the file from then on: Reset to file goes back to it, the autosave keeps only the
// edits since, and a reload of it has nothing to apply; a download can not say it replaced the file, so it does not,
// and neither does a file of another name, a copy, since the game still loads the one it came from
function editorSetBaseline(record, written)
{
    if (record.synthetic) return; // a layer made in code has no file to load it from
    const data = editorTileLayerData(written.layers);
    const objects = editorObjectGroups(written.layers).map((group)=> group.objects ?? []);
    Object.assign(record, {original: data, originalObjects: objects, hash: editorMapHash(data, objects,
        editorMapLayout(written)), originalSize: {width: written.width, height: written.height}});
    record.pending || editorAutosave(record); // edits waiting to be applied keep their autosave
}

// save a map as Tiled JSON: where the browser lets a page write files, Chrome and Edge, to a file picked once and
// written again on each Save after, even after a reload once the browser gives permission, or picked again with
// Save As; elsewhere as a download under the name of the file it came from; resolves to how it saved, undefined
// when the picker was closed
async function editorSave(record, pickAgain=false)
{
    if (!record) return;
    editorStrokeEnd();
    const text = editorMapJSON(record), picker = /** @type {any} */ (globalThis).showSaveFilePicker;
    if (picker)
    {
        try
        {
            if (!pickAgain && !record.fileHandle)
                record.fileHandle = await editorRememberedFile(record);
            if (pickAgain || !record.fileHandle)
            {
                record.fileHandle = await picker.call(globalThis, {suggestedName: record.fileName,
                    types: [{description: 'Tiled JSON', accept: {'application/json': ['.json']}}]});
                editorFileStore.set(editorFileKey(record), record.fileHandle);
            }
            const writable = await record.fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            // the browser gives the picked file's name but not its folder, so the name is what says it is the map's
            if (record.fileHandle.name === record.fileName)
                editorSetBaseline(record, JSON.parse(text));
            return 'written';
        }
        catch (error)
        {
            if (error?.name === 'AbortError') return; // the picker was closed, nothing saved
            record.fileHandle = undefined; // a file it could not write, a download instead, and not kept
            editorFileStore.set(editorFileKey(record), undefined);
        }
    }
    saveText(text, record.fileName, 'application/json');
    return 'downloaded';
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

// a quick hash of a map's tile data, objects and shape, to know when the file changed under its autosave
function editorMapHash(data, objects=[], layout='')
{
    let hash = 2166136261;
    for (const layer of data)
    for (const gid of layer)
        hash = Math.imul(hash ^ gid, 16777619);
    const text = (objects.length ? JSON.stringify(objects) : '') + layout;
    for (let i = 0; i < text.length; ++i)
        hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
}

// a map's shape: its size, tile size, and its tile and object layers by name, in order, so a file whose tiles read
// the same laid out another way is a changed file
function editorMapLayout(map)
{
    const names = (layers)=> layers.map((layer)=> layer.id + ':' + layer.name).join();
    return `${map.width}x${map.height} ${map.tilewidth}x${map.tileheight} ` +
        names(editorTileLayers(map.layers)) + ' | ' + names(editorObjectGroups(map.layers));
}

const editorSameData = (a, b)=> JSON.stringify(a) === JSON.stringify(b);

// copy saved tile data into a map's layers in place, when every layer is the size it was
function editorCopyData(data, saved)
{
    if (saved.length !== data.length || saved.some((layer, i)=> layer.length !== data[i].length)) return false;
    saved.forEach((layer, i)=> { for (let j = layer.length; j--;) data[i][j] = layer[j]; });
    return true;
}

// remember a map's tile data and objects, or forget them when they are back to the file
function editorAutosave(record)
{
    if (record.synthetic) return; // a layer made in code has no load to bring it back in, save it to a file
    const saves = editorSaves(), map = record.map, data = editorTileLayerData(map.layers);
    const objects = editorObjectGroups(map.layers).map((group)=> group.objects ?? []);
    const original = record.originalObjects ?? [], kept = objects.slice();
    while (kept.length > original.length && !kept.at(-1).length)
        kept.pop(); // an Objects layer the editor made, empty again, is not an edit
    const size = record.originalSize, sameSize = map.width === size.width && map.height === size.height;
    if (sameSize && editorSameData(data, record.original) && editorSameData(kept, original))
        delete saves[record.key];
    else
        saves[record.key] = {hash: record.hash, width: map.width, height: map.height, layers: data, objects,
            nextobjectid: map.nextobjectid};
    editorWriteSaves(saves);
}

// paint every cell of a map's layers from a list of tile data, the tile layers of the map in order, and set its
// object layers' objects from a list of them; data of another size resizes the map, which needs the Restart hook
function editorPaintData(record, data, objects, width=record.map.width, height=record.map.height)
{
    editorStrokeEnd();
    if (width !== record.map.width || height !== record.map.height)
    {
        if (!levelEditor.onRestart) return;
        const before = editorMapSnapshot(record);
        editorSetMapSnapshot(record, {width, height, layers: data, objects});
        editorMapChanged(record, before);
        return;
    }
    const all = editorTileLayerData(record.map.layers);
    editorBulkEdit(()=>
    {
        for (const layer of record.layers)
        {
            const gids = data[all.indexOf(layer.source.data)], {x: width, y: height} = layer.live.size;
            if (gids?.length === width * height)
                gids.forEach((gid, i)=> editorPaint(layer, vec2(i % width, height - 1 - (i / width | 0)), gid));
        }
        editorObjectLayers(record).forEach((layer, i)=> objects &&
            editorChangeObjects(layer, (list)=> list.splice(0, list.length, ...editorObjectsCopy(objects[i] ?? []))));
    });
    editorStroke ? editorStrokeEnd() : editorAutosave(record);
}

// the autosaved edits of a file that changed since, applied as one undo; edits that do not fit the file now are
// kept waiting, with their autosave, until they are dropped, and it returns false
function editorApplyPending(record)
{
    const saved = record?.pending;
    if (!saved) return false;
    if (!editorPendingFits(record, saved))
    {
        record.pendingUnfit = true;
        console.warn(`LittleJS editor: the autosaved edits to ${record.fileName} do not fit the file now, ` +
            'they are kept until dropped');
        return false;
    }
    record.pending = record.pendingUnfit = undefined;
    editorPaintData(record, saved.layers, saved.objects, saved.width, saved.height);
    return true;
}

// if autosaved edits fit a map now: as many tile layers, each the size they were saved at, which needs the Restart
// hook when the map is another size, and no objects in object layers the map no longer has
function editorPendingFits(record, saved)
{
    const map = record.map, data = editorTileLayerData(map.layers), groups = editorObjectGroups(map.layers).length;
    const width = saved.width ?? map.width, height = saved.height ?? map.height;
    return (width === map.width && height === map.height || !!levelEditor.onRestart) &&
        saved.layers?.length === data.length && saved.layers.every((layer)=> layer.length === width * height) &&
        (saved.objects ?? []).every((objects, i)=> i < groups || !objects.length);
}

// drop the autosaved edits of a file that changed since
function editorDiscardPending(record)
{
    if (!record) return;
    record.pending = record.pendingUnfit = undefined;
    const saves = editorSaves();
    delete saves[record.key];
    editorWriteSaves(saves);
}

// put every layer back to the file, its size too, as one undo
function editorRevert(record)
{
    if (!record || record.synthetic) return; // a layer made in code has no file
    record.pending = record.pendingUnfit = undefined;
    const {width, height} = record.originalSize ?? record.map;
    editorPaintData(record, record.original, record.originalObjects, width, height);
}

///////////////////////////////////////////////////////////////////////////////
// resizing

// change a map's size in place, at the right and top, so the tiles and objects keep their places from the bottom
// left; a row added goes at the start of each layer's data, Tiled's rows run from the top, and objects past the new
// edges are dropped; returns false for a size it can not have
function editorResizeMap(map, width, height)
{
    if (!(width >= 1 && height >= 1 && width % 1 === 0 && height % 1 === 0)) return false;
    if (width === map.width && height === map.height) return true;
    const oldWidth = map.width, added = height - map.height;
    for (const layer of editorTileLayers(map.layers))
    {
        const old = [...layer.data];
        layer.data.length = 0;
        for (let row = 0; row < height; ++row)
        for (let x = 0; x < width; ++x)
        {
            const oldRow = row - added;
            layer.data.push(x < oldWidth && oldRow >= 0 && old[x + oldRow * oldWidth] || 0);
        }
        layer.width = width;
        layer.height = height;
    }
    // an object on the map before and off it after is dropped, one that was already off it stays
    const {tilewidth=1, tileheight=1} = map, oldHeight = map.height;
    const inside = (object, w, h)=> object.x >= 0 && object.x < w * tilewidth && object.y > 0 && object.y <= h * tileheight;
    for (const group of editorObjectGroups(map.layers))
    {
        group.objects &&= group.objects.filter((object)=>
        {
            const was = inside(object, oldWidth, oldHeight);
            object.y += added * tileheight;
            return !was || inside(object, width, height);
        });
    }
    map.width = width;
    map.height = height;
    return true;
}

// a map's size, tiles and objects, for an undo
function editorMapSnapshot(record)
{
    const map = record.map, objects = editorObjectGroups(map.layers).map((group)=> group.objects ?? []);
    return editorObjectsCopy({width: map.width, height: map.height, layers: editorTileLayerData(map.layers), objects});
}

// give a map a size, tiles and objects, the game's Restart hook makes its layers again
function editorSetMapSnapshot(record, snapshot)
{
    const map = record.map;
    editorResizeMap(map, snapshot.width, snapshot.height);
    editorCopyData(editorTileLayerData(map.layers), snapshot.layers);
    editorRestoreObjects(map, snapshot);
    for (const group of editorObjectGroups(map.layers).slice(snapshot.objects.length))
        group.objects = []; // an Objects layer the editor made since
    editorClearSelections();
}

// the selections go when the map changes size, they are cells and objects of the old one
function editorClearSelections()
{
    editorSelection = editorSelectionDrag = editorLastCell = editorHover = undefined;
    editorObjectSelection.clear();
}

// a map changed whole, the undo can put it back; it is autosaved, and the game makes its level again, in the editor
function editorMapChanged(record, before)
{
    const stroke = [{resize: record, before, after: editorMapSnapshot(record)}];
    editorUndoList.push(stroke);
    editorRedoList.length = 0;
    editorChanged(stroke);
}

// resize a map, as one undo; a game without the Restart hook can not make its layers again, so it can not
function editorResize(record, width, height)
{
    const map = record?.map;
    if (!map || record.synthetic || record.pending || !levelEditor.onRestart) return false;
    if (width === map.width && height === map.height) return false;
    editorStrokeEnd();
    const before = editorMapSnapshot(record);
    if (!editorResizeMap(map, width, height)) return false;
    editorClearSelections();
    editorMapChanged(record, before);
    return true;
}

///////////////////////////////////////////////////////////////////////////////
// cells and undo

// the strokes that can be undone and redone, each a list of cells with the gid before and after, and of object
// layers with their objects before and after, or a resize with the map before and after
const editorUndoList = [], editorRedoList = [];
const editorEntryRecord = (entry)=> entry.resize ?? (entry.layer ?? entry.objectLayer).record;
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

// undo the stroke being made, with no undo entry, as if it was never made
function editorStrokeCancel()
{
    const stroke = editorStroke;
    editorStroke = undefined;
    if (!stroke) return;
    editorBulkEdit(()=>
    {
        for (const entry of [...stroke].reverse())
            entry.objectLayer ? editorSetObjects(entry.objectLayer, entry.before) :
                editorSetCell(entry.layer, entry.pos, entry.before);
    });
    editorRedraw(stroke);
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
        for (const entry of redo ? stroke : [...stroke].reverse())
        {
            if (entry.resize)
                editorSetMapSnapshot(entry.resize, redo ? entry.after : entry.before);
            else if (entry.objectLayer)
                editorSetObjects(entry.objectLayer, redo ? entry.after : entry.before);
            else
                editorSetCell(entry.layer, entry.pos, redo ? entry.after : entry.before);
        }
    });
    editorChanged(stroke);
}

// after a change the tile layers it touched draw again whole, so a game's onRedraw decoration sees the new tiles,
// and the maps it touched are autosaved; a resized map is made again by the game, with the editor staying open
function editorChanged(stroke)
{
    editorRedraw(stroke);
    for (const record of new Set(stroke.map(editorEntryRecord)))
        editorAutosave(record);
    stroke.some((entry)=> entry.resize) && levelEditor.onRestart?.();
}

// the tile layers a stroke touched draw again whole
function editorRedraw(stroke)
{
    for (const layer of new Set(stroke.filter((entry)=> entry.layer).map((entry)=> entry.layer)))
        layer.live.destroyed || layer.live.redraw();
}

///////////////////////////////////////////////////////////////////////////////
// objects

// the object layers of a map's Tiled layers in order, groups flattened
function editorObjectGroups(layers, list=[])
{
    for (const layer of layers || [])
    {
        if (layer.type === 'group')
            editorObjectGroups(layer.layers, list);
        else if (layer.type === 'objectgroup')
            list.push(layer);
    }
    return list;
}

// the editor's object layers of a map, each {record, isObjects, group, name, instances}: group is the Tiled object
// layer, undefined for one not made yet, and instances what the game made for each object id; a map with no object
// layer gets one to place objects in once the game has added a type, made in the map the first time it is used
function editorObjectLayers(record)
{
    if (!record || record.synthetic) return [];
    record.objectLayers ||= editorObjectGroups(record.map.layers).map((group)=>
        ({record, isObjects: true, group, name: group.name || 'Objects', instances: new Map}));
    if (!record.objectLayers.length && objectLayersTypes.size)
        record.objectLayers.push({record, isObjects: true, group: undefined, name: 'Objects', instances: new Map});
    return record.objectLayers;
}

// a new Tiled object layer named Objects, on top of a map
function editorNewObjectGroup(map)
{
    const id = map.nextlayerid ?? map.layers.length + 1, group = {draworder: 'topdown', id, name: 'Objects',
        objects: [], opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0};
    map.nextlayerid = id + 1;
    map.layers.push(group);
    return group;
}

// the Tiled object layer of an editor object layer, made the first time it is needed
function editorObjectGroup(layer) { return layer.group ||= editorNewObjectGroup(layer.record.map); }

// the next object id of a map, as Tiled counts them, and past every id the map has, for a map with no nextobjectid
// or one an autosave left behind
function editorNextObjectId(map)
{
    const ids = editorObjectGroups(map.layers).flatMap((group)=> (group.objects ?? []).map((object)=> object.id));
    const id = max(map.nextobjectid ?? 1, ...ids.map((id)=> id + 1));
    map.nextobjectid = id + 1;
    return id;
}

// an object's world position, as objectLayersLoad places it
function editorObjectPos(record, object)
{
    const {height=0, tilewidth=1, tileheight=1} = record.map;
    return vec2(object.x / tilewidth, height - object.y / tileheight);
}

// set an object's position in the map from a world position
function editorObjectSetPos(record, object, pos)
{
    const {height=0, tilewidth=1, tileheight=1} = record.map;
    object.x = pos.x * tilewidth;
    object.y = (height - pos.y) * tileheight;
}

// called by objectLayersLoad for each object it read, the editor keeps what the game made by the object's id
function editorObjectMade(map, group, object, made)
{
    const record = editorMapList.find((record)=> record.map === map);
    const layer = editorObjectLayers(record).find((layer)=> layer.group === group);
    layer && (made ? layer.instances.set(object.id, made) : layer.instances.delete(object.id));
}

// a copy of objects as undo and autosave keep them, and an object layer's objects now
const editorObjectsCopy = (value)=> JSON.parse(JSON.stringify(value));
const editorObjectList = (layer)=> editorObjectsCopy(layer.group?.objects ?? []);

// set an object layer's objects to a list and bring the game's objects in line: one gone is destroyed, a new one
// made, a moved one moved, one with changed properties given them; a type made by an arrow function, like a player
// start, is called again when its object changes, and a class is not made again for an object the game let go of
function editorSetObjects(layer, list)
{
    const {record, instances} = layer, group = editorObjectGroup(layer);
    const before = new Map(group.objects.map((object)=> [object.id, object]));
    group.objects = editorObjectsCopy(list);
    const ids = new Set(group.objects.map((object)=> object.id));
    for (const [id, made] of instances)
    {
        if (ids.has(id)) continue;
        made.destroy?.();
        instances.delete(id);
    }
    for (const object of group.objects)
    {
        const old = before.get(object.id), made = instances.get(object.id);
        const name = object.type || object.class, type = objectLayersTypes.get(name);
        if (!type || old && editorSameData(old, object)) continue;
        if (!old || (old.type || old.class) !== name || !type.make.prototype)
        {
            // new, of a new type, or a function to call again
            made?.destroy?.();
            const result = objectLayersMake(record.map, object);
            result ? instances.set(object.id, result) : instances.delete(object.id);
        }
        else if (made && !made.destroyed)
        {
            // only what the edit changed, so moving an object keeps its health and the rest of its state from play
            if ('pos' in made && (old.x !== object.x || old.y !== object.y))
                made.pos = editorObjectPos(record, object);
            const was = objectLayersProperties(type, old), now = objectLayersProperties(type, object);
            for (const name in now)
                editorSameData(was[name], now[name]) || (made[name] = now[name]);
        }
    }
}

// change an object layer's objects as part of the stroke being made: change edits a copy of the list; one stroke's
// changes to one layer are one undo entry, so a drag is one undo
function editorChangeObjects(layer, change)
{
    if (!layer || layer.record.pending) return false; // its autosaved edits wait to be applied or dropped first
    const before = editorObjectList(layer), after = editorObjectsCopy(before);
    change(after);
    if (editorSameData(before, after)) return false;
    editorSetObjects(layer, after);
    const last = editorStroke?.at(-1);
    if (last?.objectLayer === layer)
        last.after = after;
    else
        (editorStroke ||= []).push({objectLayer: layer, before, after});
    return true;
}

// set an object's property as Tiled keeps it, only where it differs from its type's default, a color as #AARRGGBB
// and a Vector2 as the string x,y
function editorObjectSetProperty(object, name, value, defaultValue)
{
    if (Number.isInteger(defaultValue) && isNumber(value))
        value = round(value); // an integer stays one, as Tiled keeps an int
    const properties = (object.properties ?? []).filter((property)=> property.name !== name);
    const text = (v)=> isColor(v) ? v.toString() : isVector2(v) ? v.x + ',' + v.y : JSON.stringify(v);
    if (text(value) !== text(defaultValue))
    {
        const hex = isColor(value) && value.toString();
        properties.push(hex ? {name, type: 'color', value: '#' + hex.slice(7, 9) + hex.slice(1, 7)} :
            isVector2(value) ? {name, type: 'string', value: text(value)} :
            {name, type: typeof value === 'boolean' ? 'bool' : typeof value === 'string' ? 'string' :
            Number.isInteger(defaultValue) ? 'int' : 'float', value});
    }
    if (properties.length)
        object.properties = properties;
    else
        delete object.properties;
}

// copy saved objects into a map's object layers, making an Objects layer for any it saved that the map lacks
function editorRestoreObjects(map, saved)
{
    const groups = editorObjectGroups(map.layers);
    (saved.objects ?? []).forEach((objects, i)=>
    {
        (groups[i] ?? editorNewObjectGroup(map)).objects = editorObjectsCopy(objects);
    });
    if (saved.nextobjectid > (map.nextobjectid ?? 1))
        map.nextobjectid = saved.nextobjectid;
}

///////////////////////////////////////////////////////////////////////////////
// object editing

// the object layer being edited, undefined while a tile layer is; the ids of the objects selected in it; the object
// brush and the last objects copied, each a list of {type, properties, offset} placed at the mouse plus the offset;
// a left drag moving the selected objects, and a right drag's box
let editorObjectLayer, editorObjectSelection = new Set, editorObjectBrush, editorObjectClipboard;
let editorObjectDrag, editorObjectBox;

// make a layer the one being edited, a tile layer or an object layer; an object layer keeps a tile layer of its map
// as editorLayer, for All Layers
function editorSelectLayer(layer)
{
    editorStrokeEnd();
    editorLastCell = editorObjectDrag = editorRightPress = editorObjectBox = undefined; // presses stay on their layer
    editorSelectionDrag = undefined; // a move so far is kept, the stroke ended
    editorObjectSelection.clear();
    if (layer.isObjects)
    {
        editorObjectLayer = layer;
        if (editorLayer?.record !== layer.record)
            editorLayer = layer.record.layers[0]; // none for a level of objects alone
    }
    else
    {
        editorObjectLayer = undefined;
        editorLayer = layer;
    }
}

// the size of an object for picking it, what the game made it, or a cell
function editorObjectSize(layer, object)
{
    const made = layer.instances.get(object.id);
    return made && !made.destroyed && isVector2(made.size) ? made.size : vec2(1);
}

// the object under a world position, the one drawn last first
function editorObjectAt(layer, pos)
{
    const objects = layer.group?.objects ?? [];
    for (let i = objects.length; i--;)
    {
        const object = objects[i], center = editorObjectPos(layer.record, object);
        const size = editorObjectSize(layer, object);
        if (abs(pos.x - center.x) <= size.x / 2 && abs(pos.y - center.y) <= size.y / 2)
            return object;
    }
}

// the ids of the objects whose positions are inside the box between two world positions
function editorObjectsIn(layer, a, b)
{
    const low = vec2(min(a.x, b.x), min(a.y, b.y)), high = vec2(max(a.x, b.x), max(a.y, b.y));
    return (layer.group?.objects ?? []).filter((object)=>
    {
        const pos = editorObjectPos(layer.record, object);
        return pos.x >= low.x && pos.y >= low.y && pos.x <= high.x && pos.y <= high.y;
    }).map((object)=> object.id);
}

// the brush takes an object's type and properties
function editorPickObject(object)
{ editorObjectBrush = [{type: object.type || object.class, properties: editorObjectsCopy(object.properties ?? []), offset: vec2()}]; }

// a new Tiled point object for a brush's object, at a world position, with the map's next id
function editorNewObject(record, {type, properties}, pos)
{
    const object = {id: editorNextObjectId(record.map), name: '', type, point: true, rotation: 0, visible: true,
        width: 0, height: 0, x: 0, y: 0};
    properties.length && (object.properties = editorObjectsCopy(properties));
    editorObjectSetPos(record, object, pos);
    return object;
}

// place an object brush's objects at a position plus each one's offset, as one undo
function editorPlaceObjects(layer, pos, brush)
{
    editorChangeObjects(layer, (list)=>
    {
        for (const object of brush)
            list.push(editorNewObject(layer.record, object, pos.add(object.offset)));
    });
    editorStrokeEnd();
}

// the selected objects of the object layer being edited
function editorSelectedObjects()
{ return (editorObjectLayer?.group?.objects ?? []).filter((object)=> editorObjectSelection.has(object.id)); }

// remove the selected objects, as one undo
function editorDeleteObjects()
{
    if (!editorObjectSelection.size) return false;
    const selection = editorObjectSelection;
    editorStrokeEnd();
    editorChangeObjects(editorObjectLayer, (list)=>
        list.splice(0, list.length, ...list.filter((object)=> !selection.has(object.id))));
    editorObjectSelection = new Set;
    editorStrokeEnd();
    return true;
}

// the selected objects into the brush, their offsets from the lowest corner of their positions, and the selection
// cleared so the next click places them
function editorCopyObjects()
{
    const objects = editorSelectedObjects();
    if (!objects.length) return false;
    const positions = objects.map((object)=> editorObjectPos(editorObjectLayer.record, object));
    const low = vec2(min(...positions.map((p)=> p.x)), min(...positions.map((p)=> p.y)));
    editorObjectBrush = editorObjectClipboard = objects.map((object, i)=> ({type: object.type || object.class,
        properties: editorObjectsCopy(object.properties ?? []), offset: positions[i].subtract(low)}));
    editorObjectSelection.clear();
    return true;
}

// copy the selected objects, then remove them, as one undo
function editorCutObjects()
{
    const selection = new Set(editorObjectSelection);
    if (!editorCopyObjects()) return false;
    editorObjectSelection = selection;
    return editorDeleteObjects();
}

// the last copied objects back into the brush
function editorPasteObjects()
{
    if (!editorObjectClipboard) return false;
    editorObjectBrush = editorObjectClipboard;
    return true;
}

// the mouse on an object layer: the left places, selects and drags objects, the right picks one or box-selects,
// Shift adding and Ctrl taking away
function editorUpdateObjects(space)
{
    const layer = editorObjectLayer, record = layer.record, mouse = screenToWorld(editorMouseScreen);
    const snap = editorSnap;
    const shift = keyIsDown('ShiftLeft') || keyIsDown('ShiftRight');
    const ctrl = keyIsDown('ControlLeft') || keyIsDown('ControlRight') || keyIsDown('MetaLeft') || keyIsDown('MetaRight');
    editorHover = undefined;

    // the right button: a click picks the object under the mouse, or clears the selection, a drag box-selects
    if (mouseWasPressed(2))
        editorRightPress = {screen: mousePosScreen.copy(), world: mouse.copy(), drag: false};
    const press = editorRightPress;
    if (press)
    {
        press.drag ||= mousePosScreen.distance(press.screen) > max(4, editorCameraScale / 2);
        editorObjectBox = press.drag ? {a: press.world, b: mouse} : undefined;
        if (!mouseIsDown(2))
        {
            const hit = !press.drag && editorObjectAt(layer, mouse);
            const ids = press.drag ? editorObjectsIn(layer, press.world, mouse) : hit ? [hit.id] : [];
            if (press.drag || hit && (shift || ctrl))
            {
                shift || ctrl || editorObjectSelection.clear();
                for (const id of ids)
                    ctrl ? editorObjectSelection.delete(id) : editorObjectSelection.add(id);
            }
            else if (hit)
                editorPickObject(hit);
            else
                editorObjectSelection.clear();
            editorRightPress = editorObjectBox = undefined;
        }
        return;
    }

    // the left button: on an object selects it and starts a drag of the selection, on empty space the first click
    // with a selection only clears it, otherwise it places the brush
    if (mouseWasPressed(0) && !space)
    {
        const hit = editorObjectAt(layer, mouse);
        if (hit)
        {
            if (!editorObjectSelection.has(hit.id))
                editorObjectSelection = new Set([hit.id]);
            editorObjectDrag = {start: snap(mouse), from: new Map(editorSelectedObjects().map((object)=>
                [object.id, editorObjectPos(record, object)]))};
        }
        else if (editorObjectSelection.size)
            editorObjectSelection.clear();
        else if (editorObjectBrush)
            editorPlaceObjects(layer, snap(mouse), editorObjectBrush);
    }
    const drag = editorObjectDrag;
    if (drag && mouseIsDown(0))
    {
        const delta = snap(mouse).subtract(drag.start);
        editorChangeObjects(layer, (list)=>
        {
            for (const object of list)
            {
                const from = drag.from.get(object.id);
                from && editorObjectSetPos(record, object, from.add(delta));
            }
        });
    }
    if (!mouseIsDown(0))
    {
        editorObjectDrag = undefined;
        editorStrokeEnd();
    }
}

///////////////////////////////////////////////////////////////////////////////
// editing

// every tile layer in the game, as the editor's records, in render order, then the object layers of their maps, and
// of the maps the game loaded objects alone from
function editorLayers()
{
    const tiles = engineObjects.filter((o)=> o instanceof TileLayer && !o.destroyed)
        .sort((a, b)=> a.renderOrder - b.renderOrder).map(editorLayerRecord);
    const records = [...new Set(tiles.map((layer)=> layer.record))];
    for (const record of editorMapList)
        record.synthetic || record.layers.length || records.includes(record) || records.push(record);
    return [...tiles, ...records.flatMap(editorObjectLayers)];
}

// if a map of objects alone has nothing left in the game, the level moved on, a marker that is no game object counts
// as nothing
const editorObjectsGone = (record)=> !record.layers.length &&
    editorObjectLayers(record).every((layer)=> [...layer.instances.values()].every((made)=> !made.destroy || made.destroyed));

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

// a stamp turned a quarter turn clockwise on screen, or back, its cells, their tiles and its objects together; cell
// (x, y) goes to (y, width - 1 - x), so the bottom row becomes the left column, its left end at the top
function editorStampTurn(stamp, back=false)
{
    for (let turns = back ? 3 : 1; turns--;)
    {
        const {width, height} = stamp;
        const objects = stamp.objects?.map((object)=> ({...object, offset: vec2(object.offset.y, width - object.offset.x)}));
        stamp = {width: height, height: width, grids: stamp.grids.map((grid)=>
        {
            const turned = [];
            for (let y = height; y--;)
            for (let x = width; x--;)
                turned[y + (width - 1 - x) * height] = editorGidTurn(grid[x + y * width]);
            return turned;
        }), ...(objects && {objects})};
    }
    return stamp;
}

// a stamp mirrored left to right, its cells, their tiles and its objects together
function editorStampMirror(stamp)
{
    const {width, height} = stamp;
    const objects = stamp.objects?.map((object)=> ({...object, offset: vec2(width - object.offset.x, object.offset.y)}));
    return {width, height, grids: stamp.grids.map((grid)=>
    {
        const mirrored = [];
        for (let y = height; y--;)
        for (let x = width; x--;)
            mirrored[width - 1 - x + y * width] = editorGidMirror(grid[x + y * width]);
        return mirrored;
    }), ...(objects && {objects})};
}

// the brush's tile when it is one tile, with its turn and mirror, undefined for the Erase brush or a bigger stamp
function editorBrushTile()
{
    const {width, height, grids} = editorBrush;
    return width === 1 && height === 1 && grids.length === 1 ? editorGidToTile(grids[0][0]) : undefined;
}

// the brush takes the tile in a cell, an empty cell gives the Erase brush
function editorPick(layer, pos) { editorBrush = editorStampTile(editorGidAt(layer, pos) || 0); }

// a palette slot into the brush: slot 0 is the Erase brush, slot n the palette's nth tile, keeping a one tile
// brush's turn; on an object layer slot n is the nth object type
function editorPalettePick(slot)
{
    if (editorObjectLayer)
    {
        // on an object layer the palette is the types the game added, in order
        const type = [...objectLayersTypes.keys()][slot];
        type && (editorObjectBrush = [{type, properties: [], offset: vec2()}]);
        return;
    }
    const t = editorBrushTile();
    const tile = slot && (editorPaletteTiles(editorLayer)[slot - 1]?.tile ?? slot - 1); // every tile, in order
    editorBrush = editorStampTile(slot ? editorTileToGid(tile, t?.direction, t?.mirror) : 0);
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

// clear the selected area, with All Layers the objects in it too, as one undo
function editorClear()
{
    if (!editorSelection) return;
    editorStrokeEnd(); // a drag held while Delete is pressed is an undo of its own
    editorBulkEdit(()=>
    {
        for (const layer of editorSelectionLayers())
            layer.record.pending || editorSelectionCells(layer.live, (cell)=> editorPaint(layer, cell, 0));
        if (editorAllLayers && editorLayer)
        {
            const corner = editorLayer.live.pos.add(editorSelection.min);
            const far = editorLayer.live.pos.add(editorSelection.max).add(vec2(1));
            for (const objectLayer of editorObjectLayers(editorLayer.record))
            {
                const ids = new Set(editorObjectsIn(objectLayer, corner, far));
                ids.size && editorChangeObjects(objectLayer, (list)=>
                    list.splice(0, list.length, ...list.filter((object)=> !ids.has(object.id))));
            }
        }
    });
    editorStrokeEnd();
}

// the objects of a map's object layers inside a tile area, each {group, type, properties, offset}: the index of its
// object layer, and its offset from the area's bottom left corner, as a stamp keeps them
function editorAreaObjects(layer, area)
{
    const corner = layer.live.pos.add(area.min), far = layer.live.pos.add(area.max).add(vec2(1));
    return editorObjectLayers(layer.record).flatMap((objectLayer, group)=>
    {
        const ids = new Set(editorObjectsIn(objectLayer, corner, far));
        return (objectLayer.group?.objects ?? []).filter((object)=> ids.has(object.id)).map((object)=>
            ({group, type: object.type || object.class, properties: editorObjectsCopy(object.properties ?? []),
            offset: editorObjectPos(layer.record, object).subtract(corner)}));
    });
}

// place a stamp's objects with the stamp's bottom left on a cell of a tile layer, into its map's object layers
function editorPlaceStampObjects(layer, cell, stamp)
{
    const targets = editorObjectLayers(layer.record), corner = layer.live.pos.add(cell);
    targets.forEach((target, group)=>
    {
        const objects = (stamp.objects ?? []).filter((object)=> (targets[object.group] ? object.group : 0) === group);
        objects.length && editorChangeObjects(target, (list)=>
        {
            for (const object of objects)
                list.push(editorNewObject(layer.record, object, corner.add(object.offset)));
        });
    });
}

// the tiles of an area on the selection layers as a stamp, its empty cells see-through
function editorSelectionStamp(area)
{
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
    return {width, height, grids};
}

// the selected area into the brush as a stamp, its empty cells see-through, with All Layers the objects in it too,
// and the selection cleared so the next click paints it
function editorCopy()
{
    const area = editorSelection;
    if (!area || !editorLayer) return false;
    const stamp = editorSelectionStamp(area), objects = editorAllLayers ? editorAreaObjects(editorLayer, area) : [];
    if (!objects.length && stamp.grids.every((grid)=> grid.every((gid)=> gid === undefined)))
        return false; // nothing there, the brush stays as it was
    editorBrush = editorClipboard = objects.length ? {...stamp, objects} : stamp;
    editorSelection = undefined;
    return true;
}

// start dragging the selection from a cell in it, with All Layers the objects in it go too
function editorSelectionDragStart(layer, cell)
{
    editorStrokeEnd();
    const area = editorSelection, objects = [];
    if (editorAllLayers)
    {
        const corner = layer.live.pos.add(area.min), far = layer.live.pos.add(area.max).add(vec2(1));
        for (const objectLayer of editorObjectLayers(layer.record))
        {
            const ids = new Set(editorObjectsIn(objectLayer, corner, far));
            ids.size && objects.push({objectLayer, ids});
        }
    }
    editorSelectionDrag = {layer, start: cell, delta: vec2(), area, stamp: editorSelectionStamp(area), objects};
}

// move the dragged selection to a cell, as the stroke being made: taken back, then its area cleared and its tiles
// and objects put down that far from where they were; letting go ends the stroke, one undo
function editorSelectionDragTo(cell)
{
    const drag = editorSelectionDrag, delta = cell.subtract(drag.start), {layer, area, stamp} = drag;
    if (delta.x === drag.delta.x && delta.y === drag.delta.y) return;
    drag.delta = delta;
    editorStrokeCancel();
    editorSelection = {min: area.min.add(delta), max: area.max.add(delta)};
    if (!delta.x && !delta.y) return; // back where it was, no change
    editorBulkEdit(()=>
    {
        for (const [target] of editorStampTargets(layer, stamp))
        for (let y = area.min.y; y <= area.max.y; ++y)
        for (let x = area.min.x; x <= area.max.x; ++x)
        {
            const from = vec2(x, y);
            from.arrayCheck(target.live.size) && editorPaint(target, from, 0);
        }
        editorPaintStamp(layer, editorSelection.min, stamp);
        for (const {objectLayer, ids} of drag.objects)
            editorChangeObjects(objectLayer, (list)=>
            {
                for (const object of list)
                    ids.has(object.id) && editorObjectSetPos(layer.record, object,
                        editorObjectPos(layer.record, object).add(delta));
            });
    });
    editorStroke && editorRedraw(editorStroke);
}

// put the dragged selection back where it was, with nothing to undo
function editorSelectionDragCancel()
{
    editorStrokeCancel();
    editorSelection = editorSelectionDrag.area;
    editorSelectionDrag = undefined;
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
    'Left drag a selection: move it · Esc or right click: put it back',
    'Middle drag or Space+drag: pan · Wheel or pinch: zoom',
    '1-9: layer · Esc: play and edit · 0: exit the editor',
    'F: fill · Delete: clear the selection',
    'Ctrl+C / X / V: copy, cut, paste · Ctrl+Z / Y: undo, redo',
    'R, Shift+R: turn · M: mirror · E: erase · G: grid · ?: keys',
    'Objects layer: left places or selects, drag moves, right picks or box-selects, Delete removes, Ctrl+C / X / V',
];

// the hint line, for what is held and whether there is a selection
function editorHint()
{
    if (keyIsDown('Space')) return 'Drag to pan';
    if (editorObjectLayer)
        return editorObjectSelection.size ? 'Selection: drag moves · Delete removes · Ctrl+C copy · Ctrl+X cut · click to clear' :
            'Left place / select · drag moves · Right pick / drag select · Delete removes';
    if (editorSelection)
        return 'Selection: drag moves · F fill · Delete clear · Ctrl+C copy · Ctrl+X cut · click to clear';
    if (keyIsDown('ShiftLeft') || keyIsDown('ShiftRight')) return 'Shift: line from the last tile';
    return 'Left paint · Right pick / drag select · F fill · Space or middle drag pans · ? keys';
}

// what the brush is, in words
function editorBrushLabel()
{
    if (editorObjectLayer)
    {
        const brush = editorObjectBrush;
        return !brush ? 'Brush: none' : brush.length > 1 ? `Brush: ${brush.length} objects` : `Brush: ${brush[0].type}`;
    }
    const {width, height, grids} = editorBrush, t = editorBrushTile();
    if (t)
        return `Brush: tile ${t.tile}` + (t.direction ? `, turned ${t.direction * 90}°` : '') +
            (t.mirror ? ', mirrored' : '');
    if (width === 1 && height === 1 && grids.length === 1) return grids[0][0] === 0 ? 'Brush: Erase' : 'Brush: empty';
    const objects = editorBrush.objects?.length;
    return `Brush: ${width}x${height} stamp` + (grids.length > 1 ? `, ${grids.length} layers` : '') +
        (objects ? `, ${objects} object${objects > 1 ? 's' : ''}` : '');
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
    editorPanel.addEventListener('mouseenter', ()=> editorMouseOnPanel = true);
    editorPanel.addEventListener('mouseleave', ()=> editorMouseOnPanel = false);

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
    button(top, 'Play', ()=> editorPlay(editorCameraPos), 'Esc, and Esc again comes back to the editor');
    const restart = button(top, 'Restart', editorRestart, 'Rebuild the level and play it');
    button(top, 'Exit', ()=> levelEditor.close(), '0, then Esc opens the debug overlay again');
    const undo = row();
    button(undo, 'Undo', ()=> editorUndo(), 'Ctrl+Z');
    button(undo, 'Redo', ()=> editorUndo(true), 'Ctrl+Y');
    button(undo, 'Keys', ()=> editorHelp = !editorHelp, 'Every control, ?');

    // a file that changed under its autosave
    const pending = editorElement('div', editorPanel, 'padding:4px;margin:4px 0;background:#630;border-radius:3px');
    editorElement('div', pending, '', 'The level file changed since your autosaved edits');
    const pendingRow = editorElement('div', pending, 'display:flex;gap:4px;margin-top:4px');
    button(pendingRow, 'Apply edits', ()=> editorApplyPending(editorRecord()));
    button(pendingRow, 'Drop them', ()=> editorDiscardPending(editorRecord()));
    const pendingUnfit = editorElement('div', pending, 'color:#fb8;margin-top:4px',
        'They do not fit the file now, its layers or size changed; they are kept until dropped');

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
        const slots = editorObjectLayer ? objectLayersTypes.size : editorPaletteTiles(editorLayer).length + 1;
        slot < slots && e.offsetX < editorPaletteColumns * cell && editorPalettePick(slot);
    };
    const brush = editorElement('div', editorPanel, 'color:#ccc;margin:2px 0');
    const properties = editorElement('div', editorPanel, 'margin:4px 0;padding:4px;background:#222;border-radius:3px');

    const file = row();
    // Save says so for a moment when it saved, Save As shows where a page can write files
    const saved = (b, label)=> (result)=> result && (b.textContent = 'Saved', setTimeout(()=> b.textContent = label, 1e3));
    const save = button(file, 'Save', ()=> editorSave(editorRecord()).then(saved(save, 'Save')),
        'Save, to the file picked the first time, or a download');
    const saveAs = button(file, 'Save As', ()=> editorSave(editorRecord(), true).then(saved(saveAs, 'Save As')),
        'Save As, to a file picked again');
    /** @type {any} */ (globalThis).showSaveFilePicker || (saveAs.style.display = 'none');

    // the Advanced section, shown by its heading: Play from mouse, the level's size, Reset to file
    const advancedToggle = editorElement('button', editorPanel,
        'width:100%;padding:3px;cursor:pointer;margin-top:4px;text-align:left');
    advancedToggle.onclick = ()=> { editorAdvanced = !editorAdvanced; advancedToggle.blur(); };
    const advanced = editorElement('div', editorPanel, 'margin:4px 0;padding:4px;background:#222;border-radius:3px');
    const playFromLabel = editorElement('label', advanced, 'display:flex;gap:6px;align-items:center;margin:2px 0');
    playFromLabel.title = 'Escape starts play with the player at the mouse, Play at the view center';
    const playFrom = editorElement('input', playFromLabel);
    playFrom.type = 'checkbox';
    playFrom.onchange = ()=> { editorPlayFromMouse = playFrom.checked; playFrom.blur(); };
    editorElement('span', playFromLabel, '', 'Play from mouse');
    const sizeRow = editorElement('div', advanced, 'display:flex;gap:4px;align-items:center;margin:4px 0');
    sizeRow.title = 'The level grows or shrinks at the right and top, can be undone';
    editorElement('span', sizeRow, '', 'Size');
    const sizeInput = ()=>
    {
        const input = editorElement('input', sizeRow, 'width:48px;background:#333;color:#eee');
        input.type = 'number';
        input.min = input.step = '1';
        input.onkeydown = (e)=> { e.key === 'Enter' && resizeLevel(); }; // returning false would block typing
        return input;
    };
    const sizeX = sizeInput();
    editorElement('span', sizeRow, '', '×');
    const sizeY = sizeInput();
    const resize = editorElement('button', sizeRow, 'flex:1;padding:3px;cursor:pointer', 'Resize');
    const resizeLevel = ()=>
    {
        // up to 1000 a side from here, editorResize takes any size from code
        const size = (input)=> clamp(parseInt(input.value) || 1, 1, 1e3);
        editorResize(editorRecord(), size(sizeX), size(sizeY));
        resize.blur(); sizeX.blur(); sizeY.blur(); // the fields show the size again
    };
    resize.onclick = resizeLevel;
    const reset = editorElement('button', advanced, 'width:100%;padding:3px;cursor:pointer;margin-top:4px',
        'Reset to file');
    reset.title = 'Put the level back to the file it was loaded from, or last saved to, can be undone';
    reset.onclick = ()=> { editorRevert(editorRecord()); reset.blur(); };
    const storage = editorElement('div', editorPanel, 'color:#f86;margin-top:4px',
        'Autosave failed, storage is full: Save to a file');
    const status = editorElement('div', editorPanel, 'color:#aaa;margin-top:4px;min-height:1em');
    const hint = editorElement('div', editorPanel, 'color:#8ab;margin-top:4px');
    const help = editorElement('div', editorPanel, 'color:#aaa;margin-top:4px;border-top:1px solid #444;padding-top:4px');
    for (const line of editorHelpLines)
        editorElement('div', help, 'margin:2px 0', line);
    button(help, 'Close', ()=> editorHelp = false, '?');

    editorPanelParts = {pendingUnfit, reset, advancedToggle, advanced, playFromLabel, playFrom, sizeRow, sizeX, sizeY, resize, restart, pending, layerRow, allLayers, turns, palette, brush, properties, status, storage, hint, help, layers: undefined};
}

// the palette's cell size in pixels and how many to a row
const editorPaletteCell = 30, editorPaletteColumns = 8;

// the tiles a layer's palette shows, each its index and the tile info it draws with: the game's
// levelEditor.paletteTiles, or every tile up to the image's edge without the blank ones at the end, a tile of one
// flat color; found once for each layer and list
function editorPaletteTiles(layer)
{
    const live = layer?.live, image = live?.tileInfo?.textureInfo?.image, list = levelEditor.paletteTiles;
    if (list && live)
    {
        if (layer.palette?.list !== list)
            layer.palette = {list, tiles: list.map((tile)=> ({tile, tileInfo: editorTileInfo(live, tile)}))};
        return layer.palette.tiles;
    }
    if (!image) return [];
    if (layer.palette?.image === image) return layer.palette.tiles;

    const tiles = [];
    for (let i = 0; i < 4096; ++i)
    {
        const t = editorTileInfo(live, i);
        if (t.pos.x + t.size.x > image.width || t.pos.y + t.size.y > image.height) break;
        tiles.push({tile: i, tileInfo: t});
    }
    try
    {
        // an image from a file page can not be read back, then every tile is kept
        const context = createCanvasContext(image.width, image.height, true);
        context.drawImage(image, 0, 0);
        const blank = (t)=>
        {
            const {pos, size} = t.tileInfo, pixels = new Uint32Array(context.getImageData(pos.x, pos.y, size.x,
                size.y).data.buffer);
            return pixels.every((p)=> p === pixels[0]);
        };
        while (tiles.length > 1 && blank(tiles.at(-1)))
            tiles.pop();
    }
    catch {}
    layer.palette = {image, tiles};
    return tiles;
}

// draw the palette of object types, each its icon or the start of its name, the brush's type outlined
function editorPaletteDrawObjects(canvas)
{
    const cell = editorPaletteCell, columns = editorPaletteColumns, types = [...objectLayersTypes];
    canvas.style.display = types.length ? '' : 'none';
    canvas.width = columns * cell;
    canvas.height = ceil(types.length / columns) * cell;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.font = '10px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    types.forEach(([name, {tileInfo}], i)=>
    {
        const x = i % columns * cell, y = (i / columns | 0) * cell, image = tileInfo?.textureInfo?.image;
        if (image)
            context.drawImage(image, tileInfo.pos.x, tileInfo.pos.y, tileInfo.size.x, tileInfo.size.y,
                x + 2, y + 2, cell - 4, cell - 4);
        else
        {
            context.fillStyle = '#ccc';
            context.fillText(name.slice(0, 4), x + cell / 2, y + cell / 2);
        }
        if (editorObjectBrush?.length !== 1 || editorObjectBrush[0].type !== name) return;
        context.strokeStyle = '#4af';
        context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    });
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
    tiles.forEach(({tileInfo: {pos, size}}, i)=>
    {
        const slot = i + 1, x = slot % columns * cell, y = (slot / columns | 0) * cell;
        context.drawImage(image, pos.x, pos.y, size.x, size.y, x + 2, y + 2, cell - 4, cell - 4);
    });

    // the brush's slot outlined, when it is one tile the palette shows or Erase
    const t = editorBrushTile(), erase = !t && editorBrush.width === 1 && editorBrush.height === 1 &&
        editorBrush.grids[0][0] === 0, shown = t ? tiles.findIndex((p)=> p.tile === t.tile) : -1;
    const selected = erase ? 0 : shown >= 0 ? shown + 1 : -1;
    if (selected < 0) return;
    context.strokeStyle = '#4af';
    context.strokeRect(selected % columns * cell + 1, (selected / columns | 0) * cell + 1, cell - 2, cell - 2);
}

// while playing in an editing session, a tag in the corner says how to get back to the editor
let editorTag;
function editorTagUpdate()
{
    const show = editorSession && !editorIsOpen;
    if (!show && !editorTag) return;
    editorTag ||= editorElement('div', document.body, 'position:fixed;bottom:8px;left:8px;padding:4px 8px;' +
        'background:#111d;color:#eee;font:12px monospace;border-radius:4px;z-index:9999;pointer-events:none');
    editorTag.textContent = `${debugKey === 'Escape' ? 'Esc' : debugKey}: edit level`;
    editorTag.style.display = show ? '' : 'none';
}

// shows or hides the panel, and shows what changed since the last frame
function editorPanelUpdate()
{
    editorTagUpdate();
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
            // its number key and name, cut short when the row runs out of room, the whole name in its tooltip
            const name = layer.isObjects ? layer.name : layer.source.name;
            const b = editorElement('button', undefined, 'flex:1;min-width:28px;padding:3px;cursor:pointer;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis', (i < 9 ? String(i + 1) : '·') +
                (name ? ' ' + name : ''));
            b.title = `${name || 'Layer ' + (i + 1)} (${layer.record.fileName})`;
            b.onclick = ()=> { editorSelectLayer(layer); b.blur(); };
            return b;
        }));
    }
    layers.forEach((layer, i)=> p.layerRow.children[i].style.outline =
        layer === (editorObjectLayer ?? editorLayer) ? '2px solid #4af' : '');
    p.allLayers.textContent = editorAllLayers ? 'All Layers: on' : 'All Layers: off';
    p.brush.textContent = editorBrushLabel();
    p.hint.textContent = editorHint();
    p.help.style.display = editorHelp ? '' : 'none';
    p.storage.style.display = editorSaveFailed ? '' : 'none';
    p.restart.style.display = levelEditor.onRestart ? '' : 'none';
    p.advancedToggle.textContent = editorAdvanced ? 'Advanced ▾' : 'Advanced ▸';
    p.advanced.style.display = editorAdvanced ? '' : 'none';
    p.playFromLabel.style.display = levelEditor.onPlayFrom ? 'flex' : 'none';
    p.playFrom.checked = editorPlayFromMouse;

    // the level's size, shown until a field is being typed in; without the Restart hook it can not change
    const record = editorRecord(), map = record?.map;
    const canResize = !!levelEditor.onRestart && !record?.synthetic && !record?.pending;
    p.sizeRow.style.display = map ? 'flex' : 'none';
    if (map && !p.sizeRow.contains(document.activeElement))
    {
        p.sizeX.value = String(map.width);
        p.sizeY.value = String(map.height);
    }
    p.sizeX.disabled = p.sizeY.disabled = p.resize.disabled = !canResize;
    p.resize.title = canResize ? '' : 'Resizing needs levelEditor.onRestart, to make the level again';
    p.turns.style.display = editorObjectLayer ? 'none' : ''; // the tile brush's, not an object layer's
    p.pending.style.display = record?.pending ? '' : 'none';
    p.pendingUnfit.style.display = record?.pendingUnfit ? '' : 'none';
    p.reset.style.display = record?.synthetic ? 'none' : ''; // a layer made in code has no file

    // the palette, drawn again when the layer or the brush changed, a change makes a new brush
    const live = editorLayer?.live;
    const paletteLayer = editorObjectLayer ?? editorLayer, paletteBrush = editorObjectLayer ? editorObjectBrush : editorBrush;
    if (p.paletteLayer !== paletteLayer || p.paletteBrush !== paletteBrush)
    {
        p.paletteLayer = paletteLayer;
        p.paletteBrush = paletteBrush;
        editorObjectLayer ? editorPaletteDrawObjects(p.palette) : editorPaletteDraw(p.palette, editorLayer);
    }
    editorPropertiesUpdate(p.properties);

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
    r: (shift)=> editorObjectLayer ? false : editorBrush = editorStampTurn(editorBrush, shift),
    m: ()=> editorObjectLayer ? false : editorBrush = editorStampMirror(editorBrush),
    e: ()=> editorObjectLayer ? false : editorBrush = editorStampTile(0),
    g: ()=> { editorGrid = !editorGrid; },
    '?': ()=> { editorHelp = !editorHelp; },
    f: ()=> editorObjectLayer ? false : editorFill(),
    Delete: ()=> editorObjectLayer ? editorDeleteObjects() : editorClear(),
    Backspace: ()=> editorObjectLayer ? editorDeleteObjects() : editorClear(),
};
const editorCtrlKeys =
{
    z: (shift)=> editorUndo(shift),
    y: ()=> editorUndo(true),
    c: ()=> editorObjectLayer ? editorCopyObjects() : editorCopy(),
    x: ()=> editorObjectLayer ? editorCutObjects() : editorCut(),
    v: ()=> editorObjectLayer ? editorPasteObjects() : editorPaste(),
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
    if (editorSelectionDrag && !(debugKey && e.code === debugKey))
    {
        // a key ends a selection drag where it is, an undo of its own, so Delete or undo acts on what is there;
        // the debug key, Escape, is left to the update, which puts the selection back
        editorStrokeEnd();
        editorSelectionDrag = undefined;
    }
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
// objects in the panel and the level

// the position a click places or drags to, a cell center unless the grid is off
function editorSnap(pos) { return editorGrid ? pos.floor().add(vec2(.5)) : pos.copy(); }

// if the properties box has an input for a default's type, a number, boolean, string or Color
const editorPropertyEditable = (value)=>
    ['number', 'boolean', 'string'].includes(typeof value) || isColor(value) || isVector2(value);

// set a property of the one selected object, from the properties box, as one undo
function editorSetSelectedProperty(name, value)
{
    const selected = editorSelectedObjects(), object = selected[0];
    const type = object && objectLayersTypes.get(object.type || object.class), defaultValue = type?.defaults[name];
    if (selected.length !== 1 || !editorPropertyEditable(defaultValue) ||
        (isColor(defaultValue) ? !isColor(value) : isVector2(defaultValue) ? !isVector2(value) :
        typeof value !== typeof defaultValue)) return false;
    editorStrokeEnd();
    editorChangeObjects(editorObjectLayer, (list)=>
        editorObjectSetProperty(list.find((o)=> o.id === object.id), name, value, type.defaults[name]));
    editorStrokeEnd();
    return true;
}

// if the game has nothing where the level puts an object: gone in play, moved in play, or not a game object, like a
// player start, so the editor draws its icon there
function editorObjectIsGhost(layer, object)
{
    const made = layer.instances.get(object.id);
    return !made || made.destroyed || !isVector2(made.pos) ||
        made.pos.distance(editorObjectPos(layer.record, object)) > .01;
}

// a world box's outline
function editorDrawBox(center, size, color, width)
{
    const half = size.scale(.5), corners = [vec2(-1, -1), vec2(1, -1), vec2(1, 1), vec2(-1, 1)]
        .map((c)=> center.add(c.multiply(half)));
    corners.forEach((c, i)=> drawLine(c, corners[(i + 1) % 4], width, color, undefined, 0, glEnable, false));
}

// an object type's icon, or a box with its name when it has none
function editorDrawObjectIcon(name, pos, size, alpha)
{
    const tileInfo = objectLayersTypes.get(name)?.tileInfo;
    if (tileInfo)
        drawTile(pos, size, tileInfo, hsl(0, 0, 1, alpha), 0, undefined, undefined, glEnable, false);
    else
    {
        drawRect(pos, size, hsl(0, 0, 0, alpha * .6), undefined, undefined, false);
        drawText(name ?? '?', pos, min(size.x, size.y) * .3, hsl(0, 0, 1, alpha));
    }
}

// the objects of the object layer being edited: each one's outline, yellow when selected, a ghost of one the game does
// not have where the level puts it, the box being dragged, and the brush's objects at the mouse
function editorRenderObjects(thin)
{
    const layer = editorObjectLayer, record = layer.record;
    for (const object of layer.group?.objects ?? [])
    {
        const pos = editorObjectPos(record, object), size = editorObjectSize(layer, object);
        if (editorObjectIsGhost(layer, object))
            editorDrawObjectIcon(object.type || object.class, pos, size, .5);
        const selected = editorObjectSelection.has(object.id);
        editorDrawBox(pos, size, selected ? hsl(.15, 1, .6) : hsl(.55, 1, .6, .6), thin * (selected ? 3 : 1.5));
    }
    const box = editorObjectBox;
    if (box)
        editorDrawBox(box.a.add(box.b).scale(.5), box.b.subtract(box.a).abs(), hsl(.15, 1, .6), thin * 2);
    else if (editorObjectBrush && !editorObjectDrag && !editorObjectSelection.size && !mouseIsDown(1))
    {
        const pos = editorSnap(screenToWorld(mousePosScreen));
        for (const object of editorObjectBrush)
            editorDrawObjectIcon(object.type, pos.add(object.offset), vec2(1), .5);
    }
}

// the properties box: an input for each default of the one selected object's type, made again when the selection or
// the object changes, but not while one of its inputs is being typed in
function editorPropertiesUpdate(box)
{
    const selected = editorObjectLayer ? editorSelectedObjects() : [], object = selected.length === 1 && selected[0];
    const type = object && objectLayersTypes.get(object.type || object.class);
    const key = type ? editorObjectLayer.record.fileName + object.id + JSON.stringify(object.properties) : '';
    box.style.display = key ? '' : 'none';
    if (box.dataset.key === key || box.contains(document.activeElement)) return;
    box.dataset.key = key;
    box.replaceChildren();
    if (!type) return;

    editorElement('div', box, 'color:#aaa;margin-bottom:2px', `${object.type || object.class} ${object.id}`);
    const values = objectLayersProperties(type, object);
    for (const [name, defaultValue] of Object.entries(type.defaults))
    {
        const row = editorElement('label', box, 'display:flex;gap:6px;align-items:center;margin:2px 0');
        editorElement('span', row, 'flex:1', name);
        const value = values[name], input = editorElement('input', row, 'width:110px;background:#222;color:#eee');
        const set = (v)=> { editorSetSelectedProperty(name, v); input.blur(); };
        if (typeof defaultValue === 'boolean')
        {
            input.type = 'checkbox';
            input.checked = !!value;
            input.onchange = ()=> set(input.checked);
        }
        else if (isColor(defaultValue))
        {
            input.type = 'color';
            input.value = value.toString(false);
            input.onchange = ()=> { const color = rgb().setHex(input.value); color.a = value.a; set(color); };
        }
        else if (typeof defaultValue === 'number')
        {
            input.type = 'number';
            input.step = Number.isInteger(defaultValue) ? '1' : 'any';
            input.value = String(value);
            input.onchange = ()=> { const v = parseFloat(input.value); isNumber(v) && set(v); };
        }
        else if (typeof defaultValue === 'string')
        {
            input.type = 'text';
            input.value = String(value ?? '');
            input.onchange = ()=> set(input.value);
        }
        else if (isVector2(defaultValue))
        {
            // x and y, the row's second input for y
            const y = editorElement('input', row, 'width:52px;background:#222;color:#eee');
            input.style.width = '52px';
            for (const [field, v] of [[input, value.x], [y, value.y]])
            {
                field.type = 'number';
                field.step = 'any';
                field.value = String(v);
                field.onchange = ()=>
                {
                    // both checked before a vector is made of them, an emptied or half typed field shows its value again
                    const px = parseFloat(input.value), py = parseFloat(y.value);
                    if (isNumber(px) && isNumber(py))
                        set(vec2(px, py));
                    else
                        input.value = String(value.x), y.value = String(value.y);
                    field.blur();
                };
            }
        }
        else
        {
            // a type it has no input for, an array say, shown as it is
            input.readOnly = true;
            input.value = String(value);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// plugin

function editorUpdate()
{
    // Escape while dragging a selection puts it back, and stays in the editor
    if (editorSelectionDrag && debugKey && keyWasPressed(debugKey))
    {
        inputClearKey(debugKey);
        editorSelectionDragCancel();
        return;
    }

    // in an editing session Escape, the debug key, switches between playing and editing; taken, so the debug
    // overlay waits till the session ends
    if (editorSession && debugKey && keyWasPressed(debugKey))
    {
        inputClearKey(debugKey);
        if (editorIsOpen)
        {
            editorApplyCamera(); // the mouse is read through the editor's view
            editorPlay(screenToWorld(mousePosScreen));
        }
        else
            editorSetOpen(true);
        return;
    }
    if (!editorIsOpen) return;
    editorApplyCamera();

    // 0 exits the editor, the overlay's 0 does it while the overlay is open; cleared so debugKeysAlways
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
        layer && layer !== (editorObjectLayer ?? editorLayer) && editorSelectLayer(layer); // a drag does not carry across
    }

    // the middle button, or Space with the left, drags the view
    const space = keyIsDown('Space');
    if (mouseIsDown(1) || space && mouseIsDown(0))
        editorCameraPos = editorCameraPos.subtract(screenToWorldDelta(mouseDeltaScreen));
    editorApplyCamera();

    editorMouseOnPanel || (editorMouseScreen = mousePosScreen.copy());
    if (editorObjectLayer)
        return editorUpdateObjects(space);
    const layer = editorLayer?.live.destroyed ? undefined : editorLayer, mouse = screenToWorld(editorMouseScreen);
    editorHover = layer && !editorMouseOnPanel && editorCellAt(layer.live, mouse); // over the panel, a line starts again

    // a right press while dragging the selection puts it back, and is taken so it does not pick or select
    if (editorSelectionDrag && mouseWasPressed(2))
    {
        inputClearKey(2);
        editorSelectionDragCancel();
    }

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

    // the left button paints; a press in the selection drags it, the first press outside it only clears it, Shift
    // draws a line from the last tile placed; a quick click let go before this step still reads as pressed
    if (mouseWasPressed(0) && !space && editorSelection)
    {
        const {min: a, max: b} = editorSelection, cell = editorHover;
        if (cell && !layer.record.pending && cell.x >= a.x && cell.y >= a.y && cell.x <= b.x && cell.y <= b.y)
            editorSelectionDragStart(layer, cell);
        else
            editorSelection = undefined;
        editorLeftSpent = true;
    }
    if (editorSelectionDrag && layer)
        editorSelectionDragTo(editorCellClamped(layer.live, mouse));
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
        if (mouseWasPressed(0) && editorBrush.objects)
            editorPlaceStampObjects(layer, editorHover, editorBrush); // once a click, not along the drag
    }
    if (!mouseIsDown(0))
    {
        editorStrokeEnd();
        editorLastCell = editorSelectionDrag = undefined;
        editorLeftSpent = false;
    }
}

// switch to play and have the game rebuild its level from the changed map, when it has a hook for that
function editorRestart()
{
    if (!levelEditor.onRestart) return;
    editorSetOpen(false); // ends a held stroke, and hands back the game's pause and camera, Escape comes back
    levelEditor.onRestart();
}

// called by the engine before the camera goes to WebGL, so the level is drawn with the editor's view, a game may move
// the camera from gameUpdatePost, which runs while paused
function editorPreRender() { editorIsOpen && editorApplyCamera(); }

// the layer's edge, or the map's for a level of objects alone, a grid when zoomed in, the map's tiles the layer does not
// show, and the brush under the mouse
function editorRender()
{
    headlessMode || editorPanelUpdate();
    if (!editorIsOpen || headlessMode) return;
    const layer = editorLayer?.live.destroyed ? undefined : editorLayer;
    if (!layer && !editorObjectLayer) return;

    // the area drawn, the tile layer's, or for a level of objects alone the map's, where objectLayersLoad puts it
    const map = editorRecord().map, live = layer?.live, source = layer?.source;
    const pos = live ? live.pos : vec2(), size = live ? live.size : vec2(map.width, map.height);
    const {x: width, y: height} = size;

    // the cells on screen
    const low = screenToWorld(vec2(0, mainCanvasSize.y)).subtract(pos);
    const high = screenToWorld(vec2(mainCanvasSize.x, 0)).subtract(pos);
    const x0 = max(0, floor(low.x)), y0 = max(0, floor(low.y));
    const x1 = min(width, ceil(high.x)), y1 = min(height, ceil(high.y));

    // ghosts, cells the map has that the layer does not show: markers a game made objects of, tiles broken in play
    const ghost = hsl(0, 0, 1, .4);
    for (let x = x0; live && !editorObjectLayer && x < x1; ++x)
    for (let y = y0; y < y1; ++y)
    {
        const t = editorGidToTile(source.data[x + (height - 1 - y) * width]);
        if (t && live.getData(vec2(x, y)).tile === undefined)
            drawTile(live.pos.add(vec2(x + .5, y + .5)), vec2(1), editorTileInfo(live, t.tile), ghost,
                t.direction * PI/2, t.mirror, undefined, glEnable, false);
    }

    // a grid once the cells are big enough to see one
    const line = hsl(0, 0, 1, .12), thin = 1 / editorCameraScale;
    if (editorGrid && editorCameraScale >= 12)
    {
        for (let x = x0; x <= x1; ++x)
            drawLine(pos.add(vec2(x, y0)), pos.add(vec2(x, y1)), thin, line, undefined, 0, glEnable, false);
        for (let y = y0; y <= y1; ++y)
            drawLine(pos.add(vec2(x0, y)), pos.add(vec2(x1, y)), thin, line, undefined, 0, glEnable, false);
    }

    // the layer's edge
    const outline = (a, b, color, width)=>
    {
        const corners = [vec2(a.x, a.y), vec2(b.x, a.y), vec2(b.x, b.y), vec2(a.x, b.y)];
        corners.forEach((c, i)=> drawLine(pos.add(c), pos.add(corners[(i + 1) % 4]), width, color, undefined, 0, glEnable, false));
    };
    outline(vec2(), size, hsl(.55, 1, .6, .8), thin * 2);

    // the selection, and the line Shift would draw
    if (editorSelection && !editorObjectLayer)
        outline(editorSelection.min, editorSelection.max.add(vec2(1)), hsl(.15, 1, .6), thin * 3);
    const last = editorLastPlaced, shift = keyIsDown('ShiftLeft') || keyIsDown('ShiftRight');
    if (shift && editorHover && last?.layer === layer && !mouseIsDown(0))
        drawLine(live.pos.add(last.pos).add(vec2(.5)), live.pos.add(editorHover).add(vec2(.5)), thin * 2,
            hsl(.55, 1, .6, .6), undefined, 0, glEnable, false);

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
                drawTile(center, vec2(1), editorTileInfo(live, t.tile), hsl(0, 0, 1, .7), t.direction * PI/2, t.mirror, undefined, glEnable, false);
            else if (gid === 0)
                drawRect(center, vec2(1), hsl(0, 1, .5, .3), undefined, undefined, false);
        }
        drawRect(live.pos.add(editorHover).add(vec2(w / 2, h / 2)), vec2(w, h), hsl(.55, 1, .6, .25), undefined, undefined, false);
    }
    editorObjectLayer && editorRenderObjects(thin);
}

debug && engineAddPlugin(editorUpdate, editorRender);

// the editor's own listeners for letter shortcuts and the wheel, the engine's input reads keys by position
if (debug && globalThis.document?.addEventListener)
{
    document.addEventListener('keydown', editorOnKeyDown);
    document.addEventListener('wheel', editorOnWheel, {passive: true});
}
