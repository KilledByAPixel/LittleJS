/*
    LittleJS Particle System
    - Spawns particles with randomness from parameters
    - Updates particle physics
    - Fast particle rendering
*/

'use strict';

class ParticleEmitter extends EngineObject
{
    constructor
    ( 
        pos,                            // world space position of emitter
        emitSize = 0,                   // size of emitter (float for circle diameter, vec2 for rect)
        emitTime = 0,                   // how long to stay alive (0 is forever)
        emitRate = 100,                 // how many particles per second to spawn
        emitConeAngle = PI,             // local angle to apply velocity to particles from emitter
        tileIndex = -1,                 // index into tile sheet, if <0 no texture is applied
        tileSize = defaultTileSize,     // tile size for particles
        colorStartA = new Color,        // color at start of life
        colorStartB = new Color,        // randomized between start colors
        colorEndA = new Color(1,1,1,0), // color at end of life
        colorEndB = new Color(1,1,1,0), // randomized between end colors
        particleTime = .5,              // how long particles live
        sizeStart = .1,                 // how big are particles at start
        sizeEnd = 1,                    // how big are particles at end
        speed = .1,                     // how fast are particles when spawned
        angleSpeed = .05,               // how fast are particles rotating
        damping = 1,                    // how much to dampen particle speed
        angleDamping = 1,               // how much to dampen particle angular speed
        gravityScale = 0,               // how much does gravity effect particles
        particleConeAngle = PI,         // cone for start particle angle
        fadeRate = .1,                  // how quick to fade in particles at start/end in percent of life
        randomness = .2,                // apply extra randomness percent
        collideTiles,                   // do particles collide against tiles
        additive,                       // should particles use addtive blend
        randomColorLinear = 1,          // should color be randomized linearly or across each component
        renderOrder = additive ? 1e9 : 0// render order for particles (additive is above other stuff by default)
    )
    {
        super(pos, new Vector2, tileIndex, tileSize);

        // emitter settings
        this.emitSize = emitSize
        this.emitTime = emitTime;
        this.emitRate = emitRate;
        this.emitConeAngle = emitConeAngle;

        // color settings
        this.colorStartA = colorStartA;
        this.colorStartB = colorStartB;
        this.colorEndA   = colorEndA;
        this.colorEndB   = colorEndB;
        this.randomColorLinear = randomColorLinear;

        // particle settings
        this.particleTime      = particleTime;
        this.sizeStart         = sizeStart;
        this.sizeEnd           = sizeEnd;
        this.speed             = speed;
        this.angleSpeed        = angleSpeed;
        this.damping           = damping;
        this.angleDamping      = angleDamping;
        this.gravityScale      = gravityScale;
        this.particleConeAngle = particleConeAngle;
        this.fadeRate          = fadeRate;
        this.randomness        = randomness;
        this.collideTiles      = collideTiles;
        this.additive          = additive;
        this.renderOrder       = renderOrder;
        this.trailScale        =  
        this.emitTimeBuffer    = 0;
    }
    
    update()
    {
        // only do default update to apply parent transforms
        this.parent && super.update();

        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate)
            {
                const rate = 1/this.emitRate;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();

        debugParticles && debugRect(this.pos, vec2(this.emitSize), '#0f0', 0, this.angle);
    }

    emitParticle()
    {
        // spawn a particle
        const pos = this.emitSize.x != undefined ? // check if vec2 was used for size
            (new Vector2(rand(-.5,.5), rand(-.5,.5))).multiply(this.emitSize).rotate(this.angle) // box emitter
            : randInCircle(this.emitSize * .5);                                                  // circle emitter
        const particle = new Particle(this.pos.add(pos), this.tileIndex, this.tileSize, 
            this.angle + rand(this.particleConeAngle, -this.particleConeAngle));

        // randomness scales each paremeter by a percentage
        const randomness = this.randomness;
        const randomizeScale = (v)=> v + v*rand(randomness, -randomness);

        // randomize particle settings
        const particleTime  = randomizeScale(this.particleTime);
        const sizeStart     = randomizeScale(this.sizeStart);
        const sizeEnd       = randomizeScale(this.sizeEnd);
        const speed         = randomizeScale(this.speed);
        const angleSpeed    = randomizeScale(this.angleSpeed) * randSign();
        const coneAngle     = rand(this.emitConeAngle, -this.emitConeAngle);
        const colorStart    = randColor(this.colorStartA, this.colorStartB, this.randomColorLinear);
        const colorEnd      = randColor(this.colorEndA,   this.colorEndB, this.randomColorLinear);

        // build particle settings
        particle.colorStart      = colorStart;
        particle.colorEndDelta   = colorEnd.subtract(colorStart);
        particle.velocity        = (new Vector2).setAngle(this.angle + coneAngle, speed);
        particle.angleVelocity   = angleSpeed;
        particle.lifeTime        = particleTime;
        particle.sizeStart       = sizeStart;
        particle.sizeEndDelta    = sizeEnd - sizeStart;
        particle.fadeRate        = this.fadeRate;
        particle.damping         = this.damping;
        particle.angleDamping    = this.angleDamping;
        particle.elasticity      = this.elasticity;
        particle.friction        = this.friction;
        particle.gravityScale    = this.gravityScale;
        particle.collideTiles    = this.collideTiles;
        particle.additive        = this.additive;
        particle.renderOrder     = this.renderOrder;
        particle.trailScale      = this.trailScale;
        particle.mirror          = rand()<.5;

        // setup callbacks for particles
        particle.destroyCallback = this.particleDestroyCallback;
        this.particleCreateCallback && this.particleCreateCallback(particle);

        // return the newly created particle
        return particle;
    }

    render() {} // emitters are not rendered
}

///////////////////////////////////////////////////////////////////////////////
// particle object

class Particle extends EngineObject
{
    constructor(pos, tileIndex, tileSize, angle) { super(pos, new Vector2, tileIndex, tileSize, angle); }

    render()
    {
        // modulate size and color
        const p = min((time - this.spawnTime) / this.lifeTime, 1);
        const radius = this.sizeStart + p * this.sizeEndDelta;
        const size = new Vector2(radius, radius);
        const fadeRate = this.fadeRate*.5;
        const color = new Color(
            this.colorStart.r + p * this.colorEndDelta.r,
            this.colorStart.g + p * this.colorEndDelta.g,
            this.colorStart.b + p * this.colorEndDelta.b,
            (this.colorStart.a + p * this.colorEndDelta.a) * 
             (p < fadeRate ? p/fadeRate : p > 1-fadeRate ? (1-p)/fadeRate : 1)); // fade alpha

        // draw the particle
        this.additive && setBlendMode(1);
        if (this.trailScale)
        {
            // trail style particles
            const speed = this.velocity.length();
            const direction = this.velocity.scale(1/speed);
            const trailLength = speed * this.trailScale;
            size.y = max(size.x, trailLength);
            this.angle = direction.angle();
            drawTile(this.pos.add(direction.multiply(vec2(0,-trailLength*.5))), size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        }
        else
            drawTile(this.pos, size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        this.additive && setBlendMode();
        debugParticles && debugRect(this.pos, size, '#f005', 0, this.angle);

        if (p == 1)
        {
            // destroy particle when it's time runs out
            this.color = color;
            this.size = size;
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
    }
}