/** 
 * LittleJS Object System
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
 * - Solid objects are more performance intensive and should be used sparingly
 * @example
 * // create an engine object, normally you would first extend the class with your own
 * const pos = vec2(2,3);
 * const object = new EngineObject(pos); 
 */
class EngineObject
{
    /** Create an engine object and adds it to the list of objects
     *  @param {Vector2}  [pos=(0,0)]       - World space position of the object
     *  @param {Vector2}  [size=(1,1)]      - World space size of the object
     *  @param {TileInfo} [tileInfo]        - Tile info to render object (undefined is untextured)
     *  @param {Number}   [angle]           - Angle the object is rotated by
     *  @param {Color}    [color=(1,1,1,1)] - Color to apply to tile when rendered
     *  @param {Number}   [renderOrder]     - Objects sorted by renderOrder before being rendered
     */
    constructor(pos=vec2(), size=vec2(1), tileInfo, angle=0, color, renderOrder=0)
    {
        // set passed in params
        ASSERT(isVector2(pos) && isVector2(size), 'ensure pos and size are vec2s');
        ASSERT(typeof tileInfo !== 'number' || !tileInfo, 'old style tile setup');

        /** @property {Vector2} - World space position of the object */
        this.pos = pos.copy();
        /** @property {Vector2} - World space width and height of the object */
        this.size = size;
        /** @property {Vector2} - Size of object used for drawing, uses size if not set */
        this.drawSize = undefined;
        /** @property {TileInfo} - Tile info to render object (undefined is untextured) */
        this.tileInfo = tileInfo;
        /** @property {Number}  - Angle to rotate the object */
        this.angle = angle;
        /** @property {Color}   - Color to apply when rendered */
        this.color = color;
        /** @property {Color}   - Additive color to apply when rendered */
        this.additiveColor = undefined;
        /** @property {Boolean} - Should it flip along y axis when rendered */
        this.mirror = false;

        // physical properties
        /** @property {Number} [mass=objectDefaultMass]                 - How heavy the object is, static if 0 */
        this.mass         = objectDefaultMass;
        /** @property {Number} [damping=objectDefaultDamping]           - How much to slow down velocity each frame (0-1) */
        this.damping      = objectDefaultDamping;
        /** @property {Number} [angleDamping=objectDefaultAngleDamping] - How much to slow down rotation each frame (0-1) */
        this.angleDamping = objectDefaultAngleDamping;
        /** @property {Number} [elasticity=objectDefaultElasticity]     - How bouncy the object is when colliding (0-1) */
        this.elasticity   = objectDefaultElasticity;
        /** @property {Number} [friction=objectDefaultFriction]         - How much friction to apply when sliding (0-1) */
        this.friction     = objectDefaultFriction;
        /** @property {Number}  - How much to scale gravity by for this object */
        this.gravityScale = 1;
        /** @property {Number}  - Objects are sorted by render order */
        this.renderOrder = renderOrder;
        /** @property {Vector2} - Velocity of the object */
        this.velocity = vec2();
        /** @property {Number}  - Angular velocity of the object */
        this.angleVelocity = 0;
        /** @property {Number}  - Track when object was created  */
        this.spawnTime = time;
        /** @property {Array}   - List of children of this object */
        this.children = [];
        /** @property {Boolean}  - Limit object speed using linear or circular math */
        this.clampSpeedLinear = true;

        // parent child system
        /** @property {EngineObject} - Parent of object if in local space  */
        this.parent = undefined;
        /** @property {Vector2}      - Local position if child */
        this.localPos = vec2();
        /** @property {Number}       - Local angle if child  */
        this.localAngle = 0;

        // collision flags
        /** @property {Boolean} - Object collides with the tile collision */
        this.collideTiles = false;
        /** @property {Boolean} - Object collides with solid objects */
        this.collideSolidObjects = false;
        /** @property {Boolean} - Object collides with and blocks other objects */
        this.isSolid = false;
        /** @property {Boolean} - Object collides with raycasts */
        this.collideRaycast = false;

        // add to list of objects
        engineObjects.push(this);
    }
    
