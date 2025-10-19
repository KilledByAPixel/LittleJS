/**
 * LittleJS Particle System
 */

'use strict';

/**
 *  @callback ParticleCallbackFunction - Function that processes a particle
 *  @param {Particle} particle
 *  @memberof Engine
 */

/**
 * Particle Emitter - Spawns particles with the given settings
 * @extends EngineObject
 * @memberof Engine
 * @example
 * // create a particle emitter
 * let pos = vec2(2,3);
 * let particleEmitter = new ParticleEmitter
 * (
 *     pos, 0, 1, 0, 500, PI,      // pos, angle, emitSize, emitTime, emitRate, emitCone
 *     tile(0, 16),                // tileInfo
 *     rgb(1,1,1,1), rgb(0,0,0,1), // colorStartA, colorStartB
 *     rgb(1,1,1,0), rgb(0,0,0,0), // colorEndA, colorEndB
 *     1, .2, .2, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
 *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate,
 *     .5, 1                // randomness, collide, additive, randomColorLinear, renderOrder
 * );
 */
class ParticleEmitter extends EngineObject
{
    /** Create a particle system with the given settings
     *  @param {Vector2} position - World space position of the emitter
     *  @param {number} [angle] - Angle to emit the particles
     *  @param {number|Vector2}  [emitSize] - World space size of the emitter (float for circle diameter, vec2 for rect)
     *  @param {number} [emitTime] - How long to stay alive (0 is forever)
     *  @param {number} [emitRate] - How many particles per second to spawn, does not emit if 0
     *  @param {number} [emitConeAngle=PI] - Local angle to apply velocity to particles from emitter
     *  @param {TileInfo} [tileInfo] - Tile info to render particles (undefined is untextured)
     *  @param {Color} [colorStartA=WHITE] - Color at start of life 1, randomized between start colors
     *  @param {Color} [colorStartB=WHITE] - Color at start of life 2, randomized between start colors
     *  @param {Color} [colorEndA=CLEAR_WHITE] - Color at end of life 1, randomized between end colors
     *  @param {Color} [colorEndB=CLEAR_WHITE] - Color at end of life 2, randomized between end colors
     *  @param {number} [particleTime]      - How long particles live
     *  @param {number} [sizeStart]         - How big are particles at start
     *  @param {number} [sizeEnd]           - How big are particles at end
     *  @param {number} [speed]             - How fast are particles when spawned
     *  @param {number} [angleSpeed]        - How fast are particles rotating
     *  @param {number} [damping]           - How much to dampen particle speed
     *  @param {number} [angleDamping]      - How much to dampen particle angular speed
     *  @param {number} [gravityScale]      - How much gravity effect particles
     *  @param {number} [particleConeAngle] - Cone for start particle angle
     *  @param {number} [fadeRate]          - How quick to fade particles at start/end in percent of life
     *  @param {number} [randomness]    - Apply extra randomness percent
     *  @param {boolean} [collideTiles] - Do particles collide against tiles
     *  @param {boolean} [additive]     - Should particles use additive blend
     *  @param {boolean} [randomColorLinear] - Should color be randomized linearly or across each component
     *  @param {number} [renderOrder] - Render order for particles (additive is above other stuff by default)
     *  @param {boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
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
        colorStartA = WHITE,
        colorStartB = WHITE,
        colorEndA = CLEAR_WHITE,
        colorEndB = CLEAR_WHITE,
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
        /** @property {number|Vector2} - World space size of the emitter (float for circle diameter, vec2 for rect) */
        this.emitSize = emitSize instanceof Vector2 ? 
            emitSize.copy() : emitSize;
        /** @property {number} - How long to stay alive (0 is forever) */
        this.emitTime = emitTime;
        /** @property {number} - How many particles per second to spawn, does not emit if 0 */
        this.emitRate = emitRate;
        /** @property {number} - Local angle to apply velocity to particles from emitter */
        this.emitConeAngle = emitConeAngle;

        // color settings
        /** @property {Color} - Color at start of life 1, randomized between start colors */
        this.colorStartA = colorStartA.copy();
        /** @property {Color} - Color at start of life 2, randomized between start colors */
        this.colorStartB = colorStartB.copy();
        /** @property {Color} - Color at end of life 1, randomized between end colors */
        this.colorEndA   = colorEndA.copy();
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        this.colorEndB   = colorEndB.copy();
        /** @property {boolean} - Should color be randomized linearly or across each component */
        this.randomColorLinear = randomColorLinear;

