/*
    LittleJS Breakout
*/

'use strict';

let levelSize, ball, paddle, score;

engineInit(

///////////////////////////////////////////////////////////////////////////////
()=> // appInit 
{
    score = 0;
    levelSize = vec2(72, 50);
    paddle = new Paddle(vec2(levelSize.x/2-12,2));
    cameraPos = levelSize.scale(.5);

    // spawn blocks
    const pos = vec2();
    for(pos.x = 6; pos.x <= levelSize.x-6; pos.x += 4)
    for(pos.y = levelSize.y/2; pos.y <= levelSize.y-4; pos.y += 2)
        new Block(pos);
},
///////////////////////////////////////////////////////////////////////////////
()=> // appUpdate
{
    // spawn ball
    if (!ball && mouseWasPressed(0))
    {
        ball = new Ball(vec2(levelSize.x/2, levelSize.y/2-6));
        zzfx(...[,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04]);
    }
},
///////////////////////////////////////////////////////////////////////////////
()=> // appUpdatePost
{

},
///////////////////////////////////////////////////////////////////////////////
()=> // appRender
{
    // draw a grey square for the background
    drawRect(cameraPos, levelSize, new Color(.2,.2,.2));
},
///////////////////////////////////////////////////////////////////////////////
()=> // appRenderPost
{
    // draw text on top of everything
    drawText('Score: ' + score, cameraPos.add(vec2(0,23)), 3, new Color, .3);
},

'tiles.png' // all the tile art goes in this texture
);