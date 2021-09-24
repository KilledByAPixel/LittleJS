/*
    LittleJS Hello World Starter Game
*/

'use strict';

let particleEmiter;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create tile collision and visible tile layer
    initTileCollision(vec2(35,20));
    const tileLayer = new TileLayer(vec2(), tileCollisionSize);
    const pos = vec2();
    for (pos.x = tileCollisionSize.x; pos.x--;)
    for (pos.y = tileCollisionSize.y; pos.y--;)
    {
        if (randSeeded() > .8)
        {
            setTileCollisionData(pos, 1);

            const tileIndex = 1;
            const direction = randInt(4)
            const mirror = randInt(2);
            const color = randColor();
            const data = new TileLayerData(tileIndex, direction, mirror, color);
            tileLayer.setData(pos, data);
        }
    }
    tileLayer.redraw();

    // move camera to center of collision
    cameraPos = tileCollisionSize.scale(.5);
    cameraScale = 32;

    // enable gravity
    gravity = -.01;

    // create particle emitter
    const center = tileCollisionSize.scale(.5).add(vec2(0,9));
    particleEmiter = new ParticleEmitter(
        center, 1, 0, 500, PI, // pos, emitSize, emitTime, emitRate, emiteCone
        0, vec2(16),                              // tileIndex, tileSize
        new Color, new Color(0,0,0),   // colorStartA, colorStartB
        new Color(1,1,1,0), new Color(0,0,0,0), // colorEndA, colorEndB
        2, .2, .2, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
        .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
        .5, 1, 1             // randomness, collide, additive, randomColorLinear, renderOrder
    );
    particleEmiter.elasticity = .3;
    particleEmiter.trailScale = 2;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // play sound when mouse is pressed
    if (mouseWasPressed(0))
    {
        zzfx(.5,1);
        particleEmiter.colorStartA = randColor();
        particleEmiter.colorStartB = randColor();
        particleEmiter.colorEndA = particleEmiter.colorStartA.scale(1,0);
        particleEmiter.colorEndB = particleEmiter.colorStartB.scale(1,0);
    }

    // move particles to mouse location if on screen
    if (mousePosScreen.x || mousePosScreen.y)
        particleEmiter.pos = mousePos;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square
    drawRect(cameraPos, tileCollisionSize.add(vec2(5)), new Color(.2,.2,.2));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw text on top of everything
    drawText('Hello World', cameraPos, 3, new Color, .1);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');