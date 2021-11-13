/*
    LittleJS Platformer Example - Level Generator
    - Procedurally generates level geometry
    - Picks colors for the level and background
    - Creates ladders and spawns enemies and crates

*/

'use strict';

const tileType_ladder  = -1;
const tileType_empty   = 0;
const tileType_solid   = 1;

let player, playerStartPos, tileLayer, tileBackgroundLayer, gameTimer = new Timer;
let levelSize, levelColor, levelGroundColor, warmup;

let tileBackground;
const setTileBackgroundData = (pos, data=0)=>
    pos.arrayCheck(tileCollisionSize) && (tileBackground[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);
const getTileBackgroundData = (pos)=>
    pos.arrayCheck(tileCollisionSize) ? tileBackground[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;

///////////////////////////////////////////////////////////////////////////////
// level generation

function buildTerrain(size)
{
    tileBackground = [];
    initTileCollision(size);
    let startGroundLevel = 40;
    let groundLevel = startGroundLevel;
    let groundSlope = rand(-1,1);
    let backgroundDelta = 0, backgroundDeltaSlope = 0;
    for (let x=0; x < size.x; x++)
    {
        // pull slope towards start ground level
        groundLevel += groundSlope = rand() < .05 ? rand(-1,1) :
            groundSlope + (startGroundLevel - groundLevel)/1e3;
        
        // small jump
        if (rand() < .04)
            groundLevel += rand(9,-9);

        if (rand() < .03)
        {
            // big jump
            const jumpDelta = rand(19,-19);
            startGroundLevel = clamp(startGroundLevel + jumpDelta, 20, 80);
            groundLevel += jumpDelta;
            groundSlope = rand(-1,1);
        }

        backgroundDelta += backgroundDeltaSlope;
        if (rand() < .1)
            backgroundDelta = rand(3, -1);
        if (rand() < .1)
            backgroundDelta = 0;
        if (rand() < .1)
            backgroundDeltaSlope = rand(-1,1);
        backgroundDelta = clamp(backgroundDelta, -1, 3)

        groundLevel = clamp(groundLevel, 20, levelSize.y-20);
        for (let y=0; y < size.y; y++)
        {
            const pos = vec2(x,y);

            let frontTile = tileType_empty;
            if (y < groundLevel)
                 frontTile = tileType_solid;

            let backTile = tileType_empty;
            if (y < groundLevel + backgroundDelta)
                 backTile = tileType_solid;
            
            setTileCollisionData(pos, frontTile);
            setTileBackgroundData(pos, backTile);
        }
    }

    // add random holes
    for (let i=levelSize.x; i--;)
    {
        const pos = vec2(rand(levelSize.x), rand(levelSize.y/2, 9));
        const height = randInt(19,1);
        const offset = vec2();
        for (offset.x = randInt(19,1); --offset.x;)
        for (offset.y = height; --offset.y;)
            setTileCollisionData(pos.add(offset), tileType_empty);
    }

    // add ladders
    for (let ladderCount = 40; ladderCount--;)
    {
        // pick random pos
        const pos = vec2(randInt(levelSize.x), randInt(levelSize.y))

        // find good place to put ladders
        let state = 0, ladderTop;
        for (; pos.y > 9; --pos.y)
        {
            const data = getTileCollisionData(pos);
            if (state == 0 ||  state == 2)
                data || state++;   // found empty, go to next state
            else if (state == 1)
            {
                data && state++;   // found solid, go to next state
                ladderTop = pos.y;
            }
            else if (state == 3 && data)
            {
                // found solid again, build ladder
                for (; ++pos.y <= ladderTop;)
                    setTileCollisionData(pos, tileType_ladder);
                break;
            }
        }
    }

    // spawn crates
    for (let crateCount=100; crateCount--;)
        new Crate(vec2((randInt(levelSize.x))+.5, randInt(levelSize.y)));

    // spawn enemies
    for (let enemyCount=10; enemyCount--;)
        new Enemy(vec2(rand(levelSize.x), rand(levelSize.y)));
}

function generateLevel()
{
    // clear old level
    engineObjectsDestroy();

    // randomize ground level hills
    buildTerrain(levelSize);

    // find starting poing for player
    playerStartPos = vec2(rand(levelSize.x), levelSize.y);
    const raycastHit = tileCollisionRaycast(playerStartPos, vec2(playerStartPos.x, 0));
    playerStartPos = raycastHit.add(vec2(0,1));
}

function makeTileLayers()
{
    // create tile layers
    tileLayer = new TileLayer(vec2(), levelSize);
    tileLayer.renderOrder = -1e3;
    tileBackgroundLayer = new TileLayer(vec2(), levelSize);
    tileBackgroundLayer.renderOrder = -2e3;

    const pos = vec2();
    for (pos.x = levelSize.x; pos.x--;)
    for (pos.y = levelSize.y; pos.y--;)
    {
        // foreground tiles
        let tileType = getTileCollisionData(pos);
        if (tileType)
        {
            let direction, mirror, tileIndex, color;
            if (tileType == tileType_solid)
            {
                tileIndex = 5 + rand()**3*2|0;
                color = levelColor.mutate(.03);
                direction = randInt(4);
                mirror = randInt(2);
            }
            else if (tileType == tileType_ladder)
                tileIndex = 7;

            const data = new TileLayerData(tileIndex, direction, mirror, color);
            tileLayer.setData(pos, data);
        }
        
        // background tiles
        tileType = getTileBackgroundData(pos);
        if (tileType)
        {
            const data = new TileLayerData(5 + rand()**3*2|0, randInt(4), randInt(2), levelColor.mutate().scale(.4,1));
            tileBackgroundLayer.setData(pos, data);
        }
    }
    tileLayer.redraw();
    tileBackgroundLayer.redraw();

    if (!glEnable)
    {
        // get rid of background if webgl is not enabled
        tileBackgroundLayer.destroy();
        tileBackgroundLayer = 0;
    }
}

function buildLevel()
{
    levelSize = vec2(256);
    levelColor = randColor(new Color(.2,.2,.2), new Color(.8,.8,.8));
    levelGroundColor = levelColor.mutate().add(new Color(.4,.4,.4)).clamp();

    generateLevel();
    initSky();
    initParallaxLayers();
    
    // apply decoration to level tiles
    makeTileLayers();
    const pos = vec2();
    for (pos.x=levelSize.x; pos.x--;)
    for (pos.y=levelSize.y; pos.y-->1;)
    {
        decorateBackgroundTile(pos);
        decorateTile(pos);
    }

    // warm up level
    warmup = 1;
    for (let i=5*frameRate; i--;)
        engineObjectsUpdate();
    warmup = 0;

    // spawn player
    player = new Player(cameraPos = playerStartPos);
}