/**
 * LittleJS 3D Level Plugin
 * - A 3D level is a list of objects, each a type name, a position, and a rotation, scale and properties where
 *   they are not the default, kept as plain JSON that can be written by hand
 * - level3DAddType names the types a game makes them from, as objectLayersAddType does in 2D
 * - level3DLoad makes every object of a level
 * - Box, Sphere, Cylinder and Light are built in, to block out and light a level with no code
 * - The 3D level editor, in debug builds, edits the level a game loaded
 * @namespace Level3D
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

const LEVEL3D_VERSION = 1; // the format a level's littlejs3D names

// the types a level's objects are made from, by name
const level3DTypes = new Map;

// the scale each object had when it was made, the level's scale multiplies it
const level3DBaseScale = new WeakMap;

/** Add a type of object, so level3DLoad makes one wherever a level has an object of that type
 *  - The name is a string because minified builds rename classes
 *  - A class, or any function with a prototype, is made with new make(pos3D, properties); an arrow function is
 *    called as make(pos3D, properties), for what is not an object, like a player start
 *  - properties is the defaults with the object's own values over them, and each of the type's own is also set on
 *    what was made; a property the type has no default for is in properties and is not set
 *  - Give a class a constructor of its own that takes the position: one that hands every argument on to
 *    EngineObject3D would hand it the properties as its mesh
 *  - An EngineObject3D then gets the object's rotation, and its scale times the scale it was made with
 *  - Adding a name again replaces it, Box, Sphere, Cylinder and Light too
 *  @param {string} name - The type the objects have in the level
 *  @param {Function} make - A class made at each object's position, or a function called with it
 *  @param {Object} [defaults] - Properties of each one made, the level editor shows inputs for them
 *  @param {TileInfo} [tileInfo] - An icon for the level editor
 *  @memberof Level3D
 *  @example
 *  level3DAddType('Crate', Crate, {health: 3});
 *  level3DAddType('PlayerStart', (pos)=> playerStart = pos); */
function level3DAddType(name, make, defaults={}, tileInfo)
{
    ASSERT(isStringLike(name), 'object type name must be a string');
    ASSERT(typeof make === 'function', 'make must be a class or function');
    ASSERT(!!defaults && typeof defaults === 'object', 'defaults must be an object');
    level3DTypes.set(String(name), {make, defaults, tileInfo});
}

/** Add a type that is a mesh and nothing more, a static prop with no class to write, for a built mesh or a model
 *  - Each object has a color and a solid property, solid collides as the box around the mesh
 *  @param {string} name - The type the objects have in the level
 *  @param {Mesh} mesh - Shared by every object of the type
 *  @param {TileInfo} [tileInfo] - Its texture
 *  @param {Color} [color] - Its color, an object's own color property goes over it
 *  @memberof Level3D
 *  @example
 *  level3DAddMesh('Tree', treeMesh, tile(4)); */
function level3DAddMesh(name, mesh, tileInfo, color=WHITE)
{
    ASSERT(mesh instanceof Mesh, 'mesh must be a Mesh');
    ASSERT(isColor(color), 'color must be a color');
    level3DAddType(name, function(pos, properties) { return level3DMakeShape(pos, properties, mesh, tileInfo); },
        {color, solid: false}, tileInfo);
}

