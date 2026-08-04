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
 *     pos, 0, 1, 0, 500, PI,      // pos, angle, emitSize, emitTime, emitRate, emitCone
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
     *  @param {Boolean} [additive]     - Should particles use additive blend
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
        /** @property {Boolean} - Should particles be emitted in a circle */
        this.emitCircle = typeof emitSize === 'number';
        /** @property {Vector2} - World space size of the emitter */
        this.emitSize = this.emitCircle ? vec2(emitSize) : emitSize.copy();
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
        /** @property {Boolean} - Should particles use additive blend */
        this.additive          = additive;
        /** @property {Boolean} - Should it be in local space of emitter */
        this.localSpace        = localSpace;
        /** @property {Number} - If non zero the particle is drawn as a trail, stretched in the direction of velocity */
        this.trailScale        = 0;
        /** @property {Function}   - Callback when particle is destroyed */
        this.particleDestroyCallback = undefined;
        /** @property {Function}   - Callback when particle is created */
        this.particleCreateCallback = undefined;
        /** @property {Number} - Track particle emit time */
        this.emitTimeBuffer    = 0;
        /** @property {Array<Particle>} - Array of particles for this emitter */
        this.particles = [];
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
        else if (!this.particles.length)
            this.destroy();

        // update particles and remove destroyed ones
        this.particles = this.particles.filter(particle=>
            (particle.update(), !particle.destroyed));

        if (debugParticles)
        {
            if (this.emitCircle)
                debugCircle(this.pos, this.emitSize.x/2, '#0f0');
            else
                debugRect(this.pos, this.emitSize, '#0f0', 0, this.angle);
        }
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        let pos = this.emitCircle ?            // check if circle emitter
            randInCircle(this.emitSize.x/2)    // circle emitter
            : vec2(rand(-.5,.5), rand(-.5,.5)) // box emitter
                .multiply(this.emitSize).rotate(this.angle)
        let angle = rand(this.particleConeAngle, -this.particleConeAngle);
        if (!this.localSpace)
        {
            pos = this.pos.add(pos);
            angle += this.angle;
        }

        // randomness scales each parameter by a percentage
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
        const velocity = vec2().setAngle(velocityAngle, speed);
        const particle = new Particle(this, pos, angle, colorStart, colorEnd, particleTime, sizeStart, sizeEnd, velocity, angleSpeed);
        this.particles.push(particle);

        // call particle create callback
        this.particleCreateCallback && this.particleCreateCallback(particle);

        // return the newly created particle
        return particle;
    }

    /** Render all particles for this emitter, called automatically by engine */
    render()
    {
        for (const particle of this.particles)
            particle.render();
    }

    /** Destroy the emitter
     *  @param {Boolean} [immediate] - if not immediate, waits for particles to die off first */
    destroy(immediate=false)
    {
        if (!immediate && this.particles.length)
            this.emitTime = -1; // stop emitting and destroy when particles are gone
        else
            super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Particle Object - Created automatically by Particle Emitters
 * - Lightweight objects updated and rendered by their emitter, not the engine
 */
class Particle
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {ParticleEmitter} emitter - The emitter that created this particle
     * @param {Vector2} pos             - World or local space position
     * @param {Number}  angle           - Angle of the particle
     * @param {Color}   colorStart      - Color at start of life
     * @param {Color}   colorEnd        - Color at end of life
     * @param {Number}  lifeTime        - How long to live for
     * @param {Number}  sizeStart       - Size at start of life
     * @param {Number}  sizeEnd         - Size at end of life
     * @param {Vector2} [velocity]      - Velocity of the particle
     * @param {Number}  [angleVelocity] - Angular speed of the particle
     */
    constructor(emitter, pos, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, velocity=vec2(), angleVelocity=0)
    {
        /** @property {ParticleEmitter} - The emitter that created this particle */
        this.emitter = emitter;
        /** @property {Vector2} - World or local space position */
        this.pos = pos;
        /** @property {Number} - Angle of the particle */
        this.angle = angle;
        /** @property {Vector2} - Size of the particle */
        this.size = vec2(sizeStart);
        /** @property {Color} - Current color of the particle */
        this.color = colorStart;
        /** @property {Color} - Color at start of life */
        this.colorStart = colorStart;
        /** @property {Color} - Color at end of life */
        this.colorEnd = colorEnd;
        /** @property {Number} - How long to live for */
        this.lifeTime = lifeTime;
        /** @property {Number} - Size at start of life */
        this.sizeStart = sizeStart;
        /** @property {Number} - Size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {Vector2} - Velocity of the particle */
        this.velocity = velocity;
        /** @property {Number} - Angular speed of the particle */
        this.angleVelocity = angleVelocity;
        /** @property {Number} - Time the particle was spawned */
        this.spawnTime = time;
        /** @property {Boolean} - Is the particle mirrored horizontally */
        this.mirror = !!randInt(2);
        /** @property {Boolean} - True once the particle has died */
        this.destroyed = false;
        /** @property {TileInfo} - Tile info to render the particle */
        this.tileInfo = emitter.tileInfo;
    }

    /** Update the particle, called automatically by its emitter */
    update()
    {
        // destroy particle when its time runs out
        if (this.lifeTime > 0 && time - this.spawnTime > this.lifeTime)
            return this.destroy();

        // apply physics using the emitter's settings
        const emitter = this.emitter;
        const oldPos = this.pos.copy();
        this.velocity.x *= emitter.damping;
        this.velocity.y *= emitter.damping;
        this.pos.x += this.velocity.x += gravity.x * emitter.gravityScale;
        this.pos.y += this.velocity.y += gravity.y * emitter.gravityScale;
        this.angle += this.angleVelocity *= emitter.angleDamping;

        // don't do collision if disabled
        if (!enablePhysicsSolver || !emitter.collideTiles)
            return;

        // clamp max speed to prevent going through collision
        this.velocity = this.velocity.clampLength(objectMaxSpeed);

        // bounce if it hit a tile and was not already stuck in collision
        if (tileCollisionTest(this.pos) && !tileCollisionTest(oldPos))
        {
            // test which side we bounced off (or both if a corner)
            const isBlockedX = tileCollisionTest(vec2(this.pos.x, oldPos.y));
            const isBlockedY = tileCollisionTest(vec2(oldPos.x, this.pos.y));
            if (isBlockedX)
            {
                // move to previous X position and bounce
                this.pos.x = oldPos.x;
                this.velocity.x *= -emitter.restitution;
                this.velocity.y *= emitter.friction;
            }
            if (isBlockedY || !isBlockedX)
            {
                // move to previous Y position and bounce
                this.pos.y = oldPos.y;
                this.velocity.y *= -emitter.restitution;
                this.velocity.x *= emitter.friction;
            }
        }
    }

    /** Destroy this particle */
    destroy()
    {
        this.color = this.colorEnd.copy();
        this.size = vec2(this.sizeEnd);
        this.destroyed = true;
        const destroyCallback = this.emitter.particleDestroyCallback;
        destroyCallback && destroyCallback(this);
    }

    /** Render the particle, called automatically by its emitter */
    render()
    {
        // modulate size and color
        const emitter = this.emitter;
        const p = this.lifeTime > 0 ? min((time - this.spawnTime) / this.lifeTime, 1) : 1;
        const size = vec2(lerp(this.sizeStart, this.sizeEnd, p));
        const fadeRate = emitter.fadeRate/2;
        const color = this.color = this.colorStart.lerp(this.colorEnd, p);
        color.a *= p < fadeRate ? p/fadeRate : p > 1-fadeRate ? (1-p)/fadeRate : 1; // fade alpha

        // update the position and angle for drawing
        let pos = this.pos, angle = this.angle;
        if (emitter.localSpace)
        {
            // in local space of emitter
            pos = emitter.pos.add(pos.rotate(-emitter.angle));
            angle += emitter.angle;
        }

        // draw the particle
        emitter.additive && setAdditiveBlendMode();
        if (emitter.trailScale)
        {
            // trail style particles
            let velocity = this.velocity;
            if (emitter.localSpace)
                velocity = velocity.rotate(-emitter.angle);
            const speed = velocity.length();
            if (speed)
            {
                // stretch in direction of motion
                const trailLength = speed * emitter.trailScale;
                size.y = max(size.x, trailLength);
                angle = velocity.angle();
                drawTile(pos, size, this.tileInfo, color, angle, this.mirror);
            }
        }
        else
            drawTile(pos, size, this.tileInfo, color, angle, this.mirror);
        emitter.additive && setAdditiveBlendMode(false);
        debugParticles && debugRect(pos, size, '#f005', 0, angle);
    }
}