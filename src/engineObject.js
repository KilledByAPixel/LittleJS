/**
 * LittleJS Object System
 * - EngineObject is the base class for all game objects
 * - Handles automatic updating, rendering, physics, and collision
 * - Supports parent-child hierarchies with transform inheritance
 * - 2D physics with velocity, acceleration, damping, and gravity
 * - Collision system with tiles and other objects
 * - Renders sprites from tile sheets with color and rotation
 * - Objects sorted by renderOrder for layered rendering
 */

'use strict';

/**
 * LittleJS Object Base Object Class
 * - Top level object class used by the engine
 * - Automatically adds self to object list
 * - Will be updated and rendered each frame
 * - Renders as a sprite from a tilesheet by default
 * - Can have color and additive color applied
 * - 2D Physics and collision system
 * - Sorted by renderOrder
 * - Objects can have children attached
 * - Parents are updated before children, and set child transform
 * - Call destroy() to get rid of objects
 *
 * The physics system used by objects is simple and fast with some caveats...
 * - Collision uses the axis aligned size, the object's rotation angle is only for rendering
 * - Objects are guaranteed to not intersect tile collision from physics
 * - If an object starts or is moved inside tile collision, it will not collide with that tile
 * - Collision for objects can be set to be solid to block other objects
 * - Objects may get pushed into overlapping other solid objects, if so they will push away
 * - A static solid (mass 0) moved by its velocity, like a door or an elevator, pushes objects out of its way
 * - Solid objects are more performance intensive and should be used sparingly
 * @memberof Engine
 * @example
 * // create an engine object, normally you would first extend the class with your own
 * const pos = vec2(2,3);
 * const object = new EngineObject(pos);
 */