    /** Update the object transform, called automatically by engine even when paused */
    updateTransforms()
    {
        const parent = this.parent;
        if (parent)
        {
            // copy parent pos/angle
            const mirror = parent.getMirrorSign();
            this.pos = this.localPos.multiply(vec2(mirror,1)).rotate(-parent.angle).add(parent.pos);
            this.angle = mirror*this.localAngle + parent.angle;
        }

        // update children
        for (const child of this.children)
            child.updateTransforms();
    }

    /** Update the object physics, called automatically by engine once each frame */
    update()
    {
        // child objects do not have physics
        if (this.parent)
            return;

        // limit max speed to prevent missing collisions
        if (this.clampSpeedLinear)
        {
            this.velocity.x = clamp(this.velocity.x, -objectMaxSpeed, objectMaxSpeed);
            this.velocity.y = clamp(this.velocity.y, -objectMaxSpeed, objectMaxSpeed);
        }
        else
        {
            const length2 = this.velocity.lengthSquared();
            if (length2 > objectMaxSpeed*objectMaxSpeed)
            {
                const s = objectMaxSpeed / length2**.5;
                this.velocity.x *= s;
                this.velocity.y *= s;
            }
        }

        // apply physics
        const oldPos = this.pos.copy();
        this.velocity.y += gravity * this.gravityScale;
        this.pos.x += this.velocity.x *= this.damping;
        this.pos.y += this.velocity.y *= this.damping;
        this.angle += this.angleVelocity *= this.angleDamping;

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);
        if (!enablePhysicsSolver || !this.mass) // dont do collision for fixed objects
            return;

