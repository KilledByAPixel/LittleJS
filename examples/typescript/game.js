/*
    Little JS TypeScript Demo
    - A simple starter project
    - Shows how to use LittleJS with modules, typed by the littlejs.d.ts the package ships
*/
'use strict';
// import LittleJS module, by its npm name; index.html maps it to the build in dist
import * as LJS from 'littlejsengine';
const { tile, vec2, hsl, PI } = LJS;
// show the LittleJS splash screen
LJS.setShowSplashScreen(true);
// each tile in tiles.png has a 1 pixel border, which stops texture bleeding
LJS.setTileDefaultPadding(1);
// the level, one character a cell: # is a block, a space is empty
const levelMap = `
################################
#                              #
#                              #
#   #####            #####     #
#                              #
#                              #
#          ##########          #
#                              #
#                              #
#  ####                  ####  #
#                              #
#                              #
#        ####      ####        #
#                              #
#                              #
################################`;
// sound effects
const sound_click = new LJS.Sound([1, .5]);
// medals
const medal_example = new LJS.Medal(0, 'Example Medal', 'Welcome to LittleJS!');
LJS.medalsInit('Hello World');
// game variables
let particleEmitter;
///////////////////////////////////////////////////////////////////////////////
function gameInit() {
    // create tile collision and visible tile layer from the level map
    const rows = levelMap.trim().split('\n');
    const levelSize = vec2(rows[0].length, rows.length);
    const tileLayer = new LJS.TileCollisionLayer(vec2(), levelSize);
    for (let x = levelSize.x; x--;)
        for (let y = levelSize.y; y--;) {
            // the first row of the map is the top of the level
            if (rows[levelSize.y - 1 - y][x] != '#')
                continue;
            // set tile data
            const pos = vec2(x, y);
            const tileIndex = 1;
            const direction = LJS.randInt(4);
            const mirror = !LJS.randInt(2);
            const color = LJS.randColor();
            const data = new LJS.TileLayerData(tileIndex, direction, mirror, color);
            tileLayer.setData(pos, data);
            tileLayer.setCollisionData(pos);
        }
    // draw tile layer with new data
    tileLayer.redraw();
    // move camera to center of collision
    LJS.setCameraPos(tileLayer.size.scale(.5));
    LJS.setCameraScale(32);
    // enable gravity
    LJS.setGravity(vec2(0, -.01));
    // create particle emitter
    particleEmitter = new LJS.ParticleEmitter(vec2(16, 9), 0, // emitPos, emitAngle
    0, 0, 500, PI, // emitSize, emitTime, emitRate, emitConeAngle
    tile(0, 16), // tileInfo
    hsl(1, 1, 1), hsl(0, 0, 0), // colorStartA, colorStartB
    hsl(0, 0, 0, 0), hsl(0, 0, 0, 0), // colorEndA, colorEndB
    1, .2, .2, .1, .05, // particleTime, sizeStart, sizeEnd, speed, angleSpeed
    .99, 1, 1, PI, // damping, angleDamping, gravityScale, particleConeAngle
    .05, .5, true, true // fadeRate, randomness, collideLevel, additive
    );
    particleEmitter.restitution = .3; // bounce when it collides
    particleEmitter.trailScale = 2; // stretch as it moves
    particleEmitter.velocityInheritance = .3; // inherit emitter velocity
}
///////////////////////////////////////////////////////////////////////////////
function gameUpdate() {
    if (LJS.mouseWasPressed(0)) {
        // play sound when mouse is pressed
        sound_click.play(LJS.mousePos);
        // change particle color and set to fade out
        particleEmitter.colorStartA = LJS.randColor();
        particleEmitter.colorStartB = LJS.randColor();
        particleEmitter.colorEndA = particleEmitter.colorStartA.scale(1, 0);
        particleEmitter.colorEndB = particleEmitter.colorStartB.scale(1, 0);
        // unlock medals
        medal_example.unlock();
    }
    // move particles to the mouse once it has moved
    if (LJS.mousePosScreen.x)
        particleEmitter.pos = LJS.mousePos.copy();
}
///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost() {
}
///////////////////////////////////////////////////////////////////////////////
function gameRender() {
    // draw a gray square in the background, inside the walls
    LJS.drawRect(vec2(16, 8), vec2(30, 14), hsl(0, 0, .6));
    // draw the logo as a tile, standing on the floor
    LJS.drawTile(vec2(26, 3.25), vec2(4.5), tile(3, 128));
}
///////////////////////////////////////////////////////////////////////////////
function gameRenderPost() {
    LJS.drawTextScreen('LittleJS with TypeScript', vec2(LJS.mainCanvasSize.x / 2, 80), 80);
}
///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);
