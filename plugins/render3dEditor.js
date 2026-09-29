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
function editor3DViewOn() { return editor3DFreeCamera; }

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
// the level

/** @type {Object|undefined} - The level being edited, the one given to level3DLoad last */
let editor3DLevel;

// what the game made for each object of the level, by the object's id
const editor3DInstances = new Map;

// called by level3DLoad before it makes the objects: the editor takes the level
function editor3DLevelLoaded(level)
{
    editor3DLevel = level;
    editor3DInstances.clear();
}

// called by level3DLoad for each object, with what its type made
function editor3DObjectMade(object, made)
{
    made && typeof made === 'object' && editor3DInstances.set(object.id, made);
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
