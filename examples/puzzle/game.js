/*
    Little Puzzle Game
    - A simple match 3 style puzzle game
    - Uses a high resolution texture
    - Tracks high score in local storage
    - Control with mouse or touch
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
const {vec2, rgb, hsl, tile} = LJS;

///////////////////////////////////////////////////////////////////////////////
// do not use pixelated rendering
LJS.setCanvasPixelated(false);
LJS.setTilesPixelated(false);

const fallTime = .2;
const cameraOffset = vec2(0,-.5);
const backgroundColor = hsl(0,0,.2);
const minMatchCount = 3;
const highScoreKey = 'puzzleBestScore';

// sound effects
const sound_goodMove = new LJS.Sound([.4,.2,250,.04,,.04,,,1,,,,,3]);
const sound_badMove  = new LJS.Sound([,,700,,,.07,,,,3.7,,,,3,,,.1]);
const sound_fall     = new LJS.Sound([.2,,1900,,,.01,,1.4,,91,,,,,,,,,,.7]);

let level, levelSize, levelFall, fallTimer, dragStartPos, comboCount, score, bestScore;

///////////////////////////////////////////////////////////////////////////////
// tiles
const tileColors = 
[
    rgb(1,0,0),
    rgb(1,1,1),
    rgb(1,1,0),
    rgb(0,1,0),
    rgb(0,.6,1),
    rgb(.8,0,1),
    rgb(.5,.5,.5),
];
const tileTypeCount = tileColors.length;

const getTile = (pos)       => level[pos.x + pos.y * levelSize.x];
const setTile = (pos, data) => level[pos.x + pos.y * levelSize.x] = data;

///////////////////////////////////////////////////////////////////////////////
function gameReset()
{
    // reset game objects
    LJS.engineObjectsDestroy();

    // randomize level
    level = [];
    const pos = vec2();
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
        setTile(pos, LJS.randInt(tileTypeCount));

    comboCount = score = 0;
    fallTimer = new LJS.Timer;
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // setup canvas
    LJS.setCanvasFixedSize(vec2(1920, 1080)); // 1080p
    LJS.setCanvasClearColor(backgroundColor);
    // load high score
    bestScore = localStorage[highScoreKey] || 0;

    // setup game
    levelSize = vec2(12,6);
    LJS.setCameraPos(levelSize.scale(.5).add(cameraOffset));
    LJS.setCameraScale(900/levelSize.y);
    LJS.setGravity(vec2(0,-.004));

    // start a new game
    gameReset();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (fallTimer.isSet())
    {
        // update falling tiles
        if (fallTimer.elapsed())
        {
            // add more blocks in the top
            for (let x = 0; x < levelSize.x; ++x)
                setTile(vec2(x,levelSize.y), LJS.randInt(tileTypeCount));
        }
        
        // allow blocks to fall
        if (!fallTimer.active())
        {
            // check if there is more to fall
            levelFall = [];
            let keepFalling = 0;
            const pos = vec2();
            for (pos.x = levelSize.x; pos.x--;)
            for (pos.y = 0; pos.y<levelSize.y; pos.y++)
            {
                const data = getTile(pos);
                const abovePos = pos.add(vec2(0,1));
                const aboveData = getTile(abovePos);
                if (data == -1 && aboveData >= 0)
                {
                    setTile(pos, aboveData);
                    setTile(abovePos, -1);
                    levelFall[pos.x+pos.y*levelSize.x] = keepFalling = 1;
                }
            }

            if (keepFalling)
            {
                const p = LJS.percent(comboCount, 9, 0);
                fallTimer.set(fallTime*p);
                sound_fall.play();
            }
            else
                fallTimer.unset();
        }
    }
    else
    {
        // try to clear matches
        clearMatches();
        if (!fallTimer.isSet())
        {
            // mouse/touch control
            const mouseTilePos = LJS.mousePos.floor();
            if (!LJS.mousePos.arrayCheck(levelSize))
            {
                // cancel drag if mouse is not in the level bounds
                dragStartPos = 0;
            }
            else if (LJS.mouseWasPressed(0) && !dragStartPos)
            {
                // start drag
                dragStartPos = mouseTilePos.copy();
            }
            else if (LJS.mouseIsDown(0) && dragStartPos)
            {
                // if dragging to a neighbor tile
                const dx = LJS.abs(dragStartPos.x - mouseTilePos.x);
                const dy = LJS.abs(dragStartPos.y - mouseTilePos.y);
                if (dx == 1 && dy == 0 || dx == 0 && dy == 1)
                {
                    const startTile = getTile(dragStartPos);
                    const endTile =   getTile(mouseTilePos);
                    if (startTile >= 0 && endTile >= 0)
                    {
                        // swap tiles
                        setTile(mouseTilePos, startTile);
                        setTile(dragStartPos, endTile);

                        // try to clear matches
                        clearMatches();

                        // undo if no matches
                        if (!fallTimer.isSet())
                        {
                            sound_badMove.play();
                            setTile(mouseTilePos, endTile);
                            setTile(dragStartPos, startTile);
                        }
                        else
                            sound_goodMove.play();
                        dragStartPos = 0;
                    }
                }
            }
            else
                dragStartPos = 0;
        }
    }

    if (score > bestScore)
    {
        // update high score
        bestScore = score;
        localStorage[highScoreKey] = bestScore;
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
    // draw a black square for the background
    LJS.drawRect(LJS.cameraPos.subtract(cameraOffset), levelSize, hsl(0,0,0));

    // draw the blocks
    const pos = vec2();
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
    {
        const data = getTile(pos);
        if (data == -1)
            continue;

        // highlight drag start
        const drawPos = pos.add(vec2(.5));
        if (dragStartPos && pos.x == dragStartPos.x && pos.y == dragStartPos.y)
            LJS.drawRect(drawPos, vec2(1.05));

        // make pieces fall gradually
        if (fallTimer.active() && levelFall[pos.x + pos.y*levelSize.x])
            drawPos.y += 1-fallTimer.getPercent();

        // draw background
        const color = tileColors[data];
        LJS.drawRect(drawPos, vec2(.95), color);
        
        // use darker color for icon
        const color2 = color.scale(.8, 1);
        LJS.drawTile(drawPos, vec2(.5), tile(data, 64), color2);
    }

    // draw a grey square at top to cover up incoming tiles
    LJS.drawRect(LJS.cameraPos.subtract(cameraOffset).add(vec2(0,levelSize.y)), levelSize, backgroundColor);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw text on top of everything
    LJS.drawTextOverlay('Score: ' + score,    LJS.cameraPos.add(vec2(-3,-3.1)), .9, hsl(), .1);
    LJS.drawTextOverlay('Best: ' + bestScore, LJS.cameraPos.add(vec2( 3,-3.1)), .9, hsl(), .1);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png']);

///////////////////////////////////////////////////////////////////////////////
// find and remove all runs of 3 or higher
function clearMatches()
{
    // horizontal match check
    const removeTiles = [], pos = vec2();
    for (pos.y = levelSize.y; pos.y--;)
    {
        let runCount, runData;
        for (pos.x = levelSize.x; pos.x--;)
        {
            const data = getTile(pos);
            if (data >= 0 && data == runData)
            {
                for (let i=++runCount; runCount >= minMatchCount && i--;)
                    removeTiles[pos.x + i + pos.y * levelSize.x] = 1;
            }
            else
            {
                runData = data;
                runCount = 1;
            }
        }
    }

    // vertical match check
    for (pos.x = levelSize.x; pos.x--;)
    {
        let runCount, runData;
        for (pos.y = levelSize.y; pos.y--;)
        {
            const data = getTile(pos);
            if (data >= 0 && data == runData)
            {
                for (let i=++runCount; runCount >= minMatchCount && i--;)
                    removeTiles[pos.x + (pos.y + i) * levelSize.x] = 1;
            }
            else
            {
                runData = data;
                runCount = 1;
            }
        }
    }

    // remove tiles all at once like this to handle shapes like L or T
    let removedCount = 0;
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
    {
        if (removeTiles[pos.x + pos.y * levelSize.x])
        {
            // remove tile
            ++removedCount;
            const data = getTile(pos);
            setTile(pos, -1);

            // spawn particles
            const color1 = tileColors[data];
            const color2 = color1.lerp(hsl(), .5);
            new LJS.ParticleEmitter(
                pos.add(vec2(.5)), 0, // pos, angle
                .5, .1, 200, 3.14,    // emitSize, emitTime, rate, cone
                0,                    // tileInfo
                color1, color2,                      // colorStartA, colorStartB
                color1.scale(1,0), color2.scale(1,0),// colorEndA, colorEndB
                .5, .3, .2, .05, .05, // particleTime, sizeStart, sizeEnd, speed, angleSpeed
                .99, 1, 1, 3.14, .05, // damp, angleDamp, gravityScale, particleCone, fadeRate
                .5, 0, 1              // randomness, collide, additive, colorLinear, renderOrder
            );
        }
    }

    if (removedCount)
    {
        score += ++comboCount*removedCount;
        fallTimer.set();
        levelFall = [];
    }
    else
        comboCount = 0;
}