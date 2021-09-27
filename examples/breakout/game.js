/*
    LittleJS Breakout Example
*/

'use strict';

// zzfx sounds
const sound_start =      [,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04];
const sound_breakBlock = [,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01];
const sound_bounce =     [,,1e3,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06];

let levelSize, ball, paddle, score, blockCount;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    fixedWidth = 1280, fixedHeight = 720; // 720p
    levelSize = vec2(72, 40);
    cameraPos = levelSize.scale(.5);
    paddle = new Paddle(vec2(levelSize.x/2-12,2));
    score = blockCount = 0;

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
        playSound(sound_start);
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
    drawText('Score: ' + score, cameraPos.add(vec2(0,21)), 2, new Color, .2);
    if (!blockCount)
        drawText('You Win!', cameraPos.add(vec2(0,-5)), 2, new Color, .2);
    else if (!ball)
        drawText('Click to play', cameraPos.add(vec2(0,-5)), 2, new Color, .2);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');