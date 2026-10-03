/*
 * LittleJS 3D Editor Plugin
 * - A free camera to look around any 3D game as it runs, C on the debug overlay
 * - The 3D level editor, for a level loaded with level3DLoad, 0 on the debug overlay
 * - Debug builds only, like the 2D level editor: engineRelease.js has empty stubs for what other files call, so
 *   release builds carry none of it
 * - Goes after the Render3D plugins and the 2D level editor
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// the view: a camera of the editor's own, drawn with while the free camera or the editor is on

const EDITOR3D_LOOK_SPEED = .003; // radians a pixel of mouse movement turns the view

// the camera of the free camera and the editor, made at the first use

/** @type {Camera3D|undefined} */
let editor3DCamera;
let editor3DFreeCamera = false; // the free camera is on
let editor3DFlySpeed = .2;      // world units flown in a frame of 1/60, the wheel changes it
let editor3DTimeLast = 0;       // real time of the last update, flying goes by real time so it works while paused
let editor3DWasLocked = false;  // the mouse was captured last update, a lock that is lost leaves the free camera
// the game's camera while the editor's is drawn with
/** @type {Camera3D|undefined} */
let editor3DGameCamera;

// if something draws with the editor's camera
function editor3DViewOn() { return editor3DFreeCamera || editor3DIsOpen; }

// the editor's camera starts as the game's: where it is, the way it looks and its field of view
function editor3DCameraStart()
{
    const from = render3D.camera, camera = editor3DCamera = new Camera3D;
    camera.pos = from.pos.copy();
    camera.rotation = vec3(from.rotation.x, from.rotation.y, 0);
    camera.fov = from.fov;
    camera.near = from.near;
    camera.far = from.far;
}

// turn the free camera on or off, it needs a Render3DPlugin and takes the keyboard and mouse while it is on
function editor3DSetFreeCamera(on)
{
    on = !!on && !!render3D;
    if (on === editor3DFreeCamera) return;
    editor3DFreeCamera = on;
    editor3DWasLocked = false;
    if (on)
    {
        editor3DCameraStart();
        pointerLockRequest();
    }
    else
        pointerLockIsActive() && pointerLockExit();
    inputCapture(editor3DViewOn());
}

// fly a camera: turn is the mouse movement in pixels, move is right, up and forward from -1 to 1
function editor3DFly(camera, move, turn, seconds, fast=false)
{
    const r = camera.rotation;
    camera.rotation = vec3(clamp(r.x - turn.y * EDITOR3D_LOOK_SPEED, -1.55, 1.55), r.y - turn.x * EDITOR3D_LOOK_SPEED, 0);
    const distance = editor3DFlySpeed * 60 * seconds * (fast ? 4 : 1);
    camera.pos = camera.pos.add(camera.getRight().scale(move.x * distance))
        .add(vec3(0, move.y * distance, 0))
        .add(camera.getForward().scale(move.z * distance));
}

// the keys that fly, right, up and forward from -1 to 1
function editor3DFlyKeys()
{
    const key = (code)=> keyIsDown(code) ? 1 : 0;
    return vec3(key('KeyD') - key('KeyA'), key('KeyE') - key('KeyQ'), key('KeyW') - key('KeyS'));
}

// run a function with render3D looking through the editor's camera, for the editor's picking and projecting
function editor3DWithView(fn)
{
    const r = render3D, camera = r.camera;
    r.camera = editor3DCamera;
    r.updateMatrices();
    try { return fn(); }
    finally
    {
        r.camera = camera;
        r.updateMatrices();
    }
}

// called by the 3D pass before it works out its matrices: the frame is drawn with the editor's camera
function editor3DCameraBegin()
{
    if (!editor3DViewOn() || !editor3DCamera) return;
    const r = render3D, camera = editor3DGameCamera = r.camera;
    r.camera = editor3DCamera;

    // where the game is looking from, a box turned its way and a line along its view; the editor has enough to show
    if (editor3DFreeCamera)
    {
        const color = hsl(.15, 1, .6);
        debugBox3D(camera.pos, vec3(.5, .5, .8), color, 0, camera.rotation);
        debugLine3D(camera.pos, camera.pos.add(camera.getForward().scale(2)), color);
    }

    // the editor's own drawing, in this frame's 3D pass
    editor3DIsOpen && render3DDebugPush(0, editor3DDraw);
}

// called by the 3D pass after the frame: the game's camera is back, with its matrices, for the game's next update
function editor3DCameraEnd()
{
    if (!editor3DGameCamera) return;
    render3D.camera = editor3DGameCamera;
    editor3DGameCamera = undefined;
    render3D.updateMatrices();
}

// if a captured mouse was let go of by the browser since the last look, as Chrome does on Escape, and not by the
// game with pointerLockExit
function editor3DLostLock(locked)
{
    const lost = editor3DWasLocked && !locked && !inputLockLetGo;
    editor3DWasLocked = locked;
    inputLockLetGo = false;
    return lost;
}

// C turns the free camera on while the debug keys work, the level editor has its own view
function editor3DFreeCameraKey()
{
    if (!(debugOverlay || debugKeysAlways) || levelEditor.isOpen || !keyWasPressed('KeyC')) return;
    inputClearKey('KeyC');
    editor3DSetFreeCamera(true);
}

// the free camera's update: C or Escape leaves, and so does a captured mouse the browser let go of, since Chrome
// takes Escape for that and may not send the key; the mouse looks while it is captured or the right button is held
function editor3DFreeCameraUpdate(seconds)
{
    const locked = pointerLockIsActive(), lostLock = editor3DLostLock(locked);
    if (keyWasPressed('KeyC') || debugKey && keyWasPressed(debugKey) || lostLock)
    {
        inputClearKey('KeyC');
        debugKey && inputClearKey(debugKey);
        editor3DSetFreeCamera(false);
        return;
    }
    editor3DFlySpeed = clamp(editor3DFlySpeed * Math.exp(-inputCaptureWheel * .2), .01, 10);
    const look = locked || mouseIsDown(2);
    editor3DFly(editor3DCamera, editor3DFlyKeys(), look ? inputCaptureDeltaScreen : vec2(), seconds,
        keyIsDown('ShiftLeft') || keyIsDown('ShiftRight'));
}

///////////////////////////////////////////////////////////////////////////////
// the math of the handles: each is dragged with the mouse's ray

const EDITOR3D_UP = vec3(0, 1, 0);

// how far along an axis line, from its origin, the point nearest a ray is: the two lines' closest points, solved
// for the axis; a ray along the axis has no nearest point, and gives 0
function editor3DAxisDistance(ray, origin, axis)
{
    const d = ray.direction, w = origin.subtract(ray.origin);
    const a = axis.dot(axis), b = axis.dot(d), c = d.dot(d), e = axis.dot(w), f = d.dot(w);
    const denominator = a * c - b * b;
    return abs(denominator) < 1e-9 ? 0 : (b * f - c * e) / denominator;
}

// where a ray meets the plane through a point, undefined when it runs along the plane or away from it
function editor3DPlanePoint(ray, point, normal)
{
    const distance = raycastPlane(ray, point, normal);
    return distance === undefined ? undefined : ray.getPosition(distance);
}

// the axis a ring turns around and two axes across it, for the pitch 'x', yaw 'y' or roll 'z' of a rotation:
// yaw turns around world up, pitch around the side axis after the yaw, roll around the forward axis after both,
// so each ring changes one number of rotation3D; a turn goes from across toward along
function editor3DRingAxes(rotation, ring)
{
    const frame = buildMatrix(vec3(), ring === 'y' ? vec3() : ring === 'x' ? vec3(0, rotation.y, 0) :
        vec3(rotation.x, rotation.y, 0));
    const x = frame.transformDirection(vec3(1, 0, 0)), y = frame.transformDirection(vec3(0, 1, 0));
    const z = frame.transformDirection(vec3(0, 0, 1));
    return ring === 'x' ? {axis: x, across: y, along: z} : ring === 'y' ? {axis: y, across: z, along: x} :
        {axis: z, across: x, along: y};
}

// the angle of a ray's point on a ring's plane, around the ring's axis from across toward along
function editor3DRingAngle(ray, center, axes)
{
    const point = editor3DPlanePoint(ray, center, axes.axis);
    if (!point) return;
    const offset = point.subtract(center);
    return atan2(offset.dot(axes.along), offset.dot(axes.across));
}

// a value on the nearest step, a step of 0 leaves it
function editor3DSnap(value, step) { return step ? round(value / step) * step : value; }

// a position snapped to the grid by the low corner of its box, so its faces land on grid lines and boxes tile
// with no gaps; a turned object has no such corner and goes by its center
function editor3DSnapPos(pos, size, step, turned=false)
{
    const half = turned ? vec3() : size.scale(.5), low = pos.subtract(half);
    return vec3(editor3DSnap(low.x, step), editor3DSnap(low.y, step), editor3DSnap(low.z, step)).add(half);
}

// the height of the editor's view in world units at a point's depth, handles are sized by it to keep their size
// on screen
function editor3DScreenScale(point)
{
    const camera = editor3DCamera, depth = point.subtract(camera.pos).dot(camera.getForward());
    return max(depth, .01) * tan(camera.fov / 2) * 2;
}

// how far in pixels a screen position is from the line between two world points as the view shows it, Infinity
// when an end is behind the camera
function editor3DSegmentDistance(screenPos, a, b)
{
    const sa = render3D.worldToScreen(a), sb = render3D.worldToScreen(b);
    if (!sa || !sb) return Infinity;
    const ab = sb.subtract(sa), t = clamp(screenPos.subtract(sa).dot(ab) / (ab.lengthSquared() || 1), 0, 1);
    return screenPos.distance(sa.add(ab.scale(t)));
}

// the first point a ray hits: on an object, a height map or a voxel map, leaving some out, or on the ground plane
// at height 0 when it hits none
function editor3DSurface(ray, ignore=new Set)
{
    let distance;
    for (const o of engineObjects)
    {
        if (ignore.has(o)) continue;
        const d = render3DRaycastObject(ray, o);
        if (d !== undefined && (distance === undefined || d < distance))
            distance = d;
    }
    distance ??= raycastPlane(ray, vec3(), EDITOR3D_UP);
    return distance === undefined ? undefined : ray.getPosition(distance);
}

// where a box of a size stands with its bottom on a point
function editor3DRest(point, size) { return vec3(point.x, point.y + size.y / 2, point.z); }

// the height of the middle of a box that lands at a place across the ground: dropped from its own height over a
// height, onto what is under it, so it climbs a step as tall as itself and no more; with nothing under it, it
// stands at that height
function editor3DLand(x, z, height, size, ignore)
{
    const landed = editor3DDrop(vec3(x, height + size.y * 1.5 + .01, z), size, ignore);
    return landed ? landed.y : height + size.y / 2;
}

// where a box lands dropped straight down from its bottom onto what is under it, undefined with nothing there
function editor3DDrop(pos, size, ignore=new Set)
{
    const bottom = vec3(pos.x, pos.y - size.y / 2, pos.z);
    const point = editor3DSurface(new Ray3D(bottom, vec3(0, -1, 0)), ignore);
    return point && editor3DRest(point, size);
}

///////////////////////////////////////////////////////////////////////////////
// the level: the object the game gave level3DLoad is the source of truth, the editor changes it in place and
// brings what the game made in line with it

// the level being edited, the one given to level3DLoad last

/** @type {Object|undefined} */
let editor3DLevel;

// what the game made for each object of the level, by the object's id
const editor3DInstances = new Map;

// what the editor keeps for each level: {fileName, key, original, hash, pending, fileHandle, undo, redo}, the file
// it came from, the file's objects and their hash for the autosave, an autosave waiting for a file that changed,
// and its undo and redo lists
const editor3DRecords = new WeakMap;

// if the editor is open, and if it was opened and not exited, while Escape switches between playing and editing
let editor3DIsOpen = false, editor3DSession = false;
let editor3DGamePaused = false;   // the game's pause from before the editor opened
let editor3DPlayFromMouse = false; // Escape and Play hand the game a position to play from

const editor3DSelection = new Set; // the ids of the selected objects
// the type a click places
/** @type {string|undefined} */
let editor3DBrush;
// the copied objects, and the size and box offset each had when it was copied
/** @type {Array<Object>|undefined} */
let editor3DClipboard;
/** @type {Map<Object, {size: Vector3, offset: Vector3}>} */
let editor3DClipboardBoxes = new Map;
// the level's, each entry its object list and its parts, the scene and the blocks, before and after an edit
let editor3DUndoList = [], editor3DRedoList = [];
// the edit being made, a drag is one: the objects and the parts as they were before it, and painted when blocks
// were set in the game's map and are not in the level yet
/** @type {{before: Array<Object>, parts: Object, painted?: boolean, sculpted?: boolean}|undefined} */
let editor3DStroke;

const editor3DCopy = (value)=> JSON.parse(JSON.stringify(value));
const editor3DSame = (a, b)=> JSON.stringify(a) === JSON.stringify(b);
const editor3DRound = (v)=> round(v * 1e4) / 1e4; // as the file keeps a number

// the level's objects, and the one of an id
const editor3DObjects = ()=> isArray(editor3DLevel?.objects) ? editor3DLevel.objects : [];
const editor3DObject = (id)=> editor3DObjects().find((o)=> o.id === id);
const editor3DSelected = ()=> editor3DObjects().filter((o)=> editor3DSelection.has(o.id));

// the parts of a level beside its objects that the editor edits: its scene block and its map of blocks; each is
// undone, autosaved, reset and saved as the objects are
const editor3DLevelPartNames = ['scene', 'voxels', 'terrain', 'prefabs'];

// the last copy made of each part, as its text and the copy: a part that has not changed since is not copied
// again, so undo steps share one copy of a terrain until it is sculpted; a copy is never changed
/** @type {Object<string, {text: string, part: Object}>} */
const editor3DPartCopies = {};

// a part of a level, undefined when it has none
function editor3DLevelPart(name, level=editor3DLevel)
{
    const part = level?.[name];
    return part && typeof part === 'object' && !isArray(part) ? part : undefined;
}

// a copy of every part a level has, {} for a level with none; the copies are shared, see editor3DPartCopies, so
// what is given is copied again before it is changed or made a level's own
function editor3DLevelParts(level=editor3DLevel)
{
    const parts = {};
    for (const name of editor3DLevelPartNames)
    {
        const part = editor3DLevelPart(name, level);
        if (!part) continue;
        const text = JSON.stringify(part);
        if (editor3DPartCopies[name]?.text !== text)
            editor3DPartCopies[name] = {text, part: JSON.parse(text)};
        parts[name] = editor3DPartCopies[name].part;
    }
    return parts;
}
const editor3DScene = ()=> editor3DLevelPart('scene');

// what a level's hash covers: its objects, and the parts it has, so a level with none hashes as before
const editor3DContentHash = (objects, parts)=> editor3DHash(JSON.stringify(objects) +
    editor3DLevelPartNames.map((name)=> parts[name] ? JSON.stringify(parts[name]) : '').join(''));

// the renderer's settings a scene block can set, as they are now, and put back as they were: what the game set
// itself shows again when a level's block changes or goes
function editor3DSceneState()
{
    const r = render3D;
    return {sky: r.sky, ambientColor: r.ambientColor.copy(), ambientGroundColor: r.ambientGroundColor?.copy(),
        fogStart: r.fogStart, fogEnd: r.fogEnd, fogColor: r.fogColor?.copy(), sunDirection: r.sunDirection.copy(),
        sunColor: r.sunColor.copy(), shadows: r.shadows, sunFlare: !!level3DSunFlare && !level3DSunFlare.destroyed};
}
function editor3DSceneRestore(state)
{
    const r = render3D;
    if (!r || !state) return;
    r.sky !== state.sky && level3DSkies.has(r.sky) && r.sky.dispose(); // a dome a level made, not the game's
    r.sky = state.sky;
    r.ambientColor = state.ambientColor.copy();
    r.ambientGroundColor = state.ambientGroundColor?.copy();
    r.fogStart = state.fogStart, r.fogEnd = state.fogEnd;
    r.fogColor = state.fogColor?.copy();
    r.sunDirection = state.sunDirection.copy();
    r.sunColor = state.sunColor.copy();
    r.shadows = state.shadows;
    level3DSceneFlare(state.sunFlare); // a flare an earlier level's scene gave the sun, never the game's own
}

// the scene on screen as a block, to start a level's scene from: a sky only when the dome's colors are known
const editor3DHex = (color)=> new Color(clamp(color.r), clamp(color.g), clamp(color.b)).toString(false);
function editor3DSceneFromView()
{
    const r = render3D, scene = {}, colors = r.sky && render3DSkyColors.get(r.sky);
    if (colors)
    {
        // how much of the top color the ambient light is
        const top = max(colors[0].r, colors[0].g, colors[0].b);
        const lit = max(r.ambientColor.r, r.ambientColor.g, r.ambientColor.b);
        scene.sky = colors.map(editor3DHex);
        scene.ambient = top ? round(clamp(lit / top) * 100) / 100 : .5;
    }
    const sun = r.sunDirection.normalize();
    scene.sunDirection = [sun.x, sun.y, sun.z].map((v)=> round(v * 1e3) / 1e3);
    scene.sunColor = editor3DHex(r.sunColor);
    scene.fog = [editor3DRound(r.fogStart || 0), editor3DRound(r.fogEnd || 0)];
    scene.fogColor = editor3DHex(r.fogColor || canvasClearColor);
    scene.shadows = !!r.shadows;
    scene.lensFlare = level3DSunHasFlare();
    return scene;
}

// the sun's direction as two angles in degrees, for two sliders: around, from +z toward +x, and its height over
// the horizon; and the direction of two angles, as the file keeps it
function editor3DSunAngles(direction)
{
    const d = level3DVector(direction, vec3(0, 1, 0)).normalize();
    return [round((atan2(d.x, d.z) * 180 / PI + 360) % 360) % 360, round(Math.asin(clamp(d.y, -1, 1)) * 180 / PI)];
}
function editor3DSunDirection(around, height)
{
    const a = around * PI / 180, h = height * PI / 180;
    return [sin(a) * cos(h), sin(h), cos(a) * cos(h)].map((v)=> round(v * 1e3) / 1e3 + 0);
}

// an object's position, rotation in degrees and scale, the defaults where the level leaves them out
const editor3DPos = (object)=> level3DVector(object.pos, vec3());
const editor3DRotation = (object)=> level3DVector(object.rotation, vec3());
const editor3DScale = (object)=> level3DVector(object.scale, vec3(1));
const editor3DTurned = (object)=> editor3DRotation(object).lengthSquared() > 0;

// the size of an object's box: what the game made for it says, a marker is 1 unit
function editor3DSize(object)
{
    const made = editor3DInstances.get(object.id), box = editor3DPrefabBox(made);
    if (box) return box.size;
    if (!(made instanceof EngineObject3D) || !(made.mesh || made.tileInfo)) return vec3(1);
    const s = made.size3D, k = made.scale3D;
    return vec3(s.x * abs(k.x), s.y * abs(k.y), s.z * abs(k.z));
}

// the box around a prefab's instance in the world, the boxes of its parts together, as its middle and its size;
// undefined for anything else, or an instance with nothing to see
function editor3DPrefabBox(made)
{
    if (!(made instanceof Prefab3D) || made.destroyed) return;
    const low = vec3(Infinity), high = vec3(-Infinity);
    for (const part of editor3DParts(made))
    {
        if (!(part instanceof EngineObject3D) || !(part.mesh || part.tileInfo)) continue;
        const bounds = part.mesh && (part.mesh.bounds || part.mesh.getBounds());
        const matrix = render3DObjectMatrix(part).copy().multiply(bounds ?
            buildMatrix(bounds.min.add(bounds.max).scale(.5), undefined, bounds.max.subtract(bounds.min)) :
            buildMatrix(vec3(), undefined, part.size3D));
        for (let i = 8; i--;)
        {
            const p = matrix.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
            for (const k of ['x', 'y', 'z'])
                low[k] = min(low[k], p[k]), high[k] = max(high[k], p[k]);
        }
    }
    // to the nearest part of the file's numbers, so a box worked out through a matrix reads as it was written
    const tidy = (v)=> vec3(editor3DRound(v.x), editor3DRound(v.y), editor3DRound(v.z));
    return low.x <= high.x ? {pos: tidy(low.add(high).scale(.5)), size: tidy(high.subtract(low))} : undefined;
}