/** Make the objects of a level, each from the type added for its name
 *  - The level is an object: {littlejs3D: 1, objects: [{id, type, pos: [x, y, z]}, ...]}, and {} is a new one
 *  - rotation is pitch, yaw and roll in degrees, scale is a number for each axis, both left out when they are
 *    the default, and properties holds what differs from the type's defaults
 *  - A Color property is a #rrggbb or #rrggbbaa string, a Vector2 or Vector3 an array, as the default says
 *  - An object whose type was not added is skipped, with a warning in debug builds
 *  - What a file written by hand gets wrong uses the default: a value that is not of its default's type
 *  - An object its type can not make is skipped with an error in debug builds, where asserts throw, and the rest
 *    of the level is made
 *  - A level may hold a map of blocks, in a voxels block: pos, its corner, size, its cells along x, y and z, and
 *    blocks, runs of a count and a type along x, then y, then z; it is made a VoxelMap, the first of what is
 *    returned, see level3DVoxelSetup for its sheet
 *  - A level may hold a terrain, in a terrain block: pos, its center, size, its size in the world along x and z,
 *    height, how tall a full height is, color, and heights, rows of 0 to 1 from -z to +z, each from -x to +x; it
 *    is made a HeightMap, returned with what else was made; paint, when it has it, colors its samples: colors, a
 *    list, and cells, runs of a count and a color along the rows, 0 for the terrain's own and 1 the list's first
 *  - A level may hold prefabs of its own, in a prefabs block, each by its name as level3DAddPrefab takes it; they
 *    are added before its objects are made, one the game added itself keeps its place
 *  - A level may set the scene too, in a scene block beside its objects: sky, three colors for straight up, the
 *    horizon and straight down, ambient, how much of them lights the scene, .5 when not given, sunDirection and
 *    sunColor, fog, its start and end, fogColor, the horizon color when not given, and shadows; what the block
 *    leaves out stays as the game set it, and a level with no block changes nothing
 *  @param {Object} level - The level, the level editor edits this same object
 *  @return {Array<any>} - What each object's type made, a function that made nothing is left out
 *  @memberof Level3D */
function level3DLoad(level)
{
    ASSERT(!!level && typeof level === 'object', 'a level is an object, {} for a new one');
    ASSERT(!(level.littlejs3D > LEVEL3D_VERSION), 'the level was made by a newer LittleJS');
    editor3DLevelLoaded(level); // debug builds: the 3D editor takes the level, its autosaved edits go in first
    level3DPrefabsAdd(level.prefabs);
    level3DSceneApply(level.scene);
    const made = [], map = level3DVoxelMap = level3DVoxelsMake(level.voxels);
    map && made.push(map);
    const terrain = level3DTerrainMap = level3DTerrainMake(level.terrain);
    terrain && made.push(terrain);
    for (const object of isArray(level.objects) ? level.objects : [])
    {
        if (!object || typeof object !== 'object') continue;
        const result = level3DMake(object);
        editor3DObjectMade(object, result); // debug builds link it for the 3D editor
        result && made.push(result);
    }
    return made;
}

// the sheet a level's block map is made with, and what sets each one up, see level3DVoxelSetup; and the map the
// level loaded last made, the one the 3D editor paints
let level3DVoxelTiles, level3DVoxelSetupMap, level3DVoxelMap;

/** How a level's block map is made: the sheet its blocks show tiles of, and a function to set it up
 *  - A level's voxels block makes a VoxelMap when the level loads, with texture 0 and the default tile size unless
 *    a sheet is given here; a block's type shows that tile of the sheet on every face; a game that has loaded no
 *    image gets plain blocks, a color for each type
 *  - setup is called with each map a level makes, to give block types their own faces or make them see-through
 *  - Call it before level3DLoad; with no arguments the defaults are back
 *  @param {TileInfo} [tileInfo] - The sheet's first tile, as for a VoxelMap
 *  @param {function(VoxelMap): void} [setup]
 *  @example
 *  level3DVoxelSetup(tile(0, 16, 1), (map)=> map.setBlockType(1, {top: 0, side: 1, bottom: 2})); // grass
 *  @memberof Level3D */
function level3DVoxelSetup(tileInfo, setup)
{
    level3DVoxelTiles = tileInfo;
    level3DVoxelSetupMap = setup;
}

// the most cells a level's map may have, 256 each way
const LEVEL3D_VOXEL_CELLS = 2 ** 24;

// a map's blocks as the file keeps them, runs of a count and a type, cell by cell in the map's own order
function level3DVoxelsEncode(data)
{
    const blocks = [];
    for (let i = 0; i < data.length;)
    {
        let end = i + 1;
        while (end < data.length && data[end] === data[i]) ++end;
        blocks.push(end - i, data[i]);
        i = end;
    }
    return blocks;
}

