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
const sound_score =        new Sound([,,783,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);

///////////////////////////////////////////////////////////////////////////////
// special effects

const persistentParticleDestroyCallback = (particle)=>
{
    // copy particle to tile layer on death
    ASSERT(!particle.tileInfo, 'quick draw to tile layer uses canvas 2d so must be untextured');
    if (particle.groundObject)
        tileLayers[foregroundLayerIndex].drawTile(particle.pos, particle.size, particle.tileInfo, particle.color, particle.angle, particle.mirror);
}

function makeBlood(pos, amount) { makeDebris(pos, hsl(0,1,.5), amount, .1, 0); }
function makeDebris(pos, color = hsl(), amount = 50, size=.2, elasticity = .3)
{
    const color2 = color.lerp(hsl(), .5);
    const emitter = new ParticleEmitter(
        pos, 0, 1, .1, amount/.1, PI, // pos, angle, emitSize, emitTime, emitRate, emiteCone
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

    sound_explosion.play(pos);

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
        const damage = radius*2;
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
    });

    // smoke
    new ParticleEmitter(
        pos, 0,                     // pos, angle
        radius/2, .2, 50*radius, PI,// emitSize, emitTime, emitRate, emiteCone
        0,                          // tileInfo
        hsl(0,0,0), hsl(0,0,0),     // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,0,0), // colorEndA, colorEndB
        1, .5, 2, .2, .05,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.3, PI, .1,  // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 0, 0, 1e8     // randomness, collide, additive, colorLinear, renderOrder
    );

    // fire
    new ParticleEmitter(
        pos, 0,                         // pos, angle
        radius/2, .1, 100*radius, PI,   // emitSize, emitTime, emitRate, emiteCone
        0,                              // tileInfo
        rgb(1,.5,.1), rgb(1,.1,.1),     // colorStartA, colorStartB
        rgb(1,.5,.1,0), rgb(1,.1,.1,0), // colorEndA, colorEndB
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
    if (!tileType)
        return true;

    const tileLayer = tileLayers[foregroundLayerIndex];
    const centerPos = pos.add(vec2(.5));
    const layerData = tileLayer.getData(pos);
    if (!layerData || tileType == tileType_solid)
        return false;

    // create effects
    makeDebris(centerPos, layerData.color.mutate());
    makeSound && sound_destroyObject.play(centerPos);

     // set and clear tile
    tileLayer.setData(pos, new TileLayerData, 1);
    setTileCollisionData(pos, tileType_empty);

    // cleanup neighbors
    if (cleanNeighbors)
    {
        for (let i=-1;i<=1;++i)
        for (let j=-1;j<=1;++j)
            decorateTile(pos.add(vec2(i,j)));
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////
// sky with background gradient, stars, and planets

class Sky extends EngineObject
{
    constructor() 
    {
        super();

        this.renderOrder = -1e4;
        this.seed = randInt(1e9);
        this.skyColor = randColor(hsl(0,0,.5), hsl(0,0,.9));
        this.horizonColor = this.skyColor.subtract(hsl(0,0,.05,0)).mutate(.3);
    }

    render()
    {
        // fill background with a gradient
        const gradient = mainContext.createLinearGradient(0, 0, 0, mainCanvas.height);
        gradient.addColorStop(0, this.skyColor);
        gradient.addColorStop(1, this.horizonColor);
        mainContext.save();
        mainContext.fillStyle = gradient;
        mainContext.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        mainContext.globalCompositeOperation = 'lighter';
        
        // draw stars
        const random = new RandomGenerator(this.seed);
        for (let i=1e3; i--;)
        {
            const size = random.float(.5,2)**2;
            const speed = random.float() < .9 ? random.float(5) : random.float(9,99);
            const color = hsl(random.float(-.3,.2), random.float(), random.float());
            const extraSpace = 50;
            const w = mainCanvas.width+2*extraSpace, h = mainCanvas.height+2*extraSpace;
            const screenPos = vec2(
                (random.float(w)+time*speed)%w-extraSpace,
                (random.float(h)+time*speed*random.float())%h-extraSpace);
            mainContext.fillStyle = color;
            mainContext.fillRect(screenPos.x, screenPos.y, size, size);
        }
        mainContext.restore();
    }
}

///////////////////////////////////////////////////////////////////////////////
// parallax background mountain ranges

class ParallaxLayer extends EngineObject
{
    constructor(index) 
    {
        super();

        const size = vec2(1024,512);
        this.size = size;
        this.index = index;
        this.renderOrder = -3e3 + index;
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        this.canvas.width = size.x;
        this.canvas.height = size.y;

        // create a gradient
        const o1 = 40-20*index;
        const o2 = 100-30*index;
        const gradient = this.context.createLinearGradient(0,size.y/2-o1,0,size.y/2+o2);
        const layerColor = levelColor.mutate(.1).lerp(sky.skyColor,1-index*.15);
        gradient.addColorStop(0,layerColor);
        gradient.addColorStop(1,layerColor.mutate(.5).scale(.1,1));
        this.context.fillStyle = gradient;

        // draw procedural mountains ranges
        let groundLevel = size.y/2, groundSlope = rand(-1,1);
        for (let i=size.x; i--;)
            this.context.fillRect(i, groundLevel += groundSlope = rand() < .3 ? rand(1,-1) :
                groundSlope + (size.y/2 - groundLevel)/300, 1, size.y);
    }

    render()
    {
        // position layer based on camera distance from center of level
        const parallax = vec2(1e3,-100).scale(this.index**2);
        const cameraDeltaFromCenter = cameraPos
            .subtract(levelSize.scale(.5))
            .divide(levelSize.divide(parallax));
        const scale = this.size.scale(2+2*this.index);
        const pos = mainCanvasSize.scale(.5)         // center screen
           .add(vec2(-scale.x/2,-scale.y/2))         // center layer 
           .add(cameraDeltaFromCenter.scale(-.5))    // apply parallax
           .add(vec2(0,(this.index*.1)*this.size.y)); // separate layers
        
        // draw the parallax layer onto the main canvas
        mainContext.drawImage(this.canvas, pos.x, pos.y, scale.x, scale.y);
    }
}