// from an object's place to the middle of its box: nothing for a plain object, whose place is its middle, and for
// a prefab's instance how far its origin is from the middle of its parts, as it is turned and sized now
function editor3DBoxOffset(object)
{
    const box = editor3DPrefabBox(editor3DInstances.get(object.id));
    return box ? box.pos.subtract(editor3DPos(object)) : vec3();
}

// every object gets an id of its own, a whole number: one without, or with one already used, gets a new one
function editor3DFixIds(objects)
{
    const isObject = (o)=> !!o && typeof o === 'object', seen = new Set;
    let next = 1;
    for (const o of objects)
        isObject(o) && Number.isInteger(o.id) && (next = max(next, o.id + 1));
    for (const o of objects)
    {
        if (!isObject(o)) continue;
        if (!Number.isInteger(o.id) || seen.has(o.id))
            o.id = next++;
        seen.add(o.id);
    }
}

// a quick hash of a text, to know when the file changed under its autosave
function editor3DHash(text)
{
    let hash = 2166136261;
    for (let i = 0; i < text.length; ++i)
        hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
}

// called by level3DLoad before it makes the objects: the editor takes the level, and the first time it sees it,
// puts in the edits it autosaved for the file, or keeps them waiting when the file changed since
function editor3DLevelLoaded(level)
{
    if (editor3DLevel !== level)
    {
        // another level, the selection and the edit being made were the last one's
        editor3DSelection.clear();
        editor3DStroke = undefined;
    }
    if (!editor3DPrefabLevels.has(level) && editor3DPrefabStack.length)
    {
        // the game loaded a level while a prefab was open: what was open is gone with what it was opened from
        editor3DPrefabStack.length = 0;
        editor3DPrefabEdits = {};
    }
    editor3DLevel = level;
    editor3DInstances.clear();
    if (isArray(level.objects))
    {
        // an entry that is not an object is dropped, in place, a game may keep the list
        for (let i = level.objects.length; i--;)
            level.objects[i] && typeof level.objects[i] === 'object' || level.objects.splice(i, 1);
        editor3DFixIds(level.objects);
    }
    // its blocks as the editor writes them, so the same map always reads the same, however the file wrote its runs
    const voxels = editor3DLevelPart('voxels', level), shape = level3DVoxelsShape(voxels);
    if (shape)
    {
        const data = new Uint8Array(shape.size.x * shape.size.y * shape.size.z);
        level3DVoxelsDecode(voxels.blocks, data);
        voxels.blocks = level3DVoxelsEncode(data);
    }
    const known = editor3DRecords.get(level);
    if (known)
    {
        // loaded again, as a restart does: its edits are in it, and its undo is its own
        editor3DUndoList = known.undo;
        editor3DRedoList = known.redo;
        return;
    }

    // a level from a file goes by the file, one made in code by its objects as they were loaded, so each has an
    // autosave of its own
    const url = editorFetchedURLs.get(level)?.split(/[?#]/)[0];
    const original = editor3DCopy(editor3DObjects()), originalParts = editor3DLevelParts();
    const hash = editor3DContentHash(original, originalParts);
    // sceneBase is the scene the game set, taken before the level's own block is applied
    const record = {fileName: editorFileName(url, 'level3D.json'), key: url ?? 'level #' + hash, original,
        originalParts, sceneBase: render3D ? editor3DSceneState() : undefined, hash, pending: undefined,
        fileHandle: undefined, undo: [], redo: []};
    editor3DRecords.set(level, record);
    editor3DUndoList = record.undo;
    editor3DRedoList = record.redo;
    // an autosave the file already has, from a Save, goes; one of this file, or of the file a Save wrote, comes back
    // a prefab being edited has no autosave, and one of a level with the same objects is not its
    const saved = editor3DPrefabLevels.has(level) ? undefined : editor3DSaves()[record.key];
    if (saved && isArray(saved.objects) && editor3DSame(saved.objects, original) &&
        editor3DSame(editor3DLevelParts(saved), originalParts))
        editor3DAutosave(level);
    else if ((saved?.hash === hash || saved?.savedHash === hash) && isArray(saved.objects))
    {
        // before level3DLoad makes anything, so the scene and the map are made with the edits in them
        const parts = editor3DLevelParts(saved);
        level.objects = editor3DCopy(saved.objects);
        for (const name of editor3DLevelPartNames)
            parts[name] ? level[name] = editor3DCopy(parts[name]) : delete level[name];
    }
    else if (saved)
        record.pending = saved;
}

// called by level3DLoad for each object, with what its type made
function editor3DObjectMade(object, made)
{
    made && typeof made === 'object' && editor3DInstances.set(object.id, made);
}

// put what the game made for an object where the level has it, and still
function editor3DPlaceInstance(made, object)
{
    made.pos3D = editor3DPos(object);
    made.rotation3D = editor3DRotation(object).scale(PI / 180);
    made.scale3D = (level3DBaseScale.get(made) ?? vec3(1)).multiply(editor3DScale(object));
    made.velocity3D = vec3();
    made.angleVelocity3D = vec3();
    made instanceof Prefab3D && made.placeAt(editor3DPos(object)); // by its origin, and its parts go with it
}

// make an object's game object, again when it has one
function editor3DMakeInstance(object)
{
    editor3DInstances.get(object.id)?.destroy?.();
    const made = level3DMake(object);
    made ? editor3DInstances.set(object.id, made) : editor3DInstances.delete(object.id);
}

// set the level's objects to a list and bring the game's objects in line: one gone is destroyed, a new one made,
// one that only moved, turned or changed size is moved where it is, and one whose type or properties changed is
// made again, since its constructor takes them; a type made by an arrow function is called again
function editor3DSetObjects(list)
{
    const before = new Map(editor3DObjects().map((o)=> [o.id, o]));
    const objects = editor3DLevel.objects = editor3DCopy(list);
    const ids = new Set(objects.map((o)=> o.id));
    for (const [id, made] of editor3DInstances)
    {
        if (ids.has(id)) continue;
        made.destroy?.();
        editor3DInstances.delete(id);
    }
    for (const id of [...editor3DSelection])
        ids.has(id) || editor3DSelection.delete(id);
    for (const object of objects)
    {
        const old = before.get(object.id), made = editor3DInstances.get(object.id);
        if (!level3DTypes.has(object.type) || old && editor3DSame(old, object)) continue;
        const onlyMoved = old && old.type === object.type && editor3DSame(old.properties, object.properties) &&
            made instanceof EngineObject3D && !made.destroyed;
        onlyMoved ? editor3DPlaceInstance(made, object) : editor3DMakeInstance(object);
    }
    editor3DShadowLight();
}

// the light that casts the shadows is the level's last Light that asks to, as it is after a load, whatever order
// the edits made them in; a light of the game's own is left alone while no Light of the level asks
function editor3DShadowLight()
{
    if (!render3D) return;
    let light;
    for (const object of editor3DObjects())
    {
        const made = editor3DInstances.get(object.id);
        if (object.type === 'Light' && object.properties?.shadows === true && made instanceof Light3D && !made.destroyed)
            light = made;
    }
    const now = render3D.shadowLight;
    if (light || !now || now.destroyed || [...editor3DInstances.values()].some((made)=> made === now))
        render3D.shadowLight = light;
}

// change the level's objects as part of the edit being made: change edits a copy of the list; the changes until
// editor3DStrokeEnd are one undo, so a drag is one undo; false when nothing changed
function editor3DChange(change)
{
    if (!editor3DLevel || editor3DRecords.get(editor3DLevel)?.pending) return false; // its autosave waits first
    const before = editor3DCopy(editor3DObjects()), after = editor3DCopy(before);
    change(after);
    if (editor3DSame(before, after)) return false;
    editor3DFixIds(after); // an object added with no id, or with one in use, gets one of its own
    editor3DSetObjects(after);
    editor3DStroke ||= {before, parts: editor3DLevelParts()};
    return true;
}

// make a part the level's, or take it away, and show it: for the scene the game's own setup, then what the block
// sets; for the blocks the game's map, brought in line
function editor3DSetPart(name, part)
{
    const level = editor3DLevel;
    part ? level[name] = editor3DCopy(part) : delete level[name];
    if (name === 'scene')
    {
        editor3DSceneRestore(editor3DRecords.get(level)?.sceneBase);
        level3DSceneApply(level.scene);
    }
    else if (name === 'voxels')
        editor3DVoxelShow();
    else if (name === 'terrain')
        editor3DTerrainShow();
    else
        editor3DPrefabsShow();
}

// bring the prefab types in line with the level's own prefabs, and make every instance again: a prefab the level
// no longer has is no longer a type, one it has is added as level3DLoad adds it, and what a prefab makes is made
// when its instance is, so each instance is made again
function editor3DPrefabsShow()
{
    if (editor3DPrefabLevels.has(editor3DLevel)) return; // inside a prefab, the prefabs are the level's
    const prefabs = editor3DLevelPart('prefabs') ?? {};
    for (const [name, prefab] of level3DPrefabs)
    {
        if (!prefab.fromLevel || prefabs[name]) continue;
        level3DPrefabs.delete(name);
        level3DTypes.delete(name);
    }
    level3DPrefabsAdd(prefabs);
    // every object of a prefab's type, one whose type was not there when the objects were set too
    for (const object of editor3DObjects())
        level3DPrefabs.has(object.type) && editor3DMakeInstance(object);
    editor3DShadowLight();
}

// make the level's parts these, the ones that differ
function editor3DSetParts(parts)
{
    for (const name of editor3DLevelPartNames)
        editor3DSame(parts[name], editor3DLevelPart(name)) || editor3DSetPart(name, parts[name]);
}

// the stroke being made, started here with the level as it is when there is none: called before the level changes
/** @return {{before: Array<Object>, parts: Object, painted?: boolean, sculpted?: boolean}} */
function editor3DStrokeBegin()
{ return editor3DStroke ||= {before: editor3DCopy(editor3DObjects()), parts: editor3DLevelParts()}; }

// change a part of the level as part of the edit being made, as editor3DChange does its objects: change is given
// a copy of the part, undefined when the level has none, and returns the new one, or undefined for none; false
// when nothing changed
function editor3DChangePart(name, change)
{
    if (!editor3DLevel || editor3DRecords.get(editor3DLevel)?.pending) return false; // its autosave waits first
    const parts = editor3DLevelParts(), after = change(parts[name] && editor3DCopy(parts[name]));
    if (editor3DSame(parts[name], after)) return false;
    editor3DStrokeBegin();
    editor3DSetPart(name, after);
    return true;
}
const editor3DChangeScene = (change)=> editor3DChangePart('scene', change);

///////////////////////////////////////////////////////////////////////////////
// the level's map of blocks: the level's voxels block is the source of truth, the game's VoxelMap follows it;
// painting sets blocks in the game's map as it goes, and the stroke's end writes them into the level

// the game's map of the level's blocks, undefined when the level has none
function editor3DVoxelMap()
{
    const map = level3DVoxelMap;
    return map && !map.destroyed && editor3DLevelPart('voxels') ? map : undefined;
}

// bring the game's map in line with the level's voxels block: made, made again when its place or size changed,
// its cells set, or destroyed with the block gone
function editor3DVoxelShow()
{
    const voxels = editor3DLevelPart('voxels'), shape = level3DVoxelsShape(voxels);
    let map = level3DVoxelMap && !level3DVoxelMap.destroyed ? level3DVoxelMap : undefined;
    const sameVector = (a, b)=> a.x === b.x && a.y === b.y && a.z === b.z;
    if (map && !(shape && sameVector(map.pos3D, shape.pos) && sameVector(map.mapSize, shape.size)))
    {
        map.destroy();
        map = level3DVoxelMap = undefined;
    }
    if (!shape) return;
    if (!map)
    {
        level3DVoxelMap = level3DVoxelsMake(voxels);
        return;
    }
    level3DVoxelsDecode(voxels.blocks, map.data);
    map.rebuild();
}

// write the game's map into the level, as a stroke of painting ends
function editor3DVoxelStore()
{
    const map = editor3DVoxelMap(), voxels = editor3DLevelPart('voxels');
    map && voxels && (voxels.blocks = level3DVoxelsEncode(map.data));
}

// give the level an empty map of a size in cells, centered on the origin with its bottom on the ground, as one undo
function editor3DVoxelAdd(size=vec3(32, 16, 32))
{
    const changed = editor3DChangePart('voxels', ()=> ({pos: [-floor(size.x / 2), 0, -floor(size.z / 2)],
        size: [size.x, size.y, size.z], blocks: [size.x * size.y * size.z, 0]}));
    editor3DStrokeEnd();
    return changed;
}

// take the level's map away, as one undo
function editor3DVoxelRemove()
{
    const changed = editor3DChangePart('voxels', ()=> undefined);
    editor3DStrokeEnd();
    return changed;
}

// is a cell in a map
function editor3DVoxelInside(map, cell)
{
    const s = map.mapSize;
    return cell.x >= 0 && cell.y >= 0 && cell.z >= 0 && cell.x < s.x && cell.y < s.y && cell.z < s.z;
}

// set a block as part of the edit being made, 0 for none: in the game's map now, in the level when the stroke
// ends; false when it is that already, or there is no such cell
function editor3DVoxelSet(cell, type)
{
    const map = editor3DVoxelMap();
    if (!map || editor3DRecords.get(editor3DLevel)?.pending) return false; // its autosave waits first
    if (!editor3DVoxelInside(map, cell) || map.getVoxel(cell) === type) return false;
    editor3DStrokeBegin().painted = true;
    map.setVoxel(cell, type);
    return true;
}

// the cell a ray picks on a layer of the map: drag has the axis the layer is across, the plane the ray is met
// with, in cells from the map's corner, and the layer, the cell's place along the axis; undefined off the map
function editor3DVoxelDragCell(drag, ray)
{
    const map = editor3DVoxelMap(), axis = drag.axis, along = ray.direction[axis];
    if (!map || !along) return;
    const distance = (map.pos3D[axis] + drag.plane - ray.origin[axis]) / along;
    if (distance < 0) return;
    const p = ray.getPosition(distance).subtract(map.pos3D), cell = vec3(floor(p.x), floor(p.y), floor(p.z));
    cell[axis] = drag.layer;
    return editor3DVoxelInside(map, cell) ? cell : undefined;
}

///////////////////////////////////////////////////////////////////////////////
// the level's terrain: the level's terrain block is the source of truth, the game's HeightMap follows it;
// sculpting changes the game's map as it goes, and the stroke's end writes its heights into the level

// the brush: its size across in world units, how strong it is, 0 to 1, which brush it is, sculpt, flatten or
// paint, and the color it paints
const editor3DTerrainBrush = {size: 8, strength: .5, mode: 'sculpt', color: '#8a6a4a'};
const editor3DTerrainBrushes = ['sculpt', 'flatten', 'paint'];

// the paint of the game's terrain map as it is being edited, {colors, cells} as level3DTerrainPaint gives it:
// from the level, and ahead of it while a stroke paints
const editor3DTerrainPaints = new WeakMap;
function editor3DTerrainPaint(map)
{
    let paint = editor3DTerrainPaints.get(map);
    if (!paint)
    {
        const samples = map.rows * map.columns;
        paint = level3DTerrainPaint(editor3DLevelPart('terrain'), samples) || {colors: [], cells: new Uint8Array(samples)};
        editor3DTerrainPaints.set(map, paint);
    }
    return paint;
}

// the next brush of the Terrain tool
function editor3DTerrainNextBrush()
{
    const brushes = editor3DTerrainBrushes;
    editor3DTerrainBrush.mode = brushes[(brushes.indexOf(editor3DTerrainBrush.mode) + 1) % brushes.length];
}

// the drag a press on the ground starts, by the brush and the keys held: sculpt raises, Shift lowers; flatten
// brings the ground to the height pressed; paint colors it, Shift takes the paint off; Ctrl smooths with the two
// that shape the ground
function editor3DTerrainPress(point, shift, ctrl)
{
    const map = editor3DTerrainMap(), brush = editor3DTerrainBrush.mode;
    if (!map) return;
    if (brush === 'paint')
        return {kind: 'terrain', mode: shift ? 'erase' : 'paint'};
    if (ctrl)
        return {kind: 'terrain', mode: 'smooth'};
    if (brush === 'flatten')
        return {kind: 'terrain', mode: 'flatten', level: clamp((point.y - map.pos3D.y) / map.height)};
    return {kind: 'terrain', mode: shift ? 'lower' : 'raise'};
}

// the mouse held on the ground with a terrain drag
function editor3DTerrainDragTo(drag, point)
{
    return drag.mode === 'paint' || drag.mode === 'erase' ? editor3DTerrainPaintAt(point, drag.mode === 'erase') :
        editor3DTerrainSculpt(point, drag.mode, editor3DSeconds, drag.level);
}

// paint the ground around a point with the brush's color, or take its paint off, as part of the edit being made:
// every sample under the brush, in the game's map now and in the level when the stroke ends; false when nothing
// changed, or when the terrain has all the colors it can keep, 255
function editor3DTerrainPaintAt(point, erase=false)
{
    const map = editor3DTerrainMap();
    if (!map || editor3DRecords.get(editor3DLevel)?.pending) return false; // its autosave waits first
    const paint = editor3DTerrainPaint(map), hex = editor3DInputColor(editor3DTerrainBrush.color);
    let color = erase ? 0 : paint.colors.indexOf(hex) + 1;
    if (!erase && !color && paint.colors.length >= 255) return false;
    const radius = editor3DTerrainBrush.size / 2, rows = map.rows, columns = map.columns;
    const stepX = map.mapSize.x / (columns - 1), stepZ = map.mapSize.y / (rows - 1);
    const x0 = map.pos3D.x - map.mapSize.x / 2, z0 = map.pos3D.z - map.mapSize.y / 2;
    let changed = false;
    for (let r = 0; r < rows; ++r)
    for (let c = 0; c < columns; ++c)
    {
        if (hypot(x0 + c * stepX - point.x, z0 + r * stepZ - point.z) >= radius) continue;
        color ||= erase ? 0 : paint.colors.push(hex); // a new color joins the list with the first sample it paints
        if (paint.cells[r * columns + c] === color) continue;
        paint.cells[r * columns + c] = color;
        changed = true;
    }
    if (!changed) return false;
    editor3DStrokeBegin().sculpted = true;
    level3DTerrainSetColors(map, editor3DLevelPart('terrain'), paint);
    map.rebuild();
    return true;
}

// the game's map of the level's terrain, undefined when the level has none
function editor3DTerrainMap()
{
    const map = level3DTerrainMap;
    return map && !map.destroyed && editor3DLevelPart('terrain') ? map : undefined;
}

// bring the game's map in line with the level's terrain block: made, made again when its place or shape changed,
// its heights and color set, or destroyed with the block gone
function editor3DTerrainShow()
{
    const terrain = editor3DLevelPart('terrain'), shape = level3DTerrainShape(terrain);
    let map = level3DTerrainMap && !level3DTerrainMap.destroyed ? level3DTerrainMap : undefined;
    const fits = map && shape && map.pos3D.distance(shape.pos) === 0 && map.mapSize.distance(shape.size) === 0 &&
        map.height === shape.height && map.rows === shape.heights.length && map.columns === shape.heights[0].length;
    if (map && !fits)
    {
        map.destroy();
        map = level3DTerrainMap = undefined;
    }
    if (!shape) return;
    if (!map)
    {
        level3DTerrainMap = level3DTerrainMake(terrain);
        return;
    }
    map.heights = shape.heights;
    editor3DTerrainPaints.delete(map); // as the level has it
    level3DTerrainSetColors(map, terrain);
    map.rebuild();
}

// write the game's map into the level, as a stroke of sculpting ends, its heights to a thousandth, and its paint:
// the colors still in use and runs of a count and a color along the rows, or no paint when none is left
function editor3DTerrainStore()
{
    const map = editor3DTerrainMap(), terrain = editor3DLevelPart('terrain');
    if (!map || !terrain) return;
    terrain.heights = map.heights.map((row)=> row.map((v)=> round(v * 1e3) / 1e3));
    const paint = editor3DTerrainPaints.get(map);
    if (!paint) return; // nothing painted since the level's was read
    const used = paint.colors.map((hex, i)=> paint.cells.includes(i + 1));
    const colors = paint.colors.filter((hex, i)=> used[i]), cells = [];
    const index = paint.colors.map((hex, i)=> used[i] ? colors.indexOf(hex) + 1 : 0);
    for (const v of paint.cells)
    {
        const color = v && index[v - 1];
        cells[cells.length - 1] === color ? ++cells[cells.length - 2] : cells.push(1, color);
    }
    colors.length ? terrain.paint = {colors, cells} : delete terrain.paint;
    editor3DTerrainPaints.delete(map); // read from the level again, with its colors as they are numbered now
}

// give the level a flat terrain, as one undo: its size in the world, how many cells a side, and how tall a full
// height is; it starts a fifth of the way up with its surface on the ground, so it can be dug as well as raised
function editor3DTerrainAdd(size=vec2(64), cells=64, height=16)
{
    const samples = clamp(floor(cells), 1, LEVEL3D_TERRAIN_SAMPLES - 1) + 1;
    const changed = editor3DChangePart('terrain', ()=> ({pos: [0, editor3DRound(-height * .2), 0],
        size: [size.x, size.y], height, color: '#6a9955',
        heights: Array.from({length: samples}, ()=> Array(samples).fill(.2))}));
    editor3DStrokeEnd();
    return changed;
}

// take the level's terrain away, as one undo
function editor3DTerrainRemove()
{
    const changed = editor3DChangePart('terrain', ()=> undefined);
    editor3DStrokeEnd();
    return changed;
}

// sculpt the ground around a point for some seconds, as part of the edit being made: raise, lower or smooth it
// under the brush, a soft circle, most in its middle and nothing at its edge, or flatten it toward a height, level,
// 0 to 1; in the game's map now, in the level when the stroke ends; false when nothing changed
function editor3DTerrainSculpt(point, mode, seconds, level=0)
{
    const map = editor3DTerrainMap();
    if (!map || editor3DRecords.get(editor3DLevel)?.pending) return false; // its autosave waits first
    const {size, strength} = editor3DTerrainBrush, radius = size / 2, heights = map.heights;
    const rows = map.rows, columns = map.columns;
    const stepX = map.mapSize.x / (columns - 1), stepZ = map.mapSize.y / (rows - 1);
    const x0 = map.pos3D.x - map.mapSize.x / 2, z0 = map.pos3D.z - map.mapSize.y / 2;
    const c0 = max(0, ceil((point.x - radius - x0) / stepX)), c1 = min(columns - 1, floor((point.x + radius - x0) / stepX));
    const r0 = max(0, ceil((point.z - radius - z0) / stepZ)), r1 = min(rows - 1, floor((point.z + radius - z0) / stepZ));
    // smoothing reads the ground as it was, so the order the samples are done in does not show
    const old = mode === 'smooth' ? heights.map((row, r)=> r >= r0 - 1 && r <= r1 + 1 ? row.slice() : row) : heights;
    const rate = strength * 10 * seconds; // world units of height at full strength, 10 a second
    let changed = false;
    for (let r = r0; r <= r1; ++r)
    for (let c = c0; c <= c1; ++c)
    {
        const distance = hypot(x0 + c * stepX - point.x, z0 + r * stepZ - point.z);
        if (distance >= radius) continue;
        const falloff = .5 + .5 * cos(PI * distance / radius), h = heights[r][c];
        let v;
        if (mode === 'smooth')
        {
            // toward the average of the samples beside it
            let sum = 0, count = 0;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
                old[r + dr]?.[c + dc] !== undefined && (sum += old[r + dr][c + dc], ++count);
            v = h + (sum / count - h) * min(1, rate * falloff);
        }
        else if (mode === 'flatten')
            v = h + (level - h) * min(1, rate * falloff);
        else
            v = clamp(h + (mode === 'lower' ? -1 : 1) * rate * falloff / map.height);
        if (v === h) continue;
        heights[r][c] = v;
        changed = true;
    }
    if (!changed) return false;
    editor3DStrokeBegin().sculpted = true;
    map.rebuild();
    return true;
}

// what the Blocks tool does to a cell: place puts the current type in an empty one, paint gives a block the
// current type, remove empties it
function editor3DVoxelApply(cell, mode)
{
    const map = editor3DVoxelMap(), has = map ? map.getVoxel(cell) : 0;
    return mode === 'place' ? !has && editor3DVoxelSet(cell, editor3DBlockType) :
        mode === 'paint' ? !!has && editor3DVoxelSet(cell, editor3DBlockType) :
        editor3DVoxelSet(cell, 0);
}

// a press of the Blocks tool: the cell under the ray is changed, and what a drag needs to go on from it on the
// same layer; undefined with no cell there
function editor3DVoxelPress(ray, mode)
{
    const target = editor3DVoxelTarget(ray, mode);
    if (!target) return;
    const {cell, axis, plane, side} = target;
    if (editor3DBlockBox)
    {
        // a box grows out from the face when placing, and into the blocks when removing or repainting
        const drag = {kind: 'blocks', mode, axis, plane, layer: cell[axis], last: cell, start: cell,
            grow: mode === 'place' ? side : -side, height: max(1, floor(editor3DBlockBoxHeight)),
            changed: new Map, region: undefined};
        editor3DVoxelBoxTo(drag, cell);
        return drag;
    }
    editor3DVoxelApply(cell, mode);
    return {kind: 'blocks', mode, axis, plane, layer: cell[axis], last: cell};
}

// a box drag goes on: what it changed so far is put back, then every cell of the box from where it started to a
// cell of the same layer is changed, as many layers as its height, the part of it inside the map
function editor3DVoxelBoxTo(drag, cell)
{
    const map = editor3DVoxelMap();
    if (!map) return;
    for (const [at, type] of drag.changed.values())
        map.setVoxel(at, type);
    drag.changed.clear();
    const lo = vec3(min(drag.start.x, cell.x), min(drag.start.y, cell.y), min(drag.start.z, cell.z));
    const hi = vec3(max(drag.start.x, cell.x), max(drag.start.y, cell.y), max(drag.start.z, cell.z));
    const far = drag.layer + drag.grow * (drag.height - 1), axis = drag.axis, s = map.mapSize;
    lo[axis] = clamp(min(drag.layer, far), 0, s[axis] - 1);
    hi[axis] = clamp(max(drag.layer, far), 0, s[axis] - 1);
    for (let z = lo.z; z <= hi.z; ++z)
    for (let y = lo.y; y <= hi.y; ++y)
    for (let x = lo.x; x <= hi.x; ++x)
    {
        const at = vec3(x, y, z), type = map.getVoxel(at);
        editor3DVoxelApply(at, drag.mode) && drag.changed.set(x + s.x * (y + s.y * z), [at, type]);
    }
    drag.region = {lo, hi};
    drag.last = cell;
}

// change the size of the level's map in cells, as one undo: it grows and shrinks about its middle across, and at
// its top, and its blocks stay where they are in the world, the ones outside the new size gone
function editor3DVoxelResize(size)
{
    const changed = editor3DChangePart('voxels', (voxels)=>
    {
        const shape = level3DVoxelsShape(voxels);
        const to = vec3(floor(size.x), floor(size.y), floor(size.z));
        if (!shape || to.x < 1 || to.y < 1 || to.z < 1 || to.x * to.y * to.z > LEVEL3D_VOXEL_CELLS) return voxels;
        const from = shape.size, old = new Uint8Array(from.x * from.y * from.z);
        level3DVoxelsDecode(voxels.blocks, old);
        // how far each block moves in cells, so the corner moves the other way and the blocks stay put
        const dx = floor((to.x - from.x) / 2), dz = floor((to.z - from.z) / 2);
        const data = new Uint8Array(to.x * to.y * to.z);
        for (let z = 0; z < from.z; ++z)
        for (let y = 0; y < min(from.y, to.y); ++y)
        for (let x = 0; x < from.x; ++x)
        {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nz >= 0 && nx < to.x && nz < to.z)
                data[nx + to.x * (y + to.y * nz)] = old[x + from.x * (y + from.y * z)];
        }
        return {...voxels, pos: [shape.pos.x - dx, shape.pos.y, shape.pos.z - dz], size: [to.x, to.y, to.z],
            blocks: level3DVoxelsEncode(data)};
    });
    editor3DStrokeEnd();
    return changed;
}

// a drag of the Blocks tool goes on: every cell of the layer from the last one to the one under the ray
function editor3DVoxelDragTo(drag, ray)
{
    const cell = editor3DVoxelDragCell(drag, ray), last = drag.last;
    if (!cell) return;
    if (drag.changed)
        return editor3DVoxelBoxTo(drag, cell);
    const d = cell.subtract(last), steps = max(abs(d.x), abs(d.y), abs(d.z));
    for (let i = 1; i <= steps; ++i)
        editor3DVoxelApply(vec3(round(last.x + d.x * i / steps), round(last.y + d.y * i / steps),
            round(last.z + d.z * i / steps)), drag.mode);
    drag.last = cell;
}

// make the type of the block under a ray the one to place; false with no block there
function editor3DVoxelPick(ray)
{
    const hit = editor3DVoxelMap()?.raycast(ray);
    if (!hit) return false;
    editor3DBlockType = hit.type;
}

// the cell a click is for: to place, the empty cell against the face the ray hits, or the one standing on the
// map's floor where it hits no block; otherwise the block it hits; with the axis the face is across and the plane
// of the face, for a drag to stay on; undefined with no such cell
function editor3DVoxelTarget(ray, mode)
{
    const map = editor3DVoxelMap();
    if (!map) return;
    const place = mode === 'place', hit = map.raycast(ray);
    if (!hit)
    {
        const cell = place ? editor3DVoxelDragCell({axis: 'y', plane: 0, layer: 0}, ray) : undefined;
        return cell && {cell, axis: 'y', plane: 0, side: 1};
    }
    const n = hit.normal, axis = n.x ? 'x' : n.y ? 'y' : 'z', cell = place ? hit.cell.add(n) : hit.cell;
    if (!editor3DVoxelInside(map, cell)) return;
    // the face between the block hit and the cell in front of it, and side, the way that face looks along the axis
    return {cell, axis, plane: cell[axis] + ((n[axis] > 0) === place ? 0 : 1), side: n[axis]};
}

// end the edit being made: one undo, and the autosave
function editor3DStrokeEnd()
{
    const stroke = editor3DStroke;
    editor3DStroke = undefined;
    if (!stroke) return;
    stroke.painted && editor3DVoxelStore(); // the blocks painted go into the level
    stroke.sculpted && editor3DTerrainStore(); // and the ground sculpted
    const parts = editor3DLevelParts();
    if (editor3DSame(stroke.before, editor3DObjects()) && editor3DSame(stroke.parts, parts)) return;
    editor3DUndoList.push({before: stroke.before, after: editor3DCopy(editor3DObjects()),
        partsBefore: stroke.parts, partsAfter: parts});
    editor3DUndoList.length > 100 && editor3DUndoList.shift();
    editor3DRedoList.length = 0;
    editor3DAutosave();
}

// take the edit being made back, with nothing to undo
function editor3DStrokeCancel()
{
    const stroke = editor3DStroke;
    editor3DStroke = undefined;
    if (!stroke) return;
    editor3DSetObjects(stroke.before);
    stroke.painted && editor3DVoxelShow(); // the level never had them, the game's map goes back to it
    stroke.sculpted && editor3DTerrainShow();
    editor3DSetParts(stroke.parts);
}

// undo the last edit, or redo the last one undone; false with none
function editor3DUndo(redo=false)
{
    editor3DStrokeEnd();
    const entry = (redo ? editor3DRedoList : editor3DUndoList).pop();
    if (!entry) return false;
    (redo ? editor3DUndoList : editor3DRedoList).push(entry);
    editor3DSetObjects(redo ? entry.after : entry.before);
    editor3DSetParts(redo ? entry.partsAfter : entry.partsBefore);
    editor3DAutosave();
    return true;
}

// write an object's position, rotation in degrees and scale as the file keeps them: rounded, and the rotation and
// scale left out when they are the default; one not given is left as it is
function editor3DSetTransform(object, pos, rotation, scale)
{
    const list = (v)=> [editor3DRound(v.x), editor3DRound(v.y), editor3DRound(v.z)];
    pos && (object.pos = list(pos));
    if (rotation)
        list(rotation).some((v)=> v) ? object.rotation = list(rotation) : delete object.rotation;
    if (scale)
        list(scale).some((v)=> v !== 1) ? object.scale = list(scale) : delete object.scale;
}

// set an object's property as the file keeps it, only where it differs from its type's default: a Color as a hex
// string, with its alpha when it has one, and a vector as an array
function editor3DSetProperty(object, name, value, defaultValue)
{
    const encode = (v)=> isColor(v) ? v.toString(v.a < 1) : isVector3(v) ? [v.x, v.y, v.z] :
        isVector2(v) ? [v.x, v.y] : v;
    const properties = {...object.properties};
    if (editor3DSame(encode(value), encode(defaultValue)))
        delete properties[name];
    else
        properties[name] = encode(value);
    Object.keys(properties).length ? object.properties = properties : delete object.properties;
}

// add an object of a type at a position, selected; its id, or undefined when the level can not be edited
function editor3DPlace(type, pos)
{
    if (editor3DPrefabSelf(type)) return; // it would hold itself
    let id;
    const placed = editor3DChange((list)=>
    {
        const object = {id: id = list.reduce((next, o)=> max(next, o.id + 1), 1), type};
        editor3DSetTransform(object, pos);
        list.push(object);
    });
    if (!placed) return;
    editor3DSelection.clear();
    editor3DSelection.add(id);
    return id;
}

///////////////////////////////////////////////////////////////////////////////
// prefabs: a selection made one, an instance made objects again, and a prefab's own settings

// what the panel says about the last prefab action that was refused
let editor3DPrefabMessage = '';

// the box around an object in the world, turned and sized as it is, as its low and high corners
function editor3DWorldBox(object, low=vec3(Infinity), high=vec3(-Infinity))
{
    const matrix = editor3DBoxMatrix(object);
    for (let i = 8; i--;)
    {
        const p = matrix.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
        for (const k of ['x', 'y', 'z'])
            low[k] = min(low[k], p[k]), high[k] = max(high[k], p[k]);
    }
    return {low, high};
}

// is a type the prefab being edited, or one that holds it: a prefab that is open, or one the game made of the
// level being edited itself, as a prefab maker does; placed there it would hold itself
function editor3DPrefabSelf(type)
{
    const names = editor3DPrefabStack.map((frame)=> frame.name);
    for (const [name, prefab] of level3DPrefabs)
        prefab.source === editor3DLevel && names.push(name);
    return names.some((name)=> editor3DPrefabHolds(type, name));
}

// the types the Place list has, the plain ones and then the prefabs
function editor3DPlaceNames()
{
    const all = [...level3DTypes.keys()].filter((name)=> !editor3DPrefabSelf(name));
    return [...all.filter((name)=> !level3DPrefabs.has(name)), ...all.filter((name)=> level3DPrefabs.has(name))];
}

// does a type hold a prefab, itself or through the prefabs it holds
function editor3DPrefabHolds(type, name, depth=0)
{
    return type === name || depth < 8 &&
        !!level3DPrefabs.get(type)?.objects.some((o)=> editor3DPrefabHolds(o.type, name, depth + 1));
}

// make the selected objects a prefab of the level's own, about the bottom centre of their box, and put one
// instance of it where they were, as one undo; a name the level's prefabs have replaces that prefab, and every
// instance of it changes; true, or why not, which the panel shows
function editor3DMakePrefab(name='')
{
    const refuse = (why)=> editor3DPrefabMessage = why;
    const selected = editor3DSelected();
    if (editor3DPrefabStack.length) return refuse('Go back to the level to make a prefab');
    if (!selected.length) return refuse('Select the objects to make a prefab of');
    if (!editor3DLevel || editor3DRecords.get(editor3DLevel)?.pending) return refuse('The level can not be edited now');
    name = String(name).trim();
    for (let i = 1; !name; ++i)
        level3DTypes.has('Prefab ' + i) || (name = 'Prefab ' + i);
    const known = level3DPrefabs.get(name);
    if (known ? !known.fromLevel : level3DTypes.has(name))
        return refuse(name + ' is a type the game added, pick another name');
    if (selected.some((o)=> editor3DPrefabHolds(o.type, name)))
        return refuse(name + ' can not hold itself');

    // its origin is the bottom centre of the selection, so an instance stands on the ground
    const low = vec3(Infinity), high = vec3(-Infinity);
    for (const object of selected)
        editor3DWorldBox(object, low, high);
    const origin = vec3(editor3DRound((low.x + high.x) / 2), editor3DRound(low.y), editor3DRound((low.z + high.z) / 2));
    const objects = selected.map((object, i)=>
    {
        const part = {...editor3DCopy(object), id: i + 1};
        editor3DSetTransform(part, editor3DPos(object).subtract(origin));
        return part;
    });
    editor3DStrokeEnd();
    const id = editor3DObjects().reduce((next, o)=> max(next, o.id + 1), 1);
    const ids = new Set(selected.map((o)=> o.id));
    // the prefab first, so its type is there when the instance is made
    editor3DChangePart('prefabs', (prefabs={})=>
        ({...prefabs, [name]: prefabs[name]?.attached ? {attached: true, objects} : {objects}}));
    editor3DChange((list)=>
    {
        for (let i = list.length; i--;)
            ids.has(list[i].id) && list.splice(i, 1);
        const instance = {id, type: name};
        editor3DSetTransform(instance, origin);
        list.push(instance);
    });
    editor3DStrokeEnd();
    editor3DSelection.clear();
    editor3DSelection.add(id);
    editor3DPrefabMessage = '';
    return true;
}

// add a prefab from the text of a file the editor saved, a level file, to the level's own prefabs under a name,
// as one undo, and pick it to place; a name the level's prefabs have is replaced, as Make prefab does; true, or
// why not, which the panel shows
function editor3DPrefabLoad(name, text)
{
    const refuse = (why)=> editor3DPrefabMessage = why;
    if (editor3DPrefabStack.length) return refuse('Go back to the level to load a prefab');
    if (!editor3DLevel || editor3DRecords.get(editor3DLevel)?.pending) return refuse('The level can not be edited now');
    name = String(name).trim();
    if (!name) return refuse('The prefab needs a name');
    let file;
    try { file = JSON.parse(text); }
    catch { return refuse(name + ' is not a JSON file'); }
    if (!file || typeof file !== 'object' || !isArray(file.objects))
        return refuse(name + ' is not a prefab, it has no objects');
    const known = level3DPrefabs.get(name);
    if (known ? !known.fromLevel : level3DTypes.has(name))
        return refuse(name + ' is a type the game added, rename the file');
    const objects = file.objects.filter((o)=> o && typeof o === 'object');
    if (objects.some((o)=> editor3DPrefabHolds(o.type, name)))
        return refuse(name + ' can not hold itself');
    editor3DStrokeEnd();
    editor3DChangePart('prefabs', (prefabs={})=> ({...prefabs, [name]: file.attached ? {attached: true, objects} : {objects}}));
    editor3DStrokeEnd();
    editor3DPickTool(editor3DTool); // a tool of the game's own is put down
    editor3DBrush = name;
    editor3DPrefabMessage = '';
    return true;
}

// pick a prefab's file and load it, by its file name
function editor3DPrefabPickFile()
{
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async ()=>
    {
        const file = input.files?.[0];
        file && editor3DPrefabLoad(file.name.replace(/\.json$/i, ''), await file.text());
    };
    input.click();
}

// turn the selected instances of prefabs into the objects they are made of, where they are, as one undo; false
// with none selected
function editor3DUnpack()
{
    const instances = editor3DSelected().filter((o)=> editor3DInstances.get(o.id) instanceof Prefab3D);
    if (!instances.length) return false;
    editor3DStrokeEnd();
    const added = [];
    const changed = editor3DChange((list)=>
    {
        let id = list.reduce((next, o)=> max(next, o.id + 1), 1);
        for (const instance of instances)
        {
            const made = editor3DInstances.get(instance.id);
            // by the level's own place of it, its origin, which is not where an attached one's handle is
            const origin = {pos3D: editor3DPos(instance), rotation3D: editor3DRotation(instance).scale(PI / 180),
                scale3D: editor3DScale(instance)};
            for (const part of level3DPrefabs.get(made.prefabName)?.objects ?? [])
            {
                const at = level3DPrefabPartTransform(origin, part), object = {...editor3DCopy(part), id: id++};
                editor3DSetTransform(object, at.pos, at.rotation.scale(180 / PI), at.scale);
                list.push(object);
                added.push(object.id);
            }
            list.splice(list.findIndex((o)=> o.id === instance.id), 1);
        }
    });
    editor3DStrokeEnd();
    if (!changed) return false;
    editor3DSelection.clear();
    for (const id of added)
        editor3DSelection.add(id);
    return true;
}

// make a prefab of the level's own attached, its parts the children of each instance, or not, as one undo
function editor3DPrefabSetAttached(name, attached)
{
    if (editor3DPrefabStack.length) return false; // a prefab is the level's, set from the level
    editor3DStrokeEnd();
    const changed = editor3DChangePart('prefabs', (prefabs)=>
    {
        if (!prefabs?.[name]) return prefabs;
        const {attached: was, ...rest} = prefabs[name];
        return {...prefabs, [name]: attached ? {attached: true, ...rest} : rest};
    });
    editor3DStrokeEnd();
    return changed;
}

// a prefab as its own file has it, a level file of its objects, to load with level3DLoadPrefab
function editor3DPrefabJSON(name)
{
    const prefab = level3DPrefabs.get(name);
    if (!prefab) return '';
    return editor3DLevelJSON({...(prefab.attached ? {attached: true} : {}), objects: prefab.objects});
}

///////////////////////////////////////////////////////////////////////////////
// Edit prefab: the editor on a prefab alone, the level it came from put away until Back

// the prefabs opened one inside the other, each with the level it was opened from, its name, the selection there
// and the ids of that level's objects that had something made for them
/** @type {Array<{level: Object, name: string, selection: Array<number>, made: Set<number>, entered?: string}>} */
const editor3DPrefabStack = [];
// the levels that are a prefab being edited, they have no autosave of their own
const editor3DPrefabLevels = new WeakSet;
// what was edited in prefabs of the level's own since the level was left, written into it on the way back
/** @type {Object<string, Object>} */
let editor3DPrefabEdits = {};
// the prefabs of the game's own that were edited and are not in a file yet
const editor3DPrefabDirty = new Set;
// what is known of each prefab's file, by its name, so it outlasts the prefab being closed and opened again: the
// save being written, for the next to wait on, what the file has since a Save, and what the prefab holds now
/** @type {Map<string, {saving?: Promise<any>, saved?: string, content?: string}>} */
const editor3DPrefabFiles = new Map;
function editor3DPrefabFile(name)
{
    editor3DPrefabFiles.has(name) || editor3DPrefabFiles.set(name, {});
    return editor3DPrefabFiles.get(name);
}

// say if a prefab of the game's own is in its file, now that it holds this: once a Save has written it, it is
// when what it holds is what was written; before any Save it is not once it was edited
function editor3DPrefabFileCheck(name, content, edited=false)
{
    const file = editor3DPrefabFile(name);
    file.content = content;
    if (level3DPrefabs.get(name)?.fromLevel) return; // one of the level's own is saved with the level
    if (file.saved !== undefined)
        content === file.saved ? editor3DPrefabDirty.delete(name) : editor3DPrefabDirty.add(name);
    else if (edited)
        editor3DPrefabDirty.add(name);
}

// destroy what the level being edited has in the world, its objects' and its maps'
function editor3DPrefabClear()
{
    for (const made of editor3DInstances.values())
        made?.destroy?.();
    editor3DInstances.clear();
    for (const map of [level3DVoxelMap, level3DTerrainMap])
        map && !map.destroyed && map.destroy();
}

// open the prefab of an instance, the selected one when none is given, to edit alone: its objects about its own
// origin, with an undo of its own, and the level it is in put away; false when it is not a prefab's instance
function editor3DPrefabEnter(id)
{
    const selected = editor3DSelected();
    id ??= selected.length === 1 ? selected[0].id : undefined;
    const made = editor3DInstances.get(id), from = editor3DLevel;
    const prefab = made instanceof Prefab3D && level3DPrefabs.get(made.prefabName);
    if (!prefab || editor3DRecords.get(from)?.pending) return false;
    editor3DStrokeEnd();
    editor3DDrag = editor3DHover = undefined;
    const frame = {level: from, name: made.prefabName, selection: [...editor3DSelection],
        made: new Set(editor3DInstances.keys()), entered: undefined};
    editor3DPrefabStack.push(frame);
    editor3DPrefabClear();
    const level = {littlejs3D: LEVEL3D_VERSION, ...(prefab.attached ? {attached: true} : {}),
        objects: editor3DCopy(prefab.objects)};
    editor3DPrefabLevels.add(level);
    level3DLoad(level); // the editor takes it as it does any level
    frame.entered = JSON.stringify(editor3DObjects()); // as the editor has it, an edit is what differs from this
    return true;
}

// leave the prefab being edited for the level it was opened from: the prefab is what was edited, every instance
// of it is made again, and back in the level itself what was edited in its own prefabs is one undo; false when
// no prefab is open
function editor3DPrefabBack()
{
    const frame = editor3DPrefabStack.pop(), edited = editor3DLevel;
    if (!frame) return false;
    editor3DStrokeEnd();
    editor3DDrag = editor3DHover = undefined;
    const known = level3DPrefabs.get(frame.name);
    const objects = editor3DCopy(editor3DObjects()), changed = JSON.stringify(objects) !== frame.entered;
    editor3DPrefabClear();
    if (changed)
    {
        // the prefab as it is now, for whatever is made next; one of the game's own waits to be saved to its file
        const prefab = known?.attached ? {attached: true, objects} : {objects}, fromLevel = !!known?.fromLevel;
        level3DPrefabSet(frame.name, prefab, fromLevel);
        if (fromLevel)
            editor3DPrefabEdits[frame.name] = prefab;
    }
    // one of the game's own is in its file or not by what it holds now, edited here or not: undone back to how it
    // was opened after a Save, it is not what the file has
    editor3DPrefabFileCheck(frame.name, JSON.stringify(objects), changed);

    // the level it was opened from is the editor's again, with its own undo
    const level = editor3DLevel = frame.level, record = editor3DRecords.get(level);
    editor3DUndoList = record.undo, editor3DRedoList = record.redo;
    editor3DStroke = undefined;
    if (!editor3DPrefabStack.length)
    {
        // back in the level: its own prefabs that were edited go into it, as one undo
        const edits = editor3DPrefabEdits;
        editor3DPrefabEdits = {};
        Object.keys(edits).length && editor3DChangePart('prefabs', (prefabs={})=> ({...prefabs, ...edits}));
        editor3DStrokeEnd();
    }
    // what the level had in the world is made again: what a class makes, and what else had something made
    for (const object of editor3DObjects())
    {
        const type = level3DTypes.get(object.type);
        type && (type.make.prototype || frame.made.has(object.id)) && editor3DMakeInstance(object);
    }
    editor3DSceneRestore(record.sceneBase);
    level3DSceneApply(level.scene);
    editor3DVoxelShow();
    editor3DTerrainShow();
    editor3DShadowLight();
    editor3DSelection.clear();
    for (const id of frame.selection)
        editor3DObject(id) && editor3DSelection.add(id);
    return true;
}

// remove the selected objects, as one undo
function editor3DDelete()
{
    if (!editor3DSelection.size) return false;
    editor3DStrokeEnd();
    editor3DChange((list)=>
    {
        for (let i = list.length; i--;)
            editor3DSelection.has(list[i].id) && list.splice(i, 1);
    });
    editor3DStrokeEnd();
}

// copy the selected objects
function editor3DCopySelection()
{
    const selected = editor3DSelected();
    if (!selected.length) return false;
    editor3DClipboard = editor3DCopy(selected);
    // how big each was and where its box was about its place: what is cut has nothing left to measure
    editor3DClipboardBoxes = new Map(editor3DClipboard.map((copy, i)=>
        [copy, {size: editor3DSize(selected[i]), offset: editor3DBoxOffset(selected[i])}]));
}

// copy the selected objects and remove them
function editor3DCut() { return editor3DCopySelection() === false ? false : editor3DDelete(); }

// add the copied objects, moved by an offset, with new ids and selected, as one undo
function editor3DPaste(offset=vec3())
{
    const copied = editor3DClipboard, ids = [];
    if (!copied?.length) return false;
    editor3DStrokeEnd();
    const pasted = editor3DChange((list)=>
    {
        let id = list.reduce((next, o)=> max(next, o.id + 1), 1);
        for (const from of copied)
        {
            const object = {...editor3DCopy(from), id: id++};
            editor3DSetTransform(object, editor3DPos(from).add(offset));
            list.push(object);
            ids.push(object.id);
        }
    });
    editor3DStrokeEnd();
    if (!pasted) return false;
    editor3DSelection.clear();
    ids.forEach((id)=> editor3DSelection.add(id));
}

// copy the selected objects where they are and select the copies, the clipboard stays as it was
function editor3DDuplicate()
{
    const clipboard = editor3DClipboard;
    const done = editor3DCopySelection() === false ? false : editor3DPaste();
    editor3DClipboard = clipboard;
    return done;
}

///////////////////////////////////////////////////////////////////////////////
// the session: opening, playing and closing

// if the level editor is the 3D one: as levelEditor.use3D says, or when a 3D level was loaded
function editor3DWanted() { return !!render3D && (levelEditor.use3D ?? !!editor3DLevel); }

// put every object back where the level has it, and make one the game destroyed again, so what is on screen is
// what Save writes; a type made by an arrow function made nothing to put back
function editor3DRestore()
{
    for (const object of editor3DObjects())
    {
        const type = level3DTypes.get(object.type), made = editor3DInstances.get(object.id);
        if (!type) continue;
        // a prefab's instance that play took a part of is made again, whole
        const broken = (p)=> p instanceof Prefab3D && p.parts.some((part)=> part?.destroyed || broken(part));
        if (made instanceof EngineObject3D && !made.destroyed && !broken(made))
            editor3DPlaceInstance(made, object);
        else if (type.make.prototype && (!made || made.destroyed || broken(made)))
            editor3DMakeInstance(object);
    }
    // the blocks and the terrain as the level has them: what play dug, raised or destroyed is not the level's,
    // and must not be written into it by the next stroke
    editor3DVoxelShow();
    editor3DTerrainShow();
}

// open or close the editor, the session goes on: the game is paused under it and reads no input
function editor3DSetOpen(open)
{
    open = !!open;
    if (!debug || editor3DIsOpen === open) return;
    if (open)
    {
        editor3DSetFreeCamera(false);
        editor3DLevel || editor3DLevelLoaded({}); // a new level, with nothing loaded
        editor3DCamera || editor3DCameraStart();
        editor3DGamePaused = paused;
        setPaused(true);
        setDebugOverlay(false); // out of the way of the level
        editor3DIsOpen = true;
        editor3DRestore();
        editorCall('onOpen');
        editorKeyClashes();
    }
    else
    {
        editor3DDrag = editor3DHover = undefined;
        editor3DMouseOnPanel = false; // the panel hides, with no mouseleave
        editor3DStrokeEnd();
        while (editor3DPrefabBack()); // the game plays the level, not a prefab that was open
        editor3DToolHeld = false;
        editor3DIsOpen = false;
        setPaused(editor3DGamePaused);
        editorCall('onClose');
    }
    inputCapture(editor3DViewOn());
}

// open the editor, a new session starts at the game's camera and a return keeps the editor's
function editor3DOpen()
{
    editor3DSession || editor3DCameraStart();
    editor3DSession = true;
    editor3DSetOpen(true);
}

// close the editor and end its session, Escape opens the debug overlay again
function editor3DClose()
{
    editor3DSession = false;
    editor3DSetOpen(false);
}

// switch to playing, from a position when Play from mouse is on
function editor3DPlay(pos)
{
    editor3DSetOpen(false);
    editor3DPlayFromMouse && pos && editorHas('onPlayFrom') && levelEditor.onPlayFrom(pos.copy());
}

// rebuild the level through the game's hook and play it
function editor3DRestart()
{
    if (!editorHas('onRestart')) return;
    editor3DSetOpen(false);
    levelEditor.onRestart();
}

// a key as addKey spells it, as the 3D editor's tables have it, by its position: a letter, a digit, a mark by the
// key it is on, or its name
const editor3DKeyMarks = {'?': 'Slash', '/': 'Slash', ',': 'Comma', '.': 'Period', ';': 'Semicolon', "'": 'Quote',
    '[': 'BracketLeft', ']': 'BracketRight', '-': 'Minus', '=': 'Equal', '\\': 'Backslash', '`': 'Backquote'};
function editor3DKeyCode(name)
{
    return name.length !== 1 ? name : editor3DKeyMarks[name] ??
        (name >= '0' && name <= '9' ? 'Digit' + name : 'Key' + name.toUpperCase());
}

// the 3D editor's edit functions, what levelEditor.edit3D gives a game's own keys, buttons and tools
const editor3DEdit =
{
    get level() { return editor3DLevel; },
    get objects() { return editor3DObjects(); },
    get selection() { return editor3DSelection; },
    selected() { return editor3DSelected(); },
    made(id) { return editor3DInstances.get(id); },
    change(change) { return editor3DChange(change); },
    changePart(name, change) { return editor3DLevelPartNames.includes(name) && editor3DChangePart(name, change); },
    strokeEnd() { editor3DStrokeEnd(); },
    strokeCancel() { editor3DStrokeCancel(); },
    place(type, pos3D) { return level3DTypes.has(type) ? editor3DPlace(type, pos3D) : undefined; },
    setTransform(object, pos3D, rotation, scale3D) { editor3DSetTransform(object, pos3D, rotation, scale3D); },
    setProperty(object, name, value)
    { editor3DSetProperty(object, name, value, level3DTypes.get(object.type)?.defaults[name]); },
    pos(object) { return editor3DPos(object); },
    rotation(object) { return editor3DRotation(object); },
    scale(object) { return editor3DScale(object); },
    mousePoint() { return editor3DIsOpen && !editor3DMouseOnPanel ? editor3DWithView(editor3DMousePoint) : undefined; },
    undo(redo=false) { return editor3DUndo(redo); },
    toJSON() { return editor3DLevel ? editor3DLevelJSON() : ''; },
};

// the level editor's open, close and isOpen go to the 3D editor when the game has a 3D level, and it has the 3D
// editor's keys and edit functions through this
if (debug)
    editorOther = {wanted: editor3DWanted, isOpen: ()=> editor3DIsOpen, active: ()=> editor3DIsOpen || editor3DSession,
        open: editor3DOpen, close: editor3DClose, edit: editor3DEdit,
        hasKey: (name, ctrl)=> !!(ctrl ? editor3DCtrlKeys : editor3DKeys)[editor3DKeyCode(name)]};

// pick a tool of the editor's own, which puts a tool of the game's down
function editor3DPickTool(tool)
{
    editor3DTool = tool;
    levelEditor.tool = undefined;
}

// a tool of the game's own: if its press is held, and the editor's tool and type to place when it was turned on,
// since picking one of those puts the game's tool down
let editor3DToolHeld = false, editor3DToolName, editor3DToolPicked = [];

// what a tool's callbacks are given: where the mouse is on the level or the ground, its ray, and the keys held
function editor3DToolAt(ray=render3D.screenToRay(mousePosScreen), shift=false, ctrl=false)
{ return {pos: editor3DMouseOnPanel ? undefined : editor3DSurface(ray), cell: undefined, ray, shift, ctrl}; }

// the game's tool, when one is on: the left button is its, a press, a drag and a release one undo, the right
// button takes a held press back; true when it has the mouse
function editor3DToolUpdate(ray, idle, shift, ctrl)
{
    const picked = [editor3DTool, editor3DBrush];
    if (levelEditor.tool !== editor3DToolName)
        editor3DToolName = levelEditor.tool, editor3DToolPicked = picked; // turned on, or off, by its key or button
    else if (picked.some((value, i)=> value !== editor3DToolPicked[i]))
        levelEditor.tool = editor3DToolName = undefined; // a tool or a type of the editor's was picked
    const tool = editorGameTool();
    if (!tool)
    {
        editor3DToolHeld = false;
        return false;
    }
    const at = editor3DToolAt(ray, shift, ctrl);
    editor3DHover = editor3DBlockHover = editor3DTerrainHover = undefined; // the editor's own cursors are put away
    if (editor3DToolHeld && mouseWasPressed(2))
    {
        editor3DStrokeCancel();
        editor3DToolHeld = false;
    }
    else if (idle && mouseWasPressed(0))
        editor3DToolHeld = tool.onPress?.(at) !== false;
    else if (editor3DToolHeld && mouseIsDown(0))
        tool.onDrag?.(at);
    if (editor3DToolHeld && !mouseIsDown(0))
    {
        tool.onRelease?.(at);
        editor3DStrokeEnd();
        editor3DToolHeld = false;
    }
    return true;
}

// the game's own drawing in the level, in the editor's 3D pass: the editor's onDraw, and its tool's while one is on
function editor3DDrawGame()
{
    if (!editor3DIsOpen) return;
    editorCall('onDraw');
    const held = (...codes)=> inputCaptureRead(()=> codes.some((code)=> keyIsDown(code)));
    editorGameTool()?.onDraw?.(editor3DToolAt(undefined, held('ShiftLeft', 'ShiftRight'),
        held('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight')));
}

///////////////////////////////////////////////////////////////////////////////
// files: the level as JSON, Save, and the autosave

// a value as JSON on one line, with a space after each comma and colon, as a person would write it
function editor3DJSON(value)
{
    if (isArray(value))
        return '[' + value.map(editor3DJSON).join(', ') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).filter(([, v])=> v !== undefined)
            .map(([key, v])=> JSON.stringify(key) + ': ' + editor3DJSON(v)).join(', ') + '}';
    return JSON.stringify(value) ?? 'null';
}

