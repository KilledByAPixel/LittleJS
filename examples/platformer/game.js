/*
    Little JS Platforming Game
    - A basic platforming starter project
    - Platforming phyics and controls
    - Includes destructibe terrain
    - Control with keyboard, mouse, touch, or gamepad
*/

'use strict';

// show the LittleJS splash screen
setShowSplashScreen(true);

let spriteAtlas, score, deaths;

// enable touch gamepad on touch devices
touchGamepadEnable = true;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // engine settings
    gravity = -.01;
    objectDefaultDamping = .99;
    objectDefaultAngleDamping = .99;
    cameraScale = 4*16;

    // create a table of all sprites
    const gameTile = (i, size=16)=>  tile(i, size, 0, 1);
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

    // setup level
    buildLevel();

    // init game
    score = deaths = 0;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // respawn player
    if (player.deadTimer > 1)
    {
        player = new Player(playerStartPos);
        player.velocity = vec2(0,.1);
        sound_jump.play();
    }
    
    // mouse wheel = zoom
    cameraScale = clamp(cameraScale*(1-mouseWheel/10), 1, 1e3);
    
    // T = drop test crate
    if (keyWasPressed('KeyT'))
        new Crate(mousePos);
    
    // E = drop enemy
    if (keyWasPressed('KeyE'))
        new Enemy(mousePos);

    // X = make explosion
    if (keyWasPressed('KeyX'))
        explosion(mousePos);

    // M = move player to mouse
    if (keyWasPressed('KeyM'))
        player.pos = mousePos;

    // R = restart level
    if (keyWasPressed('KeyR'))
        buildLevel();
}

///////////////////////////////////////////////////////////////////////////////
function getCameraTarget()
{
    // camera is above player
    const offset = 200/cameraScale*percent(mainCanvasSize.y, 300, 600);
    return player.pos.add(vec2(0, offset));
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // update camera
    cameraPos = cameraPos.lerp(getCameraTarget(), clamp(player.getAliveTime()/2));
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    const drawText = (text, x, y, size=40) =>
    {
        overlayContext.textAlign = 'center';
        overlayContext.textBaseline = 'top';
        overlayContext.font = size + 'px arial';
        overlayContext.fillStyle = '#fff';
        overlayContext.lineWidth = 3;
        overlayContext.strokeText(text, x, y);
        overlayContext.fillText(text, x, y);
    }
    drawText('Score: ' + score,   overlayCanvas.width*1/4, 20);
    drawText('Deaths: ' + deaths, overlayCanvas.width*3/4, 20);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png', 'tilesLevel.png']);