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
()=> // gameInit 
{
    gravity = -.01;
    cameraScale = 4*16;
    gameTimer.set();
    buildLevel();
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameUpdate
{
    // respawn player
    if (player.deadTimer.get() > 1)
    {
        player = new Player(player.pos.add(vec2(0,1)));
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
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameUpdatePost
{
    // move camera to player
    cameraPos = cameraPos.lerp(player.pos, clamp(player.getAliveTime()/2));

    // update parallax background relative to camera
    updateParallaxLayers();
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameRender
{
    drawSky();
    drawStars();
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameRenderPost
{
},
///////////////////////////////////////////////////////////////////////////////
'tiles.png' // all the tile art goes in this texture
);