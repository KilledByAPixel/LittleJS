/*
    LittleJS Breakout Example
*/

'use strict';

let levelSize, ball, paddle, score;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    fixedWidth = 1280, fixedHeight = 720; // 720p
    levelSize = vec2(72, 40);
    cameraPos = levelSize.scale(.5);
    paddle = new Paddle(vec2(levelSize.x/2-12,2));
    score = 0;

    // spawn blocks
    const pos = vec2();
    for (pos.x = 6; pos.x <= levelSize.x-6; pos.x += 4)
    for (pos.y = levelSize.y/2; pos.y <= levelSize.y-4; pos.y += 2)
        new Block(pos);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // spawn ball
    if (!ball && mouseWasPressed(0))
    {
        ball = new Ball(vec2(levelSize.x/2, levelSize.y/2-6));
        zzfx(...[,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04]);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square for the background
    drawRect(cameraPos, levelSize, new Color(.2,.2,.2));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw text on top of everything
    drawText('Score: ' + score, cameraPos.add(vec2(0,21)), 2, new Color, .3);
    ball || drawText('Click to play', cameraPos.add(vec2(0,-5)), 2, new Color, .3);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');