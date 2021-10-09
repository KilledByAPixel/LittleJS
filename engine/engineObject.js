/*
    LittleJS Object Base Class
    - Base object class used by the engine
    - Automatically adds self to object list
    - Will be updated and rendered each frame
    - Renders as a sprite from a tilesheet by default
    - Can have color and addtive color applied
    - 2d Physics and collision system
    - Sorted by renderOrder
    - Objects can have children attached
    - Parents are updated before children, and set child transform
    - Call destroy() to get rid of objects
*/

'use strict';

class EngineObject
{
    constructor(pos, size=defaultObjectSize, tileIndex=-1, tileSize=defaultTileSize, angle=0, color)
    {
        // set passed in params
        ASSERT(pos && pos.x != undefined && size.x != undefined); // ensure pos and size are vec2s
        this.pos = pos.copy();
        this.size = size;
        this.tileIndex = tileIndex;
        this.tileSize = tileSize;
        this.angle = angle;
        this.color = color;

        // set physics defaults
        this.mass         = defaultObjectMass;
        this.damping      = defaultObjectDamping;
        this.angleDamping = defaultObjectAngleDamping;
        this.elasticity   = defaultObjectElasticity;
        this.friction     = defaultObjectFriction;

        // init other object stuff
        this.spawnTime = time;
        this.velocity = vec2(this.collideSolidObjects = this.renderOrder = this.angleVelocity = 0);
        this.collideTiles = this.gravityScale = 1;
        this.children = [];

        // add to list of objects
        engineObjects.push(this);
    }
    
    update()
    {
        if (this.parent)
        {
            // copy parent pos/angle
            this.pos = this.localPos.multiply(vec2(this.getMirrorSign(),1)).rotate(-this.parent.angle).add(this.parent.pos);
            this.angle = this.getMirrorSign()*this.localAngle + this.parent.angle;
            return;
        }

        // limit max speed to prevent missing collisions
        this.velocity.x = clamp(this.velocity.x, maxObjectSpeed, -maxObjectSpeed);
        this.velocity.y = clamp(this.velocity.y, maxObjectSpeed, -maxObjectSpeed);

        // apply physics
        const oldPos = this.pos.copy();
        this.pos.x += this.velocity.x = this.damping * this.velocity.x;
        this.pos.y += this.velocity.y = this.damping * this.velocity.y + gravity * this.gravityScale;
        this.angle += this.angleVelocity *= this.angleDamping;

        // physics sanity checks
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        ASSERT(this.damping >= 0 && this.damping <= 1);

        if (!this.mass) // do not update collision for fixed objects
            return;

        const wasMovingDown = this.velocity.y < 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * this.friction;
            this.groundObject = 0;
            //debugPhysics && debugPoint(this.pos.subtract(vec2(0,this.size.y/2)), '#0f0');
        }

