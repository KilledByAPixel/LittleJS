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
const sound_walk =         new Sound([.3,.1,50,.005,,.01,4,,,,,,,,10,,,.5]);
const sound_explosion =    new Sound([2,.2,72,.01,.01,.2,4,,,,,,,1,,.5,.1,.5,.02]);
const sound_grenade =      new Sound([.5,.01,300,,,.02,3,.22,,,-9,.2,,,,,,.5]);
const sound_killEnemy =    new Sound([,,783,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);

///////////////////////////////////////////////////////////////////////////////
// special effects

const persistentParticleDestroyCallback = (particle)=>
{
    // copy particle to tile layer on death
    ASSERT(!particle.tileInfo, 'quick draw to tile layer uses canvas 2d so must be untextured');
    if (particle.groundObject)
        tileLayers[foregroundLayerIndex].drawTile(particle.pos, particle.size, particle.tileInfo, particle.color, particle.angle, particle.mirror);
}

function makeBlood(pos, amount) { makeDebris(pos, new Color(1,0,0), 50, .1, 0); }
function makeDebris(pos, color = new Color, amount = 100, size=.2, elasticity = .3)
{
    const color2 = color.lerp(new Color, .5);
    const emitter = new ParticleEmitter(
        pos, 0, 1, .1, 100, PI, // pos, angle, emitSize, emitTime, emitRate, emiteCone
        0,                      // tileInfo
        color, color2,          // colorStartA, colorStartB
        color, color2,          // colorEndA, colorEndB
        3, size,size, .1, .05,  // time, sizeStart, sizeEnd, speed, angleSpeed
        1, .95, .4, PI, 0,      // damp, angleDamp, gravity, particleCone, fade
        .5, 1                   // randomness, collide, additive, colorLinear, renderOrder
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
    const cleanupRadius = radius + 2;
    for (let x = -cleanupRadius; x < cleanupRadius; ++x)
    {
        const h = (cleanupRadius**2 - x**2)**.5;
        for (let y = -h; y < h; ++y)
            decorateTile(pos.add(vec2(x,y)).floor());
    }

    // kill/push objects
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
        pos, 0,                                 // pos, angle
        radius/2, .2, 50*radius, PI,            // emitSize, emitTime, emitRate, emiteCone
        0,                                      // tileInfo
        new Color(0,0,0), new Color(0,0,0),     // colorStartA, colorStartB
        new Color(0,0,0,0), new Color(0,0,0,0), // colorEndA, colorEndB
        1, .5, 2, .2, .05,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.3, PI, .1,  // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 0, 0, 1e8     // randomness, collide, additive, colorLinear, renderOrder
    );

    // fire
    new ParticleEmitter(
        pos, 0,                                 // pos, angle
        radius/2, .1, 100*radius, PI,           // emitSize, emitTime, emitRate, emiteCone
        0,                                      // tileInfo
        new Color(1,.5,.1), new Color(1,.1,.1), // colorStartA, colorStartB
        new Color(1,.5,.1,0), new Color(1,.1,.1,0), // colorEndA, colorEndB
        .7, .8, .2, .2, .05,  // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.2, PI, .05,  // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 1, 0, 1e9      // randomness, collide, additive, colorLinear, renderOrder
    );
}

///////////////////////////////////////////////////////////////////////////////

function destroyTile(pos, makeSound = 1, cleanNeighbors = 1)
{
    // pos must be an int
    pos = pos.floor();

    // destroy tile
    const tileType = getTileCollisionData(pos);

    if (!tileType || tileType == tileType_solid)
        return 1;

    const tileLayer = tileLayers[foregroundLayerIndex];
    const centerPos = pos.add(vec2(.5));
    const layerData = tileLayer.getData(pos);
    if (!layerData)
        return;

    makeDebris(centerPos, layerData.color.mutate());
    makeSound && sound_destroyObject.play(centerPos);

     // set and clear tile
    tileLayer.setData(pos, new TileLayerData, 1);
    setTileCollisionData(pos, tileType_empty);
    setTileData(pos, foregroundLayerIndex, 0);

    // cleanup neighbors
    if (cleanNeighbors)
    {
        for (let i=-1;i<=1;++i)
        for (let j=-1;j<=1;++j)
            decorateTile(pos.add(vec2(i,j)));
    }

    return 1;
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
    const random = new RandomGenerator(skySeed);
    const largeStarCount = 9;
    for (let i = 1e3; i--;)
    {
        let size = random.float(6, 1);
        let speed = random.float() < .9 ? random.float(5) : random.float(99,9);
        let color = (new Color).setHSLA(random.float(.2,-.3), random.float()**9, random.float(1,.5), random.float(.9,.3));
        if (i < largeStarCount)
        {
            // large planets and suns
            size = random.float(9,60);
            speed = random.float(2,4);
            color = (new Color).setHSLA(random.float(), random.float(), random.float(1,.5)).add(skyColor.scale(.5)).clamp();
        }
        
        const extraSpace = 200;
        const w = mainCanvas.width+2*extraSpace, h = mainCanvas.height+2*extraSpace;
        const screenPos = vec2(
            (random.float(w)+time*speed)%w-extraSpace,
            (random.float(h)+time*speed*random.float())%h-extraSpace);

        mainContext.fillStyle = color;
        if (size < 9)
            mainContext.fillRect(screenPos.x, screenPos.y, size, size);
        else
        {
            mainContext.arc(screenPos.x, screenPos.y, size, 0, 9);
            mainContext.fill();
            mainContext.beginPath();
        }
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
        const parallaxSize = vec2(600,300), startGroundLevel = 99+i*30;
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