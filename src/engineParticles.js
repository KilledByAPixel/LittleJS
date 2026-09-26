/**
 * LittleJS Particle System
 * - Fast and flexible particle effects system
 * - ParticleEmitter spawns and manages lightweight Particle objects
 * - Particles support color gradients, fading, rotation, and scaling
 * - Physics simulation with velocity, gravity, and damping
 * - Collision detection with tile layers
 * - Additive blending for glowing effects
 * - Cone-based emission with randomization
 * - Particle design tool available for easy emitter creation
 * @namespace Particles
 */

'use strict';

/**
 *  @callback ParticleCallback - Function that processes a particle
 *  @param {Particle} particle
 *  @memberof Particles
 */

/**
 *  @callback ParticleCollideCallback - Decides whether a particle stops at a tile, it is a filter rather than a notice
 *  @param {Particle} particle
 *  @param {number} tileData
 *  @param {Vector2} pos
 *  @return {boolean} - true to stop the particle there; a callback that returns nothing lets it pass through
 *  @memberof Particles
 */

/**
 * Particle Emitter - Spawns particles with the given settings
 * @extends EngineObject
 * @memberof Particles
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
 *     .99, 1, 1, PI, .05,  // damping, angleDamping, gravityScale, particleCone, fadeRate
 *     .5, 1                // randomness, collide
 * );
 */
