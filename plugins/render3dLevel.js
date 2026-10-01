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
 *    is made a HeightMap, returned with what else was made
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
 *    a sheet is given here; a block's type shows that tile of the sheet on every face
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
    const map = new VoxelMap(shape.pos, shape.size, level3DVoxelTiles || tile());
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

// the HeightMap of a level's terrain block, undefined when it has none or it is wrong
function level3DTerrainMake(terrain)
{
    const shape = level3DTerrainShape(terrain);
    if (!shape || typeof HeightMap == 'undefined') return;
    const map = new HeightMap(shape.heights, shape.size, shape.height, undefined, shape.pos);
    if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(terrain.color))
        map.color = new Color().setHex(terrain.color);
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
    const type = level3DTypes.get(object.type);
    if (!type)
    {
        debug && console.warn(`level3DLoad: no type added for ${object.type}, skipped`);
        return;
    }
    const pos = level3DVector(object.pos, vec3()), properties = level3DProperties(type, object);
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
        result.rotation3D = level3DVector(object.rotation, vec3()).scale(PI / 180);
        result.scale3D = result.scale3D.multiply(level3DVector(object.scale, vec3(1)));
    }

    // the type's own properties are set on it, one the type has no default for could be a field of the engine's
    for (const key in type.defaults)
        result[key] = properties[key];
    return result;
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
