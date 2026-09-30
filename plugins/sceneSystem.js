/**
 * LittleJS Scene System Plugin
 * - A game's states, like a title, the game and game over, as scene objects
 * - setScene leaves the current scene, destroys the objects and enters the next
 * - Objects with the persistent flag set outlive every switch
 * - Pause is the engine's paused flag, a scene's update stops with gameUpdate
 * @namespace SceneSystem
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** A scene, any object with the hooks it needs, each optional and called as a method so this is the scene
 *  @typedef {Object} Scene
 *  @property {function():void} [enter] - Called when the scene starts, after the old one left and the objects were destroyed
 *  @property {function():void} [leave] - Called before the next scene starts, while the scene is current and its objects are still there
 *  @property {function():void} [update] - Called each update after gameUpdate, not while paused or at time scale 0
 *  @property {function():void} [render] - Called before gameRender, to draw under the objects
 *  @property {function():void} [renderPost] - Called after gameRenderPost, to draw over the game, while paused too; plugins made after the first setScene draw over it
 *  @memberof SceneSystem */

let sceneCurrent, sceneLeaving = false, scenePluginAdded = false;

/** Leave the current scene, destroy every object that is not persistent, and enter the next scene
 *  - Setting the current scene again restarts it, and no scene leaves the game with none
 *  - The switch happens at once, it can be called from anywhere but a scene's leave
 *  @param {Scene} [scene] - The scene to enter
 *  @memberof SceneSystem */
function setScene(scene)
{
    ASSERT(!sceneLeaving, 'setScene can not be called from a scene leave');
    if (!scenePluginAdded)
    {
        scenePluginAdded = true;
        engineAddPlugin(sceneUpdate, sceneRenderPost, undefined, undefined, sceneRender);
    }

    if (sceneCurrent)
    {
        // a leave that throws still lets the next switch through
        sceneLeaving = true;
        try { sceneCurrent.leave?.(); }
        finally { sceneLeaving = false; }
    }
    engineObjectsDestroy();
    sceneCurrent = scene;
    scene?.enter?.();
}

/** Get the current scene
 *  @return {Scene|undefined}
 *  @memberof SceneSystem */
function getScene() { return sceneCurrent; }

// the plugin hooks, update skips the frozen ticks that skip gameUpdate
function sceneUpdate() { paused || !timeScale || sceneCurrent?.update?.(); }
function sceneRender() { sceneCurrent?.render?.(); }
function sceneRenderPost() { sceneCurrent?.renderPost?.(); }