// a level as the file has it: its version, what else it holds, and its objects, one to a line
function editor3DLevelJSON(level=editor3DLevel)
{
    const {littlejs3D, objects, ...rest} = level;
    const lines = [`"littlejs3D": ${LEVEL3D_VERSION}`];
    for (const [key, value] of Object.entries(rest))
        lines.push(JSON.stringify(key) + ': ' + editor3DJSON(value));
    const list = (isArray(objects) ? objects : []).map((o)=> '    ' + editor3DJSON(o));
    lines.push('"objects": [' + (list.length ? '\n' + list.join(',\n') + '\n  ]' : ']'));
    return '{\n  ' + lines.join(',\n  ') + '\n}\n';
}

// every page keeps its own autosaves, one for each level by its key
function editor3DSaveName() { return 'LittleJS editor 3D ' + (globalThis.location?.pathname ?? ''); }
const editor3DSaves = ()=> readSaveData(editor3DSaveName(), {});

// if the last autosave did not fit in storage, the panel says so
let editor3DSaveFailed = false;

// remember the level's objects and parts, or forget them when they are back to the file
function editor3DAutosave(level=editor3DLevel, known)
{
    // a prefab being edited is kept with the level it is in, as that level would be on going back: its own
    // prefabs with what is open, and what was edited on the way, in them
    if (editor3DPrefabLevels.has(level))
    {
        const root = editor3DPrefabStack[0]?.level, edits = {...editor3DPrefabEdits};
        editor3DPrefabStack.forEach((frame, i)=>
        {
            const open = editor3DPrefabStack[i + 1]?.level ?? editor3DLevel, known = level3DPrefabs.get(frame.name);
            const objects = isArray(open.objects) ? editor3DCopy(open.objects) : [];
            if (known?.fromLevel && JSON.stringify(objects) !== frame.entered)
                edits[frame.name] = known.attached ? {attached: true, objects} : {objects};
        });
        // with nothing edited any more, an undo back to how the prefab was, the level's autosave is the level's own
        // again, which takes away one of an edit that was undone and keeps the level's other edits
        const prefabs = {...editor3DLevelPart('prefabs', root), ...edits};
        root && editor3DAutosave(Object.keys(prefabs).length ? {...root, prefabs} : root, editor3DRecords.get(root));
        return;
    }
    const record = known ?? editor3DRecords.get(level);
    if (!record || record.pending) return; // edits waiting to be applied keep their autosave
    const saves = editor3DSaves(), objects = isArray(level.objects) ? level.objects : [];
    const parts = editor3DLevelParts(level);
    // the level as it was loaded has nothing to keep; one a Save wrote is kept until a reload shows the file has it,
    // since the browser gives a picked file's name and not its folder, and a file of the same name may be a copy
    if (editor3DSame(objects, record.original) && editor3DSame(parts, record.originalParts) && !record.savedHash)
        delete saves[record.key];
    else
        saves[record.key] = {hash: record.hash, savedHash: record.savedHash, objects: editor3DCopy(objects),
            ...parts};
    const failed = editorSaveFailed; // the 2D editor's own flag is its own
    editor3DSaveFailed = editorWriteSaves(saves, record.key, editor3DSaveName());
    editorSaveFailed = failed;
}

