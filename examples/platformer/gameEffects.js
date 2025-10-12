/*
    LittleJS Platformer Example - Effects
    - Plays different particle effects which can be persistent
    - Destroys terrain and makes explosions
    - Outlines tiles based on neighbor types
    - Generates parallax background layers
    - Draws moving starfield with plants and suns
    - Tracks zzfx sound effects
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameLevel from './gameLevel.js';
const {vec2, hsl, rgb} = LJS;

///////////////////////////////////////////////////////////////////////////////
// sound effects

export const sound_shoot =        new LJS.Sound([,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01]);
export const sound_destroyObject =new LJS.Sound([.5,,1e3,.02,,.2,1,3,.1,,,,,1,-30,.5,,.5]);
export const sound_die =          new LJS.Sound([.5,.4,126,.05,,.2,1,2.09,,-4,,,1,1,1,.4,.03]);
export const sound_jump =         new LJS.Sound([.4,.2,250,.04,,.04,,,1,,,,,3]);
export const sound_dodge =        new LJS.Sound([.4,.2,150,.05,,.05,,,-1,,,,,4,,,,,.02]);
export const sound_walk =         new LJS.Sound([.3,.1,50,.005,,.01,4,,,,,,,,10,,,.5]);
export const sound_explosion =    new LJS.Sound([2,.2,72,.01,.01,.2,4,,,,,,,1,,.5,.1,.5,.02]);
export const sound_grenade =      new LJS.Sound([.5,.01,300,,,.02,3,.22,,,-9,.2,,,,,,.5]);
export const sound_score =        new LJS.Sound([,,783,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);

///////////////////////////////////////////////////////////////////////////////
// special effects

export const persistentParticleDestroyCallback = (particle)=>
{
    // copy particle to tile layer on death
    LJS.ASSERT(!particle.tileInfo, 'quick draw to tile layer uses canvas 2d so must be untextured');
    if (particle.groundObject)
    {
        GameLevel.foregroundTileLayer.drawTile(particle.pos, particle.size, particle.tileInfo, particle.color, particle.angle, particle.mirror);
        // update WebGL texture
        GameLevel.foregroundTileLayer.useWebGL();
    }
}

export function makeBlood(pos, amount) { makeDebris(pos, hsl(0,1,.5), amount, .1, 0); }
export function makeDebris(pos, color = hsl(), amount = 50, size=.2, restitution = .3)
{
    const color2 = color.lerp(hsl(), .5);
    const emitter = new LJS.ParticleEmitter(
        pos, 0, 1, .1, amount/.1, 3.14, // pos, angle, size, time, rate, cone
        0,                     // tileInfo
        color, color2,         // colorStartA, colorStartB
        color, color2,         // colorEndA, colorEndB
        3, size,size, .1, .05, // time, sizeStart, sizeEnd, speed, angleSpeed
        1, .95, .4, 3.14, 0,   // damp, angleDamp, gravity, particleCone, fade
        .5, 1                  // randomness, collide
    );
    emitter.restitution = restitution;
    emitter.particleDestroyCallback = persistentParticleDestroyCallback;
    return emitter;
}

///////////////////////////////////////////////////////////////////////////////

export function explosion(pos, radius=3)
{
    LJS.ASSERT(radius > 0);

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
            GameLevel.decorateTile(pos.add(vec2(x,y)).floor());
    }

    // update WebGL texture
    GameLevel.foregroundTileLayer.useWebGL();

    // kill/push objects
    LJS.engineObjectsCallback(pos, radius*3, (o)=> 
    {
        const damage = radius*2;
        const d = o.pos.distance(pos);
        if (o.isGameObject)
        {
            // do damage
            d < radius && o.damage(damage);
        }

        // push
        const p = LJS.percent(d, 2*radius, radius);
        const force = o.pos.subtract(pos).normalize(p*radius*.2);
        o.applyForce(force);
    });

    // smoke
    new LJS.ParticleEmitter(
        pos, 0,                       // pos, angle
        radius/2, .2, 50*radius, 3.14,// emitSize, emitTime, rate, cone
        0,                            // tileInfo
        hsl(0,0,0), hsl(0,0,0),       // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,0,0),   // colorEndA, colorEndB
        1, .5, 2, .2, .05,    // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.3, 3.14, .1, // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 0, 0, 1e8      // randomness, collide, additive, colorLinear, renderOrder
    );

    // fire
    new LJS.ParticleEmitter(
        pos, 0,                         // pos, angle
        radius/2, .1, 100*radius, 3.14, // emitSize, emitTime, rate, cone
        0,                              // tileInfo
        rgb(1,.5,.1), rgb(1,.1,.1),     // colorStartA, colorStartB
        rgb(1,.5,.1,0), rgb(1,.1,.1,0), // colorEndA, colorEndB
        .7, .8, .2, .2, .05,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.2, 3.14, .05, // damp, angleDamp, gravity, particleCone, fade
        .5, 0, 1, 0, 1e9       // randomness, collide, additive, colorLinear, renderOrder
    );
}

///////////////////////////////////////////////////////////////////////////////

export function destroyTile(pos, makeSound = 1, cleanup = 1)
{
    // pos must be an int
    pos = pos.floor();

    // destroy tile
    const layer = GameLevel.foregroundTileLayer;
    const tileType = layer.getCollisionData(pos);
    if (!tileType)
        return true;

    const centerPos = pos.add(vec2(.5));
    const layerData = layer.getData(pos);
    if (!layerData || tileType == GameLevel.tileType_solid)
        return false;

    // create effects
    makeDebris(centerPos, layerData.color.mutate());
    makeSound && sound_destroyObject.play(centerPos);

    // set and clear tile
    layer.setData(pos, new LJS.TileLayerData, true);
    layer.setCollisionData(pos, GameLevel.tileType_empty);

    // cleanup neighbors and rebuild WebGL
    if (cleanup)
    {
        for (let i=-1;i<=1;++i)
        for (let j=-1;j<=1;++j)
            GameLevel.decorateTile(pos.add(vec2(i,j)));
        layer.useWebGL();
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////
// sky with background gradient, stars, and planets

export class Sky extends LJS.EngineObject
{
    constructor() 
    {
        super();

        this.renderOrder = -1e4;
        this.seed = LJS.randInt(1e9);
        this.skyColor = LJS.randColor(hsl(0,0,.5), hsl(0,0,.9));
        this.horizonColor = this.skyColor.subtract(hsl(0,0,.05,0)).mutate(.3);
    }

    render()
    {
        // fill background with a gradient
        const canvas = LJS.mainCanvas;
        LJS.drawRectGradient(LJS.cameraPos, LJS.getCameraSize(), this.skyColor, this.horizonColor);
        
        // draw stars
        LJS.setBlendMode(true);
        const random = new LJS.RandomGenerator(this.seed);
        for (let i=1e3; i--;)
        {
            const size = random.float(.5,2)**2;
            const speed = random.float() < .9 ? random.float(5) : random.float(9,99);
            const color = hsl(random.float(-.3,.2), random.float(), random.float());
            const extraSpace = 50;
            const w = canvas.width+2*extraSpace, h = canvas.height+2*extraSpace;
            const screenPos = vec2(
                (random.float(w)+LJS.time*speed)%w-extraSpace,
                (random.float(h)+LJS.time*speed*random.float())%h-extraSpace);
            LJS.drawRect(screenPos, vec2(size), color, 0, undefined, true)
        }
        LJS.setBlendMode(false);
    }
}

///////////////////////////////////////////////////////////////////////////////
// parallax background mountain ranges

export class ParallaxLayer extends LJS.CanvasLayer
{
    constructor(pos, topColor, bottomColor, depth) 
    {
        const renderOrder = depth - 3e3;
        const canvasSize = vec2(512, 256);
        super(pos, vec2(), 0, renderOrder, canvasSize);
        this.centerPos = pos;
        this.depth = depth;

        // create a gradient for the mountains
        const w = canvasSize.x, h = canvasSize.y;
        for (let i = h; i--;)
        {
            // draw a 1 pixel gradient line on the left side of the canvas
            const p = i/h;
            this.context.fillStyle = topColor.lerp(bottomColor, p);
            this.context.fillRect(0, i, 1, 1);
        }

        // draw random mountains
        const pointiness = .2;  // how pointy the mountains are
        const levelness = .005; // how much the mountains level out
        const slopeRange = 1;   // max slope of the mountains
        const startGroundLevel = h/2;
        let y = startGroundLevel, groundSlope = LJS.rand(-slopeRange, slopeRange);
        for (let x=w; x--;)
        {
            // pull slope towards start ground level
            y += groundSlope -= (y-startGroundLevel)*levelness;

            // randomly change slope
            if (LJS.rand() < pointiness)
                groundSlope = LJS.rand(-slopeRange, slopeRange);

            // draw 1 pixel wide vertical slice of mountain
            this.context.drawImage(this.canvas, 0, 0, 1, h, x, y, 1, h - y);
        }

        // remove gradient sliver from left side
        this.context.clearRect(0,0,1,h);
    
        // make WebGL texture
        this.useWebGL(LJS.glEnable);
    }

    render()
    {
        const canvasSize = vec2(this.canvas.width, this.canvas.height);
        const depth = this.depth
        const distance = 4 + depth;
        const parallax = vec2(150, 30).scale(depth**2+1);
        const levelCenter = this.centerPos;
        const cameraDeltaFromCenter = LJS.cameraPos.subtract(levelCenter)
            .divide(levelCenter.scale(-1).divide(parallax));
        const scale = distance/LJS.cameraScale;
        const positonOffset = vec2(0, 2-depth);
        const cameraOffset = cameraDeltaFromCenter.scale(1/LJS.cameraScale);
        this.pos = LJS.cameraPos.add(positonOffset).add(cameraOffset);
        this.size = canvasSize.scale(scale);
        super.render();
    }
}