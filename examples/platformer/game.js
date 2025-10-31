/*
    Little JS Platforming Game
    - A basic platforming starter project
    - Platforming physics and controls
    - Includes destructible terrain
    - Control with keyboard, mouse, touch, or gamepad
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameObjects from './gameObjects.js';
import * as GameEffects from './gameEffects.js';
import * as GamePlayer from './gamePlayer.js';
import * as GameLevel from './gameLevel.js';
const {vec2} = LJS;

// globals
export let gameLevelData, spriteAtlas, player, score, deaths;
export function addToScore(delta=1) { score += delta; }
export function addToDeaths() { ++deaths; }

// enable touch gamepad on touch devices
LJS.setTouchGamepadEnable(true);

// limit canvas aspect ratios to support most modern HD devices
LJS.setCanvasMinAspect(.4);
LJS.setCanvasMaxAspect(2.5);

// limit size to to 4k HD
LJS.setCanvasMaxSize(vec2(3840, 2160));

///////////////////////////////////////////////////////////////////////////////
function loadLevel()
{
    // setup level
    GameLevel.buildLevel();
    
    // spawn player
    player = new GamePlayer.Player(GameLevel.playerStartPos);
    LJS.setCameraPos(GameLevel.getCameraTarget());

    // init game
    score = deaths = 0;
}

///////////////////////////////////////////////////////////////////////////////
async function gameInit()
{
    // load the game level data
    gameLevelData = await LJS.fetchJSON('gameLevelData.json');

    // engine settings
    LJS.setGravity(vec2(0,-.01));
    LJS.setObjectDefaultDamping(.99);
    LJS.setObjectDefaultAngleDamping(.99);
    LJS.setCameraScale(4*16);

    // create a table of all sprites
    const gameTile = (i, size=16)=> LJS.tile(i, size, 0, 1);
    spriteAtlas =
    {
        // large tiles
        circle:  gameTile(0),
        crate:   gameTile(1),
        player:  gameTile(2),
        enemy:   gameTile(4),
        coin:    gameTile(5),

        // small tiles
        gun:     gameTile(vec2(0,2),8),
        grenade: gameTile(vec2(1,2),8),
    };

    loadLevel();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // respawn player
    if (player.deadTimer > 1)
    {
        player = new GamePlayer.Player(GameLevel.playerStartPos);
        player.velocity = vec2(0,.1);
        GameEffects.sound_jump.play();
    }
    
    // mouse wheel = zoom
    LJS.setCameraScale(LJS.clamp(LJS.cameraScale*(1-LJS.mouseWheel/10), 1, 1e3));
    
    // T = drop test crate
    if (LJS.keyWasPressed('KeyT'))
        new GameObjects.Crate(LJS.mousePos);
    
    // E = drop enemy
    if (LJS.keyWasPressed('KeyE'))
        new GameObjects.Enemy(LJS.mousePos);

    // X = make explosion
    if (LJS.keyWasPressed('KeyX'))
        GameEffects.explosion(LJS.mousePos);

    // M = move player to mouse
    if (LJS.keyWasPressed('KeyM'))
        player.pos = LJS.mousePos;

    // R = restart level
    if (LJS.keyWasPressed('KeyR'))
        loadLevel();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // update camera
    LJS.setCameraPos(LJS.cameraPos.lerp(GameLevel.getCameraTarget(), LJS.clamp(player.getAliveTime()/2)));
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to main canvas for hud rendering
    const drawText = (text, x, y, size=40) =>
    {
        const context = LJS.mainContext;
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.font = size + 'px arial';
        context.fillStyle = '#fff';
        context.lineWidth = 3;
        context.strokeText(text, x, y);
        context.fillText(text, x, y);
    }
    drawText('Score: ' + score,   LJS.mainCanvas.width*1/4, 20);
    drawText('Deaths: ' + deaths, LJS.mainCanvas.width*3/4, 20);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png', 'tilesLevel.png']);