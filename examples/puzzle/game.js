/*
    LittleJS Puzzle Example
    - A match 3 style puzzle game to get you started
    - Draws directly to Canvas2D without using WebGL
    - Does not use a texture
*/

'use strict';

const tileTypeCount = 6, fallTime = .1;
const cameraOffset = vec2(0,.5);
let music, levelSize, level, levelFall, fallTimer, dragStartPos, comboCount, score;

const getLevelTile = (pos)   => level[pos.x + pos.y * levelSize.x];
const setLevelTile = (pos,d) => level[pos.x + pos.y * levelSize.x] = d;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    gravity = -.005;
    fixedWidth = 1920, fixedHeight = 1080; // 1080p
    mainCanvas.style.background = '#444';

    // randomize level
    level = [];
    levelSize = vec2(16,8);
    const pos = vec2();
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
        setLevelTile(pos, randInt(tileTypeCount));

    cameraPos = levelSize.scale(.5).add(cameraOffset);
    cameraScale = 900/levelSize.y;
    fallTimer = new Timer;
    comboCount = 0;
    score = 0;
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (fallTimer.isSet())
    {
        if (fallTimer.elapsed())
        {
            // add more blocks in the top
            for(let x = 0; x < levelSize.x; ++x)
                setLevelTile(vec2(x,levelSize.y),randInt(tileTypeCount));
        }
        
        // allow blocks to fall
        if (!fallTimer.active())
        {
            // check if there is more to fall
            let keepFalling = 0;
            levelFall = [];
            const pos = vec2();
            for (pos.x = levelSize.x; pos.x--;)
            for (pos.y = 0; pos.y<levelSize.y; pos.y++)
            {
                const abovePos = pos.add(vec2(0,1));
                const data = getLevelTile(pos);
                const aboveData = getLevelTile(abovePos);
                if (data == -1 && aboveData >= 0)
                {
                    setLevelTile(pos, aboveData);
                    setLevelTile(abovePos, -1);
                    levelFall[pos.x+pos.y*levelSize.x] = 1;
                    keepFalling = 1;
                }
            }

            if (keepFalling)
            {
                const p = percent(comboCount,0,9);
                fallTimer.set(fallTime*p);
                    zzfx(...[.1,,1922,,,.01,,1.42,,91,,,,,,,,,,.73]);
            }
            else
                fallTimer.unset();
        }

        if (mouseWasPressed(0))
            zzfx(...[.8,,60,.05,,.06,3,.64,2,-24,,,,,,,.01]);
    }
    else
    {
        // try to clear matches
        clearMatches();
        if (!fallTimer.isSet())
        {
            // mouse/touch control
            const mouseTilePos = mousePos.int();
            if (mouseWasPressed(0) && !dragStartPos)
            {
                dragStartPos = mouseTilePos.copy();
            }
            else if (mouseIsDown(0) && dragStartPos)
            {
                if (dragStartPos.x != mouseTilePos.x || dragStartPos.y != mouseTilePos.y)
                {
                    // drag must be a neighbor tile
                    if ((abs(dragStartPos.x - mouseTilePos.x) == 1) ^ (abs(dragStartPos.y - mouseTilePos.y) == 1))
                    {
                        const startTile = getLevelTile(dragStartPos);
                        const endTile =   getLevelTile(mouseTilePos);
                        if (startTile >= 0 && endTile >= 0)
                        {
                            // swap tiles
                            setLevelTile(mouseTilePos, startTile);
                            setLevelTile(dragStartPos, endTile);

                            // try to clear matches
                            clearMatches();

                            // undo if no matches
                            if (!fallTimer.isSet())
                            {
                                score = max(score-1, 0);
                                zzfx(...[,,709,,,.07,,,,3.7,,,,3.6,,,.11]);
                                setLevelTile(mouseTilePos, endTile);
                                setLevelTile(dragStartPos, startTile);
                            }
                            else
                                zzfx(...[.8,,224,.02,.02,.08,1,1.7,-13.9,,,,,,6.7]);
                            dragStartPos = 0;
                        }
                    }
                }
            }
            else
                dragStartPos = 0;
        }
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
    drawCanvas2D(cameraPos.subtract(cameraOffset), levelSize, 0, 0, context=>
    {
        context.fillStyle = '#000';
        context.fillRect(-.5,-.5,1,1);
    });

    // draw the blocks
    mainContext.font = '.9px"';
    mainContext.textAlign = 'center';
    mainContext.textBaseline = 'middle';
    mainContext.fillStyle = '#fff';
    mainContext.strokeStyle = '#000';
    mainContext.lineWidth = .05;
    mainContext.shadowColor = '#000';
    
    const pos = vec2();
    const tileSize = .45;
    const mouseTilePos = mousePos.int();
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
    {
        const data = getLevelTile(pos);
        if (data == -1)
            continue;

        let drawPos = pos.add(vec2(.5));
        if (fallTimer.active() && levelFall[pos.x + pos.y*levelSize.x])
            drawPos.y += 1-fallTimer.getPercent();
        
        const isDragTile = dragStartPos && dragStartPos && pos.x == dragStartPos.x && pos.y == dragStartPos.y;

        drawCanvas2D(drawPos, vec2(1), 0, 0, context=>
        {
            context.shadowBlur = 0;
            context.fillStyle = new Color().setHSLA(data/4,data==4?0:.7,data==5?1:.7).rgba();
            if (isDragTile)
                context.fillStyle = '#ff0';
            context.fillRect(-tileSize,-tileSize,2*tileSize,2*tileSize);

            context.shadowBlur = 9;
            context.fillStyle = new Color().setHSLA(data/4,1,data==5?1:data==4?0:.5).rgba();
            const icon = '♥♣♦♠●▴'[data];
            context.strokeText(icon,0,0);
            context.fillText(icon,0,0);
        });
    }

    // draw a grey square at top to cover up incomming tiles
    drawCanvas2D(cameraPos.subtract(cameraOffset).add(vec2(0,levelSize.y)), levelSize, 0, 0, context=>
    {
        context.fillStyle = '#444';
        context.fillRect(-.5,-.5,1,1);
    });
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw text on top of everything
    drawText('Score: ' + score, cameraPos.add(vec2(0,4.1)), 1.2, new Color, .1);
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);

