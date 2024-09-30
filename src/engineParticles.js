/** 
 * LittleJS Particle System
 */

'use strict';

/**
 * Particle Emitter - Spawns particles with the given settings
 * @extends EngineObject
 * @example
 * // create a particle emitter
 * let pos = vec2(2,3);
 * let particleEmitter = new ParticleEmitter
 * (
 *     pos, 0, 1, 0, 500, PI,      // pos, angle, emitSize, emitTime, emitRate, emiteCone
 *     tile(0, 16),                // tileInfo
 *     rgb(1,1,1),   rgb(0,0,0),   // colorStartA, colorStartB
 *     rgb(1,1,1,0), rgb(0,0,0,0), // colorEndA, colorEndB
 *     2, .2, .2, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
 *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
 *     .5, 1                // randomness, collide, additive, randomColorLinear, renderOrder
 * );
 */
class ParticleEmitter extends EngineObject
{
    /** Create a particle system with the given settings
     *  @param {Vector2} position - World space position of the emitter
     *  @param {Number} [angle] - Angle to emit the particles
     *  @param {Number|Vector2}  [emitSize] - World space size of the emitter (float for circle diameter, vec2 for rect)
     *  @param {Number} [emitTime] - How long to stay alive (0 is forever)
     *  @param {Number} [emitRate] - How many particles per second to spawn, does not emit if 0
     *  @param {Number} [emitConeAngle=PI] - Local angle to apply velocity to particles from emitter
     *  @param {TileInfo} [tileInfo] - Tile info to render particles (undefined is untextured)
     *  @param {Color} [colorStartA=(1,1,1,1)] - Color at start of life 1, randomized between start colors
     *  @param {Color} [colorStartB=(1,1,1,1)] - Color at start of life 2, randomized between start colors
     *  @param {Color} [colorEndA=(1,1,1,0)] - Color at end of life 1, randomized between end colors
     *  @param {Color} [colorEndB=(1,1,1,0)] - Color at end of life 2, randomized between end colors
     *  @param {Number} [particleTime]      - How long particles live
     *  @param {Number} [sizeStart]         - How big are particles at start
     *  @param {Number} [sizeEnd]           - How big are particles at end
     *  @param {Number} [speed]             - How fast are particles when spawned
     *  @param {Number} [angleSpeed]        - How fast are particles rotating
     *  @param {Number} [damping]           - How much to dampen particle speed
     *  @param {Number} [angleDamping]      - How much to dampen particle angular speed
     *  @param {Number} [gravityScale]      - How much gravity effect particles
     *  @param {Number} [particleConeAngle] - Cone for start particle angle
     *  @param {Number} [fadeRate]          - How quick to fade particles at start/end in percent of life
     *  @param {Number} [randomness]    - Apply extra randomness percent
     *  @param {Boolean} [collideTiles] - Do particles collide against tiles
     *  @param {Boolean} [additive]     - Should particles use addtive blend
     *  @param {Boolean} [randomColorLinear] - Should color be randomized linearly or across each component
     *  @param {Number} [renderOrder] - Render order for particles (additive is above other stuff by default)
     *  @param {Boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
     */
    constructor
    ( 
        position,
        angle,
        emitSize = 0,
        emitTime = 0,
        emitRate = 100,
        emitConeAngle = PI,
        tileInfo,
        colorStartA = new Color,
        colorStartB = new Color,
        colorEndA = new Color(1,1,1,0),
        colorEndB = new Color(1,1,1,0),
        particleTime = .5,
        sizeStart = .1,
        sizeEnd = 1,
        speed = .1,
        angleSpeed = .05,
        damping = 1,
        angleDamping = 1,
        gravityScale = 0,
        particleConeAngle = PI,
        fadeRate = .1,
        randomness = .2, 
        collideTiles = false,
        additive = false,
        randomColorLinear = true,
        renderOrder = additive ? 1e9 : 0,
        localSpace = false
    )
    {
        super(position, vec2(), tileInfo, angle, undefined, renderOrder);

        // emitter settings
        /** @property {Number|Vector2} - World space size of the emitter (float for circle diameter, vec2 for rect) */
        this.emitSize = emitSize
        /** @property {Number} - How long to stay alive (0 is forever) */
        this.emitTime = emitTime;
        /** @property {Number} - How many particles per second to spawn, does not emit if 0 */
        this.emitRate = emitRate;
        /** @property {Number} - Local angle to apply velocity to particles from emitter */
        this.emitConeAngle = emitConeAngle;

        // color settings
        /** @property {Color} - Color at start of life 1, randomized between start colors */
        this.colorStartA = colorStartA;
        /** @property {Color} - Color at start of life 2, randomized between start colors */
        this.colorStartB = colorStartB;
        /** @property {Color} - Color at end of life 1, randomized between end colors */
        this.colorEndA   = colorEndA;
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        this.colorEndB   = colorEndB;
        /** @property {Boolean} - Should color be randomized linearly or across each component */
        this.randomColorLinear = randomColorLinear;

        // particle settings
        /** @property {Number} - How long particles live */
        this.particleTime      = particleTime;
        /** @property {Number} - How big are particles at start */
        this.sizeStart         = sizeStart;
        /** @property {Number} - How big are particles at end */
        this.sizeEnd           = sizeEnd;
        /** @property {Number} - How fast are particles when spawned */
        this.speed             = speed;
        /** @property {Number} - How fast are particles rotating */
        this.angleSpeed        = angleSpeed;
        /** @property {Number} - How much to dampen particle speed */
        this.damping           = damping;
        /** @property {Number} - How much to dampen particle angular speed */
        this.angleDamping      = angleDamping;
        /** @property {Number} - How much does gravity effect particles */
        this.gravityScale      = gravityScale;
        /** @property {Number} - Cone for start particle angle */
        this.particleConeAngle = particleConeAngle;
        /** @property {Number} - How quick to fade in particles at start/end in percent of life */
        this.fadeRate          = fadeRate;
        /** @property {Number} - Apply extra randomness percent */
        this.randomness        = randomness;
        /** @property {Boolean} - Do particles collide against tiles */
        this.collideTiles      = collideTiles;
        /** @property {Boolean} - Should particles use addtive blend */
        this.additive          = additive;
        /** @property {Boolean} - Should it be in local space of emitter */
        this.localSpace        = localSpace;
        /** @property {Number} - If non zero the partile is drawn as a trail, stretched in the drection of velocity */
        this.trailScale        = 0;
        /** @property {Function}   - Callback when particle is destroyed */
        this.particleDestroyCallback = undefined;
        /** @property {Function}   - Callback when particle is created */
        this.particleCreateCallback = undefined;
        /** @property {Number} - Track particle emit time */
        this.emitTimeBuffer    = 0;
    }
    
    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
        // only do default update to apply parent transforms
        this.parent && super.update();

        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate * particleEmitRateScale)
            {
                const rate = 1/this.emitRate/particleEmitRateScale;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();

        debugParticles && debugRect(this.pos, vec2(this.emitSize), '#0f0', 0, this.angle);
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        let pos = typeof this.emitSize === 'number' ? // check if number was used
            randInCircle(this.emitSize/2)              // circle emitter
            : vec2(rand(-.5,.5), rand(-.5,.5))         // box emitter
                .multiply(this.emitSize).rotate(this.angle)
        let angle = rand(this.particleConeAngle, -this.particleConeAngle);
        if (!this.localSpace)
        {
            pos = this.pos.add(pos);
            angle += this.angle;
        }

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
        const velocityAngle = this.localSpace ? coneAngle : this.angle + coneAngle;
        
        // build particle
        const particle = new Particle(pos, this.tileInfo, angle, colorStart, colorEnd, particleTime, sizeStart, sizeEnd, this.fadeRate, this.additive,  this.trailScale, this.localSpace && this, this.particleDestroyCallback);
        particle.velocity      = vec2().setAngle(velocityAngle, speed);
        particle.angleVelocity = angleSpeed;
        particle.fadeRate      = this.fadeRate;
        particle.damping       = this.damping;
        particle.angleDamping  = this.angleDamping;
        particle.elasticity    = this.elasticity;
        particle.friction      = this.friction;
        particle.gravityScale  = this.gravityScale;
        particle.collideTiles  = this.collideTiles;
        particle.renderOrder   = this.renderOrder;
        particle.mirror        = !!randInt(2);

        // call particle create callaback
        this.particleCreateCallback && this.particleCreateCallback(particle);

        // return the newly created particle
        return particle;
    }

    // Particle emitters are not rendered, only the particles are
    render() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Particle Object - Created automatically by Particle Emitters
 * @extends EngineObject
 */