// put the autosaved edits of a file that changed into the level, as one undo
function editor3DApplyPending()
{
    const record = editor3DRecords.get(editor3DLevel), saved = record?.pending;
    if (!saved || !isArray(saved.objects)) return false;
    record.pending = undefined;
    editor3DFixIds(saved.objects);
    editor3DChange((list)=> { list.length = 0; list.push(...editor3DCopy(saved.objects)); });
    const parts = editor3DLevelParts(saved);
    for (const name of editor3DLevelPartNames)
        editor3DChangePart(name, ()=> parts[name]);
    editor3DStrokeEnd();
    editor3DAutosave();
}

// drop the autosaved edits of a file that changed
function editor3DDropPending()
{
    const record = editor3DRecords.get(editor3DLevel);
    if (!record?.pending) return false;
    record.pending = undefined;
    editor3DAutosave();
}

// Reset to file: put the level back as its file has it, or as Save last wrote it, as one undo; edits waiting for a
// file that changed are dropped, and a level already as its file has it is left alone
function editor3DRevert()
{
    const record = editor3DRecords.get(editor3DLevel);
    if (!record) return false;
    record.pending = undefined;
    if (editor3DSame(editor3DObjects(), record.original) && editor3DSame(editor3DLevelParts(), record.originalParts))
        return editor3DAutosave(), false;
    editor3DChange((list)=> { list.length = 0; list.push(...editor3DCopy(record.original)); });
    for (const name of editor3DLevelPartNames)
        editor3DChangePart(name, ()=> record.originalParts[name] && editor3DCopy(record.originalParts[name]));
    editor3DStrokeEnd();
}

