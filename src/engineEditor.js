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