        if (this.collideSolidObjects)
        {
            // check collisions against solid objects
            const epsilon = 1e-3; // necessary to push slightly outside of the collision
            for (const o of engineCollideObjects)
            {
                // non solid objects don't collide with eachother
                if (!this.isSolid & !o.isSolid || o.destroyed || o.parent)
                    continue;

                // check collision
                if (!isOverlapping(this.pos, this.size, o.pos, o.size) || o == this)
                    continue;

                // pass collision to objects
                if (!this.collideWithObject(o) | !o.collideWithObject(this))
                    continue;

                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001; // push away if alread overlapping
                    const velocity = length < .01 ? randVector(pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                        
                    debugPhysics && debugAABB(this.pos, o.pos, this.size, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sx = this.size.x + o.size.x;
                const sy = this.size.y + o.size.y;
                const smallStepUp = (oldPos.y - o.pos.y)*2 > sy + gravity; // prefer to push up if small delta
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sy;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sx;
                
                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sy*.5 + epsilon) * sign(oldPos.y - o.pos.y);
                    if (o.groundObject && wasMovingDown || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasMovingDown)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -this.elasticity;
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
                        const elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.y = lerp(elasticity, elastic0, inelastic);
                        o.velocity.y = lerp(elasticity, elastic1, inelastic);
                    }
                    debugPhysics && smallStepUp && (abs(oldPos.x - o.pos.x)*2 > sx) && console.log('stepUp', oldPos.y - o.pos.y);
                }
                if (!smallStepUp && (isBlockedX || !isBlockedY)) // resolve x collision
                {
                    // push outside collision
                    this.pos.x = o.pos.x + (sx*.5 + epsilon) * sign(oldPos.x - o.pos.x);
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
                        const elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.x = lerp(elasticity, elastic0, inelastic);
                        o.velocity.x = lerp(elasticity, elastic1, inelastic);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -this.elasticity;
                }

                debugPhysics && debugAABB(this.pos, o.pos, this.size, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            if (tileCollisionTest(this.pos, this.size, this))
            {
                //debugPhysics && debugRect(this.pos, this.size, '#ff0');

                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedY = tileCollisionTest(new Vector2(oldPos.x, this.pos.y), this.size, this);
                    const isBlockedX = tileCollisionTest(new Vector2(this.pos.x, oldPos.y), this.size, this);
                    if (isBlockedY || !isBlockedX)
                    {
                        // set if landed on ground
                        this.groundObject = wasMovingDown;

                        // push out of collision and bounce
                        this.pos.y = oldPos.y;
                        this.velocity.y *= -this.elasticity;
                    }
                    if (isBlockedX)
                    {
                        // push out of collision and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.elasticity;
                    }
                }
            }
        }
    }
       
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
    }
    
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
    collideWithTile(data, pos)        { return data > 0; }
    collideWithTileRaycast(data, pos) { return data > 0; }
    collideWithObject(o)              { return 1; }
    getAliveTime()                    { return time - this.spawnTime; }
    applyAcceleration(a)              { ASSERT(!this.isFixed()); this.velocity = this.velocity.add(a); }
    applyForce(force)	              { this.applyAcceleration(force.scale(1/this.mass)); }
    isFixed()                         { return !this.mass; }
    getMirrorSign(s=1)                { return this.mirror ? -s : s; }

    addChild(child, localPos=vec2(), localAngle=0)
    {
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    }
    removeChild(child)
    {
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    }

    setCollision(collideSolidObjects, isSolid, collideTiles=1)
    {
        ASSERT(collideSolidObjects || !isSolid); // solid objects must be set to collide

        // track collidable objects in separate list
        if (collideSolidObjects && !this.collideSolidObjects)
        {
            ASSERT(!engineCollideObjects.includes(this));
            engineCollideObjects.push(this);
        }
        else if (!collideSolidObjects && this.collideSolidObjects)
        {
            ASSERT(engineCollideObjects.includes(this))
            engineCollideObjects.splice(engineCollideObjects.indexOf(this), 1);
        }

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
    }
}

function destroyAllObjects()
{
    // remove all objects that are not persistent or are descendants of something persistent
    for (const o of engineObjects)
        o.persistent || o.parent || o.destroy();
    engineObjects = engineObjects.filter(o=>!o.destroyed);
}

function forEachObject(pos, size=0, callbackFunction=(o)=>1, collideObjectsOnly=1)
{
    const objectList = collideObjectsOnly ? engineCollideObjects : engineObjects;
    if (!size)
    {
        // no overlap test
        for (const o of objectList)
            callbackFunction(o);
    }
    else if (size.x != undefined)
    {
        // aabb test
        for (const o of objectList)
            isOverlapping(pos, size, o.pos, o.size) && callbackFunction(o);
    }
    else
    {
        // circle test
        const sizeSquared = size**2;
        for (const o of objectList)
            pos.distanceSquared(o.pos) < sizeSquared && callbackFunction(o);
    }
}