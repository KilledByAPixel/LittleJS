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

/** @type {Camera3D|undefined} - The camera of the free camera and the editor, made at the first use */
let editor3DCamera;
let editor3DFreeCamera = false; // the free camera is on
let editor3DFlySpeed = .2;      // world units flown in a frame of 1/60, the wheel changes it
let editor3DTimeLast = 0;       // real time of the last update, flying goes by real time so it works while paused
let editor3DWasLocked = false;  // the mouse was captured last update, a lock that is lost leaves the free camera
/** @type {Camera3D|undefined} - The game's camera while the editor's is drawn with */
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

    // where the game is looking from, a box turned its way and a line along its view
    const color = hsl(.15, 1, .6);
    debugBox3D(camera.pos, vec3(.5, .5, .8), color, 0, camera.rotation);
    debugLine3D(camera.pos, camera.pos.add(camera.getForward().scale(2)), color);
}

// called by the 3D pass after the frame: the game's camera is back, with its matrices, for the game's next update
function editor3DCameraEnd()
{
    if (!editor3DGameCamera) return;
    render3D.camera = editor3DGameCamera;
    editor3DGameCamera = undefined;
    render3D.updateMatrices();
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
    const locked = pointerLockIsActive();
    if (keyWasPressed('KeyC') || debugKey && keyWasPressed(debugKey) || editor3DWasLocked && !locked)
    {
        inputClearKey('KeyC');
        debugKey && inputClearKey(debugKey);
        editor3DSetFreeCamera(false);
        return;
    }
    editor3DWasLocked = locked;
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

/** @type {Object|undefined} - The level being edited, the one given to level3DLoad last */
let editor3DLevel;

// what the game made for each object of the level, by the object's id
const editor3DInstances = new Map;

// what the editor keeps for each level: {fileName, key, original, hash, pending, fileHandle}, the file it came
// from, the file's objects and their hash for the autosave, and an autosave waiting for a file that changed
const editor3DRecords = new WeakMap;

// if the editor is open, and if it was opened and not exited, while Escape switches between playing and editing
let editor3DIsOpen = false, editor3DSession = false;
let editor3DGamePaused = false;   // the game's pause from before the editor opened
let editor3DPlayFromMouse = false; // Escape and Play hand the game a position to play from

const editor3DSelection = new Set; // the ids of the selected objects
/** @type {string|undefined} - The type a click places */
let editor3DBrush;
/** @type {Array<Object>|undefined} - The copied objects */
let editor3DClipboard;
const editor3DUndoList = [], editor3DRedoList = []; // each entry the object list before and after an edit
/** @type {{before: Array<Object>}|undefined} - The edit being made, a drag is one */
let editor3DStroke;

const editor3DCopy = (value)=> JSON.parse(JSON.stringify(value));
const editor3DSame = (a, b)=> JSON.stringify(a) === JSON.stringify(b);
const editor3DRound = (v)=> round(v * 1e4) / 1e4; // as the file keeps a number

// the level's objects, and the one of an id
const editor3DObjects = ()=> isArray(editor3DLevel?.objects) ? editor3DLevel.objects : [];
const editor3DObject = (id)=> editor3DObjects().find((o)=> o.id === id);
const editor3DSelected = ()=> editor3DObjects().filter((o)=> editor3DSelection.has(o.id));

// an object's position, rotation in degrees and scale, the defaults where the level leaves them out
const editor3DPos = (object)=> level3DVector(object.pos, vec3());
const editor3DRotation = (object)=> level3DVector(object.rotation, vec3());
const editor3DScale = (object)=> level3DVector(object.scale, vec3(1));
const editor3DTurned = (object)=> editor3DRotation(object).lengthSquared() > 0;

// the size of an object's box: what the game made for it says, a marker is 1 unit
function editor3DSize(object)
{
    const made = editor3DInstances.get(object.id);
    if (!(made instanceof EngineObject3D) || !(made.mesh || made.tileInfo)) return vec3(1);
    const s = made.size3D, k = made.scale3D;
    return vec3(s.x * abs(k.x), s.y * abs(k.y), s.z * abs(k.z));
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
    editor3DLevel = level;
    editor3DInstances.clear();
    isArray(level.objects) && editor3DFixIds(level.objects);
    if (editor3DRecords.has(level)) return; // loaded again, as a restart does, its edits are in it
    const url = editorFetchedURLs.get(level)?.split(/[?#]/)[0];
    const original = editor3DCopy(editor3DObjects()), hash = editor3DHash(JSON.stringify(original));
    const record = {fileName: url ? url.split('/').pop() : 'level3D.json', key: url ?? 'level', original, hash,
        pending: undefined, fileHandle: undefined};
    editor3DRecords.set(level, record);
    editor3DUndoList.length = editor3DRedoList.length = 0;
    editor3DSelection.clear();
    const saved = editor3DSaves()[record.key];
    if (saved?.hash === hash && isArray(saved.objects))
        level.objects = editor3DCopy(saved.objects);
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
}

// change the level's objects as part of the edit being made: change edits a copy of the list; the changes until
// editor3DStrokeEnd are one undo, so a drag is one undo; false when nothing changed
function editor3DChange(change)
{
    if (!editor3DLevel || editor3DRecords.get(editor3DLevel)?.pending) return false; // its autosave waits first
    const before = editor3DCopy(editor3DObjects()), after = editor3DCopy(before);
    change(after);
    if (editor3DSame(before, after)) return false;
    editor3DSetObjects(after);
    editor3DStroke ||= {before};
    return true;
}

// end the edit being made: one undo, and the autosave
function editor3DStrokeEnd()
{
    const stroke = editor3DStroke;
    editor3DStroke = undefined;
    if (!stroke || editor3DSame(stroke.before, editor3DObjects())) return;
    editor3DUndoList.push({before: stroke.before, after: editor3DCopy(editor3DObjects())});
    editor3DUndoList.length > 100 && editor3DUndoList.shift();
    editor3DRedoList.length = 0;
    editor3DAutosave();
}

// take the edit being made back, with nothing to undo
function editor3DStrokeCancel()
{
    const stroke = editor3DStroke;
    editor3DStroke = undefined;
    stroke && editor3DSetObjects(stroke.before);
}

// undo the last edit, or redo the last one undone; false with none
function editor3DUndo(redo=false)
{
    editor3DStrokeEnd();
    const entry = (redo ? editor3DRedoList : editor3DUndoList).pop();
    if (!entry) return false;
    (redo ? editor3DUndoList : editor3DRedoList).push(entry);
    editor3DSetObjects(redo ? entry.after : entry.before);
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
        if (made instanceof EngineObject3D && !made.destroyed)
            editor3DPlaceInstance(made, object);
        else if (type.make.prototype && (!made || made.destroyed))
            editor3DMakeInstance(object);
    }
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
    }
    else
    {
        editor3DStrokeEnd();
        editor3DIsOpen = false;
        setPaused(editor3DGamePaused);
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
    editor3DPlayFromMouse && pos && levelEditor.onPlayFrom?.(pos.copy());
}

// rebuild the level through the game's hook and play it
function editor3DRestart()
{
    if (!levelEditor.onRestart) return;
    editor3DSetOpen(false);
    levelEditor.onRestart();
}

// the level editor's open, close and isOpen go to the 3D editor when the game has a 3D level
if (debug)
{
    const open2D = levelEditor.open.bind(levelEditor), close2D = levelEditor.close.bind(levelEditor);
    levelEditor.open = ()=> editor3DWanted() ? editor3DOpen() : open2D();
    levelEditor.close = ()=> editor3DIsOpen || editor3DSession ? editor3DClose() : close2D();
    Object.defineProperty(levelEditor, 'isOpen', {get: ()=> editor3DIsOpen || editorIsOpen});
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

// remember the level's objects, or forget them when they are back to the file
function editor3DAutosave()
{
    const record = editor3DRecords.get(editor3DLevel);
    if (!record || record.pending) return; // edits waiting to be applied keep their autosave
    const saves = editor3DSaves(), objects = editor3DObjects();
    if (editor3DSame(objects, record.original))
        delete saves[record.key];
    else
        saves[record.key] = {hash: record.hash, objects: editor3DCopy(objects)};
    try
    {
        localStorage.setItem(editor3DSaveName(), JSON.stringify(saves));
        editor3DSaveFailed = false;
    }
    catch { editor3DSaveFailed = true; }
}

// put the autosaved edits of a file that changed into the level, as one undo
function editor3DApplyPending()
{
    const record = editor3DRecords.get(editor3DLevel), saved = record?.pending;
    if (!saved || !isArray(saved.objects)) return false;
    record.pending = undefined;
    editor3DFixIds(saved.objects);
    editor3DChange((list)=> { list.length = 0; list.push(...editor3DCopy(saved.objects)); });
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

// save the level as JSON: where the browser lets a page write files, Chrome and Edge, to a file picked once and
// written again on each Save after, or picked again with Save As; elsewhere as a download; a file of the level's
// own name that was written is the file from then on, for the autosave; resolves to how it saved, undefined when
// the picker was closed
async function editor3DSave(pickAgain=false)
{
    const level = editor3DLevel, record = editor3DRecords.get(level);
    if (!record) return;
    editor3DStrokeEnd();
    const text = editor3DLevelJSON(level), picker = /** @type {any} */ (globalThis).showSaveFilePicker;
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
                record.original = editor3DCopy(editor3DObjects());
                record.hash = editor3DHash(JSON.stringify(record.original));
                editor3DAutosave();
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
// plugin

function editor3DUpdate()
{
    const seconds = clamp(timeReal - editor3DTimeLast, 0, .1);
    editor3DTimeLast = timeReal;
    if (!render3D) return;
    if (editor3DFreeCamera)
        inputCaptureRead(()=> editor3DFreeCameraUpdate(seconds));
    else
        editor3DFreeCameraKey();
}

function editor3DRender()
{
    if (headlessMode || !editor3DFreeCamera) return;
    drawTextScreen('Free camera · C or Esc to leave', vec2(mainCanvasSize.x / 2, mainCanvasSize.y - 30), 20, WHITE, 4,
        BLACK);
}

debug && engineAddPlugin(editor3DUpdate, editor3DRender);
debug && debugOverlayKeys.push(()=> render3D && {text: 'C: Free Camera', on: editor3DFreeCamera});
