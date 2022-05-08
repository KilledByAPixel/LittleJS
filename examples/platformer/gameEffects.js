/*
    LittleJS Platformer Example - Effects
    - Plays different particle effects which can be persistant
    - Destroys terrain and makes explosions
    - Outlines tiles based on neighbor types
    - Generates parallax background layers
    - Draws moving starfield with plants and suns
    - Tracks zzfx sound effects
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// sound effects

const sound_shoot =        new Sound([,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01]);
const sound_destroyObject =new Sound([.5,,1e3,.02,,.2,1,3,.1,,,,,1,-30,.5,,.5]);
const sound_die =          new Sound([.5,.4,126,.05,,.2,1,2.09,,-4,,,1,1,1,.4,.03]);
const sound_jump =         new Sound([.4,.2,250,.04,,.04,,,1,,,,,3]);
const sound_dodge =        new Sound([.4,.2,150,.05,,.05,,,-1,,,,,4,,,,,.02]);
const sound_walk =         new Sound([.3,.1,70,,,.01,4,,,,-9,.1,,,,,,.5]);
const sound_explosion =    new Sound([2,.2,72,.01,.01,.2,4,,,,,,,1,,.5,.1,.5,.02]);
const sound_grenade =      new Sound([.5,.01,300,,,.02,3,.22,,,-9,.2,,,,,,.5]);
const sound_killEnemy =    new Sound([,,783,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);

///////////////////////////////////////////////////////////////////////////////
// special effects

const persistentParticleDestroyCallback = (particle)=>
{
    // copy particle to tile layer on death
    ASSERT(particle.tileIndex < 0); // quick draw to tile layer uses canvas 2d so must be untextured
    if (particle.groundObject)
        tileLayer.drawTile(particle.pos, particle.size, particle.tileIndex, particle.tileSize, particle.color, particle.angle, particle.mirror);
}

function makeBlood(pos, amount) { makeDebris(pos, new Color(1,0,0), 50, .1, 0); }
function makeDebris(pos, color = new Color, amount = 100, size=.2, elasticity = .3)
{
    const color2 = color.lerp(new Color, .5);
    const emitter = new ParticleEmitter(
        pos, 0, 1, .1, 100, PI, // pos, angle, emitSize, emitTime, emitRate, emiteCone
        undefined, undefined,  // tileIndex, tileSize
        color, color2,         // colorStartA, colorStartB
        color, color2,         // colorEndA, colorEndB
        3, size,size, .1, .05, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
        1, .95, .4, PI, 0,     // damping, angleDamping, gravityScale, particleCone, fadeRate, 
        .5, 1                  // randomness, collide, additive, randomColorLinear, renderOrder
    );
    emitter.elasticity = elasticity;
    emitter.particleDestroyCallback = persistentParticleDestroyCallback;
    return emitter;
}

///////////////////////////////////////////////////////////////////////////////

function explosion(pos, radius=3)
{
    ASSERT(radius > 0);

    const damage = radius*2;

    // destroy level
    for (let x = -radius; x < radius; ++x)
    {
        const h = (radius*radius - x*x)**.5;
        for (let y = -h; y <= h; ++y)
            destroyTile(pos.add(vec2(x,y)), 0, 0);
    }

    // cleanup neighbors
    const cleanupRadius = radius + 1;
    for (let x = -cleanupRadius; x < cleanupRadius; ++x)
    {
        const h = (cleanupRadius**2 - x**2)**.5;
        for (let y = -h; y < h; ++y)
            decorateTile(pos.add(vec2(x,y)).floor());
    }

    // kill/push objects
    const maxRangeSquared = (radius*1.5)**2;
    engineObjectsCallback(pos, radius*3, (o)=> 
    {
        const d = o.pos.distance(pos);
        if (o.isGameObject)
        {
            // do damage
            d < radius && o.damage(damage);
        }

        // push
        const p = percent(d, 2*radius, radius);
        const force = o.pos.subtract(pos).normalize(p*radius*.2);
        o.applyForce(force);
        if (o.isDead && o.isDead())
            o.angleVelocity += randSign()*rand(p*radius/4,.3);
    });

    sound_explosion.play(pos);

    // smoke
    new ParticleEmitter(
        pos, 0, radius/2, .2, 50*radius, PI, // pos, angle, emitSize, emitTime, emitRate, emiteCone
        0, undefined,        // tileIndex, tileSize
        new Color(0,0,0), new Color(0,0,0), // colorStartA, colorStartB
        new Color(0,0,0,0), new Color(0,0,0,0), // colorEndA, colorEndB
        1, .5, 2, .1, .05, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
        .9, 1, -.3, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
        .5, 0, 0, 0, 1e8              // randomness, collide, additive, randomColorLinear, renderOrder
    );

    // fire
    new ParticleEmitter(
        pos, 0, radius/2, .1, 100*radius, PI, // pos, angle, emitSize, emitTime, emitRate, emiteCone
        0, undefined,        // tileIndex, tileSize
        new Color(1,.5,.1), new Color(1,.1,.1), // colorStartA, colorStartB
        new Color(1,.5,.1,0), new Color(1,.1,.1,0), // colorEndA, colorEndB
        .5, .5, 2, .1, .05, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
        .9, 1, 0, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
        .5, 0, 1, 0, 1e9              // randomness, collide, additive, randomColorLinear, renderOrder
    );
}

///////////////////////////////////////////////////////////////////////////////

function destroyTile(pos, makeSound = 1, cleanNeighbors = 1)
{
    // pos must be an int
    pos = pos.floor();

    // destroy tile
    const tileType = getTileCollisionData(pos);

    if (!tileType) return 1;                  // empty

    const centerPos = pos.add(vec2(.5));
    const layerData = tileLayer.getData(pos);
    if (layerData)
    {
        makeDebris(centerPos, layerData.color.mutate());
        makeSound && sound_destroyObject.play(centerPos);

        setTileCollisionData(pos, tileType_empty);
        tileLayer.setData(pos, new TileLayerData, 1); // set and clear tile

        // cleanup neighbors
        if (cleanNeighbors)
        {
            for (let i=-1;i<=1;++i)
            for (let j=-1;j<=1;++j)
                decorateTile(pos.add(vec2(i,j)));
        }
    }

    return 1;
}

function decorateBackgroundTile(pos)
{
    if (!tileBackgroundLayer)
        return;

    const tileData = getTileBackgroundData(pos);
    if (tileData <= 0)
        return;

    // make round corners
    for (let i=4;i--;)
    {
        // check corner neighbors
        const neighborTileDataA = getTileBackgroundData(pos.add(vec2().setAngle(i*PI/2)));
        const neighborTileDataB = getTileBackgroundData(pos.add(vec2().setAngle((i+1)%4*PI/2)));
        if (neighborTileDataA > 0 | neighborTileDataB > 0)
            continue;

        const directionVector = vec2().setAngle(i*PI/2+PI/4, 10).floor();
        const drawPos = pos.add(vec2(.5))          // center
            .scale(16).add(directionVector).floor(); // direction offset

        // clear rect without any scaling to prevent blur from filtering
        const s = 2;
        tileBackgroundLayer.context.clearRect(
            drawPos.x - s/2, tileBackgroundLayer.canvas.height - drawPos.y - s/2, s, s);
    }
}

function decorateTile(pos)
{
    ASSERT((pos.x|0) == pos.x && (pos.y|0)== pos.y);
    const tileData = getTileCollisionData(pos);
    if (tileData <= 0)
    {
        tileData || tileLayer.setData(pos, new TileLayerData, 1); // force it to clear if it is empty
        return;
    }

    for (let i=4;i--;)
    {
        // outline towards neighbors of differing type
        const neighborTileData = getTileCollisionData(pos.add(vec2().setAngle(i*PI/2)));
        if (neighborTileData == tileData)
            continue;

        // make pixel perfect outlines
        const size = i&1 ? vec2(2, 16) : vec2(16, 2);
        tileLayer.context.fillStyle = levelGroundColor.mutate(.1);
        const drawPos = pos.scale(16)
            .add(vec2(i==1?14:0,(i==0?14:0)))
            .subtract((i&1? vec2(0,8-size.y/2) : vec2(8-size.x/2,0)));
        tileLayer.context.fillRect(
            drawPos.x, tileLayer.canvas.height - drawPos.y, size.x, -size.y);
    }
}

///////////////////////////////////////////////////////////////////////////////
// sky with background gradient, stars, and planets

let skySeed, skyColor, horizonColor;

function initSky()
{
    skySeed = rand(1e9);
    skyColor = randColor(new Color(.5,.5,.5), new Color(.9,.9,.9));
    horizonColor = skyColor.subtract(new Color(.05,.05,.05)).mutate(.3).clamp();
}

function drawSky()
{
    // fill background with a gradient
    const gradient = mainContext.fillStyle = mainContext.createLinearGradient(0, 0, 0, mainCanvas.height);
    gradient.addColorStop(0, skyColor);
    gradient.addColorStop(1, horizonColor);
    mainContext.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
}

function drawStars()
{
    // draw stars and planets
    randSeed = skySeed;
    const largeStarCount = 9;
    for (let i = 1e3; i--;)
    {
        let size = randSeeded(6, 1);
        let speed = randSeeded() < .9 ? randSeeded(5) : randSeeded(99,9);
        let color = (new Color).setHSLA(randSeeded(.2,-.3), randSeeded()**9, randSeeded(1,.5), randSeeded(.9,.3));
        if (i < largeStarCount)
        {
            // large planets and suns
            size = randSeeded()**3*99 + 9;
            speed = randSeeded(5);
            color = (new Color).setHSLA(randSeeded(), randSeeded(), randSeeded(1,.5)).add(skyColor.scale(.5)).clamp();
        }
        
        const extraSpace = 200;
        const w = mainCanvas.width+2*extraSpace, h = mainCanvas.height+2*extraSpace;
        const screenPos = vec2(
            (randSeeded(w)+time*speed)%w-extraSpace,
            (randSeeded(h)+time*speed*randSeeded())%h-extraSpace);

        mainContext.fillStyle = color;
        if (size < 9)
            mainContext.fillRect(screenPos.x, screenPos.y, size, size);
        else
            mainContext.beginPath(mainContext.fill(mainContext.arc(screenPos.x, screenPos.y, size, 0, 9)));
    }
}

///////////////////////////////////////////////////////////////////////////////
// parallax background mountain ranges

let tileParallaxLayers;

function initParallaxLayers()
{
    tileParallaxLayers = [];
    for (let i=3; i--;)
    {
        // setup the layer
        const parallaxSize = vec2(600,300), startGroundLevel = rand(99,120)+i*30;
        const tileParallaxLayer = tileParallaxLayers[i] = new TileLayer(vec2(), parallaxSize);
        tileParallaxLayer.renderOrder = -3e3+i;
        tileParallaxLayer.canvas.width = parallaxSize.x;

        // create a gradient
        const layerColor = levelColor.mutate(.2).lerp(skyColor,.95-i*.15);
        const gradient = tileParallaxLayer.context.fillStyle = 
            tileParallaxLayer.context.createLinearGradient(0,0,0,tileParallaxLayer.canvas.height = parallaxSize.y);
        gradient.addColorStop(0,layerColor);
        gradient.addColorStop(1,layerColor.subtract(new Color(1,1,1,0)).mutate(.1).clamp());

        // draw mountains ranges
        let groundLevel = startGroundLevel, groundSlope = rand(-1,1);
        for (let x=parallaxSize.x;x--;)
            tileParallaxLayer.context.fillRect(x,groundLevel += groundSlope = rand() < .05 ? rand(1, -1) :
                groundSlope + (startGroundLevel - groundLevel)/2e3, 1, parallaxSize.y)
    }
}

function updateParallaxLayers()
{
    tileParallaxLayers.forEach((tileParallaxLayer, i)=>
    {
        const distance = 4+i;
        const parallax = vec2(150,30).scale((i*i+1));
        const cameraDeltaFromCenter = cameraPos.subtract(levelSize.scale(.5)).divide(levelSize.scale(-.5).divide(parallax));
        tileParallaxLayer.scale = vec2(distance/cameraScale);
        tileParallaxLayer.pos = cameraPos
            .subtract(tileParallaxLayer.size.multiply(tileParallaxLayer.scale).scale(.5))
            .add(cameraDeltaFromCenter.scale(1/cameraScale))
            .subtract(vec2(0,150/cameraScale))
    });
}