// runs into a map's cells: what they do not reach is empty, a type that is not 0 to 255 is empty, and a run that
// is not two numbers ends them
function level3DVoxelsDecode(blocks, data)
{
    data.fill(0);
    if (!isArray(blocks)) return;
    for (let i = 0, cell = 0; i + 1 < blocks.length && cell < data.length; i += 2)
    {
        const count = blocks[i], type = blocks[i + 1];
        if (!isNumber(count) || !isNumber(type) || count < 0) return;
        const end = min(cell + floor(count), data.length);
        data.fill(type >= 0 && type <= 255 && type % 1 === 0 ? type : 0, cell, end);
        cell = end;
    }
}

// the corner and the size in cells of a level's voxels block, undefined when it is not one a map can be made of
function level3DVoxelsShape(voxels)
{
    if (!voxels || typeof voxels !== 'object') return;
    const size = level3DVector(voxels.size);
    if (!size || [size.x, size.y, size.z].some((n)=> n < 1 || n % 1) ||
        size.x * size.y * size.z > LEVEL3D_VOXEL_CELLS) return;
    return {pos: level3DVector(voxels.pos, vec3()), size};
}

// the VoxelMap of a level's voxels block, undefined when it has none or it is wrong
function level3DVoxelsMake(voxels)
{
    const shape = level3DVoxelsShape(voxels);
    if (!shape || typeof VoxelMap == 'undefined') return;
    const map = new VoxelMap(shape.pos, shape.size, level3DVoxelTiles || level3DVoxelPlainTiles());
    level3DVoxelsDecode(voxels.blocks, map.data);
    level3DVoxelSetupMap?.(map);
    map.rebuild();
    return map;
}

// the terrain the level loaded last made, the one the 3D editor sculpts, and the most samples it may have a side
let level3DTerrainMap;
const LEVEL3D_TERRAIN_SAMPLES = 129;

// what a level's terrain block is made with: its center, its size in the world along x and z, how tall a full
// height is, and its heights as rows of 0 to 1, a copy, each row as long as the first; undefined when it is not
// one a HeightMap can be made of
function level3DTerrainShape(terrain)
{
    if (!terrain || typeof terrain !== 'object') return;
    const size = terrain.size, rows = terrain.heights, n = LEVEL3D_TERRAIN_SAMPLES;
    if (!isArray(size) || size.length !== 2 || !size.every((v)=> isNumber(v) && v > 0)) return;
    if (!isArray(rows) || rows.length < 2 || rows.length > n || !isArray(rows[0])) return;
    const columns = rows[0].length;
    if (columns < 2 || columns > n || !rows.every((row)=> isArray(row) && row.length === columns)) return;
    const heights = rows.map((row)=> row.map((v)=> isNumber(v) ? clamp(v) : 0));
    return {pos: level3DVector(terrain.pos, vec3()), size: vec2(size[0], size[1]),
        height: isNumber(terrain.height) && terrain.height > 0 ? terrain.height : 1, heights};
}

// a hex color of a level as a Color, undefined when it is not one
function level3DHexColor(hex)
{ return /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex) ? new Color().setHex(hex) : undefined; }

// the paint of a level's terrain block, for a terrain of so many samples: its colors as they are written and a
// color for each sample, row after row, 0 for none and 1 the first of the colors; undefined when it has none or
// it does not fit the terrain
function level3DTerrainPaint(terrain, samples)
{
    const paint = terrain?.paint, colors = paint?.colors, runs = paint?.cells;
    if (!isArray(colors) || !isArray(runs) || colors.length > 255 || !colors.every(level3DHexColor)) return;
    const cells = new Uint8Array(samples);
    let at = 0;
    for (let i = 0; i < runs.length; i += 2)
    {
        const count = runs[i], color = runs[i + 1];
        if (!(count > 0 && count % 1 === 0 && color >= 0 && color % 1 === 0) || color > colors.length ||
            at + count > samples) return;
        cells.fill(color, at, at += count);
    }
    return at === samples ? {colors: colors.slice(), cells} : undefined;
}

