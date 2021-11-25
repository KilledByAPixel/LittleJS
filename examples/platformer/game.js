/*
    LittleJS Platformer Example
    - A platforming starter game with destructibe terrain
*/

'use strict';

let score, deaths;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // enable touch gamepad on touch devices
    touchGamepadEnable = 1;

    // setup game
    score = deaths = 0;
    gravity = -.01;
    cameraScale = 4*16;
    gameTimer.set();
    buildLevel();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // respawn player
    if (player.deadTimer.get() > 1)
    {
        player = new Player(playerStartPos);
        player.velocity = vec2(0,.1);
        sound_jump.play();
    }
    
    // mouse wheel = zoom
    cameraScale = clamp(cameraScale*(1-mouseWheel/10), 1, 1e3);
    
    // T = drop test crate
    if (keyWasPressed(84))
        new Crate(mousePos);
    
    // E = drop enemy
    if (keyWasPressed(69))
        new Enemy(mousePos);

    // X = make explosion
    if (keyWasPressed(88))
        explosion(mousePos);

    // M = move player to mouse
    if (keyWasPressed(77))
        player.pos = mousePos;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // move camera to player
    cameraPos = cameraPos.lerp(player.pos, clamp(player.getAliveTime()/2));

    // update parallax background relative to camera
    updateParallaxLayers();
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    drawSky();
    drawStars();
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    const drawText = (text, x, y, size=50) =>
    {
        overlayContext.textAlign = 'center';
        overlayContext.textBaseline = 'top';
        overlayContext.font = size + 'px arial';
        overlayContext.fillStyle = '#fff';
        overlayContext.lineWidth = 2;
        overlayContext.strokeText(text, x, y);
        overlayContext.fillText(text, x, y);
    }
    drawText('Score: ' + score,   overlayCanvas.width*1/4, 20);
    drawText('Deaths: ' + deaths, overlayCanvas.width*3/4, 20);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');