class EngineObject
{
    /** Create an engine object and adds it to the list of objects
     *  @param {Vector2}  [pos=vec2()] - World space position of the object
     *  @param {Vector2}  [size=vec2(1)] - World space size of the object
     *  @param {TileInfo} [tileInfo] - Tile info to render object (undefined is untextured)
     *  @param {number}   [angle] - Angle the object is rotated by
     *  @param {Color}    [color=WHITE] - Color to apply to tile when rendered
     *  @param {number}   [renderOrder] - Objects sorted by renderOrder before being rendered
     */
    constructor(pos=vec2(), size=vec2(1), tileInfo, angle=0, color=WHITE, renderOrder=0)
    {
        // check passed in params
        ASSERT(isVector2(pos), 'object pos must be a vec2');
        ASSERT(isVector2(size), 'object size must be a vec2');
        ASSERT(!tileInfo || tileInfo instanceof TileInfo, 'object tileInfo should be a TileInfo or undefined');
        ASSERT(typeof angle === 'number' && isFinite(angle), 'object angle should be a number');
        ASSERT(isColor(color), 'object color should be a valid rgba color');
        ASSERT(typeof renderOrder === 'number', 'object renderOrder should be a number');

        /** @property {Vector2} - World space position of the object */
        this.pos = pos.copy();
        /** @property {Vector2} - World space width and height of the object */
        this.size = size.copy();
        /** @property {Vector2|undefined} - Size of object used for drawing, uses size if not set
         *  @type {Vector2|undefined} */
        this.drawSize = undefined;
        /** @property {TileInfo|undefined} - Tile info to render object (undefined is untextured)
         *  @type {TileInfo|undefined} */
        this.tileInfo = tileInfo;
        /** @property {number} - Angle to rotate the object */
        this.angle = angle;
        /** @property {Color} - Color to apply when rendered */
        this.color = color.copy();
        /** @property {Color|undefined} - Additive color to apply when rendered
         *  @type {Color|undefined} */
        this.additiveColor = undefined;
        /** @property {Shader|undefined} - Custom shader to render with, undefined for the engine's own
         *  @type {Shader|undefined} */
        this.shader = undefined;
        /** @property {boolean} - Should the rendered tile flip along the y axis. Affects rendering and the local→world transform of attached children (a mirrored parent flips its children's localPos.x and localAngle). Does not affect this object's own physics, collision, or localToWorld/worldToLocal. */
        this.mirror = false;
        /** @property {boolean} - Has object been destroyed? */
        this.destroyed = false;
        this.updatePass = 0; // the engine update pass it was last updated in, so nothing updates twice in one

        // physical properties
        /** @property {number} - How heavy the object is, static if 0 */
        this.mass = objectDefaultMass;
        /** @property {number} - Fraction of velocity kept each frame, 1 keeps all of it, 0 stops at once */
        this.damping = objectDefaultDamping;
        /** @property {number} - Fraction of angular velocity kept each frame, 1 keeps all of it, 0 stops at once */
        this.angleDamping = objectDefaultAngleDamping;
        /** @property {number} - How bouncy the object is when colliding (0-1) */
        this.restitution = objectDefaultRestitution;
        /** @property {number} - Fraction of sliding speed kept each frame on the ground, 1 is no friction, 0 stops at
         *  once, the more slippery of the object and its ground is used */
        this.friction  = objectDefaultFriction;
        /** @property {number} - How much to scale gravity by for this object */
        this.gravityScale = 1;
        /** @property {number} - Objects are sorted by render order */
        this.renderOrder = renderOrder;
        /** @property {Vector2} - Velocity of the object, in world units per frame */
        this.velocity = vec2();
        /** @property {number} - Angular velocity of the object, in radians per frame */
        this.angleVelocity = 0;
        /** @property {number} - Track when object was created  */
        this.spawnTime = time;
        /** @property {Array<EngineObject>} - List of children of this object
         *  @type {Array<EngineObject>} */
        this.children = [];
        /** @property {boolean} - Limit object speed along x and y axis */
        this.clampSpeed = true;
        /** @property {EngineObject|undefined} - Object we are standing on, if any
         *  @type {EngineObject|undefined} */
        this.groundObject = undefined;

        // parent child system
        /** @property {EngineObject|undefined} - Parent of object if in local space
         *  @type {EngineObject|undefined} */
        this.parent = undefined;
        /** @property {Vector2|undefined} - Position relative to the parent, only while attached to one
         *  @type {Vector2|undefined} */
        this.localPos = undefined;
        /** @property {number} - Local angle if child  */
        this.localAngle = 0;

        // collision flags
        /** @property {boolean} - Object collides with the tile collision */
        this.collideTiles = false;
        /** @property {boolean} - Object collides with solid objects */
        this.collideSolidObjects = false;
        /** @property {boolean} - Object collides with and blocks other objects */
        this.isSolid = false;
        /** @property {boolean} - Object collides with raycasts */
        this.collideRaycast = false;

        /** @property {boolean} - Object is skipped by engineObjectsDestroy, for things that outlive a level like a camera
         *  - Calling destroy on it still destroys it, and its children go with it either way */
        this.persistent = false;

        // add to list of objects
        engineObjects.push(this);
    }

    /** Update the object transform, called automatically by engine even when paused
     *  @param {boolean} [updateChildren] - Also update the children's transforms */
    updateTransforms(updateChildren=true)
    {
        const parent = this.parent;
        if (parent)
        {
            // compose with parent transform inline to avoid intermediate vector allocs
            const mirror = parent.getMirrorSign();
            const lp = this.localPos, pp = parent.pos;
            const lx = lp.x*mirror, ly = lp.y, pa = parent.angle;
            if (pa)
            {
                const c = cos(-pa), s = sin(-pa);
                this.pos.set(lx*c - ly*s + pp.x, lx*s + ly*c + pp.y);
            }
            else
                this.pos.set(lx + pp.x, ly + pp.y);
            this.angle = mirror*this.localAngle + pa;
        }

        // update children
        if (updateChildren)
            for (const child of this.children)
                child.updateTransforms();
    }