// give a terrain's map the colors of its block: its own color over the whole of it, or with paint a color for
// each sample, the terrain's own where it is not painted; the caller builds the map again
function level3DTerrainSetColors(map, terrain, paint=level3DTerrainPaint(terrain, map.rows * map.columns))
{
    const base = level3DHexColor(terrain.color) || WHITE;
    map.color = base, map.colors = undefined;
    if (!paint || !paint.cells.some((v)=> v)) return;
    const palette = [base, ...paint.colors.map(level3DHexColor)];
    map.color = WHITE;
    map.colors = map.heights.map((row, r)=> row.map((v, c)=> palette[paint.cells[r * map.columns + c]] || base));
}

// the sheet a level's blocks show when the game gave none with level3DVoxelSetup: the game's first image, as a
// VoxelMap takes it, or, for a game that has loaded no image, plain tiles made here, a color for each type, so a
// block map in a game with no art can still be seen and painted
let level3DVoxelPlain;
function level3DVoxelPlainTiles()
{
    if (textureInfos[0]?.size.x || headlessMode || typeof OffscreenCanvas == 'undefined')
        return tile();
    if (!level3DVoxelPlain)
    {
        // 16 by 16 tiles of 16 pixels, each a color of its own with a darker edge, so the blocks read as blocks
        const context = createCanvasContext(256);
        for (let i = 0; i < 256; ++i)
        {
            const x = i % 16 * 16, y = (i / 16 | 0) * 16, hue = i * .618 % 1;
            context.fillStyle = hsl(hue, .45, .4).toString();
            context.fillRect(x, y, 16, 16);
            context.fillStyle = hsl(hue, .5, .55).toString();
            context.fillRect(x + 1, y + 1, 14, 14);
        }
        level3DVoxelPlain = new TextureInfo(context.canvas);
    }
    return tile(0, 16, level3DVoxelPlain, 0);
}

// the HeightMap of a level's terrain block, undefined when it has none or it is wrong
function level3DTerrainMake(terrain)
{
    const shape = level3DTerrainShape(terrain);
    if (!shape || typeof HeightMap == 'undefined') return;
    const map = new HeightMap(shape.heights, shape.size, shape.height, undefined, shape.pos);
    level3DTerrainSetColors(map, terrain);
    map.colors && map.rebuild();
    return map;
}

// the sky domes levels made, a level's sky takes the place of the one before and disposes it; a dome the game made
// itself is left whole, for the game to put back
const level3DSkies = new WeakSet;

// set the scene a level's scene block gives: sky as its top, horizon and bottom colors, with ambient how much of
// them lights the scene, sunDirection and sunColor, fog as its start and end with fogColor, the horizon without one,
// and shadows; a setting the block does not have, or has wrong, stays as it is
function level3DSceneApply(scene)
{
    const r = render3D;
    if (!r || !scene || typeof scene !== 'object') return;
    const color = (value)=> /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? new Color().setHex(value) : undefined;
    const sky = isArray(scene.sky) && scene.sky.length === 3 ? scene.sky.map(color) : [];
    if (sky.length && sky.every((c)=> c))
    {
        // as setSky does, without disposing a dome that is the game's own
        const [top, horizon, bottom] = sky, ambient = isNumber(scene.ambient) ? scene.ambient : .5;
        level3DSkies.has(r.sky) && r.sky.dispose();
        level3DSkies.add(r.sky = buildSky(top, horizon, bottom));
        r.fogColor = horizon.copy();
        r.ambientColor = top.scale(ambient, 1);
        r.ambientGroundColor = bottom.scale(ambient, 1);
    }
    const sun = level3DVector(scene.sunDirection);
    if (sun && sun.lengthSquared())
        r.sunDirection = sun;
    r.sunColor = color(scene.sunColor) || r.sunColor;
    const fog = scene.fog;
    if (isArray(fog) && fog.length === 2 && fog.every((v)=> isNumber(v)))
        r.fogStart = fog[0], r.fogEnd = fog[1];
    r.fogColor = color(scene.fogColor) || r.fogColor;
    if (typeof scene.shadows === 'boolean')
        r.shadows = scene.shadows;
}