// save the level as JSON: where the browser lets a page write files, Chrome and Edge, to a file picked once and
// written again on each Save after, or picked again with Save As; elsewhere as a download; a file of the level's
// own name that was written is the file from then on, for the autosave; resolves to how it saved, undefined when
// the picker was closed; saves of a level run one at a time in the order asked, so the file ends with the last
async function editor3DSave(pickAgain=false)
{
    const level = editor3DLevel, record = editor3DRecords.get(level);
    if (!record) return;
    editor3DStrokeEnd();
    const open = editor3DPrefabStack[editor3DPrefabStack.length - 1];
    if (open)
    {
        // inside a prefab, Save writes the prefab as a file of its own, or the game keeps it itself
        const text = editor3DLevelJSON(level), name = open.name + '.json';
        const written = JSON.stringify(editor3DObjects()); // as the file has it
        // its place in line is the prefab's, by its name: closed and opened again it is a new level here, and its
        // saves still go in the order they were asked for
        const file = editor3DPrefabFile(open.name), before = file.saving;
        const saved = (async ()=>
        {
            await before;
            const kept = await editorCall('onSave', text, name) === true;
            kept || saveText(text, name, 'application/json');
            file.saved = written;
            // it is in its file when what it holds now is what was written: edited again while the save was
            // kept, or gone back from with more edits, it still waits
            const at = editor3DPrefabStack.indexOf(open);
            const now = at < 0 ? file.content : JSON.stringify((editor3DPrefabStack[at + 1]?.level ?? editor3DLevel).objects);
            editor3DPrefabFileCheck(open.name, now ?? written);
            return kept ? 'kept' : 'downloaded';
        })();
        file.saving = saved.catch(()=> {});
        return saved;
    }
    // what is written, kept as it is now: the level can change while the file is picked and written, and those
    // edits are not in the file, so they stay in the autosave; the level and record are this one's, whichever is
    // open by then
    const text = editor3DLevelJSON(level);
    // its place in line is taken now, and the game's hook is asked when its turn comes, so saves are written in
    // the order they were asked for however long a hook takes
    const saved = (async ()=>
    {
        await record.saving;
        if (await editorCall('onSave', text, record.fileName) === true) return 'kept'; // the game kept it itself
        return editor3DSaveText(level, record, text, pickAgain);
    })();
    record.saving = saved.catch(()=> {});
    return saved;
}

// write one save of a level, the one before it done
async function editor3DSaveText(level, record, text, pickAgain)
{
    const file = JSON.parse(text), written = editor3DCopy(file.objects), writtenParts = editor3DLevelParts(file);
    const picker = /** @type {any} */ (globalThis).showSaveFilePicker;
    const fileKey = (globalThis.location?.pathname ?? '') + ' 3D ' + record.key;
    if (picker)
    {
        try
        {
            if (!pickAgain && !record.fileHandle)
            {
                const handle = await editorFileStore.get(fileKey), mode = {mode: 'readwrite'};
                if (handle && (await handle.queryPermission(mode) === 'granted' ||
                    await handle.requestPermission(mode) === 'granted'))
                    record.fileHandle = handle;
            }
            if (pickAgain || !record.fileHandle)
            {
                record.fileHandle = await picker.call(globalThis, {suggestedName: record.fileName,
                    types: [{description: 'LittleJS 3D level', accept: {'application/json': ['.json']}}]});
                editorFileStore.set(fileKey, record.fileHandle);
            }
            const writable = await record.fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            if (record.fileHandle.name === record.fileName)
            {
                record.original = written;
                record.originalParts = writtenParts;
                record.savedHash = editor3DContentHash(written, writtenParts);
                editor3DAutosave(level);
            }
            return 'written';
        }
        catch (error)
        {
            if (error?.name === 'AbortError') return; // the picker was closed, nothing saved
            record.fileHandle = undefined; // a file it could not write, a download instead, and not kept
            editorFileStore.set(fileKey, undefined);
        }
    }
    saveText(text, record.fileName, 'application/json');
    return 'downloaded';
}

///////////////////////////////////////////////////////////////////////////////
// the tools: handles on the selection, dragged with the mouse

const EDITOR3D_HANDLE_SIZE = .15; // a handle's length as a part of the view's height
const EDITOR3D_HANDLE_REACH = 10; // how many pixels from a handle still grab it
const EDITOR3D_AXES = {x: vec3(1, 0, 0), y: vec3(0, 1, 0), z: vec3(0, 0, 1)};

let editor3DTool = 'move';     // 'select', 'move', 'rotate', 'scale', 'blocks' or 'terrain'
let editor3DBlockType = 1;     // the block type the Blocks tool places
let editor3DBlockBox = false;  // the Blocks tool fills a box: the rectangle dragged, editor3DBlockBoxHeight tall
let editor3DBlockBoxHeight = 1;
let editor3DSeconds = 0;       // how long the last step was, for a brush held down
// where the mouse is on the terrain, for the Terrain tool's brush
/** @type {Vector3|undefined} */
let editor3DTerrainHover;
// the cell the Blocks tool would change, for its outline: {cell, mode}
/** @type {{cell: Vector3, mode: string}|undefined} */
let editor3DBlockHover;
let editor3DGrid = true;       // moves, turns and sizes go in steps, Ctrl flips it for a drag
let editor3DGroundSnap = true; // a body drag slides along what is under the mouse
let editor3DLocalAxes = false; // the Move handles follow the object's own axes, not the world's
let editor3DMoveStep = 1, editor3DRotateStep = 15, editor3DScaleStep = .25; // the rotate step in degrees
let editor3DHelp = false;      // the keys are shown
let editor3DMouseOnPanel = false;
// the drag being made: {kind, ...}, a 'box' drag has from and to in screen pixels
/** @type {any} */
let editor3DDrag;
// the handle under the mouse
/** @type {any} */
let editor3DHover;
// what an Alt drag orbits around
/** @type {Vector3|undefined} */
let editor3DOrbitPivot;

// the middle of the selection, where the handles are
function editor3DSelectionCenter()
{
    const selected = editor3DSelected();
    if (selected.length)
        return selected.reduce((sum, o)=> sum.add(editor3DPos(o)), vec3()).scale(1 / selected.length);
}

// the handles of the tool on the selection, each {kind, axis, center, length, direction or axes, points}: Move has
// an arrow along each world axis and a square between each pair, Rotate a ring for the pitch, yaw and roll of the
// first selected object, Scale a handle along each of its own axes and a box in the middle for all three
function editor3DHandles()
{
    const center = editor3DSelectionCenter(), tool = editor3DTool, handles = [];
    if (!center || tool === 'select' || tool === 'blocks' || tool === 'terrain' || editorGameTool()) return handles;
    const length = editor3DScreenScale(center) * EDITOR3D_HANDLE_SIZE;
    const rotation = editor3DRotation(editor3DSelected()[0]).scale(PI / 180), frame = buildMatrix(vec3(), rotation);
    for (const axis of 'xyz')
    {
        if (tool === 'rotate')
        {
            const axes = editor3DRingAxes(rotation, axis), points = [];
            for (let i = 0; i <= 48; ++i)
            {
                const a = i / 48 * PI * 2;
                points.push(center.add(axes.across.scale(cos(a) * length)).add(axes.along.scale(sin(a) * length)));
            }
            handles.push({kind: 'ring', axis, center, length, axes, points});
            continue;
        }

        // an arrow or scale handle starts a little out from the middle, which is left for the object's body; Move
        // goes along the world's axes, or with own axes on along the object's, as Scale always does
        const local = tool !== 'move' || editor3DLocalAxes;
        const way = (k)=> local ? frame.transformDirection(EDITOR3D_AXES[k]) : EDITOR3D_AXES[k];
        const direction = way(axis), turn = tool === 'move' && local ? rotation : undefined;
        handles.push({kind: tool === 'move' ? 'arrow' : 'scale', axis, center, length, direction, turn,
            points: [center.add(direction.scale(length * .2)), center.add(direction.scale(length))]});
        if (tool === 'move')
        {
            // the square between the other two axes moves along both; across is the axis it does not move along
            const [a, b] = 'xyz'.replace(axis, '');
            handles.push({kind: 'plane', axis: a + b, center, length, direction, turn, across: axis,
                ways: [way(a), way(b)], points: [center.add(way(a).add(way(b)).scale(length * .35))]});
        }
    }
    tool === 'scale' && handles.push({kind: 'scaleAll', axis: 'xyz', center, length, points: [center]});
    return handles;
}

// the handle nearest a screen position, within reach; a square or box is a point and a little easier to take
function editor3DHandleAt(screenPos)
{
    let nearest, reach = EDITOR3D_HANDLE_REACH;
    for (const handle of editor3DHandles())
    {
        // a ring seen edge on is a line on screen and the mouse's ray runs along its plane, it can not be dragged
        const {points, center} = handle, toward = center.subtract(editor3DCamera.pos).normalize();
        if (handle.kind === 'ring' && abs(handle.axes.axis.dot(toward)) < .15) continue;

        // an arrow or scale handle seen end on is a dot over the object, which is left for the object's body
        if (points.length === 2)
        {
            const a = render3D.worldToScreen(points[0]), b = render3D.worldToScreen(points[1]);
            if (a && b && a.distance(b) < 12) continue;
        }
        let distance = Infinity;
        if (points.length === 1)
        {
            const at = render3D.worldToScreen(points[0]);
            at && (distance = screenPos.distance(at) - 4);
        }
        else
            for (let i = 1; i < points.length; ++i)
                distance = min(distance, editor3DSegmentDistance(screenPos, points[i-1], points[i]));
        if (distance < reach)
            reach = distance, nearest = handle;
    }
    return nearest;
}

// the object of the level a ray hits first: what the game made for it or a part attached to that, or a unit box
// where it made nothing to hit, like a light or a player start; its id
function editor3DPickAt(ray)
{
    let nearest, id;
    for (const object of editor3DObjects())
    {
        const parts = editor3DVisible(object) ? editor3DParts(editor3DInstances.get(object.id)) : [];
        let distance = parts.length ? undefined : raycastBox(ray, editor3DPos(object), vec3(1));
        for (const part of parts)
        {
            const d = render3DRaycastObject(ray, part);
            if (d !== undefined && (distance === undefined || d < distance))
                distance = d;
        }
        if (distance !== undefined && (nearest === undefined || distance < nearest))
            nearest = distance, id = object.id;
    }
    return id;
}

// what the game made for an object and the parts attached to it, its children and theirs
function editor3DParts(made, parts=[])
{
    if (made instanceof EngineObject && !made.destroyed)
    {
        parts.push(made);
        for (const child of made.children)
            editor3DParts(child, parts);
        // a prefab's instance and its parts are one thing, the ones that are not its children too
        if (made instanceof Prefab3D)
            for (const part of made.parts)
                part?.parent === made || editor3DParts(part, parts);
    }
    return parts;
}

// what the game made for the selected objects, with their parts, left out when the selection looks for a surface
// to stand on
function editor3DSelectedInstances()
{
    return new Set(editor3DSelected().flatMap((o)=> editor3DParts(editor3DInstances.get(o.id))));
}

// where each selected object is, as a drag starts from
function editor3DDragStart()
{
    return new Map(editor3DSelected().map((o)=>
        [o.id, {pos: editor3DPos(o), rotation: editor3DRotation(o), scale: editor3DScale(o)}]));
}

// the left button went down: on a handle it drags it, with a brush it places one, on an object it selects it and
// may drag it, and on nothing it drags out a box to select with
function editor3DPress(mouse, ray, shift)
{
    const handle = editor3DHandleAt(mouse), from = mouse.copy();
    if (handle)
    {
        const {kind, center, direction, axes} = handle;
        const grab = kind === 'ring' ? editor3DRingAngle(ray, center, axes) :
            kind === 'plane' ? editor3DPlanePoint(ray, center, direction) :
            kind === 'scaleAll' ? 0 : editor3DAxisDistance(ray, center, direction);
        editor3DDrag = {kind, handle, from, grab, start: editor3DDragStart()};
        return;
    }
    if (editor3DBrush)
    {
        editor3DPlaceAt(editor3DBrush, ray);
        shift || (editor3DBrush = undefined);
        editor3DTool = 'move';
        return;
    }
    const id = editor3DPickAt(ray);
    if (id === undefined)
    {
        editor3DDrag = {kind: 'box', from, to: from.copy(), shift};
        return;
    }
    if (shift)
    {
        editor3DSelection.has(id) ? editor3DSelection.delete(id) : editor3DSelection.add(id);
        return;
    }
    if (!editor3DSelection.has(id))
    {
        editor3DSelection.clear();
        editor3DSelection.add(id);
    }

    // a drag of its body moves it level, at its height, so it stays under the mouse; seen from the side, where the
    // mouse's ray runs along that plane, it moves across the view instead, in the upright plane facing it
    const pos = editor3DPos(editor3DObject(id)), forward = editor3DCamera.getForward();
    const side = abs(ray.direction.y) < .2 && vec3(forward.x, 0, forward.z).normalize();
    const normal = side && side.lengthSquared() ? side : EDITOR3D_UP;
    editor3DDrag = {kind: 'body', id, from, moving: false, ignore: editor3DSelectedInstances(), normal,
        start: editor3DDragStart(), level: editor3DPlanePoint(ray, pos, normal) ?? pos};
}

// place an object of a type where a ray lands, standing on what is there, snapped, selected, as one undo
function editor3DPlaceAt(type, ray)
{
    const point = editor3DSurface(ray);
    if (!point) return;
    editor3DStrokeEnd();
    const id = editor3DPlace(type, point);
    if (id === undefined) return;
    const object = editor3DObject(id), size = editor3DSize(object), offset = editor3DBoxOffset(object);
    const ignore = new Set(editor3DParts(editor3DInstances.get(id)));
    const snapped = editor3DSnapPos(editor3DRest(point, size), size, editor3DGrid ? editor3DMoveStep : 0);
    const y = editor3DLand(snapped.x, snapped.z, point.y, size, ignore);
    // the box stands there, and the object's place is where that puts it
    const to = vec3(snapped.x, y, snapped.z).subtract(offset);
    editor3DChange((list)=> editor3DSetTransform(list.find((o)=> o.id === id), to));
    editor3DStrokeEnd();
}

// the mouse moved with a drag held: the selection goes from where the drag started to where the mouse says
function editor3DDragTo(drag, mouse, ray, snap)
{
    if (drag.kind === 'blocks')
        return editor3DVoxelDragTo(drag, ray);
    if (drag.kind === 'terrain')
        return editor3DTerrainHover && editor3DTerrainDragTo(drag, editor3DTerrainHover);
    if (drag.kind === 'box')
    {
        drag.to = mouse.copy();
        return;
    }
    if (drag.kind === 'body' && !(drag.moving ||= mouse.distance(drag.from) > 4)) return;
    const {kind, handle, start, grab} = drag, first = editor3DObject(drag.id ?? [...start.keys()][0]);
    const was = first && start.get(first.id);
    if (!was) return;
    const size = editor3DSize(first), turned = editor3DTurned(first), step = snap ? editor3DMoveStep : 0;
    const offset = editor3DBoxOffset(first); // snapping and landing go by its box
    const snapTo = (to)=> editor3DSnapPos(to.add(offset), size, step, turned).subtract(offset).subtract(was.pos);
    let move, turn, factor;
    if (kind === 'arrow')
    {
        const d = editor3DAxisDistance(ray, handle.center, handle.direction) - grab;
        // an axis of its own does not follow the grid, so the move goes in steps from where it started
        move = handle.turn ? handle.direction.scale(step ? round(d / step) * step : d) :
            handle.direction.multiply(snapTo(was.pos.add(handle.direction.scale(d)))); // along its axis alone
    }
    else if (kind === 'plane')
    {
        const point = editor3DPlanePoint(ray, handle.center, handle.direction);
        if (!point || !grab) return;
        const delta = point.subtract(grab), along = (w)=> step ? round(delta.dot(w) / step) * step : delta.dot(w);
        move = handle.turn ? handle.ways[0].scale(along(handle.ways[0])).add(handle.ways[1].scale(along(handle.ways[1]))) :
            vec3(1).subtract(handle.direction).multiply(snapTo(was.pos.add(delta)));
    }
    else if (kind === 'body')
    {
        // level under the mouse, and with ground snap it lands on what is under it there, from where it started
        const point = editor3DPlanePoint(ray, drag.level, drag.normal);
        if (!point) return;
        const across = snapTo(was.pos.add(point.subtract(drag.level)));
        const y = editor3DGroundSnap ? editor3DLand(was.pos.x + offset.x + across.x, was.pos.z + offset.z + across.z,
            was.pos.y + offset.y - size.y / 2, size, drag.ignore) - offset.y : was.pos.y;
        move = vec3(across.x, y - was.pos.y, across.z);
    }
    else if (kind === 'ring')
    {
        const angle = editor3DRingAngle(ray, handle.center, handle.axes);
        if (angle === undefined || grab === undefined) return;
        turn = mod((angle - grab) * 180 / PI + 180, 360) - 180; // the short way around
    }
    else if (kind === 'scale')
    {
        if (abs(grab) < 1e-6) return;
        factor = vec3(1);
        factor[handle.axis] = max(editor3DAxisDistance(ray, handle.center, handle.direction) / grab, .01);
    }
    else // the box in the middle sizes all three, right and up is larger
        factor = vec3(Math.exp((mouse.x - drag.from.x - mouse.y + drag.from.y) / 200));

    editor3DChange((list)=>
    {
        for (const object of list)
        {
            const s = start.get(object.id);
            if (!s) continue;
            if (move)
                editor3DSetTransform(object, s.pos.add(move));
            if (turn !== undefined)
            {
                const rotation = s.rotation.copy();
                rotation[handle.axis] = editor3DSnap(rotation[handle.axis] + turn, snap ? editor3DRotateStep : 0);
                editor3DSetTransform(object, undefined, rotation);
            }
            if (factor)
            {
                const size = snap ? editor3DScaleStep : 0, least = size || .01;
                const scale = s.scale.multiply(factor);
                editor3DSetTransform(object, undefined, undefined, vec3(max(editor3DSnap(scale.x, size), least),
                    max(editor3DSnap(scale.y, size), least), max(editor3DSnap(scale.z, size), least)));
            }
        }
    });
}

// the left button went up: a box selects what is inside it, by where each object's middle is on screen, and a
// press that never moved clears the selection; any other drag is one undo
function editor3DDragEnd(drag, mouse)
{
    editor3DDrag = undefined;
    if (drag.kind !== 'box')
        return editor3DStrokeEnd();
    drag.shift || editor3DSelection.clear();
    const {from} = drag;
    if (mouse.distance(from) < 4) return;
    const low = vec2(min(from.x, mouse.x), min(from.y, mouse.y));
    const high = vec2(max(from.x, mouse.x), max(from.y, mouse.y));
    for (const object of editor3DObjects())
    {
        const at = render3D.worldToScreen(editor3DPos(object));
        at && at.x >= low.x && at.x <= high.x && at.y >= low.y && at.y <= high.y &&
            editor3DSelection.add(object.id);
    }
}

// take the drag being made back, with nothing to undo
function editor3DDragCancel()
{
    editor3DDrag = undefined;
    editor3DStrokeCancel();
}

///////////////////////////////////////////////////////////////////////////////
// the editor's camera, keys and update