///////////////////////////////////////////////////////////////////////////////
function clearMatches()
{
    // horizontal match check
    let removedCount = 0;
    let pos = vec2();
    for (pos.y = levelSize.y; pos.y--;)
    {
        let runCount, runData;
        for (pos.x = levelSize.x; pos.x--;)
        {
            const data = getLevelTile(pos);
            if (data >= 0 && data == runData)
            {
                ++runCount;
                if (runCount == 3)
                {
                    // remove run tiles
                    removedCount += runCount;
                    for (let j=runCount; j--;)
                        removeTile(pos.add(vec2(j,0)));
                }
                else if (runCount > 3)
                {
                    ++removedCount;
                    removeTile(pos);
                }
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
            const data = getLevelTile(pos);
            if (data >= 0 && data == runData)
            {
                ++runCount;
                if (runCount == 3)
                {
                    // remove run tiles
                    removedCount += runCount;
                    for (let j=runCount; j--;)
                        removeTile(pos.add(vec2(0,j)));
                }
                else if (runCount > 3)
                {
                    ++removedCount;
                    removeTile(pos);
                }
            }
            else
            {
                runData = data;
                runCount = 1;
            }
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

function removeTile(pos)
{
    const data = getLevelTile(pos);
    setLevelTile(pos, -1);

    // spawn particles
    const color1 = new Color().setHSLA(data/4,data==4?0:1,data==5?1:.5);
    const color2 = color1.lerp(new Color, .5);
    new ParticleEmitter(
        pos.add(vec2(.5)), 1, .1, 400, PI,   // pos, emitSize, emitTime, emitRate, emiteCone
        undefined, undefined,                // tileIndex, tileSize
        color1, color2,                      // colorStartA, colorStartB
        color1.scale(1,0), color2.scale(1,0),// colorEndA, colorEndB
        .5, .2, .2, .05, .05, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
        .99, 1, 1, PI, .05,   // damping, angleDamping, gravityScale, particleCone, fadeRate, 
        .5, 0, 1              // randomness, collide, additive, randomColorLinear, renderOrder
    );
}