// a vec3 of an array of three numbers, as the file has them, or the fallback
function level3DVector(value, fallback)
{
    return isArray(value) && value.length === 3 && value.every((v)=> isNumber(v)) ?
        vec3(value[0], value[1], value[2]) : fallback;
}

// the defaults of an object's type, a Color or vector copied for each object, then its own properties over them,
// each read as its default is; one the file got wrong, a value not of its default's type, keeps the default, and
// one the type has no default for is kept as it is
function level3DProperties(type, object)
{
    const properties = {}, own = object.properties;
    for (const [key, value] of Object.entries(type.defaults))
        properties[key] = value?.copy ? value.copy() : value;
    for (const [key, value] of Object.entries(own && typeof own === 'object' ? own : {}))
    {
        const d = type.defaults[key];
        if (isColor(d))
            /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) && (properties[key] = new Color().setHex(value));
        else if (isVector3(d))
            properties[key] = level3DVector(value, properties[key]);
        else if (isVector2(d))
            isArray(value) && value.length === 2 && value.every((v)=> isNumber(v)) &&
                (properties[key] = vec2(value[0], value[1]));
        else if (d === undefined || typeof value === typeof d)
            properties[key] = value;
    }
    return properties;
}

// make one object of a level from the type added for its name, undefined when there is no such type or it made
// nothing
function level3DMake(object)
{
    return level3DMakeAt(object, level3DVector(object.pos, vec3()),
        level3DVector(object.rotation, vec3()).scale(PI / 180), level3DVector(object.scale, vec3(1)));
}

// make a level object's game object at a place, a rotation in radians and a scale, its own as level3DMake gives
// them or the ones a prefab's instance puts it at
function level3DMakeAt(object, pos, rotation, scale)
{
    const type = level3DTypes.get(object.type);
    if (!type)
    {
        debug && console.warn(`level3DLoad: no type added for ${object.type}, skipped`);
        return;
    }
    const properties = level3DProperties(type, object);
    const {make} = type, count = engineObjects.length;
    let result;
    try { result = make.prototype ? new make(pos, properties) : make(pos, properties); }
    catch (error)
    {
        // a value the type can not be made with: in debug builds, where asserts throw, the object is skipped with
        // what it made so far, so the rest of the level loads and the level editor can put the value right
        if (!debug) throw error;
        console.error(`level3DLoad: ${object.type} ${object.id} could not be made, skipped:`, error);
        for (const o of engineObjects.slice(count))
            o.destroy();
        return;
    }
    if (!result || typeof result !== 'object') return;
    if (result instanceof EngineObject3D)
    {
        level3DBaseScale.set(result, result.scale3D.copy());
        result.rotation3D = rotation.copy();
        result.scale3D = result.scale3D.multiply(scale);
    }

    // the type's own properties are set on it, one the type has no default for could be a field of the engine's
    for (const key in type.defaults)
        result[key] = properties[key];
    // a prefab's instance makes its parts now that it is where it goes
    result instanceof Prefab3D && result.placeAt(pos);
    return result;
}

/** Make one object of a type added with level3DAddType, level3DAddMesh or level3DAddPrefab, from code, with no
 *  level: a prefab's instance, or a plain type
 *  @param {string} type - The type's name
 *  @param {Vector3} [pos3D]
 *  @param {Vector3} [rotation3D] - In radians, as an object has it
 *  @param {Vector3} [scale3D] - Times the scale the type makes it with
 *  @param {Object} [properties] - Over the type's defaults
 *  @return {any} - What the type made, a Prefab3D for a prefab, undefined when there is no such type
 *  @memberof Level3D
 *  @example
 *  level3DAddPrefab('House', await fetchJSON('house.json'));
 *  level3DSpawn('House', vec3(10, 0, 0), vec3(0, PI/2, 0)); */
function level3DSpawn(type, pos3D=vec3(), rotation3D=vec3(), scale3D=vec3(1), properties)
{
    ASSERT(isVector3(pos3D) && isVector3(rotation3D) && isVector3(scale3D), 'pos3D, rotation3D and scale3D are vec3');
    return level3DMakeAt(properties ? {type, properties} : {type}, pos3D.copy(), rotation3D, scale3D);
}