// the surface under a screen position, under the mouse and under the middle of the view, seen through the
// editor's camera
function editor3DScreenPoint(screenPos)
{ return editor3DWithView(()=> editor3DSurface(render3D.screenToRay(screenPos))); }
function editor3DMousePoint() { return editor3DScreenPoint(mousePosScreen); }
function editor3DViewPoint() { return editor3DScreenPoint(mainCanvasSize.scale(.5)); }

// move the camera back along its view until the selection is in the middle and fits
function editor3DFrame()
{
    const center = editor3DSelectionCenter(), camera = editor3DCamera;
    if (!center) return false;
    const radius = editor3DSelected().reduce((r, o)=>
        max(r, editor3DPos(o).distance(center) + editor3DSize(o).length() / 2), 0);
    camera.pos = center.subtract(camera.getForward().scale(max(radius * 2.5, 3)));
    render3D.updateMatrices();
}

// drop the selection straight down onto what is under it, each object by itself, as one undo
function editor3DDropSelection()
{
    const ignore = editor3DSelectedInstances();
    if (!editor3DSelection.size) return false;
    editor3DStrokeEnd();
    editor3DChange((list)=>
    {
        for (const object of list)
        {
            const offset = editor3DBoxOffset(object), to = editor3DSelection.has(object.id) &&
                editor3DDrop(editor3DPos(object).add(offset), editor3DSize(object), ignore);
            to && editor3DSetTransform(object, to.subtract(offset));
        }
    });
    editor3DStrokeEnd();
}

// paste the copied objects with their middle under the mouse, the lowest standing on what is there, snapped by
// the first of them; where they were when the mouse is over nothing
function editor3DPasteAtMouse()
{
    const copied = editor3DClipboard, point = !editor3DMouseOnPanel && editor3DMousePoint();
    if (!copied?.length) return false;
    if (!point) return editor3DPaste();
    const center = copied.reduce((sum, o)=> sum.add(editor3DPos(o)), vec3()).scale(1 / copied.length);
    const box = (o)=> editor3DClipboardBoxes.get(o) ?? {size: editor3DSize(o), offset: editor3DBoxOffset(o)};
    const bottom = copied.reduce((low, o)=> min(low, editor3DPos(o).y + box(o).offset.y - box(o).size.y / 2), Infinity);
    const first = copied[0], size = box(first).size, was = editor3DPos(first).add(box(first).offset); // its box's middle
    const snapped = editor3DSnapPos(was.add(vec3(point.x - center.x, 0, point.z - center.z)), size,
        editor3DGrid ? editor3DMoveStep : 0, editor3DTurned(first));
    const land = editor3DLand(snapped.x, snapped.z, point.y, size) - size.y / 2;
    return editor3DPaste(vec3(snapped.x - was.x, land - bottom, snapped.z - was.z));
}

// the keys by their position on the keyboard, each called with whether Shift is held; the tool keys are the ones
// Unity, Unreal and Godot use
/** @type {Object<string, function(boolean=): any>} */
const editor3DKeys =
{
    KeyQ: ()=> { editor3DPickTool('select'); editor3DBrush = undefined; },
    KeyW: ()=> { editor3DPickTool('move'); },
    KeyE: ()=> { editor3DPickTool('rotate'); },
    KeyR: ()=> { editor3DPickTool('scale'); },
    KeyB: ()=> { editor3DPickTool('blocks'); editor3DBrush = undefined; },
    KeyT: ()=> { editor3DPickTool('terrain'); editor3DBrush = undefined; },
    KeyP: ()=> editor3DTool === 'blocks' && editor3DVoxelPick(render3D.screenToRay(mousePosScreen)),
    KeyX: ()=> editor3DTool === 'terrain' ? editor3DTerrainNextBrush() :
        editor3DTool === 'blocks' && (editor3DBlockBox = !editor3DBlockBox),
    KeyG: ()=> { editor3DGrid = !editor3DGrid; },
    KeyL: ()=> { editor3DLocalAxes = !editor3DLocalAxes; },
    KeyF: ()=> editor3DFrame(),
    End: ()=> editor3DDropSelection(),
    Delete: ()=> editor3DDelete(),
    Backspace: ()=> editor3DSelection.size ? editor3DDelete() : editor3DPrefabBack(),
    Enter: ()=> editor3DPrefabEnter(),
    Slash: ()=> { editor3DHelp = !editor3DHelp; },
};
/** @type {Object<string, function(boolean=): any>} */
const editor3DCtrlKeys =
{
    KeyZ: (shift)=> editor3DUndo(shift),
    KeyY: ()=> editor3DUndo(true),
    KeyC: ()=> editor3DCopySelection(),
    KeyX: ()=> editor3DCut(),
    KeyV: ()=> editor3DPasteAtMouse(),
    KeyD: ()=> editor3DDuplicate(),
    KeyG: (shift)=> shift ? editor3DUnpack() : editor3DMakePrefab() === true,
};

// the camera: the right button looks and the keys fly while it is held, the middle button or Space and the left
// pans, Alt and the left orbits the selection, and the wheel zooms toward what is under the mouse
function editor3DCameraUpdate(seconds, shift, alt)
{
    const camera = editor3DCamera, delta = inputCaptureDeltaScreen, wheel = inputCaptureWheel;
    const ahead = ()=> camera.pos.add(camera.getForward().scale(10));
    if (mouseIsDown(2))
    {
        editor3DFlySpeed = clamp(editor3DFlySpeed * Math.exp(-wheel * .2), .01, 10);
        editor3DFly(camera, editor3DFlyKeys(), delta, seconds, shift);
    }
    else if (mouseIsDown(1) || keyIsDown('Space') && mouseIsDown(0))
    {
        // the scene follows the mouse, at the depth of what is in the middle of the view
        const perPixel = editor3DScreenScale(editor3DViewPoint() ?? ahead()) / mainCanvasSize.y;
        camera.pos = camera.pos.subtract(camera.getRight().scale(delta.x * perPixel))
            .add(camera.getUp().scale(delta.y * perPixel));
    }
    else if (alt && mouseIsDown(0))
    {
        if (mouseWasPressed(0) || !editor3DOrbitPivot)
            editor3DOrbitPivot = editor3DSelectionCenter() ?? editor3DViewPoint() ?? ahead();
        const pivot = editor3DOrbitPivot, distance = camera.pos.distance(pivot);
        editor3DFly(camera, vec3(), delta, 0);
        camera.pos = pivot.subtract(camera.getForward().scale(distance));
    }
    else if (wheel && !editor3DMouseOnPanel)
    {
        // toward what is under the mouse, a part of the way there for each notch, and never through it
        render3D.updateMatrices();
        const ray = render3D.screenToRay(mousePosScreen), target = editor3DSurface(ray);
        const distance = target ? camera.pos.distance(target) : 10;
        camera.pos = camera.pos.add(ray.direction.scale(min(max(distance * .15, .2) * -wheel, distance - .5)));
    }
    render3D.updateMatrices(); // what follows picks and projects through the camera where it is now
}

// the editor's update, called while it is open with the input readable and render3D looking through its camera
function editor3DEditorUpdate(seconds)
{
    editor3DSeconds = seconds;
    const held = (...codes)=> codes.some((code)=> keyIsDown(code));
    const shift = held('ShiftLeft', 'ShiftRight'), alt = held('AltLeft', 'AltRight');
    const ctrl = held('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight');
    const mouse = mousePosScreen;

    // Escape, the debug key, puts a drag back, or else switches to playing; taken, so the debug overlay stays shut
    if (debugKey && keyWasPressed(debugKey))
    {
        inputClearKey(debugKey);
        if (editor3DToolHeld)
        {
            editor3DStrokeCancel(); // a held press of the game's tool is taken back
            editor3DToolHeld = false;
        }
        else
            editor3DDrag ? editor3DDragCancel() : editor3DPlay(editor3DMousePoint());
        return;
    }

    // 0 exits the editor; cleared, so debugKeysAlways does not open it again in the same step
    if (keyWasPressed('Digit0'))
    {
        inputClearKey('Digit0');
        editor3DClose();
        return;
    }

    editor3DCameraUpdate(seconds, shift, alt);
    const looking = mouseIsDown(2), cameraDrag = looking || mouseIsDown(1) || keyIsDown('Space') || alt;

    // the keys, which wait for a drag to end, and fly while the right button is held
    if (!editor3DDrag && !looking && !editor3DToolHeld)
    {
        // the game's own keys first, each takes the place of the editor's key of the same spelling
        const taken = new Set;
        for (const [spelled, key] of Object.entries(levelEditor.keys))
        {
            const withCtrl = spelled.startsWith('ctrl+'), code = editor3DKeyCode(spelled.slice(withCtrl ? 5 : 0));
            if (withCtrl !== ctrl) continue;
            taken.add(code);
            keyWasPressed(code) && key.action.call(levelEditor, shift);
        }
        for (const [code, action] of Object.entries(ctrl ? editor3DCtrlKeys : editor3DKeys))
            taken.has(code) || keyWasPressed(code) && action(shift);
    }

    // a right press during a drag puts it back
    if (editor3DDrag && mouseWasPressed(2))
        return editor3DDragCancel();

    const ray = render3D.screenToRay(mouse), idle = !cameraDrag && !editor3DMouseOnPanel && !editor3DDrag;
    editor3DHover = idle ? editor3DHandleAt(mouse) : undefined;
    editorCall('onUpdate');
    if (editor3DToolUpdate(ray, idle, shift, ctrl)) return; // a tool of the game's own has the mouse

    // the Blocks tool takes the mouse while the level has a map: Shift removes, Ctrl repaints
    // a type picked to place is placed, whichever tool is on
    const painting = editor3DTool === 'blocks' && !editor3DBrush && !!editor3DVoxelMap();
    const mode = shift ? 'remove' : ctrl ? 'paint' : 'place';
    const target = painting && idle ? editor3DVoxelTarget(ray, mode) : undefined;
    editor3DBlockHover = target && {cell: target.cell, mode};
    // the Terrain tool takes it while the level has a terrain: held down its brush works on the ground
    const terrain = editor3DTool === 'terrain' && !editor3DBrush ? editor3DTerrainMap() : undefined;
    const reach = terrain && !cameraDrag && !editor3DMouseOnPanel ? terrain.raycast(ray) : undefined;
    editor3DTerrainHover = reach === undefined ? undefined : ray.getPosition(reach);
    if (painting)
        idle && mouseWasPressed(0) && (editor3DDrag = editor3DVoxelPress(ray, mode));
    else if (terrain)
        idle && mouseWasPressed(0) && editor3DTerrainHover &&
            (editor3DDrag = editor3DTerrainPress(editor3DTerrainHover, shift, ctrl));
    else if (idle && mouseWasPressed(0))
        editor3DPress(mouse, ray, shift);

    // a quick click, down and up before this step, is a press and its release in one
    const drag = editor3DDrag;
    if (drag)
        mouseIsDown(0) ? editor3DDragTo(drag, mouse, ray, editor3DGrid !== ctrl) : editor3DDragEnd(drag, mouse);
}

// Ctrl with a letter the editor uses is not the browser's while the editor is open, Ctrl+D would bookmark the page
if (debug && globalThis.document?.addEventListener)
    document.addEventListener('keydown', (e)=>
    {
        if (editor3DIsOpen && (e.ctrlKey || e.metaKey) && /^Key[ZYCXVDG]$/.test(e.code) && !editorIsTextField(e.target))
            e.preventDefault();
    });

///////////////////////////////////////////////////////////////////////////////
// what the panel does to the level, and what it says

// the help, every control
const editor3DHelpLines =
[
    'Left: select · Shift+Left: add or take away · Left drag from empty space: box select',
    'Q select · W move · E rotate · R scale: drag a handle, or the object itself',
    'G: grid snap, Ctrl flips it for a drag · L: move along its own axes · End: drop to the ground',
    'Right button: look, and WASD and QE fly while it is held, Shift faster',
    'Wheel: zoom · Middle drag or Space+drag: pan · Alt+drag: orbit · F: frame the selection',
    'Pick a type, then click to place it, Shift+click keeps placing',
    'B blocks: click or drag places · Shift removes · Ctrl repaints · P picks the type under the mouse',
    'X box fill: a drag fills the rectangle dragged, as tall as the height in the panel',
    'T terrain: hold to raise the ground · Shift lowers · Ctrl smooths · X the next brush, flatten and paint',
    'Delete · Ctrl+C / X / V: copy, cut, paste · Ctrl+D: duplicate · Ctrl+Z / Y: undo, redo',
    'Ctrl+G: make the selection a prefab, one thing to place many times · Ctrl+Shift+G: unpack it into its objects',
    'Enter: open the selected prefab to edit it alone, every instance follows · Backspace with nothing selected: back',
    'Reset to file: the level as its file has it, Restart keeps your edits, Undo brings them back',
    'Esc: play and edit · 0: exit the editor · ?: keys',
];

// the hint line, for what is held and what is selected
function editor3DHint()
{
    if (editor3DRecords.get(editor3DLevel)?.pending)
        return 'The level file changed: apply your edits or drop them';
    if (editorGameTool()) return editorGameTool().hint || levelEditor.tool;
    if (editor3DDrag)
        return editor3DDrag.kind === 'box' ? 'Let go to select what is inside' :
            'Esc or right click puts it back · Ctrl flips the snap';
    if (inputCaptureRead(()=> mouseIsDown(2)))
        return 'WASD and QE fly · Shift faster · the wheel sets the speed';
    if (editor3DBrush)
        return `Click to place a ${editor3DBrush} · Shift keeps placing · Q puts it down`;
    if (editor3DTool === 'terrain')
        return !editor3DTerrainMap() ? 'Add a terrain in the panel to sculpt it' :
            {sculpt: 'Hold to raise the ground · Shift lowers · Ctrl smooths',
            flatten: 'Hold to flatten the ground to the height pressed · Ctrl smooths',
            paint: 'Hold to paint the ground · Shift takes the paint off'}[editor3DTerrainBrush.mode] +
            ' · X the next brush';
    if (editor3DTool === 'blocks')
        return editor3DVoxelMap() ? (editor3DBlockBox ? 'Drag a box to fill it' : 'Click or drag places') +
            ' · Shift removes · Ctrl repaints · P picks a type · X box' :
            'Add a block map in the panel to paint blocks';
    if (editor3DSelection.size)
        return 'Drag a handle or the object · W move · E rotate · R scale · End drops it';
    return 'Click to select · pick a type to place · the right button looks · ? keys';
}

// if the properties box has an input for a default's type
const editor3DPropertyEditable = (value)=> ['number', 'boolean', 'string'].includes(typeof value) ||
    isColor(value) || isVector2(value) || isVector3(value);

// set the position, rotation in degrees or scale of the one selected object, from the panel, as one undo
function editor3DSetSelectedTransform(field, value)
{
    const selected = editor3DSelected(), id = selected[0]?.id;
    if (selected.length !== 1 || !isVector3(value)) return false;
    editor3DStrokeEnd();
    editor3DChange((list)=> editor3DSetTransform(list.find((o)=> o.id === id), field === 'pos' ? value : undefined,
        field === 'rotation' ? value : undefined, field === 'scale' ? value : undefined));
    editor3DStrokeEnd();
    return true;
}

// set a property of the one selected object, from the panel, as one undo; the value has the type of its default
function editor3DSetSelectedProperty(name, value)
{
    const selected = editor3DSelected(), id = selected[0]?.id;
    const defaults = selected[0] && level3DTypes.get(selected[0].type)?.defaults;
    const d = defaults && Object.hasOwn(defaults, name) ? defaults[name] : undefined;
    const sameType = isColor(d) ? isColor(value) : isVector3(d) ? isVector3(value) :
        isVector2(d) ? isVector2(value) : typeof value === typeof d;
    if (selected.length !== 1 || !editor3DPropertyEditable(d) || !sameType) return false;
    editor3DStrokeEnd();
    editor3DChange((list)=> editor3DSetProperty(list.find((o)=> o.id === id), name, value, d));
    editor3DStrokeEnd();
    return true;
}

///////////////////////////////////////////////////////////////////////////////
// what the editor draws

const EDITOR3D_AXIS_COLORS = {x: hsl(0, .9, .55), y: hsl(.33, .9, .45), z: hsl(.6, .9, .6)};
const EDITOR3D_SELECT_COLOR = hsl(.15, 1, .6), EDITOR3D_MARKER_COLOR = hsl(.55, 1, .7);
const EDITOR3D_SOLID_COLOR = hsl(.08, 1, .55);

// a width in world units that shows as a number of pixels at a point
function editor3DPixels(point, pixels) { return editor3DScreenScale(point) / mainCanvasSize.y * pixels; }

// the 12 edges of the unit box a matrix places
function editor3DDrawWire(matrix, color, pixels=2)
{
    const corner = (i)=> matrix.transformPoint(vec3(i & 1 ? .5 : -.5, i & 2 ? .5 : -.5, i & 4 ? .5 : -.5));
    const width = editor3DPixels(matrix.getTranslation(), pixels);
    for (let i = 0; i < 8; ++i)
    for (const bit of [1, 2, 4])
        i & bit || render3D.drawLine(corner(i), corner(i | bit), width, color);
}

// a ring around a point across two axes
function editor3DDrawRing(center, across, along, radius, color, pixels=2)
{
    const points = [];
    for (let i = 0; i <= 32; ++i)
    {
        const a = i / 32 * PI * 2;
        points.push(center.add(across.scale(cos(a) * radius)).add(along.scale(sin(a) * radius)));
    }
    render3D.drawRibbon(points, editor3DPixels(center, pixels), undefined, color);
}

// what the game made for an object, when it has something to see and click
function editor3DVisible(object)
{
    const made = editor3DInstances.get(object.id);
    return made instanceof EngineObject3D && !made.destroyed && (made.mesh || made.tileInfo || editor3DPrefabBox(made)) ?
        made : undefined;
}

// the box around an object as a matrix: around its mesh where it is, turned and sized as it is, a unit box for a
// marker
function editor3DBoxMatrix(object)
{
    const made = editor3DVisible(object), bounds = made?.mesh && (made.mesh.bounds || made.mesh.getBounds());
    if (!made)
        return buildMatrix(editor3DPos(object));
    const box = editor3DPrefabBox(made);
    if (box)
        return buildMatrix(box.pos, undefined, box.size);
    const matrix = render3DObjectMatrix(made).copy();
    return bounds ? matrix.multiply(buildMatrix(bounds.min.add(bounds.max).scale(.5), undefined,
        bounds.max.subtract(bounds.min))) : matrix.multiply(buildMatrix(vec3(), undefined, made.size3D));
}

// the ground grid at height 0 around where the camera is, a line each unit and a stronger one each 10, fading
// with distance; drawn with the depth test so the level hides it, and a hair over 0 so a floor there does not
function editor3DDrawGrid()
{
    const camera = editor3DCamera.pos, reach = 40, y = .01;
    const x0 = round(camera.x), z0 = round(camera.z);
    for (let i = -reach; i <= reach; ++i)
    for (const across of [false, true])
    {
        const at = (across ? z0 : x0) + i, strong = at % 10 === 0;
        if (!strong && abs(i) > reach / 2) continue;
        const fade = 1 - abs(i) / (strong ? reach : reach / 2);
        const a = across ? vec3(x0 - reach, y, at) : vec3(at, y, z0 - reach);
        const b = across ? vec3(x0 + reach, y, at) : vec3(at, y, z0 + reach);
        render3D.drawLine(a, b, strong ? .04 : .02, hsl(0, 0, 1, (strong ? .35 : .15) * fade));
    }
}

// the cone a move arrow ends in, standing on Y, made the first time one is drawn
let editor3DCone;
const editor3DConeMesh = ()=> editor3DCone ||= buildCone(1, 1, 12);

