/*
    LittleJS Platformer Example
    - A platforming starter game with destructibe terrain
*/

'use strict';

const lowGraphicsSettings = glOverlay = !isChrome; // fix slow rendering when not chrome

let overlayCanvas, overlayContext, score, deaths;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create overlay canvas for hud
    document.body.appendChild(overlayCanvas = document.createElement('canvas'));
    overlayContext = overlayCanvas.getContext('2d');

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
        playSound(sound_jump);
    }
    
    // mouse wheel = zoom
    cameraScale = clamp(cameraScale*(1-mouseWheel/10), 1e3, 1);
    
    // C = drop crate
    if (keyWasPressed(67))
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
    // clear overlay canvas
    overlayCanvas.width = mainCanvas.width;
    overlayCanvas.height = mainCanvas.height;
    overlayCanvas.style = mainCanvas.style.cssText;

    // draw to overlay canvas for hud rendering
    const drawOverlayText = (text, x, y, size=70) =>
    {
        overlayContext.textAlign = 'center';
        overlayContext.textBaseline = 'top';
        overlayContext.font = size + 'px arial'
        overlayContext.fillStyle = '#fff';
        overlayContext.lineWidth = 3;
        overlayContext.strokeText(text, x, y);
        overlayContext.fillText(text, x, y);
    }
    drawOverlayText('Score: ' + score,   overlayCanvas.width*1/3, 20);
    drawOverlayText('Deaths: ' + deaths, overlayCanvas.width*2/3, 20);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');