/*
    LittleJS Hello World Starter Game
*/

'use strict';

// popup errors if there are any (help diagnose issues on mobile devices)
//onerror = (...parameters)=> alert(parameters);

// sound effects
const sound_click = new Sound([.5,.5]);

// medals
const medal_example = new Medal(0, 'Example Medal', 'Welcome to LittleJS!');
medalsInit('Hello World');

// game variables
let particleEmiter;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // create tile collision and visible tile layer
    initTileCollision(vec2(32, 16));
    const tileLayer = new TileLayer(vec2(), tileCollisionSize);
    const pos = vec2();

    // get level data from the tiles image
    const imageLevelDataRow = 1;
    mainContext.drawImage(tileImage, 0, 0);
    for (pos.x = tileCollisionSize.x; pos.x--;)
    for (pos.y = tileCollisionSize.y; pos.y--;)
    {
        const data = mainContext.getImageData(pos.x, 16*(imageLevelDataRow+1)-pos.y-1, 1, 1).data;
        if (data[0])
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
        center, 0, 1, 0, 500, PI, // pos, angle, emitSize, emitTime, emitRate, emiteCone
        0, vec2(16),                            // tileIndex, tileSize
        new Color(1,1,1),   new Color(0,0,0),   // colorStartA, colorStartB
        new Color(1,1,1,0), new Color(0,0,0,0), // colorEndA, colorEndB
        2, .2, .2, .1, .05,     // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
        .99, 1, 1, PI, .05,     // damping, angleDamping, gravityScale, particleCone, fadeRate, 
        .5, 1, 1                // randomness, collide, additive, randomColorLinear, renderOrder
    );
    particleEmiter.elasticity = .3; // bounce when it collides
    particleEmiter.trailScale = 2;  // stretch in direction of motion

    //initPostProcess(); // set up a post processing shader
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (mouseWasPressed(0))
    {
        // play sound when mouse is pressed
        sound_click.play(mousePos);

        // change particle color and set to fade out
        particleEmiter.colorStartA = new Color;
        particleEmiter.colorStartB = randColor();
        particleEmiter.colorEndA = particleEmiter.colorStartA.scale(1,0);
        particleEmiter.colorEndB = particleEmiter.colorStartB.scale(1,0);

        // unlock medals
        medal_example.unlock();
    }

    // move particles to mouse location if on screen
    if (mousePosScreen.x)
        particleEmiter.pos = mousePos;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square in the background without using webgl
    drawRect(cameraPos, tileCollisionSize.add(vec2(5)), new Color(.2,.2,.2), 0, 0);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    drawTextScreen('Hello World', vec2(overlayCanvas.width/2, 80), 80, new Color, 9);
}

///////////////////////////////////////////////////////////////////////////////
// an example shader that can be used to apply a post processing effect
function initPostProcess()
{
    const tvPostProcessCode = `
    // Simple TV Shader Code
    float hash(vec2 p)
    {
        p=fract(p*.3197);
        return fract(1.+sin(51.*p.x+73.*p.y)*13753.3);
    }
    float noise(vec2 p)
    {
        vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+1.),u.x),u.y);
    }
    void mainImage(out vec4 c, in vec2 p)
    {
        const float scanlineScale = 800.;
        const float scanlineAlpha = .3;
        const float staticNoise = .2;
        const float staticNoiseScale = 1931.7;
        const float fuzz = .002;
        const float fuzzScale = 1730.;
        const float vignette = 2.;

        p /= iResolution.xy;

        // apply fuzz as horizontal offset
        p.x += fuzz*(noise(vec2(p.y*fuzzScale, iTime*9.))*2.-1.);

        // init output color
        c = vec4(0);
        c += texture2D(iChannel0,p);
        c += texture2D(iChannel1,p);

        // tv static noise
        c += staticNoise * hash(vec2(p*staticNoiseScale+mod(iTime*1e4,7777.)));

        // scan lines
        c *= 1. + scanlineAlpha*sin(p.y*scanlineScale);

        // black vignette around the outside
        float dx = 2.*p.x - 1., dy = 2.*p.y - 1.;
        c *= 1.-pow((dx*dx + dy*dy)/vignette, 6.);
    }`;
    glInitPostProcess(tvPostProcessCode);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');