// the editor's drawing in the 3D pass: the grid, a marker for what has nothing to see, the collision shape of
// what is solid and selected, the selection, the brush where it would go, and the handles
function editor3DDraw()
{
    const r = render3D;
    render3DWithState({depthTest: true}, editor3DDrawGrid);
    for (const object of editor3DObjects())
    {
        const made = editor3DVisible(object), selected = editor3DSelection.has(object.id);
        made || editor3DDrawWire(editor3DBoxMatrix(object), EDITOR3D_MARKER_COLOR, 1.5);
        selected && editor3DDrawWire(editor3DBoxMatrix(object), EDITOR3D_SELECT_COLOR, 2.5);
        if (made?.collideSolidObjects && !made.parent && selected)
        {
            // what it collides as, which turns with it, where its size3D is not its mesh's
            const shape = render3DSolidShape(made), color = EDITOR3D_SOLID_COLOR;
            if (shape.size)
                editor3DDrawWire(buildMatrix(shape.pos, shape.axes && made.rotation3D, shape.size), color, 1.5);
            else
                for (const [across, along] of [['x', 'y'], ['y', 'z'], ['z', 'x']])
                    editor3DDrawRing(shape.pos, EDITOR3D_AXES[across], EDITOR3D_AXES[along], shape.radius, color, 1.5);
        }
    }

    // the cell the Blocks tool would change: white to place, red to remove, yellow to repaint
    const map = editor3DTool === 'blocks' && !editor3DMouseOnPanel ? editor3DVoxelMap() : undefined;
    if (map && editor3DBlockHover && !editor3DDrag)
    {
        const {cell, mode} = editor3DBlockHover;
        editor3DDrawWire(buildMatrix(map.pos3D.add(cell).add(vec3(.5)), undefined, vec3(1.02)),
            mode === 'place' ? hsl(0, 0, 1, .9) : mode === 'remove' ? hsl(0, 1, .6) : hsl(.15, 1, .6), 2.5);
    }
    // the Terrain tool's brush, a ring on the ground
    if (editor3DTool === 'terrain' && editor3DTerrainHover && editor3DTerrainMap())
        editor3DDrawRing(editor3DTerrainHover.add(vec3(0, .05, 0)), EDITOR3D_AXES.x, EDITOR3D_AXES.z,
            editor3DTerrainBrush.size / 2, hsl(0, 0, 1, .9), 2.5);

    // the box a box drag fills
    const region = map && editor3DDrag?.region;
    if (region)
    {
        const size = region.hi.subtract(region.lo).add(vec3(1));
        editor3DDrawWire(buildMatrix(map.pos3D.add(region.lo).add(size.scale(.5)), undefined, size.add(vec3(.02))),
            editor3DDrag.mode === 'place' ? hsl(0, 0, 1, .9) : editor3DDrag.mode === 'remove' ? hsl(0, 1, .6) :
            hsl(.15, 1, .6), 2.5);
    }
    // the map's edges, to see where it ends
    if (map)
        editor3DDrawWire(buildMatrix(map.pos3D.add(map.mapSize.scale(.5)), undefined, map.mapSize),
            hsl(.55, .6, .6, .5), 1);

    // the brush, a box where a click would place it
    const point = editor3DBrush && !editor3DMouseOnPanel && !editor3DDrag && editor3DMousePoint();
    if (point)
    {
        const snapped = editor3DSnapPos(editor3DRest(point, vec3(1)), vec3(1), editor3DGrid ? editor3DMoveStep : 0);
        editor3DDrawWire(buildMatrix(vec3(snapped.x, point.y + .5, snapped.z)), hsl(0, 0, 1, .7));
    }

    // the handles, the one under the mouse or being dragged in the selection's color
    for (const handle of editor3DHandles())
    {
        const {kind, axis, center, length, points} = handle;
        const taken = (editor3DDrag?.handle ?? editor3DHover);
        const lit = taken && taken.kind === kind && taken.axis === axis;
        const color = lit ? EDITOR3D_SELECT_COLOR : EDITOR3D_AXIS_COLORS[axis[0]] ?? WHITE;
        const width = editor3DPixels(center, lit ? 4 : 3), tip = length * .1;
        if (kind === 'ring')
            r.drawRibbon(points, width, undefined, color);
        else if (kind === 'plane')
        {
            // a flat square across its two axes, in the color of the axis it does not move along
            const size = vec3(tip * 1.6).subtract(EDITOR3D_AXES[handle.across].scale(tip * 1.5));
            r.drawBox(points[0], size, lit ? color : EDITOR3D_AXIS_COLORS[handle.across].scale(1, .7), handle.turn);
        }
        else if (kind === 'scaleAll')
            r.drawBox(center, tip * 1.4, lit ? color : WHITE);
        else if (kind === 'arrow')
        {
            // a move arrow ends in a cone pointing along it, which says move this way, where scale has a box
            r.drawLine(points[0], points[1], width, color);
            const turn = axis === 'x' ? vec3(0, 0, -PI / 2) : axis === 'z' ? vec3(PI / 2, 0, 0) : undefined;
            const at = points[1].add(handle.direction.scale(tip));
            const cone = buildMatrix(vec3(), turn, vec3(tip * 1.4, tip * 2, tip * 1.4));
            r.drawMesh(editor3DConeMesh(), buildMatrix(at, handle.turn).multiply(cone), undefined, color);
        }
        else
        {
            r.drawLine(points[0], points[1], width, color);
            r.drawBox(points[1], tip, color, editor3DRotation(editor3DSelected()[0]).scale(PI / 180));
        }
    }
    editor3DDrawGame();
}

// the editor's drawing on the 2D layer: the name of each marker, and the box being dragged out to select with
function editor3DDrawLabels()
{
    for (const object of editor3DObjects())
    {
        if (editor3DVisible(object)) continue;
        const at = render3D.worldToScreen(editor3DPos(object));
        at && drawTextScreen(object.type + '', at, 14, WHITE, 3, BLACK);
    }
    const drag = editor3DDrag;
    if (drag?.kind === 'box')
    {
        const {from: a, to: b} = drag, corners = [a, vec2(b.x, a.y), b, vec2(a.x, b.y)];
        corners.forEach((c, i)=> drawLine(c, corners[(i + 1) % 4], 2, EDITOR3D_SELECT_COLOR, undefined, 0, glEnable, true));
    }
}

///////////////////////////////////////////////////////////////////////////////
// the panel, in the look of the 2D level editor's, made the first time the editor opens

let editor3DPanel, editor3DPanelParts;

function editor3DPanelInit()
{
    const panel = editor3DPanel = editorElement('div', document.body,
        'position:fixed;top:8px;left:8px;width:260px;max-height:calc(100% - 16px);overflow-y:auto;' +
        'box-sizing:border-box;padding:8px;background:#111d;color:#eee;font:12px monospace;' +
        'border-radius:4px;z-index:9999;user-select:none');

    // a click or touch on the panel is not the level's, a mouse up still goes on so a drag can let go
    for (const type of ['mousedown','wheel','touchstart','touchmove','touchend','touchcancel'])
        panel.addEventListener(type, (e)=> e.stopPropagation());
    panel.addEventListener('mouseenter', ()=> editor3DMouseOnPanel = true);
    panel.addEventListener('mouseleave', ()=> editor3DMouseOnPanel = false);

    const box = 'margin:4px 0;padding:4px;background:#222;border-radius:3px';
    const row = (parent=panel)=> editorElement('div', parent, 'display:flex;gap:4px;margin:4px 0;flex-wrap:wrap');
    const button = (parent, text, onclick, title='')=>
    {
        const b = editorElement('button', parent, 'flex:1;padding:3px;cursor:pointer', text);
        b.onclick = (e)=> { onclick(e); b.blur(); }; // the keys go back to the editor
        b.title = title;
        return b;
    };
    const check = (parent, text, onchange, title='')=>
    {
        const label = editorElement('label', parent, 'display:flex;gap:6px;align-items:center;margin:2px 0');
        const input = editorElement('input', label);
        input.type = 'checkbox';
        input.onchange = ()=> { onchange(input.checked); input.blur(); };
        editorElement('span', label, '', text);
        label.title = title;
        return input;
    };
    const choice = (parent, text, values, onchange)=>
    {
        const label = editorElement('label', parent, 'display:flex;gap:3px;align-items:center;flex:1');
        editorElement('span', label, '', text);
        const select = editorElement('select', label, 'flex:1;background:#333;color:#eee');
        for (const value of values)
            editorElement('option', select, '', value + '').value = value + '';
        select.onchange = ()=> { onchange(parseFloat(select.value)); select.blur(); };
        return select;
    };

    editorElement('div', panel, 'font-weight:bold', '3D Level Editor');
    const top = row();
    button(top, 'Play', ()=> editor3DPlay(editor3DViewPoint()), 'Esc, and Esc again comes back to the editor');
    const restart = button(top, 'Restart', editor3DRestart, 'Rebuild the level and play it');
    button(top, 'Exit', ()=> levelEditor.close(), '0, then Esc opens the debug overlay again');
    const undo = row();
    button(undo, 'Undo', ()=> editor3DUndo(), 'Ctrl+Z');
    button(undo, 'Redo', ()=> editor3DUndo(true), 'Ctrl+Y');
    button(undo, 'Keys', ()=> editor3DHelp = !editor3DHelp, 'Every control, ?');

    // a file that changed under its autosave
    const pending = editorElement('div', panel, 'padding:4px;margin:4px 0;background:#630;border-radius:3px');
    editorElement('div', pending, '', 'The level file changed since your autosaved edits');
    const pendingRow = editorElement('div', pending, 'display:flex;gap:4px;margin-top:4px');
    button(pendingRow, 'Apply edits', ()=> editor3DApplyPending());
    button(pendingRow, 'Drop them', ()=> editor3DDropPending());

    // the tools, and the snapping
    const tools = row(), toolButtons = {};
    for (const [tool, text, key] of [['select', 'Select', 'Q'], ['move', 'Move', 'W'], ['rotate', 'Rotate', 'E'],
        ['scale', 'Scale', 'R'], ['blocks', 'Blocks', 'B'], ['terrain', 'Terrain', 'T']])
        toolButtons[tool] = button(tools, text, ()=>
        {
            editor3DPickTool(tool);
            (tool === 'select' || tool === 'blocks' || tool === 'terrain') && (editor3DBrush = undefined);
        }, key);
    // the game's own tools, buttons and controls, under the editor's tools
    const game = editorElement('div', panel);
    const snap = editorElement('div', panel, box);
    const grid = check(snap, 'Grid snap', (on)=> editor3DGrid = on, 'G, and Ctrl flips it for a drag');
    const steps = row(snap);
    const moveStep = choice(steps, 'Move', [1, .5, .25], (v)=> editor3DMoveStep = v);
    const rotateStep = choice(steps, 'Turn', [15, 45, 90], (v)=> editor3DRotateStep = v);
    const scaleStep = choice(steps, 'Size', [1, .5, .25], (v)=> editor3DScaleStep = v);
    const ground = check(snap, 'Ground snap', (on)=> editor3DGroundSnap = on,
        'A drag of an object slides it along what is under the mouse');
    const ownAxes = check(snap, 'Own axes', (on)=> editor3DLocalAxes = on,
        'L: the Move handles go along the object\'s own axes, as it is turned, not the world\'s');

    // the types, a click picks one up to place, made again when types are added
    editorElement('div', panel, 'color:#aaa;margin-top:4px', 'Place');
    const types = row();
    const prefabNote = editorElement('div', panel, 'color:#f86'); // why a prefab was not loaded
    const properties = editorElement('div', panel, box);

    // prefabs: the selection made one, or the selected instance's own
    const prefabBox = editorElement('div', panel, box);

    // the prefab that is open, and the way back
    const prefabOpen = editorElement('div', panel, 'padding:4px;margin:4px 0;background:#235;border-radius:3px;' +
        'display:flex;gap:6px;align-items:center');
    panel.insertBefore(prefabOpen, panel.firstChild);
    const prefabName = editorElement('span', prefabOpen, 'flex:1');
    button(prefabOpen, 'Back', ()=> editor3DPrefabBack(),
        'Backspace with nothing selected: back to where the prefab was opened from, every instance of it follows');

    // the Blocks tool's box: a map to add, or the types to paint with
    const blocks = editorElement('div', panel, box);

    // the Terrain tool's box: a terrain to add, or the brush to sculpt with
    const terrainBox = editorElement('div', panel, box);

    // the scene the level sets: its sky, sun, fog and shadows, or none, the game's own
    const scene = editorElement('div', panel, box);
    const sceneOn = check(scene, 'Level sets the scene', (on)=>
    {
        editor3DChangeScene(()=> on ? editor3DSceneFromView() : undefined);
        editor3DStrokeEnd();
    }, 'The sky, sun, fog and shadows are saved in the level; off leaves them to the game');
    const sceneRows = editorElement('div', scene);

    const file = row();
    // Save says so for a moment when it saved, Save As shows where a page can write files
    const saved = (b, label)=> (result)=> result && (b.textContent = 'Saved', setTimeout(()=> b.textContent = label, 1e3));
    const save = button(file, 'Save', ()=> editor3DSave().then(saved(save, 'Save')),
        'Save, to the file picked the first time, or a download');
    const saveAs = button(file, 'Save As', ()=> editor3DSave(true).then(saved(saveAs, 'Save As')),
        'Save As, to a file picked again');
    button(file, 'Reset to file', ()=> editor3DRevert(),
        'Put the level back as its file has it, or as Save last wrote it; Undo brings the edits back');
    /** @type {any} */ (globalThis).showSaveFilePicker || (saveAs.style.display = 'none');
    const playFrom = check(panel, 'Play from mouse', (on)=> editor3DPlayFromMouse = on,
        'Escape starts play with the player at the mouse, Play at the middle of the view');

    const storage = editorElement('div', panel, 'color:#f86;margin-top:4px',
        'Autosave failed, storage is full: Save to a file');
    const prefabUnsaved = editorElement('div', panel, 'color:#fc6;margin-top:4px');
    const hint = editorElement('div', panel, 'color:#8ab;margin-top:4px');
    const help = editorElement('div', panel, 'color:#aaa;margin-top:4px;border-top:1px solid #444;padding-top:4px');
    for (const line of editor3DHelpLines)
        editorElement('div', help, 'margin:2px 0', line);
    const gameHelp = editorElement('div', help);
    button(help, 'Close', ()=> editor3DHelp = false, '?');

    editor3DPanelParts = {game, gameHelp, restart, pending, toolButtons, grid, moveStep, rotateStep, scaleStep, ground, ownAxes, types, prefabBox, prefabOpen, prefabName, prefabUnsaved, prefabNote,
        properties, blocks, terrainBox, sceneOn, sceneRows, playFrom, storage, hint, help, typeNames: ''};
}

// show the panel as the editor is now
function editor3DPanelUpdate()
{
    if (!editor3DIsOpen)
    {
        editor3DPanel && (editor3DPanel.style.display = 'none');
        return;
    }
    editor3DPanel || editor3DPanelInit();
    editor3DPanel.style.display = '';
    const p = editor3DPanelParts, lit = '2px solid #4af';
    editorGamePanel(p.game);
    editorGameHelp(p.gameHelp);
    p.restart.style.display = editorHas('onRestart') ? '' : 'none';
    p.pending.style.display = editor3DRecords.get(editor3DLevel)?.pending ? '' : 'none';
    for (const tool in p.toolButtons)
        p.toolButtons[tool].style.outline = tool === editor3DTool ? lit : '';
    p.grid.checked = editor3DGrid;
    p.ground.checked = editor3DGroundSnap;
    p.ownAxes.checked = editor3DLocalAxes;
    p.moveStep.value = editor3DMoveStep + '';
    p.rotateStep.value = editor3DRotateStep + '';
    p.scaleStep.value = editor3DScaleStep + '';
    p.playFrom.checked = editor3DPlayFromMouse;
    p.playFrom.parentElement.style.display = editorHas('onPlayFrom') ? 'flex' : 'none';
    p.storage.style.display = editor3DSaveFailed ? '' : 'none';
    p.hint.textContent = editor3DHint();
    p.help.style.display = editor3DHelp ? '' : 'none';

    // a button for each type, made again when the types changed
    const names = editor3DPlaceNames(), plain = names.filter((name)=> !level3DPrefabs.has(name));
    const prefabs = names.slice(plain.length);
    const typeNames = plain.join('\n') + '\n\n' + prefabs.join('\n');
    if (p.typeNames !== typeNames)
    {
        p.typeNames = typeNames;
        p.typeButtons = names.map((name)=>
        {
            const b = editorElement('button', undefined, 'padding:3px 6px;cursor:pointer', name);
            b.onclick = ()=> { editor3DBrush = editor3DBrush === name ? undefined : name; b.blur(); };
            return b;
        });
        const label = editorElement('span', undefined, 'color:#aaa;width:100%', 'Prefabs');
        const load = editorElement('button', undefined, 'padding:3px 6px;cursor:pointer', 'Load prefab…');
        load.title = 'Add a prefab from a file the editor saved, by its file name, to place in this level';
        load.onclick = ()=> { editor3DPrefabPickFile(); load.blur(); };
        p.types.replaceChildren(...p.typeButtons.slice(0, plain.length), label, ...p.typeButtons.slice(plain.length), load);
    }
    p.prefabNote.style.display = editor3DPrefabMessage && !editor3DSelection.size ? '' : 'none';
    p.prefabNote.textContent = editor3DPrefabMessage;
    names.forEach((name, i)=> p.typeButtons[i].style.outline = name === editor3DBrush ? lit : '');
    editor3DPropertiesUpdate(p.properties);
    editor3DPrefabBoxUpdate(p.prefabBox);
    p.prefabOpen.style.display = editor3DPrefabStack.length ? 'flex' : 'none';
    p.prefabName.textContent = 'Editing prefab ' + editor3DPrefabStack.map((frame)=> frame.name).join(' > ');
    p.prefabUnsaved.style.display = editor3DPrefabDirty.size ? '' : 'none';
    p.prefabUnsaved.textContent = 'Edited and not in its file: ' + [...editor3DPrefabDirty].join(', ') +
        '. Open it with Enter and Save';
    editor3DBlocksUpdate(p.blocks);
    editor3DTerrainBoxUpdate(p.terrainBox);
    p.sceneOn.checked = !!editor3DScene();
    editor3DSceneUpdate(p.sceneRows);
}

// the prefab box, shown with a selection: a name and a button to make it a prefab, and for one selected instance
// its prefab's name, Unpack, Export, and for a prefab of the level's own whether it is attached
function editor3DPrefabBoxUpdate(box)
{
    const selected = editor3DSelected(), made = selected.length === 1 && editor3DInstances.get(selected[0].id);
    const instance = made instanceof Prefab3D ? made : undefined, prefab = instance && level3DPrefabs.get(instance.prefabName);
    const key = !selected.length ? '' : [selected.length, instance?.prefabName, prefab?.attached, prefab?.fromLevel,
        editor3DPrefabMessage, editor3DPrefabStack.length] + '';
    box.style.display = key ? '' : 'none';
    if (box.dataset.key === key || box.contains(document.activeElement)) return;
    box.dataset.key = key;
    box.replaceChildren();
    if (!key) return;
    const field = 'background:#222;color:#eee', press = 'padding:2px 6px;cursor:pointer';
    const row = ()=> editorElement('div', box, 'display:flex;gap:4px;align-items:center;margin:2px 0;flex-wrap:wrap');
    if (prefab)
    {
        const line = row();
        editorElement('span', line, 'flex:1;color:#aaa', 'Prefab ' + instance.prefabName);
        const open = editorElement('button', line, press, 'Edit');
        open.title = 'Enter: open the prefab alone to edit it, every instance of it follows';
        open.onclick = ()=> { editor3DPrefabEnter(); open.blur(); };
        const unpack = editorElement('button', line, press, 'Unpack');
        unpack.title = 'Ctrl+Shift+G: turn this instance into the objects it is made of';
        unpack.onclick = ()=> { editor3DUnpack(); unpack.blur(); };
        const save = editorElement('button', line, press, 'Export');
        save.title = 'Save the prefab as a file of its own, to load with level3DLoadPrefab';
        save.onclick = ()=>
        {
            saveText(editor3DPrefabJSON(instance.prefabName), instance.prefabName + '.json', 'application/json');
            save.blur();
        };
        if (prefab.fromLevel && !editor3DPrefabStack.length)
        {
            const label = editorElement('label', box, 'display:flex;gap:6px;align-items:center;margin:2px 0');
            label.title = 'Its parts are attached to each instance and move with it as one body, with no ' +
                'collision of their own; off, each part is an object of its own and solid';
            const attached = editorElement('input', label);
            attached.type = 'checkbox';
            attached.checked = prefab.attached;
            attached.onchange = ()=> { editor3DPrefabSetAttached(instance.prefabName, attached.checked); attached.blur(); };
            editorElement('span', label, '', 'Attached, one body');
        }
    }
    const line = row();
    const name = editorElement('input', line, field + ';flex:1;min-width:60px');
    name.placeholder = 'prefab name';
    const make = editorElement('button', line, press, 'Make prefab');
    make.title = 'Ctrl+G: the selection becomes one thing to place many times, kept in the level';
    make.onclick = ()=> { editor3DMakePrefab(name.value); make.blur(); };
    name.onkeydown = (e)=> { e.key === 'Enter' && (editor3DMakePrefab(name.value), name.blur()); };
    editor3DPrefabMessage && editorElement('div', box, 'color:#f86', editor3DPrefabMessage);
}