class ParticleEmitter extends EngineObject
{
    /** Create a particle system with the given settings
     *  @param {Vector2} pos - World space position of the emitter
     *  @param {number} [angle] - Angle to emit the particles
     *  @param {number|Vector2}  [emitSize] - World space size of the emitter (float for circle diameter, vec2 for rect)
     *  @param {number} [emitTime] - How long to stay alive (0 is forever)
     *  @param {number} [emitRate] - How many particles per second to spawn, does not emit if 0
     *  @param {number} [emitConeAngle=PI] - Half angle of the cone around the emitter's angle that particles move along, PI is every direction
     *  @param {TileInfo} [tileInfo] - Tile info to render particles (undefined is untextured)
     *  @param {Color} [colorStartA=WHITE] - Color at start of life 1, randomized between start colors
     *  @param {Color} [colorStartB=WHITE] - Color at start of life 2, randomized between start colors
     *  @param {Color} [colorEndA=CLEAR_WHITE] - Color at end of life 1, randomized between end colors
     *  @param {Color} [colorEndB=CLEAR_WHITE] - Color at end of life 2, randomized between end colors
     *  @param {number} [particleTime]      - How long particles live
     *  @param {number} [sizeStart]         - How big are particles at start
     *  @param {number} [sizeEnd]           - How big are particles at end
     *  @param {number} [speed]             - How fast are particles when spawned, in world units per frame (at 60fps, so multiply units/sec by 1/60)
     *  @param {number} [angleSpeed]        - How fast are particles rotating, in radians per frame (at 60fps)
     *  @param {number} [damping]           - How much to dampen particle speed, per-frame velocity multiplier (1 = no damping, .9 = lose 10% speed each frame)
     *  @param {number} [angleDamping]      - How much to dampen particle angular speed, per-frame multiplier (1 = no damping)
     *  @param {number} [gravityScale]      - How much gravity effect particles
     *  @param {number} [particleConeAngle] - Half angle each side of the emitter's angle for a particle's start angle, PI is any angle
     *  @param {number} [fadeRate]          - Fraction of life spent fading: half at fade-in (start), half at fade-out (end). e.g. .2 = 10% fade-in, 80% full opacity, 10% fade-out
     *  @param {number} [randomness]    - Apply extra randomness percent
     *  @param {boolean} [collideTiles] - Do particles collide against tiles, world space emitters only
     *  @param {boolean} [additive]     - Should particles use additive blend
     *  @param {boolean} [randomColorLinear] - Should color be randomized linearly or across each component
     *  @param {number} [renderOrder] - Render order for particles (additive is above other stuff by default)
     *  @param {boolean}  [localSpace] - Should it be in local space of emitter (world space is default)
     */
    constructor
    (
        pos,
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
        super(pos, vec2(), tileInfo, angle, undefined, renderOrder);

        // emitter settings
        /** @property {boolean} - Should particles be emitted in a circle */
        this.emitCircle = typeof emitSize === 'number';
        /** @property {Vector2} - World space size of the emitter, x is the diameter when emitCircle is set */
        this.emitSize = typeof emitSize === 'number' ? vec2(emitSize) : emitSize.copy();
        /** @property {number} - How long to stay alive (0 is forever) */
        this.emitTime = emitTime;
        /** @property {number} - How many particles per second to spawn, does not emit if 0 */
        this.emitRate = emitRate;
        /** @property {number} - Half angle of the cone around the emitter's angle that particles move along, PI is every direction */
        this.emitConeAngle = emitConeAngle;

        // color settings
        /** @property {Color} - Color at start of life 1, randomized between start colors */
        this.colorStartA = colorStartA.copy();
        /** @property {Color} - Color at start of life 2, randomized between start colors */
        this.colorStartB = colorStartB.copy();
        /** @property {Color} - Color at end of life 1, randomized between end colors */
        this.colorEndA = colorEndA.copy();
        /** @property {Color} - Color at end of life 2, randomized between end colors */
        this.colorEndB = colorEndB.copy();
        /** @property {boolean} - Should color be randomized linearly or across each component */
        this.randomColorLinear = randomColorLinear;

        // particle settings
        /** @property {number} - How long particles live */
        this.particleTime      = particleTime;
        /** @property {number} - How big are particles at start */
        this.sizeStart         = sizeStart;
        /** @property {number} - How big are particles at end */
        this.sizeEnd           = sizeEnd;
        /** @property {number} - Particle speed when spawned, in world units per frame (at 60fps) */
        this.speed             = speed;
        /** @property {number} - Particle angular speed when spawned, in radians per frame (at 60fps) */
        this.angleSpeed        = angleSpeed;
        /** @property {number} - Per-frame velocity multiplier (1 = no damping, .9 = lose 10% speed each frame) */
        this.damping           = damping;
        /** @property {number} - Per-frame angular velocity multiplier (1 = no damping) */
        this.angleDamping      = angleDamping;
        /** @property {number} - How much gravity affects particles */
        this.gravityScale      = gravityScale;
        /** @property {number} - Half angle each side of the emitter's angle for a particle's start angle, PI is any angle */
        this.particleConeAngle = particleConeAngle;
        /** @property {number} - Fraction of life spent fading, split half at start and half at end (e.g. .2 = 10% fade-in + 10% fade-out) */
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
        /** @property {ParticleCallback|undefined} - Callback when particle is created
         *  @type {ParticleCallback|undefined} */
        this.particleCreateCallback = undefined;
        /** @property {ParticleCallback|undefined} - Callback when particle is destroyed
         *  @type {ParticleCallback|undefined} */
        this.particleDestroyCallback = undefined;
        /** @property {ParticleCollideCallback|undefined} - Callback when particle collides
         *  @type {ParticleCollideCallback|undefined} */
        this.particleCollideCallback = undefined;
        /** @property {number} - Percentage of velocity to pass to particles (0-1) */
        this.velocityInheritance = 0;
        /** @property {number} - Particles owed to the emit rate, starts at one so the first comes out at once */
        this.emitTimeBuffer = 1;
        /** @property {Array<Particle>} - Array of particles for this emitter
         *  @type {Array<Particle>} */
        this.particles = [];

        // track previous position and angle, set on the first update once a parent has placed the emitter
        /** @type {Vector2|undefined} */
        this.previousPos = undefined;
        this.previousAngle = this.angle;
    }

    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1, 'angleDamping must be 0 to 1, the fraction kept each frame');
        ASSERT(this.damping >= 0 && this.damping <= 1, 'damping must be 0 to 1, the fraction of velocity kept each frame');

        if (!this.previousPos)
        {
            // first update, addChild moves an emitter after it is made
            this.previousPos = this.pos.copy();
            this.previousAngle = this.angle;
        }
        if (this.velocityInheritance)
        {
            // pass emitter velocity to particles
            const p = this.velocityInheritance;
            this.velocity.x = p * (this.pos.x - this.previousPos.x);
            this.velocity.y = p * (this.pos.y - this.previousPos.y);
            this.angleVelocity = p * (this.angle - this.previousAngle);
        }
        // tracked even while velocityInheritance is off, so turning it on does not jump
        this.previousAngle = this.angle;
        this.previousPos.x = this.pos.x;
        this.previousPos.y = this.pos.y;

        // update emitter
        if (this.isActive())
        {
            // emit particles
            const rate = this.emitRate * particleEmitRateScale;
            if (rate > 0 && rate < Infinity)
            {
                // counted in particles, so a new rate applies at once
                this.emitTimeBuffer += rate * timeDelta;
                for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                    this.emitParticle();
            }
        }
        else if (this.particles.length === 0)
            this.destroy(true);
            
        // a local space particle is placed relative to the emitter, but the tile collision is in the world
        ASSERT(!this.localSpace || !this.collideTiles, 'local space particles cannot collide with tiles, turn one of them off');

        // update and remove destroyed particles in place to avoid per-frame array allocation
        const particles = this.particles;
        let alive = 0;
        for (let i = 0; i < particles.length; ++i)
        {
            const p = particles[i];
            p.update();
            if (!p.destroyed) particles[alive++] = p;
        }
        particles.length = alive;

        if (debugParticles)
        {
            // show emitter bounds
            if (this.emitCircle)
                debugCircle(this.pos, this.emitSize.x, '#0f0');
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
                .multiply(this.emitSize);
        let angle = rand(this.particleConeAngle, -this.particleConeAngle);
        if (!this.localSpace)
        {
            // into the world: a local space particle is turned with the emitter when it draws instead
            this.emitCircle || (pos = pos.rotate(this.angle));
            pos.x += this.pos.x;
            pos.y += this.pos.y;
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
        const velocity = vec2(speed*sin(velocityAngle), speed*cos(velocityAngle));
        let angleVelocity = angleSpeed;
        if (!this.localSpace && this.velocityInheritance > 0)
        {
            // apply emitter velocity to particle
            velocity.x += this.velocity.x;
            velocity.y += this.velocity.y;
            angleVelocity += this.angleVelocity;
        }
        const particle = new Particle(this, pos, angle, colorStart, colorEnd, particleTime, sizeStart, sizeEnd, velocity, angleVelocity);
        this.particles.push(particle);

        // call particle create callback
        this.particleCreateCallback?.(particle);

        // return the newly created particle
        return particle;
    }

    /** Particle emitters do not have physics */
    updatePhysics() {}

    /** Render all particles for this emitter */
    render()
    {
        // render all particles, the blend switched once for them all, not around each one
        this.additive && setAdditiveBlendMode();
        for (const particle of this.particles)
            particle.render();
        this.additive && setAdditiveBlendMode(false);
    }

    /** is emitter actively spawning */
    isActive() { return !this.emitTime || this.getAliveTime() < this.emitTime; }

    /** Destroy the particle emitter
     *  @param {boolean} [immediate] - true removes attached effects like particle emitters at once, false lets them finish first */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        super.destroy(immediate);
        if (!immediate && this.particles.length > 0)
        {
            // wait for particles to die off
            this.destroyed = false;
            this.emitTime = -1;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// scratch vectors reused by Particle.render and the tile collision to avoid per-frame allocations
const particleDrawPos = new Vector2, particleDrawSize = new Vector2, particleCollidePos = new Vector2;

// tests if a particle collides with tiles at x, y, through its emitter's collide callback if it has one
function particleCollideTest(particle, collideCallback, x, y)
{
    const data = tileCollisionGetData(particleCollidePos.set(x, y));
    if (!collideCallback)
        return data > 0;

    // the callback gets its own vector, made only when there is a tile to decide on
    return !!data && !!collideCallback(particle, data, vec2(x, y));
}

/**
 * Particle Object - Created automatically by Particle Emitters
 * @memberof Particles
 */
class Particle
{
    /**
     * Create a particle with the passed in settings
     * Typically this is created automatically by a ParticleEmitter
     * @param {ParticleEmitter} emitter - The emitter that created this particle
     * @param {Vector2} pos             - World or local space position
     * @param {number}  angle           - Angle of the particle
     * @param {Color}   colorStart      - Color at start of life
     * @param {Color}   colorEnd        - Color at end of life
     * @param {number}  lifeTime        - How long to live for
     * @param {number}  sizeStart       - Size at start of life
     * @param {number}  sizeEnd         - Size at end of life
     * @param {Vector2} [velocity]      - Velocity of the particle
     * @param {number}  [angleVelocity] - Angular speed of the particle
     */
    constructor(emitter, pos, angle, colorStart, colorEnd, lifeTime, sizeStart, sizeEnd, velocity = vec2(), angleVelocity = 0)
    {
        /** @property {ParticleEmitter} - The emitter this particle came from */
        this.emitter = emitter;
        /** @property {Vector2} - Position, world space or local to the emitter when localSpace is set */
        this.pos = pos;
        /** @property {number} - Angle in radians */
        this.angle = angle;
        /** @property {Vector2} - Current size, updated as it renders */
        this.size = vec2(sizeStart);
        /** @property {Color} - Current color, updated as it renders */
        this.color = colorStart.copy();
        /** @property {Color} - Color at start of life */
        this.colorStart = colorStart;
        /** @property {Color} - Color at end of life */
        this.colorEnd = colorEnd;
        /** @property {number} - How long this particle lives for */
        this.lifeTime = lifeTime;
        /** @property {number} - Size at start of life */
        this.sizeStart = sizeStart;
        /** @property {number} - Size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {Vector2} - Velocity in world units per frame (at 60fps) */
        this.velocity = velocity;
        /** @property {number} - Angular speed in radians per frame (at 60fps) */
        this.angleVelocity = angleVelocity;
        /** @property {number} - Engine time it was made at */
        this.spawnTime = time;
        /** @property {boolean} - If true the tile is flipped along the x axis */
        this.mirror = randBool();
        /** @property {EngineObject|undefined} - Tile layer it last landed on, undefined in the air
         *  @type {EngineObject|undefined} */
        this.groundObject = undefined;
        /** @property {boolean} - Has this particle been destroyed */
        this.destroyed = false;
        /** @property {TileInfo|undefined} - The emitter's tile, undefined for an untextured one
         *  @type {TileInfo|undefined} */
        this.tileInfo = emitter.tileInfo;
    }

    /** Update the particle */
    update()
    {
        if (this.destroyed) return; // gone already, destroyed by the game this frame

        // emitter properties
        const emitter = this.emitter;
        const damping = emitter.damping;
        const angleDamping = emitter.angleDamping;
        const restitution = emitter.restitution;
        const friction = emitter.friction;
        const gravityScale = emitter.gravityScale;
        const collideTiles = emitter.collideTiles;
        const collideCallback = emitter.particleCollideCallback;

        // destroy particle when its time runs out
        if (this.lifeTime <= 0 || time - this.spawnTime > this.lifeTime) // no lifetime is gone at once, not never
        {
            this.destroy();
            return;
        }

        // apply physics; only the tile collision needs where the particle was
        const solve = enablePhysicsSolver && collideTiles;
        const oldX = this.pos.x, oldY = this.pos.y;
        let gravityX = gravity.x * gravityScale, gravityY = gravity.y * gravityScale;
        if (emitter.localSpace && emitter.angle)
        {
            // world gravity turned into the emitter's space, the render turns it back
            const c = cos(emitter.angle), s = sin(emitter.angle);
            [gravityX, gravityY] = [gravityX*c - gravityY*s, gravityX*s + gravityY*c];
        }
        this.velocity.x = this.velocity.x * damping + gravityX;
        this.velocity.y = this.velocity.y * damping + gravityY;
        if (solve)
        {
            // apply max circular speed to prevent going through collision, before the move it protects
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }
        this.pos.x += this.velocity.x;
        this.pos.y += this.velocity.y;
        this.angle += this.angleVelocity *= angleDamping;

        // don't do collision if solver disabled
        if (!solve) return;

        // check collision against tiles
        this.groundObject = undefined;
        if (particleCollideTest(this, collideCallback, this.pos.x, this.pos.y))
        {
            // if already was stuck in collision, don't do anything
            const hitLayer = tileCollisionTest(this.pos);
            if (!particleCollideTest(this, collideCallback, oldX, oldY))
            {
                // test which side we bounced off (or both if a corner)
                const isBlockedX = particleCollideTest(this, collideCallback, this.pos.x, oldY);
                const isBlockedY = particleCollideTest(this, collideCallback, oldX, this.pos.y);
                // collide callback may hit where the layer test does not, so hitLayer can be undefined
                const hitRestitution = hitLayer ? max(restitution, hitLayer.restitution) : restitution;
                const hitFriction = hitLayer ? max(friction, hitLayer.friction) : friction;
                if (isBlockedX)
                {
                    // move to previous X position and bounce
                    this.pos.x = oldX;
                    this.velocity.x *= -hitRestitution;
                    this.velocity.y *= hitFriction;
                }
                if (isBlockedY || !isBlockedX)
                {
                    const wasFalling = this.velocity.y < 0 && gravity.y < 0 || this.velocity.y > 0 && gravity.y > 0;
                    if (wasFalling)
                        this.groundObject = hitLayer;

                    // move to previous Y position and bounce
                    this.pos.y = oldY;
                    this.velocity.y *= -hitRestitution;
                    this.velocity.x *= hitFriction;
                }
                debugPhysics && debugRect(this.pos, this.size, '#f00');
            }
        }
    }

    /** Destroy this particle, once: a second call does nothing
     */
    destroy()
    {
        if (this.destroyed) return;
        const destroyCallback = this.emitter.particleDestroyCallback;
        const c = this.colorEnd;
        this.color.set(c.r, c.g, c.b, c.a);
        this.size.set(this.sizeEnd, this.sizeEnd);
        this.destroyed = true;
        destroyCallback?.(this);
    }

    /** Render the particle, automatically called each frame */
    render()
    {
        // emitter properties
        const emitter = this.emitter;
        const localSpace = emitter.localSpace;
        const additive = emitter.additive && !glAdditive; // switched here only for a particle drawn on its own
        const trailScale = emitter.trailScale;
        const fadeRate = emitter.fadeRate / 2;

        // lerp color and size
        const p1 = this.lifeTime > 0 ? min((time - this.spawnTime) / this.lifeTime, 1) : 1, p2 = 1-p1;
        const sizeNow = p2 * this.sizeStart + p1 * this.sizeEnd;
        this.size.set(sizeNow, sizeNow); // kept current for callbacks, drawn from the scratch since a trail stretches it
        const size = particleDrawSize.set(sizeNow, sizeNow);
        const alphaFade = p1 < fadeRate ? p1/fadeRate : 
            p1 > 1-fadeRate ? (1-p1)/fadeRate : 1;
        this.color.r = p2 * this.colorStart.r + p1 * this.colorEnd.r;
        this.color.g = p2 * this.colorStart.g + p1 * this.colorEnd.g;
        this.color.b = p2 * this.colorStart.b + p1 * this.colorEnd.b;
        this.color.a = (p2 * this.colorStart.a + p1 * this.colorEnd.a) * alphaFade;

        // update the position and angle for drawing
        const pos = particleDrawPos.set(this.pos.x, this.pos.y);
        let angle = this.angle;
        if (localSpace)
        {
            // in local space of emitter
            const a = emitter.angle;
            const c = cos(-a), s = sin(-a);
            pos.set(emitter.pos.x + pos.x*c - pos.y*s,
                emitter.pos.y + pos.x*s + pos.y*c);
            angle += a;
        }

        // draw the particle
        additive && setAdditiveBlendMode();
        if (trailScale)
        {
            // trail style particles stretch in the direction of motion, and draw as they are at rest
            const velocity = localSpace ?
                this.velocity.rotate(emitter.angle) : this.velocity;
            const speed = velocity.length();
            if (speed)
            {
                size.y = max(size.x, speed * trailScale);
                angle = atan2(velocity.x, velocity.y);
            }
        }
        drawTile(pos, size, this.tileInfo, this.color, angle, this.mirror);
        additive && setAdditiveBlendMode(false);
        debugParticles && debugRect(pos, size, '#f005', 0, angle);
    }
}