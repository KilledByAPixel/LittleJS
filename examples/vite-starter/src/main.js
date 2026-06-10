import { engineInit, drawText, drawTile, tile, vec2 } from 'littlejsengine';

function gameInit() {
    // called once after the engine starts up
    // setup the game
}

function gameUpdate() {
    // called every frame at 60 frames per second
    // handle input and update the game state
}

function gameUpdatePost() {
    // called after physics and objects are updated
    // setup camera and prepare for render
}

function gameRender() {
    // called before objects are rendered
    // draw any background effects that appear behind objects
}

function gameRenderPost() {
    // called after objects are rendered
    // draw effects or hud that appear above all objects
    drawTile(vec2(0, 0), vec2(8), tile(3, 128));
    drawText('LittleJS + Vite', vec2(0, 6), 2);
}

// tiles.png lives in public/, served from the site root in dev and build
// (on save, the vite config forces a full page reload instead of HMR)
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