// a level's color as a color input takes it, six digits and no alpha, white for one it can not show
function editor3DInputColor(hex) { return /^#[0-9a-f]{6}/i.test(hex) ? hex.slice(0, 7) : '#ffffff'; }

// the terrain box, shown with the Terrain tool: without a terrain, its size, cells and height and a button to add
// it; with one, the brush, its size and strength or the color it paints, the terrain's color, and a button to
// take it away
function editor3DTerrainBoxUpdate(box)
{
    const map = editor3DTerrainMap(), shown = editor3DTool === 'terrain';
    box.style.display = shown ? '' : 'none';
    if (!shown) return;
    const terrain = editor3DLevelPart('terrain'), brush = editor3DTerrainBrush;
    const key = map ? ['terrain', terrain.color, brush.mode] + '' : 'none';
    if (box.dataset.key === key || box.contains(document.activeElement)) return;
    box.dataset.key = key;
    box.replaceChildren();
    const field = 'background:#222;color:#eee';
    const line = (name, title='')=>
    {
        const row = editorElement('label', box, 'display:flex;gap:4px;align-items:center;margin:2px 0');
        editorElement('span', row, 'flex:1', name);
        row.title = title;
        return row;
    };
    const number = (name, title, value, most)=>
    {
        const input = editorElement('input', line(name, title), field + ';width:60px');
        input.type = 'number';
        input.min = '1', input.max = most + '', input.step = '1';
        input.value = value + '';
        return input;
    };
    if (!map)
    {
        const size = number('Size', 'How far across it is in the world, each way', 64, 1024);
        const cellsRow = line('Cells', 'How many cells a side, more is finer and slower to sculpt');
        const cells = editorElement('select', cellsRow, field + ';width:68px');
        for (const n of [32, 64, 128])
            editorElement('option', cells, '', n + '').value = n + '';
        cells.value = '64';
        const height = number('Height', 'How tall its highest ground can be', 16, 1024);
        const add = editorElement('button', box, 'width:100%;padding:3px;cursor:pointer', 'Add terrain');
        add.title = 'A flat terrain, centered, its surface on the ground, to raise and dig';
        add.onclick = ()=>
        {
            const read = (input, fallback)=> clamp(parseFloat(input.value) || fallback, 1, 1024);
            editor3DTerrainAdd(vec2(read(size, 64)), parseInt(cells.value), read(height, 16));
            add.blur();
        };
        return;
    }
    const slider = (name, title, min, max, step, value, set)=>
    {
        const input = editorElement('input', line(name, title), 'width:120px');
        input.type = 'range';
        input.min = min, input.max = max, input.step = step;
        input.value = value + '';
        input.oninput = ()=> set(parseFloat(input.value));
        input.onchange = ()=> input.blur();
    };
    const brushes = editorElement('select', line('Brush', 'X: sculpt raises and lowers the ground, flatten brings ' +
        'it to the height pressed, paint colors it'), field + ';width:120px');
    for (const name of editor3DTerrainBrushes)
        editorElement('option', brushes, '', name[0].toUpperCase() + name.slice(1)).value = name;
    brushes.value = brush.mode;
    brushes.onchange = ()=> { brush.mode = brushes.value; brushes.blur(); };
    slider('Brush size', 'How far across the brush is', 1, 32, .5, brush.size, (v)=> brush.size = v);
    if (brush.mode === 'paint')
    {
        const paint = editorElement('input', line('Paint', 'The color the brush paints'), field + ';width:60px');
        paint.type = 'color';
        paint.value = editor3DInputColor(brush.color);
        paint.oninput = ()=> brush.color = paint.value;
        paint.onchange = ()=> { brush.color = paint.value; paint.blur(); };
    }
    else
        slider('Strength', 'How fast the brush works', .05, 1, .05, brush.strength, (v)=> brush.strength = v);
    const color = editorElement('input', line('Color', 'The color of the ground that is not painted'),
        field + ';width:60px');
    color.type = 'color';
    color.value = editor3DInputColor(terrain.color);
    color.oninput = ()=> editor3DChangePart('terrain', (t)=> ({...t, color: color.value}));
    color.onchange = ()=> { color.oninput(); editor3DStrokeEnd(); color.blur(); };
    const remove = editorElement('button', box, 'margin-top:4px;padding:2px 6px;cursor:pointer', 'Remove terrain');
    remove.title = 'Take the terrain out of the level, Undo brings it back';
    remove.onclick = ()=> { editor3DTerrainRemove(); remove.blur(); };
}

// the blocks box, shown with the Blocks tool: without a map, its size and a button to add it; with one, a tile
// for each block type to paint with, and a button to take the map away; made again when what it shows changes
function editor3DBlocksUpdate(box)
{
    const map = editor3DVoxelMap(), shown = editor3DTool === 'blocks';
    box.style.display = shown ? '' : 'none';
    if (!shown) return;
    const first = map?.tileInfo, texture = first?.textureInfo;
    const key = map ? ['map', editor3DBlockType, texture?.size.x, map.blockTypes.length, editor3DBlockBox,
        map.mapSize].join() : 'none';
    if (box.dataset.key === key || box.contains(document.activeElement)) return;
    box.dataset.key = key;
    box.replaceChildren();
    const field = 'background:#222;color:#eee;width:46px';
    if (!map)
    {
        const row = editorElement('label', box, 'display:flex;gap:4px;align-items:center;margin:2px 0');
        editorElement('span', row, 'flex:1', 'Map size');
        const inputs = [32, 16, 32].map((n)=>
        {
            const input = editorElement('input', row, field);
            input.type = 'number';
            input.min = '1', input.max = '256', input.step = '1';
            input.value = n + '';
            return input;
        });
        const add = editorElement('button', box, 'width:100%;padding:3px;cursor:pointer', 'Add block map');
        add.title = 'An empty map of blocks, centered, its bottom on the ground';
        add.onclick = ()=>
        {
            const [x, y, z] = inputs.map((i, k)=> clamp(floor(parseFloat(i.value)) || [32, 16, 32][k], 1, 256));
            editor3DVoxelAdd(vec3(x, y, z));
            add.blur();
        };
        return;
    }

    // the tiles of the sheet, a type shows the tile of its side; a click picks the type
    const image = texture?.image, padding = first.padding || 0;
    const cell = first.size.add(vec2(padding * 2));
    const count = texture && cell.x && cell.y ? floor(texture.size.x / cell.x) * floor(texture.size.y / cell.y) : 0;
    const types = [];
    for (let type = 1; type < 256 && types.length < 96; ++type)
        (type < count || map.blockTypes[type]) && types.push(type);
    types.includes(editor3DBlockType) || types.push(editor3DBlockType);
    const grid = editorElement('div', box, 'display:flex;flex-wrap:wrap;gap:2px');
    for (const type of types)
    {
        const canvas = editorElement('canvas', grid, 'width:26px;height:26px;cursor:pointer;background:#444;' +
            'image-rendering:pixelated;outline:' + (type === editor3DBlockType ? '2px solid #4af' : 'none'));
        canvas.width = canvas.height = 26;
        canvas.title = 'Block ' + type;
        canvas.onclick = ()=> editor3DBlockType = type;
        // the tile of its side; read without map.blockType, which would make every type one the map has
        const index = map.blockTypes[type]?.faces[0] ?? type;
        const tile = first.columns ? first.frame(index) : first.index(index);
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        try
        {
            image && context.drawImage(image, tile.pos.x, tile.pos.y, tile.size.x, tile.size.y, 0, 0, 26, 26);
            // a tile with nothing on it is left out, unless it is the type picked, one in use or one the game set up
            const pixels = context.getImageData(0, 0, 26, 26).data;
            let blank = !!image;
            for (let i = 3; blank && i < pixels.length; i += 4)
                blank = !pixels[i];
            blank && type !== editor3DBlockType && !map.blockTypes[type] && canvas.remove();
        }
        catch {} // an image that can not be drawn or read, the title still says the type
    }
    // box fill: a drag fills the rectangle dragged, this many layers tall
    const boxRow = editorElement('label', box, 'display:flex;gap:6px;align-items:center;margin:4px 0 2px');
    boxRow.title = 'X: a drag fills the whole rectangle from the press to the mouse, Shift clears it, Ctrl repaints';
    const boxOn = editorElement('input', boxRow);
    boxOn.type = 'checkbox';
    boxOn.checked = editor3DBlockBox;
    boxOn.onchange = ()=> { editor3DBlockBox = boxOn.checked; boxOn.blur(); };
    editorElement('span', boxRow, 'flex:1', 'Box fill, height');
    const boxHeight = editorElement('input', boxRow, field);
    boxHeight.type = 'number';
    boxHeight.min = '1', boxHeight.max = '256', boxHeight.step = '1';
    boxHeight.value = editor3DBlockBoxHeight + '';
    boxHeight.onchange = ()=>
    {
        editor3DBlockBoxHeight = clamp(floor(parseFloat(boxHeight.value)) || 1, 1, 256);
        boxHeight.value = editor3DBlockBoxHeight + '';
        boxHeight.blur();
    };

    // the map's size, to change
    const sizeRow = editorElement('label', box, 'display:flex;gap:4px;align-items:center;margin:2px 0');
    editorElement('span', sizeRow, 'flex:1', 'Map size');
    const axes = ['x', 'y', 'z'], sizes = axes.map((axis)=>
    {
        const input = editorElement('input', sizeRow, field);
        input.type = 'number';
        input.min = '1', input.max = '256', input.step = '1';
        input.value = map.mapSize[axis] + '';
        return input;
    });
    const resize = editorElement('button', box, 'padding:2px 6px;cursor:pointer;margin-right:4px', 'Resize');
    resize.title = 'Change the map\'s size, its blocks stay where they are; Undo brings back what was cut off';
    resize.onclick = ()=>
    {
        // a field left empty keeps the size it has
        const [x, y, z] = sizes.map((i, k)=> clamp(floor(parseFloat(i.value)) || map.mapSize[axes[k]], 1, 256));
        editor3DVoxelResize(vec3(x, y, z));
        resize.blur();
    };

    const remove = editorElement('button', box, 'margin-top:4px;padding:2px 6px;cursor:pointer', 'Remove map');
    remove.title = 'Take the block map out of the level, Undo brings it back';
    remove.onclick = ()=> { editor3DVoxelRemove(); remove.blur(); };
}

// the scene box: an input for each setting of the level's scene block, made again when the block changes, but not
// while one of its inputs is being used; a slider or a color changes the scene as it moves, and is one undo
function editor3DSceneUpdate(box)
{
    const scene = editor3DScene(), key = scene ? JSON.stringify(scene) : '';
    box.style.display = scene ? '' : 'none';
    if (box.dataset.key === key || box.contains(document.activeElement)) return;
    box.dataset.key = key;
    box.replaceChildren();
    if (!scene) return;

    // a setting the block leaves out shows as it is on screen
    const view = editor3DSceneFromView(), value = (name)=> scene[name] ?? view[name];
    // an input changes the scene as it is when it is used, not as it was when the box was made: the box is not
    // made again while it has the focus, so a field edited right after another must not put the other one back;
    // set is given the setting's value now, or what shows for one the block leaves out
    const change = (name, set)=> editor3DChangeScene((s={})=>
        ({...s, [name]: typeof set === 'function' ? set(s[name] ?? view[name]) : set}));
    const field = 'background:#222;color:#eee';
    const line = (name, title='')=>
    {
        const row = editorElement('label', box, 'display:flex;gap:4px;align-items:center;margin:2px 0');
        editorElement('span', row, 'flex:1', name);
        row.title = title;
        return row;
    };
    // an input that changes the scene as it moves and ends the edit when let go
    const live = (input, read)=>
    {
        input.oninput = ()=> read();
        input.onchange = ()=> { read(); editor3DStrokeEnd(); input.blur(); };
        return input;
    };
    const slider = (name, title, min, max, step, v, set)=>
    {
        const input = editorElement('input', line(name, title), 'width:120px');
        input.type = 'range';
        input.min = min, input.max = max, input.step = step;
        input.value = v + '';
        return live(input, ()=> set(parseFloat(input.value)));
    };
    const color = (name, title, hex, set)=>
    {
        const input = editorElement('input', line(name, title), field + ';width:60px');
        input.type = 'color';
        input.value = editor3DInputColor(hex);
        return live(input, ()=> set(input.value));
    };
    const number = (row, v, set)=>
    {
        const input = editorElement('input', row, field + ';width:56px');
        input.type = 'number';
        input.step = 'any';
        input.min = '0';
        input.value = v + '';
        input.onchange = ()=>
        {
            const n = parseFloat(input.value);
            isNumber(n) && n >= 0 ? set(v = n) : input.value = v + ''; // one not taken shows what it has again
            editor3DStrokeEnd();
            input.blur();
        };
        return input;
    };
    const toggle = (name, title, on, set)=>
    {
        const input = editorElement('input', line(name, title));
        input.type = 'checkbox';
        input.checked = on;
        input.onchange = ()=> { set(input.checked); editor3DStrokeEnd(); input.blur(); };
    };

    // the sky: three colors and how much of them lights the scene, or no sky
    const sky = isArray(scene.sky) && scene.sky.length === 3 ? scene.sky : undefined;
    toggle('Sky', 'A sky dome, and light from it; off leaves the sky to the game', !!sky, (on)=>
        editor3DChangeScene((s={})=>
        {
            const {sky, ambient, ...rest} = s;
            return on ? {sky: ['#3d9be9', '#ccebff', '#ccebff'], ambient: .5, ...rest} : rest;
        }));
    if (sky)
    {
        ['Sky top', 'Sky horizon', 'Sky bottom'].forEach((name, i)=> color(name, '', sky[i], (hex)=>
            change('sky', (now)=> (isArray(now) && now.length === 3 ? now : sky).map((c, k)=> k === i ? hex : c))));
        slider('Ambient', 'How much of the sky colors lights the scene', 0, 1, .05,
            isNumber(scene.ambient) ? scene.ambient : .5, (v)=> change('ambient', v));
    }

    // the sun, as two angles
    const [around, height] = editor3DSunAngles(value('sunDirection'));
    slider('Sun around', 'Where the sun is around the scene, in degrees', 0, 359, 1, around, (v)=>
        change('sunDirection', (now)=> editor3DSunDirection(v, editor3DSunAngles(now)[1])));
    slider('Sun height', 'How high the sun is over the horizon, in degrees', 5, 89, 1, height, (v)=>
        change('sunDirection', (now)=> editor3DSunDirection(editor3DSunAngles(now)[0], v)));
    color('Sun color', '', value('sunColor'), (hex)=> change('sunColor', hex));

    // the fog, by its distances, an end of 0 for none
    const fog = isArray(value('fog')) ? value('fog') : [0, 0], fogRow = line('Fog start, end',
        'Where the fog starts and where it is total, an end of 0 for no fog');
    const fogNow = (now)=> isArray(now) && now.length === 2 ? now : fog;
    number(fogRow, fog[0], (v)=> change('fog', (now)=> [v, fogNow(now)[1]]));
    number(fogRow, fog[1], (v)=> change('fog', (now)=> [fogNow(now)[0], v]));
    color('Fog color', 'The sky\'s horizon color when the level has a sky and no fog color',
        scene.fogColor ?? (sky ? sky[1] : view.fogColor), (hex)=> change('fogColor', hex));
    toggle('Shadows', 'The sun casts shadows', !!value('shadows'), (on)=> change('shadows', on));
    toggle('Lens flare', 'The sun flares in the lens when it is in view', !!value('lensFlare'), (on)=>
        change('lensFlare', on));
}

// the properties box: the position, rotation and scale of the one selected object and an input for each default
// of its type, made again when the selection or the object changes, but not while one of its inputs is typed in
function editor3DPropertiesUpdate(box)
{
    const selected = editor3DSelected(), object = selected.length === 1 && selected[0];
    const type = object && level3DTypes.get(object.type);
    const key = object ? JSON.stringify(object) : selected.length ? selected.length + ' objects' : '';
    box.style.display = key ? '' : 'none';
    if (box.dataset.key === key || box.contains(document.activeElement)) return;
    box.dataset.key = key;
    box.replaceChildren();
    if (!object)
    {
        key && editorElement('div', box, 'color:#aaa', key + ' selected');
        return;
    }
    editorElement('div', box, 'color:#aaa;margin-bottom:2px', `${object.type} ${object.id}`);
    const field = 'background:#222;color:#eee';
    const line = (name)=>
    {
        const row = editorElement('label', box, 'display:flex;gap:4px;align-items:center;margin:2px 0');
        editorElement('span', row, 'flex:1', name);
        return row;
    };

    // the numbers of a vector, set together once every one of them reads as a number
    const numbers = (name, value, set)=>
    {
        const row = line(name), axes = isVector3(value) ? 'xyz' : 'xy', inputs = [];
        for (const axis of axes)
        {
            const input = editorElement('input', row, field + ';width:' + (axes.length > 2 ? 46 : 52) + 'px');
            input.type = 'number';
            input.step = 'any';
            input.value = editor3DRound(value[axis]) + '';
            input.onchange = ()=>
            {
                const v = inputs.map((i)=> parseFloat(i.value));
                if (v.every((n)=> isNumber(n)))
                    set(axes.length > 2 ? vec3(v[0], v[1], v[2]) : vec2(v[0], v[1]));
                else
                    inputs.forEach((i, k)=> i.value = editor3DRound(value[axes[k]]) + '');
                input.blur();
            };
            inputs.push(input);
        }
    };
    numbers('pos', editor3DPos(object), (v)=> editor3DSetSelectedTransform('pos', v));
    numbers('rotation', editor3DRotation(object), (v)=> editor3DSetSelectedTransform('rotation', v));
    numbers('scale', editor3DScale(object), (v)=> editor3DSetSelectedTransform('scale', v));
    if (!type) return;

    const values = level3DProperties(type, object);
    for (const [name, defaultValue] of Object.entries(type.defaults))
    {
        const value = values[name];
        if (isVector3(defaultValue) || isVector2(defaultValue))
        {
            numbers(name, value, (v)=> editor3DSetSelectedProperty(name, v));
            continue;
        }
        const input = editorElement('input', line(name), field + ';width:110px');
        const set = (v)=> { editor3DSetSelectedProperty(name, v); input.blur(); };
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
            input.onchange = ()=> { const color = new Color().setHex(input.value); color.a = value.a; set(color); };
        }
        else if (typeof defaultValue === 'number')
        {
            input.type = 'number';
            input.step = 'any';
            input.value = value + '';
            input.onchange = ()=> { const v = parseFloat(input.value); isNumber(v) && set(v); };
        }
        else if (typeof defaultValue === 'string')
        {
            input.type = 'text';
            input.value = (value ?? '') + '';
            input.onchange = ()=> set(input.value);
        }
        else
        {
            // a type it has no input for, an array say, shown as it is
            input.readOnly = true;
            input.value = value + '';
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// plugin

function editor3DUpdate()
{
    const seconds = clamp(timeReal - editor3DTimeLast, 0, .1);
    editor3DTimeLast = timeReal;
    if (!render3D) return;
    if (editor3DFreeCamera)
        return inputCaptureRead(()=> editor3DFreeCameraUpdate(seconds));
    if (editor3DIsOpen)
        return inputCaptureRead(()=> editor3DWithView(()=> editor3DEditorUpdate(seconds)));

    // playing in an editing session, Escape, the debug key, goes back to the editor; taken, so the debug overlay
    // waits till the session ends; a captured mouse the browser let go of is Escape too, Chrome keeps that key
    const lostLock = editor3DLostLock(pointerLockIsActive());
    if (editor3DSession && (lostLock || debugKey && keyWasPressed(debugKey)))
    {
        debugKey && inputClearKey(debugKey);
        editor3DSetOpen(true);
        return;
    }
    editor3DFreeCameraKey();
}

function editor3DRender()
{
    if (headlessMode) return;
    editor3DPanelUpdate();
    if (editor3DFreeCamera)
        drawTextScreen('Free camera · C or Esc to leave', vec2(mainCanvasSize.x / 2, mainCanvasSize.y - 30), 20, WHITE,
            4, BLACK);
    editor3DIsOpen && editor3DDrawLabels();
}

debug && engineAddPlugin(editor3DUpdate, editor3DRender);
debug && debugOverlayKeys.push(()=> render3D && {text: 'C: Free Camera', on: editor3DFreeCamera});