        // particle settings
        /** @property {number} - How long particles live */
        this.particleTime      = particleTime;
        /** @property {number} - How big are particles at start */
        this.sizeStart         = sizeStart;
        /** @property {number} - How big are particles at end */
        this.sizeEnd           = sizeEnd;
        /** @property {number} - How fast are particles when spawned */
        this.speed             = speed;
        /** @property {number} - How fast are particles rotating */
        this.angleSpeed        = angleSpeed;
        /** @property {number} - How much to dampen particle speed */
        this.damping           = damping;
        /** @property {number} - How much to dampen particle angular speed */
        this.angleDamping      = angleDamping;
        /** @property {number} - How much gravity affects particles */
        this.gravityScale      = gravityScale;
        /** @property {number} - Cone for start particle angle */
        this.particleConeAngle = particleConeAngle;
        /** @property {number} - How quick to fade in particles at start/end in percent of life */
        this.fadeRate          = fadeRate;
        /** @property {number} - Apply extra randomness percent */
        this.randomness        = randomness;
        /** @property {boolean} - Do particles collide against tiles */
        this.collideTiles      = collideTiles;
        /** @property {boolean} - Should particles use additive blend */
        this.additive          = additive;
        /** @property {boolean} - Should it be in local space of emitter */
        this.localSpace        = localSpace;
        /** @property {number} - If non zero the particle is drawn as a trail, stretched in the direction of velocity */
        this.trailScale        = 0;
        /** @property {ParticleCallbackFunction} - Callback when particle is destroyed */
        this.particleDestroyCallback = undefined;
        /** @property {ParticleCallbackFunction} - Callback when particle is created */
        this.particleCreateCallback = undefined;
        /** @property {number} - Track particle emit time */
        this.emitTimeBuffer    = 0;
        /** @property {number} - Percentage of velocity to pass to particles (0-1) */
        this.velocityInheritance = 0;

