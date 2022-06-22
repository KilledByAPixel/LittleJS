/*
    LittleJS Puzzle Example
    - A match 3 style puzzle game to get you started
    - Uses a higher resolution texture
*/

'use strict';

cavasPixelated = 0; // do not use pixelated rendering

const fallTime = .2;
const cameraOffset = vec2(0,-.5);
const backgroundColor = new Color(.2,.2,.2);
const minMatchCount = 3;
const highScoreKey = 'puzzleBestScore';

// sound effects
const sound_goodMove = new Sound([.4,.2,250,.04,,.04,,,1,,,,,3]);
const sound_badMove = new Sound([,,700,,,.07,,,,3.7,,,,3,,,.1]);
const sound_fall = new Sound([.2,,1900,,,.01,,1.4,,91,,,,,,,,,,.7]);

let level, levelSize, levelFall, fallTimer, dragStartPos, comboCount, score, bestScore;

///////////////////////////////////////////////////////////////////////////////
// tiles
const tileColors = 
[
    new Color(1,0,0),
    new Color(1,1,1),
    new Color(1,1,0),
    new Color(0,1,0),
    new Color(0,.6,1),
    new Color(.6,0,1),
    new Color(.5,.5,.5),
];
const tileTypeCount = tileColors.length;

const getTile = (pos)       => level[pos.x + pos.y * levelSize.x];
const setTile = (pos, data) => level[pos.x + pos.y * levelSize.x] = data;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // setup canvas
    canvasFixedSize = vec2(1920, 1080); // 1080p
    mainCanvas.style.background = backgroundColor;

    // load high score
    bestScore = localStorage[highScoreKey] || 0;

    // randomize level
    level = [];
    levelSize = vec2(12,6);
    const pos = vec2();
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
        setTile(pos, randInt(tileTypeCount));

    // setup game
    cameraPos = levelSize.scale(.5).add(cameraOffset);
    cameraScale = 900/levelSize.y;
    gravity = -.005;
    fallTimer = new Timer;
    comboCount = score = 0;
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
                setTile(vec2(x,levelSize.y),randInt(tileTypeCount));
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
                const p = percent(comboCount, 9, 0);
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
            const mouseTilePos = mousePos.floor();
            if (!mousePos.arrayCheck(levelSize))
            {
                // cancel drag if mouse is not in the level bounds
                dragStartPos = 0;
            }
            else if (mouseWasPressed(0) && !dragStartPos)
            {
                // start drag
                dragStartPos = mouseTilePos.copy();
            }
            else if (mouseIsDown(0) && dragStartPos)
            {
                // if dragging to a neighbor tile
                const dx = abs(dragStartPos.x - mouseTilePos.x);
                const dy = abs(dragStartPos.y - mouseTilePos.y);
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
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a black square for the background
    drawRect(cameraPos.subtract(cameraOffset), levelSize, new Color(0,0,0));

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
            drawRect(drawPos, vec2(1.05));

        // make pieces fall gradually
        if (fallTimer.active() && levelFall[pos.x + pos.y*levelSize.x])
            drawPos.y += 1-fallTimer.getPercent();

        // draw background
        const color = tileColors[data];
        drawRect(drawPos, vec2(.95), color);
        
        // use darker color for icon
        const color2 = color.scale(.8, 1);
        drawTile(drawPos, vec2(.5), data, vec2(64), color2);
    }

    // draw a grey square at top to cover up incomming tiles
    drawRect(cameraPos.subtract(cameraOffset).add(vec2(0,levelSize.y)), levelSize, backgroundColor);
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw text on top of everything
    drawText('Score: ' + score,    cameraPos.add(vec2(-3,-3.1)), .9, new Color, .1);
    drawText('Best: ' + bestScore, cameraPos.add(vec2( 3,-3.1)), .9, new Color, .1);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, 'tiles.png');

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
            const color2 = color1.lerp(new Color, .5);
            new ParticleEmitter(
                pos.add(vec2(.5)), 0, 1, .1, 100, PI,// pos, angle, emitSize, emitTime, emitRate, emiteCone
                undefined, undefined,                // tileIndex, tileSize
                color1, color2,                      // colorStartA, colorStartB
                color1.scale(1,0), color2.scale(1,0),// colorEndA, colorEndB
                .5, .3, .3, .05, .05, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
                .99, 1, 1, PI, .05,   // damping, angleDamping, gravityScale, particleCone, fadeRate, 
                .5, 0, 1              // randomness, collide, additive, randomColorLinear, renderOrder
            );
        }
    }

    if (removedCount)
    {
        score += ++comboCount*removedCount;
        fallTimer.set();
    }
    else
        comboCount = 0;
}