/*
    LittleJS Platformer Example
    - A platforming starter game with destructibe terrain
*/

'use strict';

// non chromium browsers like firefox may have slow compositing
// so we use glOverlay mode to work around the issue
const lowGraphicsSettings = glOverlay = !window['chrome'];

engineInit(

///////////////////////////////////////////////////////////////////////////////
()=> // appInit 
{
    gravity = -.01;
    cameraScale = 4*16;
    gameTimer.set();
    buildLevel();
},

///////////////////////////////////////////////////////////////////////////////
()=> // appUpdate
{
    // respawn player
    if (player.deadTimer.get() > 1)
    {
        player = new Player(playerStartPos);
        playSound(sound_jump);
    }
    
    // mouse wheel = zoom
    cameraScale = clamp(cameraScale*(1-mouseWheel/10), 1e3, 1);
        
    // T = drop test object
    if (keyWasPressed(84))
        new Crate(mousePos);
        
    // E = make explosion
    if (keyWasPressed(69))
        explosion(mousePos);

    // M = move player to mouse
    if (keyWasPressed(77))
        player.pos = mousePos;
},

///////////////////////////////////////////////////////////////////////////////
()=> // appUpdatePost
{
    // move camera to player
    cameraPos = cameraPos.lerp(player.pos, clamp(player.getAliveTime()/2));

    // update parallax background relative to camera
    updateParallaxLayers();
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRender
{
    drawSky();
    drawStars();
},

///////////////////////////////////////////////////////////////////////////////
()=> // appRenderPost
{
},

'tiles.png' // all the tile art goes in this texture
);