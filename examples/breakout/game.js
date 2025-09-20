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
let ball, score, brickCount, paddle;
export const levelSize = vec2(38, 20);

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
    font.drawText('Score: ' + score, LJS.cameraPos.add(vec2(0,10)), .15, true);
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
    float noise(vec2 p)
    {
        vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+1.),u.x),u.y);
    }
    void mainImage(out vec4 c, vec2 p)
    {
        // put uv in texture pixel space
        p /= iResolution.xy;

        // apply fuzz as horizontal offset
        const float fuzz = .0005;
        const float fuzzScale = 800.;
        const float fuzzSpeed = 9.;
        p.x += fuzz*(noise(vec2(p.y*fuzzScale, iTime*fuzzSpeed))*2.-1.);

        // init output color
        c = texture(iChannel0, p);

        // chromatic aberration
        const float chromatic = .002;
        c.r = texture(iChannel0, p - vec2(chromatic,0)).r;
        c.b = texture(iChannel0, p + vec2(chromatic,0)).b;

        // tv static noise
        const float staticNoise = .1;
        c += staticNoise * hash(p + mod(iTime, 1e3));

        // scan lines
        const float scanlineScale = 1e3;
        const float scanlineAlpha = .1;
        c *= 1. + scanlineAlpha*sin(p.y*scanlineScale);

        // black vignette around edges
        const float vignette = 2.;
        const float vignettePow = 6.;
        float dx = 2.*p.x-1., dy = 2.*p.y-1.;
        c *= 1.-pow((dx*dx + dy*dy)/vignette, vignettePow);
    }`;

    const includeOverlay = true;
    new LJS.PostProcessPlugin(televisionShader, includeOverlay);
}

///////////////////////////////////////////////////////////////////////////////
// Exports

export function changeBrickCount(delta)
{
    brickCount += delta;
    
    // increase score when brick is destroyed
    if (delta < 0)
        score -= delta;
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);