    /** Update the object physics, called automatically by engine once each frame. Can be overridden to stop or change how physics works for an object. */
    updatePhysics()
    {
        // child objects do not have physics
        ASSERT(!this.parent);

        // bail if a collision callback destroyed us mid-frame
        if (this.destroyed) return;

        if (this.clampSpeed)
        {
            // limit max speed to prevent missing collisions
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1, 'angleDamping must be 0 to 1, the fraction kept each frame');
        ASSERT(this.damping >= 0 && this.damping <= 1, 'damping must be 0 to 1, the fraction of velocity kept each frame');

        // apply physics; only the solver needs where the object was, so only then is it copied
        const solve = enablePhysicsSolver && this.mass;
        const oldPos = solve ? this.pos.copy() : undefined;
        this.velocity.x *= this.damping;
        this.velocity.y *= this.damping;
        if (this.mass)
        {
            // apply gravity only if it has mass
            this.velocity.x += gravity.x * this.gravityScale;
            this.velocity.y += gravity.y * this.gravityScale;
        }
        this.pos.x += this.velocity.x;
        this.pos.y += this.velocity.y;
        this.angle += this.angleVelocity *= this.angleDamping;

        // don't do collision for static objects or if solver disabled
        if (!solve) return;

        // which way is down for this object, a negative gravityScale falls up and lands on ceilings
        const gravityY = this.gravityScale < 0 ? -gravity.y : gravity.y;
        const wasFalling = this.velocity.y < 0 && gravityY < 0 || this.velocity.y > 0 && gravityY > 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const friction = max(this.friction, this.groundObject.friction);
            const groundSpeed = this.groundObject.velocity.x;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * friction;
            this.groundObject = undefined;
        }

        // an object with no width or height has no box to push out of, or to be pushed out of
        if (this.collideSolidObjects && this.size.x && this.size.y)
        {
            // check collisions against solid objects
            const epsilon = .001; // necessary to push slightly outside of the collision
            for (const o of engineObjectsCollideStaticLast)
            {
                // skip destroyed, child objects, self collision, or objects with no box
                if (o.destroyed || o.parent || o === this || !o.size.x || !o.size.y) continue;

                // non solid objects don't collide with each other
                if (!this.isSolid && !o.isSolid) continue;

                // check collision
                if (!this.isOverlappingObject(o)) continue;

                // each moving object checks its own contacts, so a pair the other one already asked about this frame
                // and left overlapping, ignored or only nudged apart, is not asked twice
                if (engineObjectsCollidePairAsked(o, this)) continue;

                // notify objects of collision and check if should be resolved
                const collide1 = this.collideWithObject(o);
                const collide2 = o.collideWithObject(this);
                if (!collide1 || !collide2)
                {
                    engineObjectsCollidePairAdd(this, o);
                    continue;
                }

                if (isOverlapping(oldPos, this.size, o.pos, o.size) && (!o.mass || o.groundObject))
                {
                    // a static solid that moved into it, like a door or an elevator, pushes it out the shortest way
                    // at once and carries it along, it would only drift out slowly and the solid would pass through;
                    // an object standing on something counts as fixed too, so a stack on an elevator rides together;
                    // it bounces off relative to the mover, a paddle moved by setting pos bounces a ball as a wall does
                    const push = collideBoxBox(this.pos, this.size, o.pos, o.size);
                    if (push)
                    {
                        this.pos.x += push.x + sign(push.x) * epsilon;
                        this.pos.y += push.y + sign(push.y) * epsilon;
                        const restitution = max(this.restitution, o.restitution);
                        if (push.x)
                        {
                            const v = this.velocity.x - o.velocity.x;
                            if (v * push.x < 0) // moving into it
                                this.velocity.x = o.velocity.x - v * restitution;
                        }
                        else
                        {
                            const v = this.velocity.y - o.velocity.y;
                            if (v * push.y < 0) // moving into it
                                this.velocity.y = o.velocity.y - v * restitution;
                            if (push.y * gravityY < 0) // pushed up against gravity, it stands on it
                                this.groundObject = o;
                        }
                    }
                    engineObjectsCollidePairAdd(this, o);

                    debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }
                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001;
                    const velocity = length < .001 ? vec2(0, pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away other object if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                    engineObjectsCollidePairAdd(this, o);

                    debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sizeBoth = this.size.add(o.size);
                // prefer to push up if small delta, up away from this object's own gravity
                const smallStepUp = (gravityY > 0 ? o.pos.y - oldPos.y : oldPos.y - o.pos.y)*2 > sizeBoth.y - abs(gravityY);
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sizeBoth.y;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sizeBoth.x;
                const restitution = max(this.restitution, o.restitution);

                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sizeBoth.y/2 + epsilon) * sign(oldPos.y - o.pos.y);
                    if ((o.groundObject && wasFalling) || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasFalling)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded, relative to it so a rider keeps up with a
                        // platform moving down instead of landing on it again every few frames
                        this.velocity.y = o.velocity.y - (this.velocity.y - o.velocity.y) * restitution;
                    }
                    else if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.y + o.mass * o.velocity.y) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.y * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.y * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.y * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.y * 2 * this.mass / (this.mass + o.mass);

