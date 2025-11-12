/*
    LittleJS Platformer Example - Level Generator
    - Procedurally generates level geometry
    - Picks colors for the level and background
    - Creates ladders and spawns enemies and crates
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameObjects from './gameObjects.js';
import * as GameEffects from './gameEffects.js';
import * as Game from './game.js';
const {vec2, hsl, tile} = LJS;

export const tileType_ladder    = -1;
export const tileType_empty     = 0;
export const tileType_solid     = 1;
export const tileType_breakable = 2;

export let playerStartPos, tileLayers, foregroundTileLayer, sky;
export let levelSize, levelColor, levelBackgroundColor, levelOutlineColor;

export function buildLevel()
{
    // destroy all objects
    LJS.engineObjectsDestroy();

    // create the level
    levelColor = LJS.randColor(hsl(0,0,.2), hsl(0,0,.8));
    levelBackgroundColor = levelColor.mutate().scale(.4,1);
    levelOutlineColor = levelColor.mutate().add(hsl(0,0,.4)).clamp();
    loadLevelData();

    // create sky object with gradient background and stars
    sky = new GameEffects.Sky;

    // create parallax layers
    for (let i=3; i--;)
    {
        const pos = levelSize.scale(.5);
        const topColor = levelColor.mutate(.2).lerp(sky.skyColor, .8 - i*.15);
        const bottomColor = levelColor.subtract(LJS.CLEAR_WHITE).mutate(.2);
        new GameEffects.ParallaxLayer(pos, topColor, bottomColor, i );
    }
}

function loadLevelData()
{
    // load the level data
    const tileMapData = Game.gameLevelData;
    tileLayers = LJS.tileLayersLoad(tileMapData, tile(0,16,1), 0, 1);
    levelSize = tileLayers[0].size;
    playerStartPos = vec2(0, levelSize.y); // default player start
    foregroundTileLayer = tileLayers[0];

    // create table for tiles in the level tilemap
    const tileLookup =
    {
        circle: 0,
        ground: 1,
        ladder: 3,
        metal:  4,
        player: 16,
        crate:  17,
        enemy:  18,
        coin:   19,
    }

    for (let i=tileLayers.length; i--;)
    {
        const tileLayer = tileLayers[i];
        const isForeground = i == tileLayers.length - 1;
        if (isForeground)
            foregroundTileLayer = tileLayer;
        else
            tileLayer.isSolid = false;

        for (let x=levelSize.x; x--;) 
        for (let y=levelSize.y; y--;)
        {
            const pos = vec2(x,levelSize.y-1-y);
            const tileData = tileLayer.getData(pos).tile;
            if (tileData >= tileLookup.player)
            {
                // create object instead of tile
                const objectPos = pos.add(vec2(.5));
                if (tileData == tileLookup.player)
                    playerStartPos = objectPos;
                if (tileData == tileLookup.crate)
                    new GameObjects.Crate(objectPos);
                if (tileData == tileLookup.enemy)
                    new GameObjects.Enemy(objectPos);
                if (tileData == tileLookup.coin)
                    new GameObjects.Coin(objectPos);

                // replace with empty tile and empty collision
                tileLayer.clearData(pos);
                tileLayer.clearCollisionData(pos);
                continue;
            }

            // get tile type
            let tileType = tileData? tileType_breakable : tileType_empty;
            if (tileData == tileLookup.ladder)
                tileType = tileType_ladder;
            if (tileData == tileLookup.metal)
                tileType = tileType_solid;
            if (tileType)
            {
                // set collision for solid tiles
                if (tileLayer.isSolid)
                    tileLayer.setCollisionData(pos, tileType);
                if (tileType == tileType_breakable)
                {
                    // randomize tile appearance
                    let direction = LJS.randInt(4);
                    let mirror = LJS.randInt(2);
                    let color = i ? levelColor : levelBackgroundColor;
                    color = color.mutate(.03);

                    // set tile layer data
                    const data = new LJS.TileLayerData(tileData, direction, mirror, color);
                    tileLayer.setData(pos, data);
                }
            }
        }
        
        tileLayer.onRedraw = ()=>
        {
            // apply decoration to level tiles
            for (let x=levelSize.x; x--;)
            for (let y=levelSize.y; y--;)
                decorateTile(vec2(x,y), tileLayer);
        }
        tileLayer.redraw();
    }
}

export function decorateTile(pos, tileLayer)
{
    LJS.ASSERT((pos.x|0) == pos.x && (pos.y|0)== pos.y);
    if (!tileLayer)
        return;

    const w = tileLayer.tileInfo.size.x;
    if (tileLayer == foregroundTileLayer)
    {
        const tileType = tileLayer.getCollisionData(pos);
        if (tileType <= 0)
        {
            // force it to clear if it is empty
            tileType || tileLayer.clearData(pos, true);
            return;
        }
        if (tileType == tileType_breakable)
        for (let i=4;i--;)
        {
            // outline towards neighbors of differing type
            const neighborTileType = tileLayer.getCollisionData(pos.add(vec2().setDirection(i)));
            if (neighborTileType == tileType)
                continue;

            // make pixel perfect outlines
            const size = i&1 ? vec2(2, 16) : vec2(16, 2);
            const drawPos = pos.scale(16)
                .add(vec2(i==1?14:0,(i==0?14:0)))
                .subtract((i&1? vec2(0,8-size.y/2) : vec2(8-size.x/2,0)));
            const color = levelOutlineColor.mutate(.1);
            tileLayer.drawLayerRect(drawPos, size, color);
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
                
            // get direction of corner
            const directionVector = vec2();
            if (i==0) directionVector.set(w-1,w-1);
            if (i==1) directionVector.set(w-1,1);
            if (i==2) directionVector.set(1,1);
            if (i==3) directionVector.set(1,w-1);

            // clear rect from corner
            const s = vec2(2);
            const drawPos = pos.scale(w).add(directionVector).subtract(s.scale(.5));
            tileLayer.clearLayerRect(drawPos, s);
        }
    }
}

export function getCameraTarget()
{
    // camera is above player
    const offset = 100/LJS.cameraScale*LJS.percent(LJS.mainCanvasSize.y, 300, 600);
    return Game.player.pos.add(vec2(0, offset));
}