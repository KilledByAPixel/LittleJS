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
 *  - properties is the defaults with the object's own values over them, and each is also set on what was made
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
 *  - What a file written by hand gets wrong uses the default
 *  @param {Object} level - The level, the level editor edits this same object
 *  @return {Array<any>} - What each object's type made, a function that made nothing is left out
 *  @memberof Level3D */
function level3DLoad(level)
{
    ASSERT(!!level && typeof level === 'object', 'a level is an object, {} for a new one');
    ASSERT(!(level.littlejs3D > LEVEL3D_VERSION), 'the level was made by a newer LittleJS');
    editor3DLevelLoaded(level); // debug builds: the 3D editor takes the level, its autosaved edits go in first
    const made = [];
    for (const object of isArray(level.objects) ? level.objects : [])
    {
        if (!object || typeof object !== 'object') continue;
        const result = level3DMake(object);
        editor3DObjectMade(object, result); // debug builds link it for the 3D editor
        result && made.push(result);
    }
    return made;
}

// a vec3 of an array of three numbers, as the file has them, or the fallback
function level3DVector(value, fallback)
{
    return isArray(value) && value.length === 3 && value.every((v)=> isNumber(v)) ?
        vec3(value[0], value[1], value[2]) : fallback;
}

// the defaults of an object's type, a Color or vector copied for each object, then its own properties over them,
// each read as its default is; one the file got wrong keeps the default
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
        else
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
    const {make} = type, result = make.prototype ? new make(pos, properties) : make(pos, properties);
    if (!result || typeof result !== 'object') return;
    if (result instanceof EngineObject3D)
    {
        level3DBaseScale.set(result, result.scale3D.copy());
        result.rotation3D = level3DVector(object.rotation, vec3()).scale(PI / 180);
        result.scale3D = result.scale3D.multiply(level3DVector(object.scale, vec3(1)));
    }
    return Object.assign(result, properties);
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
level3DAddType('Light', function(pos, properties)
    { return new Light3D(pos, properties.radius, properties.color, properties.intensity); },
    {color: WHITE, radius: 5, intensity: 1});