                        // lerp between elastic or inelastic based on restitution
                        this.velocity.y = lerp(inelastic, elastic0, restitution);
                        o.velocity.y = lerp(inelastic, elastic1, restitution);
                    }
                }
                if (!smallStepUp && isBlockedX) // resolve x collision
                {
                    // push outside collision
                    this.pos.x = o.pos.x + (sizeBoth.x/2 + epsilon) * sign(oldPos.x - o.pos.x);
                    if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.x + o.mass * o.velocity.x) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.x * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.x * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.x * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.x * 2 * this.mass / (this.mass + o.mass);

                        // lerp between elastic or inelastic based on restitution
                        this.velocity.x = lerp(inelastic, elastic0, restitution);
                        o.velocity.x = lerp(inelastic, elastic1, restitution);
                    }
                    else // bounce if other object is fixed, relative to it as a landing is
                        this.velocity.x = o.velocity.x - (this.velocity.x - o.velocity.x) * restitution;
                }
                debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            const hitLayer = tileCollisionTest(this.pos, this.size, this);
            if (hitLayer)
            {
                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedX = tileCollisionTest(vec2(this.pos.x, oldPos.y), this.size, this);
                    const isBlockedY = tileCollisionTest(vec2(oldPos.x, this.pos.y), this.size, this);
                    const restitution = max(this.restitution, hitLayer.restitution);
                    if (isBlockedX)
                    {
                        // try to step over a 1-tile bump (direction follows gravity sign
                        // so inverted gravity steps down off a ceiling bump instead of up;
                        // zero gravity defaults to the normal-gravity step-up direction)
                        const epsilon = 1e-3;
                        const maxMove = .1;
                        const gravitySign = gravityY > 0 ? -1 : 1;
                        const y = gravitySign > 0 ?
                            floor(oldPos.y-this.size.y/2+1) + this.size.y/2 + epsilon :
                            ceil( oldPos.y+this.size.y/2-1) - this.size.y/2 - epsilon;
                        const delta = abs(y - this.pos.y);
                        if (delta < maxMove)
                        if (!tileCollisionTest(vec2(this.pos.x, y), this.size, this))
                        {
                            this.pos.y = y;
                            debugPhysics && debugRect(this.pos, this.size, '#ff0');
                            return;
                        }

                        // move to previous X position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -restitution;
                    }
                    if (isBlockedY || !isBlockedX)
                    {
                        if (wasFalling)
                        {
                            // adjust position to slightly away from nearest tile
                            // this prevents gap between object and ground
                            const epsilon = .0001;
                            const offset = this.size.y/2 + epsilon;
                            // rounded in the layer's space as its collision test is, or a bottom a hair below a
                            // grid line would round to the row under it, inside the floor, and fall through
                            const layerY = hitLayer.pos.y;
                            this.pos.y = layerY + (gravityY < 0 ?
                                floor(oldPos.y - layerY - this.size.y/2) + offset :
                                ceil( oldPos.y - layerY + this.size.y/2) - offset);

                            // set ground object for tile collision
                            this.groundObject = hitLayer;
                        }
                        else
                        {
                            // move to previous Y position
                            this.pos.y = oldPos.y;
                            this.groundObject = undefined;
                        }
                        // bounce velocity
                        this.velocity.y *= -restitution;
                    }
                    debugPhysics && debugRect(this.pos, this.size, '#f00');
                }
            }
        }
    }

    /** Update the object, called automatically by engine once each frame. Does nothing by default. */
    update() {}

    /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileInfo, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Optional hook called during the light system plugin's lightmap pass to draw this object's lightmap contribution. Does nothing by default. */
    renderLight() {}

    /** Destroy this object, destroy its children, detach its parent, and mark it for removal
     *  @param {boolean} [immediate] - true removes attached effects like particle emitters at once, false lets them finish first */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        // disconnect from parent and destroy children
        this.destroyed = true;
        this.parent?.removeChild(this);
        for (const child of this.children)
        {
            child.parent = undefined;
            child.destroy(immediate);
        }
    }

    /** Convert from local space to world space
     *  @param {Vector2} pos - local space point */
    localToWorld(pos) { return this.pos.add(pos.rotate(this.angle)); }

    /** Convert from world space to local space
     *  @param {Vector2} pos - world space point */
    worldToLocal(pos) { return pos.subtract(this.pos).rotate(-this.angle); }

    /** Convert from local space to world space for a vector (rotation only)
     *  @param {Vector2} vec - local space vector */
    localToWorldVector(vec) { return vec.rotate(this.angle); }

    /** Convert from world space to local space for a vector (rotation only)
     *  @param {Vector2} vec - world space vector */
    worldToLocalVector(vec) { return vec.rotate(-this.angle); }

    /** Called to check if a tile collision should be resolved. Return true for physics to resolve the collision or false to ignore and resolve it manually.
     *  - Called for each solid tile the physics tests, which can be several times a frame for the same tile, and for
     *    positions it only tries, so keep it free of side effects or guard them to once a frame
     *  - this.pos has already moved, so a check on where it came from, like a one way platform, needs the position
     *    saved in update, as the platformer example does
     *  @param {number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos - the tile's bottom left corner in world space
     *  @return {boolean} - true if the collision should be resolved by modifying it's position and velocity */
    collideWithTile(tileData, pos) { return tileData > 0; }

    /** Called by the engine to check if an object collision should be resolved. Return true for physics to resolve the collision or false to ignore and resolve it manually.
     *  - Both objects of a touching pair are asked once a frame, whichever order they update in; an object that
     *    destroys itself here is gone at the end of the frame and is still asked about the pairs left this frame, so a
     *    bullet that should hit one thing checks its own destroyed flag first
     *  @param {EngineObject} object - the object to test against
     *  @param {Vector3} [push] - what it would take to move this object clear, a Vector3 from the 3D plugin, undefined in 2D
     *  @return {boolean} - true if the collision should be resolved by modifying it's position and velocity
     */
    collideWithObject(object, push) { return true; }

    /** Get this object's up vector
     *  @param {number} [scale] - length of the vector
     *  @return {Vector2} */
    getUp(scale=1) { return vec2().setAngle(this.angle, scale); }

    /** Get this object's right vector
     *  @param {number} [scale] - length of the vector
     *  @return {Vector2} */
    getRight(scale=1) { return vec2().setAngle(this.angle+PI/2, scale); }

    /** How long since the object was created
     *  @return {number} */
    getAliveTime() { return time - this.spawnTime; }

    /** Get the speed of this object
     *  @return {number} */
    getSpeed() { return this.velocity.length(); }

    /** Apply acceleration to this object (adjust velocity, not affected by mass)
     *  @param {Vector2} acceleration */
    applyAcceleration(acceleration)
    { if (this.mass) this.velocity = this.velocity.add(acceleration); }

    /** Apply angular acceleration to this object
     *  @param {number} acceleration */
    applyAngularAcceleration(acceleration)
    { if (this.mass) this.angleVelocity += acceleration; }

    /** Apply force to this object (adjust velocity, affected by mass)
     *  @param {Vector2} force */
    applyForce(force)
    { if (this.mass) this.applyAcceleration(force.scale(1/this.mass)); }

    /** Get the direction of the mirror
     *  @return {number} -1 if this.mirror is true, or 1 if not mirrored */
    getMirrorSign() { return this.mirror ? -1 : 1; }

    /** Attaches a child to this with a local transform, returns child for chaining
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=vec2()]
     *  @param {number}       [localAngle]
     *  @return {EngineObject} The child object added */
    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!this.destroyed, 'cannot add child to destroyed object');
        if (this.destroyed) return child;
        ASSERT(!child.parent && !this.children.includes(child), 'child already has a parent, removeChild it first or use attach');
        ASSERT(child instanceof EngineObject, 'child must be an EngineObject');
        ASSERT(!child.destroyed, 'cannot add a destroyed child');
        for (let p = /** @type {EngineObject} */ (this); p; p = p.parent)
            ASSERT(p !== child, 'cannot add an object as a child of itself or of its own child');
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
        child.updateTransforms();
        return child;
    }

    /** Attaches a child to this without moving it: the local transform is worked out from where the child is now,
     *  where addChild takes one; a child of something else is moved over, returns child for chaining
     *  @param {EngineObject} child
     *  @return {EngineObject} The child object attached */
    attach(child)
    {
        ASSERT(child instanceof EngineObject, 'child must be an EngineObject');
        ASSERT(child !== this, 'cannot attach self');
        child.parent?.removeChild(child);
        // the local values that updateTransforms turns back into the child's current pos and angle
        const mirror = this.getMirrorSign(), local = this.worldToLocal(child.pos);
        local.x *= mirror;
        return this.addChild(child, local, mirror * (child.angle - this.angle));
    }

    /** Removes a child from this one, it stays where it is in the world
     *  @param {EngineObject} child */
    removeChild(child)
    {
        ASSERT(child.parent === this && this.children.includes(child));
        const i = this.children.indexOf(child);
        if (i < 0) return; // not a child of this one, release has no assert
        this.children.splice(i, 1);
        child.parent = child.localPos = undefined;
    }

    /** Check if overlapping another engine object
     *  Collisions are resolved to prevent overlaps
     *  @param {EngineObject} object
     *  @return {boolean} */
    isOverlappingObject(object)
    { return this.isOverlapping(object.pos, object.size); }

    /** Check if overlapping a point or aligned bounding box
     *  @param {Vector2} pos          - Center of box
     *  @param {Vector2} [size=vec2()] - Size of box, uses a point if undefined
     *  @return {boolean} */
    isOverlapping(pos, size=vec2())
    { return isOverlapping(this.pos, this.size, pos, size); }

    /** Set how this object collides
     *  @param {boolean} [collideSolidObjects] - Does it collide with solid objects?
     *  @param {boolean} [isSolid]             - Does it collide with and block other objects? (expensive in large numbers)
     *  @param {boolean} [collideTiles]        - Does it collide with the tile collision?
     *  @param {boolean} [collideRaycast]      - Does it collide with raycasts? */
    setCollision(collideSolidObjects=true, isSolid=true, collideTiles=true, collideRaycast=true)
    {
        ASSERT(collideSolidObjects || !isSolid, 'solid objects must be set to collide');

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
        this.collideRaycast = collideRaycast;
    }

    /** Returns string containing info about this object for debugging
     *  @return {string} */
    toString()
    {
        let text = 'type = ' + this.constructor.name;
        if (this.pos.x || this.pos.y)
            text += '\npos = ' + this.pos;
        if (this.velocity.x || this.velocity.y)
            text += '\nvelocity = ' + this.velocity;
        if (this.size.x || this.size.y)
            text += '\nsize = ' + this.size;
        if (this.angle)
            text += '\nangle = ' + this.angle.toFixed(3);
        if (this.color)
            text += '\ncolor = ' + this.color;
        return text;
    }

    /** Render debug info for this object  */
    renderDebugInfo()
    {
        if (!debug) return;

        // check if there is anything to show
        const hasPhysics = this.collideTiles || this.collideSolidObjects || this.isSolid;
        if (!hasPhysics && !this.parent) return;

        // show object info for debugging
        const size = vec2(max(this.size.x, .2), max(this.size.y, .2));
        const color = rgb(this.collideTiles?1:0, this.collideSolidObjects?1:0, this.isSolid?1:0, .5);
        debugRect(this.pos, size, color, 0, this.angle, hasPhysics);
        if (this.parent)
            debugRect(this.pos, size.scale(.8), rgb(1,1,1,.5), 0, this.angle);
        this.parent && debugLine(this.pos, this.parent.pos, rgb(1,1,1,.5), .5);
    }
}