///////////////////////////////////////////////////////////////////////////////
// prefabs: a prefab is a small level, a list of objects about its own origin, placed many times

// the prefabs by name: how an instance is built, its objects, fromLevel, true for one a level's own prefabs
// block added, which one the game adds takes the place of, and source, the object it was added from, which the
// level editor knows a level that is a prefab by
/** @type {Map<string, {attached: boolean, objects: Array<Object>, fromLevel: boolean, source: Object}>} */
const level3DPrefabs = new Map;

// how many prefabs deep an instance being made is, a prefab that holds itself is stopped; and how many of those
// are attached: a prefab inside an attached one is attached too, or its parts would be left behind in the world
let level3DPrefabDepth = 0, level3DPrefabAttached = 0;

/** Add a prefab: a small level, its objects placed about its own origin, to place many times under one name
 *  - It is a type from then on: a level's object of that type, the level editor's Place list and level3DSpawn make
 *    an instance, a Prefab3D; an instance is made of the prefab as it is then, so the level editor, where a prefab
 *    changes, makes its instances again
 *  - The prefab is a level as the level editor saves it, {objects: [...]}, so the editor is the prefab editor too;
 *    only its objects are used, and they may be of other prefabs
 *  - With attached true in it the parts are children of the instance and move with it as one body, without
 *    collision of their own, a prefab inside it too; its handle is at the middle of the box around them and its
 *    size3D is that box, so setCollision makes the body solid where it is seen; otherwise each part is an object of its own in the world and collides as one placed
 *    by hand does
 *  - Adding a name again replaces it
 *  @param {string} name - The type its instances have in a level
 *  @param {Object} prefab - {objects, attached}
 *  @memberof Level3D
 *  @example
 *  level3DAddPrefab('Tower', {objects: [{type: 'Box', pos: [0, 1, 0], scale: [2, 2, 2]},
 *      {type: 'Cylinder', pos: [0, 3, 0]}]});
 *  level3DLoad({objects: [{type: 'Tower', pos: [5, 0, 5]}, {type: 'Tower', pos: [-5, 0, 5], rotation: [0, 45, 0]}]}); */
function level3DAddPrefab(name, prefab) { level3DPrefabSet(name, prefab, false); }

// add a prefab, the game's or a level's own
function level3DPrefabSet(name, prefab, fromLevel)
{
    ASSERT(!!prefab && typeof prefab === 'object', 'a prefab is an object, {objects: [...]}');
    name = String(name);
    const objects = isArray(prefab?.objects) ? prefab.objects.filter((o)=> o && typeof o === 'object') : [];
    // a copy, what the game or the editor does to its own afterwards does not change the instances made later
    level3DPrefabs.set(name, {attached: !!prefab?.attached, objects: JSON.parse(JSON.stringify(objects)), fromLevel,
        source: prefab});
    // a class of its own, so the level editor makes its instances again as it does a class's
    level3DTypes.set(name, {make: class extends Prefab3D { constructor(pos) { super(pos, name); } }, defaults: {},
        tileInfo: undefined});
}

// add a level's own prefabs, each unless the game added one of that name or it is a plain type's name
function level3DPrefabsAdd(prefabs)
{
    if (!prefabs || typeof prefabs !== 'object' || isArray(prefabs)) return;
    for (const name in prefabs)
    {
        const known = level3DPrefabs.get(name);
        if (known ? !known.fromLevel : level3DTypes.has(name)) continue;
        prefabs[name] && typeof prefabs[name] === 'object' && level3DPrefabSet(name, prefabs[name], true);
    }
}

/** Load a prefab from a file the level editor saved and add it
 *  @param {string} name - The type its instances have in a level
 *  @param {string} url
 *  @return {Promise<void>}
 *  @memberof Level3D */
async function level3DLoadPrefab(name, url) { level3DAddPrefab(name, await fetchJSON(url)); }