        const wasMovingDown = this.velocity.y < 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * this.friction;
            this.groundObject = 0;
            //debugOverlay && debugPhysics && debugPoint(this.pos.subtract(vec2(0,this.size.y/2)), '#0f0');
        }

        if (this.collideSolidObjects)
        {
            // check collisions against solid objects
            const epsilon = .001; // necessary to push slightly outside of the collision
            for (const o of engineObjectsCollide)
            {
                // non solid objects don't collide with eachother
                if (!this.isSolid && !o.isSolid || o.destroyed || o.parent || o == this)
                    continue;

                // check collision
                if (!isOverlapping(this.pos, this.size, o.pos, o.size))
                    continue;

                // notify objects of collision and check if should be resolved
                const collide1 = this.collideWithObject(o);
                const collide2 = o.collideWithObject(this);
                if (!collide1 || !collide2)
                    continue;

                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001; // push away if already overlapping
                    const velocity = length < .01 ? randVector(pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                        
                    debugOverlay && debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sizeBoth = this.size.add(o.size);
                const smallStepUp = (oldPos.y - o.pos.y)*2 > sizeBoth.y + gravity; // prefer to push up if small delta
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sizeBoth.y;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sizeBoth.x;
                const elasticity = max(this.elasticity, o.elasticity);
                
                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sizeBoth.y/2 + epsilon) * sign(oldPos.y - o.pos.y);
                    if (o.groundObject && wasMovingDown || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasMovingDown)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -elasticity;
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

                        // lerp betwen elastic or inelastic based on elasticity
                        this.velocity.y = lerp(elasticity, inelastic, elastic0);
                        o.velocity.y = lerp(elasticity, inelastic, elastic1);
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

                        // lerp betwen elastic or inelastic based on elasticity
                        this.velocity.x = lerp(elasticity, inelastic, elastic0);
                        o.velocity.x = lerp(elasticity, inelastic, elastic1);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -elasticity;
                }
                debugOverlay && debugPhysics && debugOverlap(this.pos, this.size, o.pos, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            if (tileCollisionTest(this.pos, this.size, this))
            {
                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedY = tileCollisionTest(vec2(oldPos.x, this.pos.y), this.size, this);
                    const isBlockedX = tileCollisionTest(vec2(this.pos.x, oldPos.y), this.size, this);
                    if (isBlockedY || !isBlockedX)
                    {
                        // set if landed on ground
                        this.groundObject = wasMovingDown;

                        // bounce velocity
                        this.velocity.y *= -this.elasticity;

                        // adjust next velocity to settle on ground
                        const o = (oldPos.y - this.size.y/2|0) - (oldPos.y - this.size.y/2);
                        if (o < 0 && o > this.damping * this.velocity.y + gravity * this.gravityScale) 
                            this.velocity.y = this.damping ? (o - gravity * this.gravityScale) / this.damping : 0;

                        // move to previous position
                        this.pos.y = oldPos.y;
                    }
                    if (isBlockedX)
                    {
                        // move to previous position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.elasticity;
                    }
                }
            }
        }
    }
       
    /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileInfo, this.color, this.angle, this.mirror, this.additiveColor);
    }
    
    /** Destroy this object, destroy it's children, detach it's parent, and mark it for removal */
    destroy()
    { 
        if (this.destroyed)
            return;
        
        // disconnect from parent and destroy chidren
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
            child.destroy(child.parent = 0);
    }

    /** Convert from local space to world space
     *  @param {Vector2} pos - local space point */
    localToWorld(pos) { return this.pos.add(pos.rotate(-this.angle)); }

    /** Convert from world space to local space
     *  @param {Vector2} pos - world space point */
    worldToLocal(pos) { return pos.subtract(this.pos).rotate(this.angle); }

    /** Convert from local space to world space for a vector (rotation only)
     *  @param {Vector2} vec - local space vector */
    localToWorldVector(vec) { return vec.rotate(this.angle); }

    /** Convert from world space to local space for a vector (rotation only)
     *  @param {Vector2} vec - world space vector */
    worldToLocalVector(vec) { return vec.rotate(-this.angle); }
    
    /** Called to check if a tile collision should be resolved
     *  @param {Number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos      - tile where the collision occured
     *  @return {Boolean}         - true if the collision should be resolved */
    collideWithTile(tileData, pos)    { return tileData > 0; }

    /** Called to check if a object collision should be resolved
     *  @param {EngineObject} object - the object to test against
     *  @return {Boolean}            - true if the collision should be resolved
     */
    collideWithObject(object)         { return true; }

    /** How long since the object was created
     *  @return {Number} */
    getAliveTime()                    { return time - this.spawnTime; }

    /** Apply acceleration to this object (adjust velocity, not affected by mass)
     *  @param {Vector2} acceleration */
    applyAcceleration(acceleration)   { if (this.mass) this.velocity = this.velocity.add(acceleration); }

    /** Apply force to this object (adjust velocity, affected by mass)
     *  @param {Vector2} force */
    applyForce(force)	              { this.applyAcceleration(force.scale(1/this.mass)); }
    
    /** Get the direction of the mirror
     *  @return {Number} -1 if this.mirror is true, or 1 if not mirrored */
    getMirrorSign() { return this.mirror ? -1 : 1; }

    /** Attaches a child to this with a given local transform
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=(0,0)]
     *  @param {Number}       [localAngle] */
    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    }

    /** Removes a child from this one
     *  @param {EngineObject} child */
    removeChild(child)
    {
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    }

    /** Set how this object collides
     *  @param {Boolean} [collideSolidObjects] - Does it collide with solid objects?
     *  @param {Boolean} [isSolid]             - Does it collide with and block other objects? (expensive in large numbers)
     *  @param {Boolean} [collideTiles]        - Does it collide with the tile collision?
     *  @param {Boolean} [collideRaycast]      - Does it collide with raycasts? */
    setCollision(collideSolidObjects=true, isSolid=true, collideTiles=true, collideRaycast=true)
    {
        ASSERT(collideSolidObjects || !isSolid, 'solid objects must be set to collide');

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
        this.collideRaycast = collideRaycast;
    }

    /** Returns string containg info about this object for debugging
     *  @return {String} */
    toString()
    {
        if (debug)
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
    }

    /** Render debug info for this object  */
    renderDebugInfo()
    {
        if (debug)
        {
            // show object info for debugging
            const size = vec2(max(this.size.x, .2), max(this.size.y, .2));
            const color1 = rgb(this.collideTiles?1:0, this.collideSolidObjects?1:0, this.isSolid?1:0, this.parent?.2:.5);
            const color2 = this.parent ? rgb(1,1,1,.5) : rgb(0,0,0,.8);
            drawRect(this.pos, size, color1, this.angle, false);
            drawRect(this.pos, size.scale(.8), color2, this.angle, false);
            this.parent && drawLine(this.pos, this.parent.pos, .1, rgb(0,0,1,.5), false);
        }
    }
}