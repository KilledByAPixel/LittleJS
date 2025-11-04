/*
    Little JS Breakout Game
    - A simple breakout game
    - Includes sound and particles
    - Uses a post processing effect
    - Control with mouse, touch, or gamepad
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameObjects from './gameObjects.js';
const {vec2, hsl} = LJS;

///////////////////////////////////////////////////////////////////////////////
// game objects
export let ball, score, brickCount, paddle;
export const levelSize = vec2(38, 20);

export function changeBrickCount(delta)
{
    brickCount += delta;
    
    // increase score when brick is destroyed
    if (delta < 0)
        score -= delta;
}

///////////////////////////////////////////////////////////////////////////////
function gameReset()
{
    // reset game objects
    LJS.engineObjectsDestroy();
    score = 0;
    brickCount = 0;

    // spawn bricks
    const pos = vec2();
    for (pos.x = 4; pos.x <= levelSize.x-4; pos.x += 2)
    for (pos.y = 12; pos.y <= levelSize.y-2; pos.y += 1)
        new GameObjects.Brick(pos);

    // create walls
    new GameObjects.Wall(vec2(-.5,levelSize.y/2),            vec2(1,100)); // top
    new GameObjects.Wall(vec2(levelSize.x+.5,levelSize.y/2), vec2(1,100)); // left
    new GameObjects.Wall(vec2(levelSize.x/2,levelSize.y+.5), vec2(100,1)); // right

    // spawn player paddle
    paddle = new GameObjects.Paddle(vec2(levelSize.x/2-12, 1));

    // reset ball
    ball = 0;
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    LJS.setCanvasFixedSize(vec2(1920, 1080)); // 1080p
    LJS.setCameraPos(levelSize.scale(.5)); // center camera
    LJS.setCameraScale(48);

    // set up a post processing shader
    setupPostProcess();

    // start a new game
    gameReset();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // spawn ball
    if (!ball && (LJS.mouseWasPressed(0) || LJS.gamepadWasPressed(0)))
        ball = new GameObjects.Ball(vec2(levelSize.x/2, levelSize.y/2));

    if (ball && ball.pos.y < -1)
    {
        // destroy ball if it goes below the level
        ball.destroy();
        ball = 0;
    }

    if (LJS.keyWasPressed('KeyR'))
        gameReset();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a the background
    LJS.drawRect(LJS.cameraPos, levelSize.scale(2), hsl(0,0,.5));
    LJS.drawRect(LJS.cameraPos, levelSize, hsl(0,0,.02));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // use built in image font for text
    const font = new LJS.FontImage;

    font.drawText('Score: ' + score, LJS.cameraPos.add(vec2(0,9.7)), .15, true);
    if (!brickCount)
        font.drawText('You Win!', LJS.cameraPos.add(vec2(0,-5)), .2, true);
    else if (!ball)
        font.drawText('Click to Play', LJS.cameraPos.add(vec2(0,-5)), .2, true);
}

///////////////////////////////////////////////////////////////////////////////
// an example shader that can be used to apply a post processing effect
function setupPostProcess()
{
    const televisionShader = `
    // Simple TV Shader Code
    float hash(vec2 p)
    {
        p=fract(p*.3197);
        return fract(1.+sin(51.*p.x+73.*p.y)*13753.3);
    }

    void mainImage(out vec4 c, vec2 p)
    {
        // setup the shader
        vec2 uv = p;
        p /= iResolution.xy;
        c = texture(iChannel0, p);

        // static noise
        const float staticAlpha = .1;
        const float staticScale = .002;
        c += staticAlpha * hash(floor(p/staticScale) + mod(iTime*500., 1e3));

        // scan lines
        const float scanlineScale = 2.;
        const float scanlineAlpha = .6;
        c *= 1. - scanlineAlpha*cos(p.y*2.*iResolution.y/scanlineScale);

        {
            // bloom effect
            const float blurSize = .002;
            const float bloomIntensity = .2;

            // 5-tap Gaussian blur
            vec4 bloom = vec4(0);
            bloom += texture(iChannel0, p + vec2(-2.*blurSize, 0)) * .12;
            bloom += texture(iChannel0, p + vec2(   -blurSize, 0)) * .24;
            bloom += texture(iChannel0, p)                         * .28;
            bloom += texture(iChannel0, p + vec2(    blurSize, 0)) * .24;
            bloom += texture(iChannel0, p + vec2( 2.*blurSize, 0)) * .12;
            bloom += texture(iChannel0, p + vec2(0, -2.*blurSize)) * .12;
            bloom += texture(iChannel0, p + vec2(0,    -blurSize)) * .24;
            bloom += texture(iChannel0, p)                         * .28;
            bloom += texture(iChannel0, p + vec2(0,     blurSize)) * .24;
            bloom += texture(iChannel0, p + vec2(0,  2.*blurSize)) * .12;
            c += bloom * bloomIntensity;
        }

        // black vignette around edges
        const float vignette = 2.;
        const float vignettePow = 6.;
        float dx = 2.*p.x-1., dy = 2.*p.y-1.;
        c *= 1.-pow((dx*dx + dy*dy)/vignette, vignettePow);
    }`;

    new LJS.PostProcessPlugin(televisionShader, true);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);