// where an instance puts one of its prefab's objects: the object's own place, turn and size inside the instance's
function level3DPrefabPartTransform(instance, object)
{
    const pos = level3DVector(object.pos, vec3()), scale = level3DVector(object.scale, vec3(1));
    const rotation = level3DVector(object.rotation, vec3()).scale(PI / 180);
    // the two turns one after the other; the sizes multiply along each axis, which is exact for an instance sized
    // evenly or a part that is not turned, and as near as a box can be otherwise
    const turn = buildMatrix(vec3(), instance.rotation3D).multiply(buildMatrix(vec3(), rotation));
    return {pos: buildMatrix(instance.pos3D, instance.rotation3D, instance.scale3D).transformPoint(pos),
        rotation: turn.getRotation(), scale: scale.multiply(instance.scale3D)};
}

/**
 * An instance of a prefab, what a prefab's type makes: a handle with no shape of its own, and its parts, what the
 * prefab's objects made
 * - Parts of a prefab that is not attached are objects of their own in the world: moving, turning or sizing the
 *   handle puts them where it now says with its next update, or call placeParts; destroying it destroys them
 * - Parts of an attached prefab are its children and move with it as one body
 * @extends EngineObject3D
 * @memberof Level3D
 */
class Prefab3D extends EngineObject3D
{
    /** Create an instance of a prefab, made by its type: place one with a level or level3DSpawn
     *  @param {Vector3} [pos3D]
     *  @param {string} [prefabName] - A prefab added with level3DAddPrefab */
    constructor(pos3D, prefabName='')
    {
        super(pos3D);
        /** @property {string} - The prefab it is an instance of */
        this.prefabName = prefabName;
        /** @property {boolean} - Are its parts its children, moving with it as one body */
        this.attached = !!level3DPrefabs.get(prefabName)?.attached || level3DPrefabAttached > 0;
        /** @property {Array<any>} - What the prefab's objects made, in the prefab's order */
        this.parts = [];
        /** @property {Vector3} - From the prefab's origin to the handle, in the prefab's own space: nothing for
         *  separate parts, and for an attached prefab the middle of the box around its parts, where its handle
         *  is, as an object's place is the middle of its body */
        this.originOffset = vec3();
        this.partObjects = []; // the prefab's object of each part
        this.partsPlaced = ''; // where the handle was when its parts were last placed, undefined parts not made
        this.partsMade = false;
    }

    /** Put the instance with its prefab's origin at a place, turned and sized as the handle is: where a level's
     *  object or level3DSpawn says it goes; the handle of an attached prefab is then at the middle of its body
     *  @param {Vector3} pos3D */
    placeAt(pos3D)
    {
        this.pos3D = pos3D.copy();
        this.placeParts();
        const o = this.originOffset;
        if (o.x || o.y || o.z)
            this.pos3D = buildMatrix(pos3D, this.rotation3D, this.scale3D).transformPoint(o);
    }

    /** Put the parts where the handle is now, making them the first time; called by the handle's update when it
     *  has moved, turned or changed size */
    placeParts()
    {
        if (this.destroyed) return;
        this.partsMade ||= (this.makeParts(), true);
        this.partsPlaced = this.placeKey();
        if (this.attached) return; // children follow by themselves
        this.parts.forEach((part, i)=>
        {
            if (!(part instanceof EngineObject3D)) return; // what a function made is where it was made
            const to = level3DPrefabPartTransform(this, this.partObjects[i]);
            part.rotation3D = to.rotation;
            part.scale3D = (level3DBaseScale.get(part) ?? vec3(1)).multiply(to.scale);
            // a prefab inside this one goes by its origin, which is not where an attached one's handle is
            part instanceof Prefab3D ? part.placeAt(to.pos) : part.pos3D = to.pos;
        });
    }

    // the handle's place, turn and size as one text, to tell when it has changed
    placeKey()
    {
        const p = this.pos3D, r = this.rotation3D, s = this.scale3D;
        return [p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z].join();
    }

