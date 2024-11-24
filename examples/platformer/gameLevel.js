/*
    LittleJS Platformer Example - Level Generator
    - Procedurally generates level geometry
    - Picks colors for the level and background
    - Creates ladders and spawns enemies and crates
*/

'use strict';

const tileType_ladder    = -1;
const tileType_empty     = 0;
const tileType_solid     = 1;
const tileType_breakable = 2;

let player, playerStartPos, tileLayers, foregroundLayerIndex, sky;
let levelSize, levelColor, levelBackgroundColor, levelOutlineColor;

function buildLevel()
{
    // destroy all objects
    engineObjectsDestroy();

    // create the level
    levelColor = randColor(hsl(0,0,.2), hsl(0,0,.8));
    levelBackgroundColor = levelColor.mutate().scale(.4,1);
    levelOutlineColor = levelColor.mutate().add(hsl(0,0,.4)).clamp();
    loadLevel();

    // create sky object with gradient and stars
    sky = new Sky;

    // create parallax layers
    for (let i=3; i--;)
        new ParallaxLayer(i);

    // spawn player
    player = new Player(playerStartPos);
    cameraPos = getCameraTarget();
}

function loadLevel(level=0)
{
    // load level data from an exported Tiled js file
    const tileMapData = TileMaps['gameLevelData'];
    levelSize = vec2(tileMapData.width, tileMapData.height);
    initTileCollision(levelSize);

    // create table for tiles in the level tilemap
    const tileLookup =
    {
        circle: 1,
        ground: 2,
        ladder: 4,
        metal:  5,
        player: 17,
        crate:  18,
        enemy:  19,
        coin:   20,
    }

    // set all level data tiles
    tileLayers = [];
    playerStartPos = vec2(1, levelSize.y);
    const layerCount = tileMapData.layers.length;
    foregroundLayerIndex = layerCount-1;
    for (let layer=layerCount; layer--;)
    {
        const layerData = tileMapData.layers[layer].data;
        const tileLayer = new TileLayer(vec2(), levelSize, tile(0,16,1));
        tileLayer.renderOrder = -1e3+layer;
        tileLayers[layer] = tileLayer;

        for (let x=levelSize.x; x--;) 
        for (let y=levelSize.y; y--;)
        {
            const pos = vec2(x,levelSize.y-1-y);
            const tile = layerData[y*levelSize.x+x];

            if (tile >= tileLookup.player)
            {
                // create object instead of tile
                const objectPos = pos.add(vec2(.5));
                if (tile == tileLookup.player)
                    playerStartPos = objectPos;
                if (tile == tileLookup.crate)
                    new Crate(objectPos);
                if (tile == tileLookup.enemy)
                    new Enemy(objectPos);
                if (tile == tileLookup.coin)
                    new Coin(objectPos);
                continue;
            }
            
            // get tile type for special tiles
            let tileType = tileType_empty;
            if (tile > 0)
                tileType = tileType_breakable;
            if (tile == tileLookup.ladder)
                tileType = tileType_ladder;
            if (tile == tileLookup.metal)
                tileType = tileType_solid;
            if (tileType)
            {
                // set collision for solid tiles
                if (layer == foregroundLayerIndex)
                    setTileCollisionData(pos, tileType);

                // randomize tile appearance
                let direction, mirror, color;
                if (tileType == tileType_breakable)
                {
                    direction = randInt(4);
                    mirror = randInt(2);
                    color = layer ? levelColor : levelBackgroundColor;
                    color = color.mutate(.03);
                }

                // set tile layer data
                const data = new TileLayerData(tile-1, direction, mirror, color);
                tileLayer.setData(pos, data);
            }
        }
        tileLayer.redraw();
    }
    
    // apply decoration to all level tiles
    const pos = vec2();
    for (let layer=layerCount; layer--;)
    for (pos.x=levelSize.x; pos.x--;)
    for (pos.y=levelSize.y; pos.y--;)
        decorateTile(pos, layer);
}

function decorateTile(pos, layer=1)
{
    ASSERT((pos.x|0) == pos.x && (pos.y|0)== pos.y);
    const tileLayer = tileLayers[layer];

    if (layer == foregroundLayerIndex)
    {
        const tileType = getTileCollisionData(pos);
        if (tileType <= 0)
        {
            // force it to clear if it is empty
            tileType || tileLayer.setData(pos, new TileLayerData, 1);
            return;
        }
        if (tileType == tileType_breakable)
        for (let i=4;i--;)
        {
            // outline towards neighbors of differing type
            const neighborTileType = getTileCollisionData(pos.add(vec2().setDirection(i)));
            if (neighborTileType == tileType)
                continue;

            // make pixel perfect outlines
            const size = i&1 ? vec2(2, 16) : vec2(16, 2);
            tileLayer.context.fillStyle = levelOutlineColor.mutate(.1);
            const drawPos = pos.scale(16)
                .add(vec2(i==1?14:0,(i==0?14:0)))
                .subtract((i&1? vec2(0,8-size.y/2) : vec2(8-size.x/2,0)));
            tileLayer.context.fillRect(
                drawPos.x, tileLayer.canvas.height - drawPos.y, size.x, -size.y);
        }
    }
    else
    {
        // make round corners
        for (let i=4; i--;)
        {
            // check corner neighbors
            const neighborTileDataA = tileLayer.getData(pos.add(vec2().setDirection(i))).tile;
            const neighborTileDataB = tileLayer.getData(pos.add(vec2().setDirection((i+1)%4))).tile;
            if (neighborTileDataA > 0 || neighborTileDataB > 0)
                continue;

            const directionVector = vec2().setAngle(i*PI/2+PI/4, 10).floor();
            const drawPos = pos.add(vec2(.5))            // center
                .scale(16).add(directionVector).floor(); // direction offset

            // clear rect without any scaling to prevent blur from filtering
            const s = 2;
            tileLayer.context.clearRect(
                drawPos.x - s/2, tileLayer.canvas.height - drawPos.y - s/2, s, s);
        }
    }
}
