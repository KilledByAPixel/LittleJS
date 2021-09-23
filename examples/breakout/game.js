/*
    LittleJS Breakout
*/

'use strict';

let levelSize, ball, paddle, score;

engineInit(

///////////////////////////////////////////////////////////////////////////////
()=> // gameInit 
{
    fixedWidth = 1280, fixedHeight = 720; // 720p
    score = 0;
    levelSize = vec2(72, 40);
    cameraPos = levelSize.scale(.5);
    paddle = new Paddle(vec2(levelSize.x/2-12,2));

    // spawn blocks
    const pos = vec2();
    for(pos.x = 6; pos.x <= levelSize.x-6; pos.x += 4)
    for(pos.y = levelSize.y/2; pos.y <= levelSize.y-4; pos.y += 2)
        new Block(pos);
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameUpdate
{
    // spawn ball
    if (!ball && mouseWasPressed(0))
    {
        ball = new Ball(vec2(levelSize.x/2, levelSize.y/2-6));
        zzfx(...[,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04]);
    }
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameUpdatePost
{

},
///////////////////////////////////////////////////////////////////////////////
()=> // gameRender
{
    // draw a grey square for the background
    drawRect(cameraPos, levelSize, new Color(.2,.2,.2));
},
///////////////////////////////////////////////////////////////////////////////
()=> // gameRenderPost
{
    // draw text on top of everything
    drawText('Score: ' + score, cameraPos.add(vec2(0,21)), 2, new Color, .3);
},

'tiles.png' // all the tile art goes in this texture
);