    // make the parts, each where the instance puts it, or attached at its own place inside the instance
    makeParts()
    {
        const prefab = level3DPrefabs.get(this.prefabName);
        if (!prefab) return;
        if (level3DPrefabDepth >= 8)
        {
            debug && console.error(`level3DLoad: the prefab ${this.prefabName} holds itself, left out there`);
            return;
        }
        ++level3DPrefabDepth;
        this.attached && ++level3DPrefabAttached;
        try
        {
            const low = vec3(Infinity), high = vec3(-Infinity), children = [];
            for (const object of prefab.objects)
            {
                const local = {pos: level3DVector(object.pos, vec3()), scale: level3DVector(object.scale, vec3(1)),
                    rotation: level3DVector(object.rotation, vec3()).scale(PI / 180)};
                const at = this.attached ? local : level3DPrefabPartTransform(this, object);
                const part = level3DMakeAt(object, at.pos, at.rotation, at.scale);
                if (!part) continue; // level3DMakeAt gives an object or nothing
                this.parts.push(part);
                this.partObjects.push(object);
                if (!this.attached || !(part instanceof EngineObject3D)) continue;
                // a child rides with its parent and has no collision of its own
                part.setCollision(false, false, false);
                children.push(part);
                // the corners of its box as it is turned; its place is its middle, a prefab inside this one too
                const box = buildMatrix(part.pos3D, part.rotation3D, part.size3D.multiply(part.scale3D));
                for (let i = 8; i--;)
                {
                    const p = box.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
                    for (const k of ['x', 'y', 'z'])
                        low[k] = min(low[k], p[k]), high[k] = max(high[k], p[k]);
                }
            }
            // an attached instance is the box around its parts, its handle at the middle of it as an object's
            // place is the middle of its body, so a game that makes it solid has it solid where it is seen
            if (children.length)
            {
                this.size3D = high.subtract(low);
                this.originOffset = low.add(high).scale(.5);
            }
            for (const part of children)
            {
                part.pos3D = part.pos3D.subtract(this.originOffset);
                this.addChild(part);
            }
        }
        finally
        {
            --level3DPrefabDepth;
            this.attached && --level3DPrefabAttached;
        }
    }

    /** Keep the parts with the handle, called automatically each frame */
    update()
    {
        super.update();
        if (!this.attached && this.partsPlaced !== this.placeKey())
            this.placeParts();
    }

    /** Destroy the instance and its parts
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.destroyed) return;
        for (const part of this.parts)
            part.parent === this || part.destroy?.(immediate); // children go with their parent
        super.destroy(immediate);
    }

    /** A prefab's instance has nothing of its own to draw */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
// the built-in types

// a static object of a mesh, with the color, tile and solid properties the built-in types have
function level3DMakeShape(pos, properties, mesh, tileInfo, asSphere=false)
{
    const o = new EngineObject3D(pos, mesh, properties.tile >= 0 ? tile(properties.tile) : tileInfo, properties.color);
    o.collideAsSphere3D = asSphere;
    properties.solid && o.setCollision();
    return o;
}

// the cylinder all Cylinder objects share, built the first time one is made
let level3DCylinderMesh;

level3DAddType('Box', function(pos, properties) { return level3DMakeShape(pos, properties, render3D.boxMesh); },
    {color: WHITE, tile: -1, solid: true});
level3DAddType('Sphere', function(pos, properties)
    { return level3DMakeShape(pos, properties, render3D.sphereMesh, undefined, true); },
    {color: WHITE, tile: -1, solid: true});
level3DAddType('Cylinder', function(pos, properties)
    { return level3DMakeShape(pos, properties, level3DCylinderMesh ||= buildCylinder()); },
    {color: WHITE, tile: -1, solid: true});
// a light, a spotlight with a cone: cone is the angle in degrees from its forward out to the edge of its beam, the
// object's rotation aims it, softness is how much of the cone fades, and shadows makes it the one that casts them
level3DAddType('Light', function(pos, properties)
{
    const light = new Light3D(pos, properties.radius, properties.color, properties.intensity);
    light.coneAngle = max(properties.cone, 0) * PI / 180;
    light.coneSoftness = properties.softness;
    if (properties.shadows && render3D)
        render3D.shadowLight = light;
    return light;
}, {color: WHITE, radius: 5, intensity: 1, cone: 0, softness: .2, shadows: false});