class Particle extends EngineObject
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {Vector2}  position   - World space position of the particle
     * @param {TileInfo} tileInfo   - Tile info to render particles
     * @param {Number}   angle      - Angle to rotate the particle
     * @param {Color}    colorStart - Color at start of life
     * @param {Color}    colorEnd   - Color at end of life
     * @param {Number}   lifeTime   - How long to live for
     * @param {Number}   sizeStart  - Size at start of life
     * @param {Number}   sizeEnd    - Size at end of life
     * @param {Number}   fadeRate   - How quick to fade in/out
     * @param {Boolean}  additive   - Does it use additive blend mode
     * @param {Number}   trailScale - If a trail, how long to make it
     * @param {ParticleEmitter} [localSpaceEmitter] - Parent emitter if local space
     * @param {Function} [destroyCallback] - Callback when particle dies
     */
    constructor(position, tileInfo, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, fadeRate, additive, trailScale, localSpaceEmitter, destroyCallback
    )
    { 
        super(position, vec2(), tileInfo, angle); 
    
        /** @property {Color} - Color at start of life */
        this.colorStart = colorStart;
        /** @property {Color} - Calculated change in color */
        this.colorEndDelta = colorEnd.subtract(colorStart);
        /** @property {Number} - How long to live for */
        this.lifeTime = lifeTime;
        /** @property {Number} - Size at start of life */
        this.sizeStart = sizeStart;
        /** @property {Number} - Calculated change in size */
        this.sizeEndDelta = sizeEnd - sizeStart;
        /** @property {Number} - How quick to fade in/out */
        this.fadeRate = fadeRate;
        /** @property {Boolean} - Is it additive */
        this.additive = additive;
        /** @property {Number} - If a trail, how long to make it */
        this.trailScale = trailScale;
        /** @property {ParticleEmitter} - Parent emitter if local space */
        this.localSpaceEmitter = localSpaceEmitter;
        /** @property {Function} - Called when particle dies */
        this.destroyCallback = destroyCallback;

        // particles use circular clamped speed
        this.clampSpeedLinear = false;
    }

    /** Render the particle, automatically called each frame, sorted by renderOrder */
    render()
    {
        // modulate size and color
        const p = min((time - this.spawnTime) / this.lifeTime, 1);
        const radius = this.sizeStart + p * this.sizeEndDelta;
        const size = vec2(radius);
        const fadeRate = this.fadeRate/2;
        const color = new Color(
            this.colorStart.r + p * this.colorEndDelta.r,
            this.colorStart.g + p * this.colorEndDelta.g,
            this.colorStart.b + p * this.colorEndDelta.b,
            (this.colorStart.a + p * this.colorEndDelta.a) * 
             (p < fadeRate ? p/fadeRate : p > 1-fadeRate ? (1-p)/fadeRate : 1)); // fade alpha

        // draw the particle
        this.additive && setBlendMode(true);

        let pos = this.pos, angle = this.angle;
        if (this.localSpaceEmitter)
        {
            // in local space of emitter
            pos = this.localSpaceEmitter.pos.add(pos.rotate(-this.localSpaceEmitter.angle)); 
            angle += this.localSpaceEmitter.angle;
        }
        if (this.trailScale)
        {
            // trail style particles
            let velocity = this.velocity;
            if (this.localSpaceEmitter)
                velocity = velocity.rotate(-this.localSpaceEmitter.angle);
            const speed = velocity.length();
            if (speed)
            {
                const direction = velocity.scale(1/speed);
                const trailLength = speed * this.trailScale;
                size.y = max(size.x, trailLength);
                angle = direction.angle();
                drawTile(pos.add(direction.multiply(vec2(0,-trailLength/2))), size, this.tileInfo, color, angle, this.mirror);
            }
        }
        else
            drawTile(pos, size, this.tileInfo, color, angle, this.mirror);
        this.additive && setBlendMode();
        debugParticles && debugRect(pos, size, '#f005', 0, angle);

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