        // track previous position and angle
        this.previousAngle = this.angle;
        this.previousPos = this.pos.copy();
    }

    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
        // only do default update to apply parent transforms
        this.parent && super.update();

        if (this.velocityInheritance)
        {
            // pass emitter velocity to particles
            const p = this.velocityInheritance;
            this.velocity.x = p * (this.pos.x - this.previousPos.x);
            this.velocity.y = p * (this.pos.y - this.previousPos.y);
            this.angleVelocity = p * (this.angle - this.previousAngle);
            this.previousAngle = this.angle;
            this.previousPos.x = this.pos.x;
            this.previousPos.y = this.pos.y;
        }

        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate && particleEmitRateScale)
            {
                const rate = 1/this.emitRate/particleEmitRateScale;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();

        if (debugParticles)
        {
            // show emitter bounds
            const emitSize = typeof this.emitSize === 'number' ? vec2(this.emitSize) : this.emitSize;
            debugRect(this.pos, emitSize, '#0f0', 0, this.angle);
        }
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        let pos = typeof this.emitSize === 'number' ? // check if number was used
            randInCircle(this.emitSize/2)            // circle emitter
            : vec2(rand(-.5,.5), rand(-.5,.5))       // box emitter
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
        const particle = new Particle(pos, this.tileInfo, angle, colorStart, colorEnd, particleTime, sizeStart, sizeEnd, this.fadeRate, this.additive,  this.trailScale, this.localSpace && this, this.particleDestroyCallback);
        particle.velocity      = vec2().setAngle(velocityAngle, speed);
        particle.angleVelocity = angleSpeed;
        if (!this.localSpace && this.velocityInheritance > 0)
        {
            // apply emitter velocity to particle
            particle.velocity.x += this.velocity.x;
            particle.velocity.y += this.velocity.y;
            particle.angleVelocity += this.angleVelocity;
        }
        particle.fadeRate      = this.fadeRate;
        particle.damping       = this.damping;
        particle.angleDamping  = this.angleDamping;
        particle.restitution   = this.restitution;
        particle.friction      = this.friction;
        particle.gravityScale  = this.gravityScale;
        particle.collideTiles  = this.collideTiles;
        particle.renderOrder   = this.renderOrder;
        particle.mirror        = randBool();

        // call particle create callback
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
 * @memberof Engine
 */
class Particle extends EngineObject
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {Vector2}  position   - World space position of the particle
     * @param {TileInfo} tileInfo   - Tile info to render particles
     * @param {number}   angle      - Angle to rotate the particle
     * @param {Color}    colorStart - Color at start of life
     * @param {Color}    colorEnd   - Color at end of life
     * @param {number}   lifeTime   - How long to live for
     * @param {number}   sizeStart  - Size at start of life
     * @param {number}   sizeEnd    - Size at end of life
     * @param {number}   fadeRate   - How quick to fade in/out
     * @param {boolean}  additive   - Does it use additive blend mode
     * @param {number}   trailScale - If a trail, how long to make it
     * @param {ParticleEmitter} [localSpaceEmitter] - Parent emitter if local space
     * @param {ParticleCallbackFunction} [destroyCallback] - Callback when particle dies
     */
    constructor(position, tileInfo, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, fadeRate, additive, trailScale, localSpaceEmitter, destroyCallback
    )
    {
        super(position, vec2(), tileInfo, angle);

        /** @property {Color} - Color at start of life */
        this.colorStart = colorStart;
        /** @property {Color} - Color at end of life */
        this.colorEnd = colorEnd;
        /** @property {number} - How long to live for */
        this.lifeTime = lifeTime;
        /** @property {number} - Size at start of life */
        this.sizeStart = sizeStart;
        /** @property {number} - Size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {number} - How quick to fade in/out */
        this.fadeRate = fadeRate;
        /** @property {boolean} - Is it additive */
        this.additive = additive;
        /** @property {number} - If a trail, how long to make it */
        this.trailScale = trailScale;
        /** @property {ParticleEmitter} - Parent emitter if local space */
        this.localSpaceEmitter = localSpaceEmitter;
        /** @property {ParticleCallbackFunction} - Called when particle dies */
        this.destroyCallback = destroyCallback;
        // particles do not clamp speed by default
        this.clampSpeed = false;
    }

    /** Update the object physics, called automatically by engine once each frame */
    update()
    {
        super.update();

        if (this.collideTiles || this.collideSolidObjects)
        {
            // only apply max circular speed if particle can collide
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }

        if (this.lifeTime > 0 && time - this.spawnTime > this.lifeTime)
        {
            // destroy particle when its time runs out
            const c = this.colorEnd;
            this.color.set(c.r, c.g, c.b, c.a);
            this.size.set(this.sizeEnd, this.sizeEnd);
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
    }

    /** Render the particle, automatically called each frame, sorted by renderOrder */
    render()
    {
        // lerp color and size
        const p1 = this.lifeTime > 0 ? min((time - this.spawnTime) / this.lifeTime, 1) : 1, p2 = 1-p1;
        const radius = p2 * this.sizeStart + p1 * this.sizeEnd;
        const size = vec2(radius);
        this.color.r = p2 * this.colorStart.r + p1 * this.colorEnd.r;
        this.color.g = p2 * this.colorStart.g + p1 * this.colorEnd.g;
        this.color.b = p2 * this.colorStart.b + p1 * this.colorEnd.b;
        this.color.a = p2 * this.colorStart.a + p1 * this.colorEnd.a;
            
        // fade alpha
        const fadeRate = this.fadeRate/2;
        this.color.a *= p1 < fadeRate ? p1/fadeRate : 
            p1 > 1-fadeRate ? (1-p1)/fadeRate : 1;

        // draw the particle
        this.additive && setBlendMode(true);

        // update the position and angle for drawing
        let pos = this.pos, angle = this.angle;
        if (this.localSpaceEmitter)
        {
            // in local space of emitter
            const a = this.localSpaceEmitter.angle;
            const c = cos(a), s = sin(a);
            pos = this.localSpaceEmitter.pos.add(
                new Vector2(pos.x*c - pos.y*s, pos.x*s + pos.y*c));
            angle += this.localSpaceEmitter.angle;
        }
        if (this.trailScale)
        {
            // trail style particles
            const direction = this.localSpaceEmitter ? 
                this.velocity.rotate(-this.localSpaceEmitter.angle) :
                this.velocity;
            const speed = direction.length();
            if (speed)
            {
                // stretch in direction of motion
                const trailLength = speed * this.trailScale;
                size.y = max(size.x, trailLength);
                angle = atan2(direction.x, direction.y);
                drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
            }
        }
        else
            drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
        this.additive && setBlendMode();
        debugParticles && debugRect(pos, size, '#f005', 0, angle);
    }
}