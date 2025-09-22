/**
 * LittleJS Box2D Physics Plugin
 * - Box2dObject extends EngineObject with Box2D physics
 * - Call box2dInit() before engineInit() to enable
 * - You will also need to include box2d.wasm.js
 * - Uses a super fast web assembly port of Box2D
 * - More info: https://github.com/kripken/box2d.js
 * - Functions to create polygon, circle, and edge shapes
 * - Contact begin and end callbacks
 * - Wraps b2Vec2 type to/from Vector2
 * - Raycasting and querying
 * - Every type of joint
 * - Debug physics drawing
 * @namespace Box2D
 */

'use strict';
 
/** Global Box2d Plugin object
 *  @type {Box2dPlugin}
 *  @memberof Box2D */
let box2d;

/** Enable Box2D debug drawing
 *  @type {boolean}
 *  @default
 *  @memberof Box2D */
let box2dDebug = false;

/** Enable Box2D debug drawing
 *  @param {boolean} enable
 *  @memberof Box2D */
function box2dSetDebug(enable) { box2dDebug = enable; }

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Object - extend with your own custom physics objects
 * - A LittleJS object with Box2D physics
 * - Each object has a Box2D body which can have multiple fixtures and joints
 * - Provides interface for Box2D body and fixture functions
 * @extends EngineObject
 */
class Box2dObject extends EngineObject 
{
    /** Create a LittleJS object with Box2d physics
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {number}   [angle]
     *  @param {Color}    [color]
     *  @param {number}   [bodyType]
     *  @param {number}   [renderOrder] */
    constructor(pos=vec2(), size, tileInfo, angle=0, color, bodyType=box2d.bodyTypeDynamic, renderOrder=0)
    {
        super(pos, size, tileInfo, angle, color, renderOrder);

        // create physics body
        const bodyDef = new box2d.instance.b2BodyDef();
        bodyDef.set_type(bodyType);
        bodyDef.set_position(box2d.vec2dTo(pos));
        bodyDef.set_angle(-angle);
        this.body = box2d.world.CreateBody(bodyDef);
        this.body.object = this;
        this.outlineColor = BLACK;
    }

    /** Destroy this object and it's physics body */
    destroy()
    {
        // destroy physics body, fixtures, and joints
        this.body && box2d.world.DestroyBody(this.body);
        this.body = 0;
        super.destroy();
    }

    /** Copy box2d update sim data */
    update()
    {
        // use box2d physics update
        this.pos = box2d.vec2From(this.body.GetPosition());
        this.angle = -this.body.GetAngle();
    }

    /** Render the object, uses box2d drawing if no tile info exists */
    render()
    {
        // use default render or draw fixtures
        if (this.tileInfo)
            super.render();
        else
            this.drawFixtures(this.color, this.outlineColor, this.lineWidth, mainContext);
    }

    /** Render debug info */
    renderDebugInfo()
    {
        const isAsleep = !this.getIsAwake();
        const isStatic = this.getBodyType() == box2d.bodyTypeStatic;
        const color = rgb(isAsleep?1:0, isAsleep?1:0, isStatic?1:0, .5);
        this.drawFixtures(color);
    }

    /** Draws all this object's fixtures 
     *  @param {Color}  [color]
     *  @param {Color}  [outlineColor]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixtures(color=WHITE, outlineColor, lineWidth=.1, context)
    {
        this.getFixtureList().forEach(fixture=>
            box2d.drawFixture(fixture, this.pos, this.angle, color, outlineColor, lineWidth, context));
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics contact callbacks

    /** Called when a contact begins
     *  @param {Box2dObject} otherObject */
    beginContact(otherObject) {}

    /** Called when a contact ends
     *  @param {Box2dObject} otherObject */
    endContact(otherObject) {}

    ///////////////////////////////////////////////////////////////////////////////
    // physics fixtures and shapes

    /** Add a shape fixture to the body
     *  @param {Object} shape
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addShape(shape, density=1, friction=.2, restitution=0, isSensor=false)
    {
        const fd = new box2d.instance.b2FixtureDef();
        fd.set_shape(shape);
        fd.set_density(density);
        fd.set_friction(friction);
        fd.set_restitution(restitution);
        fd.set_isSensor(isSensor);
        return this.body.CreateFixture(fd);
    }

    /** Add a box shape to the body
     *  @param {Vector2} [size]
     *  @param {Vector2} [offset]
     *  @param {number}  [angle]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addBox(size=vec2(1), offset=vec2(), angle=0, density, friction, restitution, isSensor)
    {
        const shape = new box2d.instance.b2PolygonShape();
        shape.SetAsBox(size.x/2, size.y/2, box2d.vec2dTo(offset), angle);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add a polygon shape to the body
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addPoly(points, density, friction, restitution, isSensor)
    {
        function box2dCreatePolygonShape(points)
        {
            function box2dCreatePointList(points)
            {
                const buffer = box2d.instance._malloc(points.length * 8);
                for (let i=0, offset=0; i<points.length; ++i)
                {
                    box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].x;
                    offset += 4;
                    box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].y;
                    offset += 4;
                }
                return box2d.instance.wrapPointer(buffer, box2d.instance.b2Vec2);
            }

            ASSERT(3 <= points.length && points.length <= 8);
            const shape = new box2d.instance.b2PolygonShape();
            const box2dPoints = box2dCreatePointList(points);
            shape.Set(box2dPoints, points.length);
            return shape;
        }

        const shape = box2dCreatePolygonShape(points);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add a regular polygon shape to the body
     *  @param {number}  [diameter]
     *  @param {number}  [sides]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addRegularPoly(diameter=1, sides=8, density, friction, restitution, isSensor)
    {
        const points = [];
        const radius = diameter/2;
        for (let i=sides; i--;)
            points.push(vec2(radius,0).rotate((i+.5)/sides*PI*2));
        return this.addPoly(points, density, friction, restitution, isSensor);
    }

    /** Add a random polygon shape to the body
     *  @param {number}  [diameter]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addRandomPoly(diameter=1, density, friction, restitution, isSensor)
    {
        const sides = randInt(3, 9);
        const points = [];
        const radius = diameter/2;
        for (let i=sides; i--;)
            points.push(vec2(rand(radius/2,radius*1.5),0).rotate(i/sides*PI*2));
        return this.addPoly(points, density, friction, restitution, isSensor);
    }

    /** Add a circle shape to the body
     *  @param {number}  [diameter]
     *  @param {Vector2} [offset]
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addCircle(diameter=1, offset=vec2(), density, friction, restitution, isSensor)
    {
        const shape = new box2d.instance.b2CircleShape();
        shape.set_m_p(box2d.vec2dTo(offset));
        shape.set_m_radius(diameter/2);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add an edge shape to the body
     *  @param {Vector2} point1
     *  @param {Vector2} point2
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdge(point1, point2, density, friction, restitution, isSensor)
    {
        const shape = new box2d.instance.b2EdgeShape();
        shape.Set(box2d.vec2dTo(point1), box2d.vec2dTo(point2));
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    /** Add an edge loop to the body, an edge loop connects the end points
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdgeLoop(points, density, friction, restitution, isSensor)
    {
        const fixtures = [];
        const getPoint = i=> points[mod(i,points.length)];
        for (let i=0; i<points.length; ++i)
        {
            const shape = new box2d.instance.b2EdgeShape();
            shape.set_m_vertex0(box2d.vec2dTo(getPoint(i-1)));
            shape.set_m_vertex1(box2d.vec2dTo(getPoint(i+0)));
            shape.set_m_vertex2(box2d.vec2dTo(getPoint(i+1)));
            shape.set_m_vertex3(box2d.vec2dTo(getPoint(i+2)));
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            fixtures.push(f);
        }
        return fixtures;
    }

    /** Add an edge list to the body
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdgeList(points, density, friction, restitution, isSensor)
    {
        const fixtures = [];
        for (let i=0; i<points.length-1; ++i)
        {
            const shape = new box2d.instance.b2EdgeShape();
            points[i-1] && shape.set_m_vertex0(box2d.vec2dTo(points[i-1]));
            points[i+0] && shape.set_m_vertex1(box2d.vec2dTo(points[i+0]));
            points[i+1] && shape.set_m_vertex2(box2d.vec2dTo(points[i+1]));
            points[i+2] && shape.set_m_vertex3(box2d.vec2dTo(points[i+2]));
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            fixtures.push(f);
        }
        return fixtures;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics get functions

    /** Gets the center of mass
     *  @return {Vector2} */
    getCenterOfMass() { return box2d.vec2From(this.body.GetWorldCenter()); }

    /** Gets the linear velocity
     *  @return {Vector2} */
    getLinearVelocity() { return box2d.vec2From(this.body.GetLinearVelocity()); }

    /** Gets the angular velocity
     *  @return {Vector2} */
    getAngularVelocity() { return this.body.GetAngularVelocity(); }

    /** Gets the mass
     *  @return {number} */
    getMass() { return this.body.GetMass(); }

    /** Gets the rotational inertia
     *  @return {number} */
    getInertia() { return this.body.GetInertia(); }

    /** Check if this object is awake
     *  @return {boolean} */
    getIsAwake() { return this.body.IsAwake(); }

    /** Gets the physics body type
     *  @return {number} */
    getBodyType() { return this.body.GetType(); }
    
    ///////////////////////////////////////////////////////////////////////////////
    // physics set functions

    /** Sets the position and angle
     *  @param {Vector2} pos
     *  @param {number} angle */
    setTransform(pos, angle)
    {
        this.pos = pos;
        this.angle = angle;
        this.body.SetTransform(box2d.vec2dTo(pos), angle);
    }
    
    /** Sets the position
     *  @param {Vector2} pos */
    setPosition(pos) { this.setTransform(pos, this.body.GetAngle()); }

    /** Sets the angle
     *  @param {number} angle */
    setAngle(angle) { this.setTransform(box2d.vec2From(this.body.GetPosition()), -angle); }

    /** Sets the linear velocity
     *  @param {Vector2} velocity */
    setLinearVelocity(velocity) { this.body.SetLinearVelocity(box2d.vec2dTo(velocity)); }

    /** Sets the angular velocity
     *  @param {number} angularVelocity */
    setAngularVelocity(angularVelocity) { this.body.SetAngularVelocity(angularVelocity); }

    /** Sets the linear damping
     *  @param {number} damping */
    setLinearDamping(damping) { this.body.SetLinearDamping(damping); }

    /** Sets the angular damping
     *  @param {number} damping */
    setAngularDamping(damping) { this.body.SetAngularDamping(damping); }

    /** Sets the gravity scale
     *  @param {number} [scale] */
    setGravityScale(scale=1) { this.body.SetGravityScale(this.gravityScale = scale); }

    /** Should this body be treated like a bullet for continuous collision detection?
     *  @param {boolean} [isBullet] */
    setBullet(isBullet=true) { this.body.SetBullet(isBullet); }

    /** Set the sleep state of the body
     *  @param {boolean} [isAwake] */
    setAwake(isAwake=true) { this.body.SetAwake(isAwake); }
    
    /** Set the physics body type
     *  @param {number} type */
    setBodyType(type) { this.body.SetType(type); }

    /** Set whether the body is allowed to sleep
     *  @param {boolean} [isAllowed] */
    setSleepingAllowed(isAllowed=true) { this.body.SetSleepingAllowed(isAllowed); }
    
    /** Set whether the body can rotate
     *  @param {boolean} [isFixed] */
    setFixedRotation(isFixed=true) { this.body.SetFixedRotation(isFixed); }

    /** Set the center of mass of the body
     *  @param {Vector2} center */
    setCenterOfMass(center) { this.setMassData(center) }

    /** Set the mass of the body
     *  @param {number} mass */
    setMass(mass) { this.setMassData(undefined, mass) }
    
    /** Set the moment of inertia of the body
     *  @param {number} momentOfInertia */
    setMomentOfInertia(momentOfInertia) { this.setMassData(undefined, undefined, momentOfInertia) }
    
    /** Reset the mass, center of mass, and moment */
    resetMassData()  { this.body.ResetMassData(); }
    
    /** Set the mass data of the body
     *  @param {Vector2} [localCenter]
     *  @param {number}  [mass]
     *  @param {number}  [momentOfInertia] */
    setMassData(localCenter, mass, momentOfInertia)
    {
        const data = new box2d.instance.b2MassData();
        this.body.GetMassData(data);
        localCenter && data.set_center(box2d.vec2dTo(localCenter));
        mass && data.set_mass(mass);
        momentOfInertia && data.set_I(momentOfInertia);
        this.body.SetMassData(data);
    }

    /** Set the collision filter data for this body
     *  @param {number} [categoryBits]
     *  @param {number} [ignoreCategoryBits]
     *  @param {number} [groupIndex] */
    setFilterData(categoryBits=0, ignoreCategoryBits=0, groupIndex=0)
    {
        this.getFixtureList().forEach(fixture=>
        {
            const filter = fixture.GetFilterData();
            filter.set_categoryBits(categoryBits);
            filter.set_maskBits(0xffff & ~ignoreCategoryBits);
            filter.set_groupIndex(groupIndex);
        });
    }

    /** Set if this body is a sensor
     *  @param {boolean} [isSensor] */
    setSensor(isSensor=true)
    { this.getFixtureList().forEach(f=>f.SetSensor(isSensor)); }

    ///////////////////////////////////////////////////////////////////////////////
    // physics force and torque functions

    /** Apply force to this object
     *  @param {Vector2} force
     *  @param {Vector2} [pos] */
    applyForce(force, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyForce(box2d.vec2dTo(force), box2d.vec2dTo(pos));
    }

    /** Apply acceleration to this object
     *  @param {Vector2} acceleration
     *  @param {Vector2} [pos] */
    applyAcceleration(acceleration, pos)
    { 
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyLinearImpulse(box2d.vec2dTo(acceleration), box2d.vec2dTo(pos));
    }

    /** Apply torque to this object
     *  @param {number} torque */
    applyTorque(torque)
    {
        this.setAwake();
        this.body.ApplyTorque(torque);
    }
    
    /** Apply angular acceleration to this object
     *  @param {number} acceleration */
    applyAngularAcceleration(acceleration)
    {
        this.setAwake();
        this.body.ApplyAngularImpulse(acceleration);
    }

    ///////////////////////////////////////////////////////////////////////////////
    // lists of fixtures and joints

    /** Check if this object has any fixtures
     *  @return {boolean} */
    hasFixtures() { return !box2d.isNull(this.body.GetFixtureList()); }

    /** Get list of fixtures for this object
     *  @return {Array<Object>} */
    getFixtureList()
    {
        const fixtures = [];
        for (let fixture=this.body.GetFixtureList(); !box2d.isNull(fixture); )
        {
            fixtures.push(fixture);
            fixture = fixture.GetNext();
        }
        return fixtures;
    }

    /** Check if this object has any joints
     *  @return {boolean} */
    hasJoints() { return !box2d.isNull(this.body.GetJointList()); }
    
    /** Get list of joints for this object
     *  @return {Array<Object>} */
    getJointList()
    {
        const joints = [];
        for (let joint=this.body.GetJointList(); !box2d.isNull(joint); )
        {
            joints.push(joint);
            joint = joint.get_next();
        }
        return joints;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Raycast Result
 * - Holds results from a box2d raycast queries
 * - Automatically created by box2d raycast functions
 */
class Box2dRaycastResult
{
    /** Create a raycast result
     *  @param {Object}  fixture
     *  @param {Vector2} point
     *  @param {Vector2} normal
     *  @param {number}  fraction */
    constructor(fixture, point, normal, fraction)
    {
        /** @property {Box2dObject} - The box2d object */
        this.object   = fixture.GetBody().object;
        /** @property {Object} - The fixture that was hit */
        this.fixture  = fixture;
        /** @property {Vector2} - The hit point */
        this.point    = point;
        /** @property {Vector2} - The hit normal */
        this.normal   = normal;
        /** @property {number} - Distance fraction at the point of intersection */
        this.fraction = fraction;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Joint
 * - Base class for Box2D joints 
 * - A joint is used to connect objects together
 */
class Box2dJoint
{
    /** Create a box2d joint, the base class is not intended to be used directly
     *  @param {Object} jointDef */
    constructor(jointDef)
    {
        this.box2dJoint = box2d.castObjectType(box2d.world.CreateJoint(jointDef));
    }

    /** Destroy this joint */
    destroy() { box2d.world.DestroyJoint(this.box2dJoint); this.box2dJoint = 0; }

    /** Get the first object attached to this joint
     *  @return {Box2dObject} */
    getObjectA() { return this.box2dJoint.GetBodyA().object; }
    
    /** Get the second object attached to this joint
     *  @return {Box2dObject} */
    getObjectB() { return this.box2dJoint.GetBodyB().object; }
    
    /** Get the first anchor for this joint in world coordinates
     *  @return {Vector2} */
    getAnchorA() { return box2d.vec2From(this.box2dJoint.GetAnchorA());}

    /** Get the second anchor for this joint in world coordinates
     *  @return {Vector2} */
    getAnchorB() { return box2d.vec2From(this.box2dJoint.GetAnchorB());}
    
    /** Get the reaction force on bodyB at the joint anchor given a time step
     *  @param {number} time
     *  @return {Vector2} */
    getReactionForce(time)  { return box2d.vec2From(this.box2dJoint.GetReactionForce(1/time));}

    /** Get the reaction torque on bodyB in N*m given a time step
     *  @param {number} time
     *  @return {number} */
    getReactionTorque(time) { return this.box2dJoint.GetReactionTorque(1/time);}
    
    /** Check if the connected bodies should collide
     *  @return {boolean} */
    getCollideConnected()   { return this.box2dJoint.getCollideConnected();}

    /** Check if either connected body is active
     *  @return {boolean} */
    isActive() { return this.box2dJoint.IsActive();}
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Target Joint, also known as a mouse joint
 * - Used to make a point on a object track a specific world point target
 * - This a soft constraint with a max force
 * - This allows the constraint to stretch and without applying huge forces
 * @extends Box2dJoint
 */
class Box2dTargetJoint extends Box2dJoint
{
    /** Create a target joint
     *  @param {Box2dObject} object
     *  @param {Box2dObject} fixedObject
     *  @param {Vector2} worldPos */
    constructor(object, fixedObject, worldPos)
    {
        object.setAwake();
        const jointDef = new box2d.instance.b2MouseJointDef();
        jointDef.set_bodyA(fixedObject.body);
        jointDef.set_bodyB(object.body);
        jointDef.set_target(box2d.vec2dTo(worldPos));
        jointDef.set_maxForce(2e3 * object.getMass());
        super(jointDef);
    }

    /** Set the target point in world coordinates
     *  @param {Vector2} pos */
    setTarget(pos) { this.box2dJoint.SetTarget(box2d.vec2dTo(pos)); }
    
    /** Get the target point in world coordinates
     *  @return {Vector2} */
    getTarget(){ return box2d.vec2From(this.box2dJoint.GetTarget()); }

    /** Sets the maximum force in Newtons
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }
    
    /** Gets the maximum force in Newtons
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }
    
    /** Sets the joint frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(hz); }
    
    /** Gets the joint frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Distance Joint
 * - Constrains two points on two objects to remain at a fixed distance
 * - You can view this as a massless, rigid rod
 * @extends Box2dJoint
 */
class Box2dDistanceJoint extends Box2dJoint
{
    /** Create a distance joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchorA
     *  @param {Vector2} anchorB
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchorA, anchorB, collide=false)
    {
        anchorA ||= box2d.vec2From(objectA.body.GetPosition());
        anchorB ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchorA);
        const localAnchorB = objectB.worldToLocal(anchorB);
        const jointDef = new box2d.instance.b2DistanceJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_length(anchorA.distance(anchorB));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    
    /** Set the length of the joint
     *  @param {number} length */
    setLength(length) { this.box2dJoint.SetLength(length); }
    
    /** Get the length of the joint
     *  @return {number} */
    getLength() { return this.box2dJoint.GetLength(); }
    
    /** Set the frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(hz); }
    
    /** Get the frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }
    
    /** Set the damping ratio
     *  @param {number} ratio */
    setDampingRatio(ratio) { this.box2dJoint.SetDampingRatio(ratio); }
    
    /** Get the damping ratio
     *  @return {number} */
    getDampingRatio() { return this.box2dJoint.GetDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Pin Joint
 * - Pins two objects together at a point
 * @extends Box2dDistanceJoint
 */
class Box2dPinJoint extends Box2dDistanceJoint
{
    /** Create a pin joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [pos]
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, pos=objectA.pos, collide=false)
    {
        super(objectA, objectB, undefined, pos, collide);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Rope Joint
 * - Enforces a maximum distance between two points on two objects
 * @extends Box2dJoint
 */
class Box2dRopeJoint extends Box2dJoint
{
    /** Create a rope joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchorA
     *  @param {Vector2} anchorB
     *  @param {number} extraLength
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchorA, anchorB, extraLength=0, collide=false)
    {
        anchorA ||= box2d.vec2From(objectA.body.GetPosition());
        anchorB ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchorA);
        const localAnchorB = objectB.worldToLocal(anchorB);
        const jointDef = new box2d.instance.b2RopeJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_maxLength(anchorA.distance(anchorB)+extraLength);
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    
    /** Set the max length of the joint
     *  @param {number} length */
    setMaxLength(length) { this.box2dJoint.SetMaxLength(length); }

    /** Get the max length of the joint
     *  @return {number} */
    getMaxLength() { return this.box2dJoint.GetMaxLength(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Revolute Joint
 * - Constrains two objects to share a point while they are free to rotate around the point
 * - The relative rotation about the shared point is the joint angle
 * - You can limit the relative rotation with a joint limit
 * - You can use a motor to drive the relative rotation about the shared point
 * - A maximum motor torque is provided so that infinite forces are not generated
 * @extends Box2dJoint
 */
class Box2dRevoluteJoint extends Box2dJoint
{
    /** Create a revolute joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2RevoluteJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the reference angle, objectB angle minus objectA angle in the reference state 
     *  @return {number} */
    getReferenceAngle() { return this.box2dJoint.GetReferenceAngle(); }

    /** Get the current joint angle
     *  @return {number} */
    getJointAngle() { return this.box2dJoint.GetJointAngle(); }

    /** Get the current joint angle speed in radians per second
     *  @return {number} */
    getJointSpeed() { return this.box2dJoint.GetJointSpeed(); }

    /** Is the joint limit enabled?
     *  @return {boolean} */
    isLimitEnabled() { return this.box2dJoint.IsLimitEnabled(); }

    /** Enable/disable the joint limit
     *  @param {boolean} [enable] */
    enableLimit(enable=true) { return this.box2dJoint.enableLimit(enable); }

    /** Get the lower joint limit
     *  @return {number} */
    getLowerLimit() { return this.box2dJoint.GetLowerLimit(); }

    /** Get the upper joint limit
     *  @return {number} */
    getUpperLimit() { return this.box2dJoint.GetUpperLimit(); }

    /** Set the joint limits
     *  @param {number} min
     *  @param {number} max */
    setLimits(min, max) { return this.box2dJoint.SetLimits(min, max); }

    /** Is the joint motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }

    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }

    /** Set the motor speed
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(speed); }

    /** Get the motor speed
     *  @return {number} */
    getMotorSpeed() { return this.box2dJoint.GetMotorSpeed(); }

    /** Set the motor torque
     *  @param {number} torque */
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }

    /** Get the max motor torque
     *  @return {number} */
    getMaxMotorTorque() { return this.box2dJoint.GetMaxMotorTorque(); }

    /** Get the motor torque given a time step
     *  @param {number} time 
     *  @return {number} */
    getMotorTorque(time) { return this.box2dJoint.GetMotorTorque(1/time); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Gear Joint
 * - A gear joint is used to connect two joints together
 * - Either joint can be a revolute or prismatic joint
 * - You specify a gear ratio to bind the motions together
 * @extends Box2dJoint
 */
class Box2dGearJoint extends Box2dJoint
{
    /** Create a gear joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Box2dJoint} joint1
     *  @param {Box2dJoint} joint2
     *  @param {ratio} [ratio] */
    constructor(objectA, objectB, joint1, joint2, ratio=1)
    {
        const jointDef = new box2d.instance.b2GearJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_joint1(joint1.box2dJoint);
        jointDef.set_joint2(joint2.box2dJoint);
        jointDef.set_ratio(ratio);
        super(jointDef);

        this.joint1 = joint1;
        this.joint2 = joint2;
    }

    /** Get the first joint
     *  @return {Box2dJoint} */
    getJoint1() { return this.joint1; }

    /** Get the second joint
     *  @return {Box2dJoint} */
    getJoint2() { return this.joint2; }

    /** Set the gear ratio
     *  @param {number} ratio */
    setRatio(ratio) { return this.box2dJoint.SetRatio(ratio); }

    /** Get the gear ratio
     *  @return {number} */
    getRatio() { return this.box2dJoint.GetRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Prismatic Joint
 * - Provides one degree of freedom: translation along an axis fixed in objectA
 * - Relative rotation is prevented
 * - You can use a joint limit to restrict the range of motion
 * - You can use a joint motor to drive the motion or to model joint friction
 * @extends Box2dJoint
 */
class Box2dPrismaticJoint extends Box2dJoint
{
    /** Create a prismatic joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {Vector2} worldAxis
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const localAxisA = objectB.worldToLocalVector(worldAxis);
        const jointDef = new box2d.instance.b2PrismaticJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_localAxisA(box2d.vec2dTo(localAxisA));
        jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the local joint axis relative to bodyA
     *  @return {Vector2} */
    getLocalAxisA() { return box2d.vec2From(this.box2dJoint.GetLocalAxisA()); }
    
    /** Get the reference angle
     *  @return {number} */
    getReferenceAngle() { return this.box2dJoint.GetReferenceAngle(); }

    /** Get the current joint translation
     *  @return {number} */
    getJointTranslation() { return this.box2dJoint.GetJointTranslation(); }
    
    /** Get the current joint translation speed
     *  @return {number} */
    getJointSpeed() { return this.box2dJoint.GetJointSpeed(); }
    
    /** Is the joint limit enabled?
     *  @return {boolean} */
    isLimitEnabled() { return this.box2dJoint.IsLimitEnabled(); }
    
    /** Enable/disable the joint limit
     *  @param {boolean} [enable] */
    enableLimit(enable=true) { return this.box2dJoint.enableLimit(enable); }
    
    /** Get the lower joint limit
     *  @return {number} */
    getLowerLimit() { return this.box2dJoint.GetLowerLimit(); }
    
    /** Get the upper joint limit
     *  @return {number} */
    getUpperLimit() { return this.box2dJoint.GetUpperLimit(); }
    
    /** Set the joint limits
     *  @param {number} min
     *  @param {number} max */
    setLimits(min, max) { return this.box2dJoint.SetLimits(min, max); }
    
    /** Is the motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }
    
    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }
    
    /** Set the motor speed
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(speed); }
    
    /** Get the motor speed
     *  @return {number} */
    getMotorSpeed() { return this.box2dJoint.GetMotorSpeed(); }
    
    /** Set the maximum motor force
     *  @param {number} force */
    setMaxMotorForce(force) { return this.box2dJoint.SetMaxMotorForce(force); }
    
    /** Get the maximum motor force
     *  @return {number} */
    getMaxMotorForce() { return this.box2dJoint.GetMaxMotorForce(); }
    
    /** Get the motor force given a time step
     *  @param {number} time
     *  @return {number} */
    getMotorForce(time) { return this.box2dJoint.GetMotorForce(1/time); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Wheel Joint
 * - Provides two degrees of freedom: translation along an axis fixed in objectA and rotation
 * - You can use a joint limit to restrict the range of motion
 * - You can use a joint motor to drive the motion or to model joint friction
 * - This joint is designed for vehicle suspensions
 * @extends Box2dJoint
 */
class Box2dWheelJoint extends Box2dJoint
{
    /** Create a wheel joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {Vector2} worldAxis
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const localAxisA = objectB.worldToLocalVector(worldAxis);
        const jointDef = new box2d.instance.b2WheelJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_localAxisA(box2d.vec2dTo(localAxisA));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the local joint axis relative to bodyA
     *  @return {Vector2} */
    getLocalAxisA() { return box2d.vec2From(this.box2dJoint.GetLocalAxisA()); }

    /** Get the current joint translation
     *  @return {number} */
    getJointTranslation() { return this.box2dJoint.GetJointTranslation(); }

    /** Get the current joint translation speed
     *  @return {number} */
    getJointSpeed() { return this.box2dJoint.GetJointSpeed(); }

    /** Is the joint motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }

    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }

    /** Set the motor speed
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(speed); }

    /** Get the motor speed
     *  @return {number} */
    getMotorSpeed() { return this.box2dJoint.GetMotorSpeed(); }

    /** Set the maximum motor torque
     *  @param {number} torque */
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }

    /** Get the max motor torque
     *  @return {number} */
    getMaxMotorTorque() { return this.box2dJoint.GetMaxMotorTorque(); }

    /** Get the motor torque for a time step
     *  @return {number} */
    getMotorTorque(time) { return this.box2dJoint.GetMotorTorque(1/time); }

    /** Set the spring frequency in Hertz
     *  @param {number} hz */
    setSpringFrequencyHz(hz) { return this.box2dJoint.SetSpringFrequencyHz(hz); }

    /** Get the spring frequency in Hertz
     *  @return {number} */
    getSpringFrequencyHz() { return this.box2dJoint.GetSpringFrequencyHz(); }

    /** Set the spring damping ratio
     *  @param {number} ratio */
    setSpringDampingRatio(ratio) { return this.box2dJoint.SetSpringDampingRatio(ratio); }

    /** Get the spring damping ratio
     *  @return {number} */
    getSpringDampingRatio() { return this.box2dJoint.GetSpringDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Weld Joint
 * - Glues two objects together
 * @extends Box2dJoint
 */
class Box2dWeldJoint extends Box2dJoint
{
    /** Create a weld joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2WeldJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the reference angle
     *  @return {number} */
    getReferenceAngle() { return this.box2dJoint.GetReferenceAngle(); }

    /** Set the frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { return this.box2dJoint.SetFrequency(hz); }

    /** Get the frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }

    /** Set the damping ratio
     *  @param {number} ratio */
    setSpringDampingRatio(ratio) { return this.box2dJoint.SetSpringDampingRatio(ratio); }

    /** Get the damping ratio
     *  @return {number} */
    getSpringDampingRatio() { return this.box2dJoint.GetSpringDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Friction Joint
 * - Used to apply top-down friction
 * - Provides 2D translational friction and angular friction
 * @extends Box2dJoint
 */
class Box2dFrictionJoint extends Box2dJoint
{
    /** Create a friction joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} anchor
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2FrictionJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Set the maximum friction force
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }

    /** Get the maximum friction force
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }

    /** Set the maximum friction torque
     *  @param {number} torque */
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(torque); }

    /** Get the maximum friction torque
     *  @return {number} */
    getMaxTorque() { return this.box2dJoint.GetMaxTorque(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Pulley Joint
 * - Connects to two objects and two fixed ground points
 * - The pulley supports a ratio such that: length1 + ratio * length2 <= constant
 * - The force transmitted is scaled by the ratio
 * @extends Box2dJoint
 */
class Box2dPulleyJoint extends Box2dJoint
{
    /** Create a pulley joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} groundAnchorA
     *  @param {Vector2} groundAnchorB
     *  @param {Vector2} anchorA
     *  @param {Vector2} anchorB
     *  @param {number}  [ratio]
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, groundAnchorA, groundAnchorB, anchorA, anchorB, ratio=1, collide=false)
    {
        anchorA ||= box2d.vec2From(objectA.body.GetPosition());
        anchorB ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchorA);
        const localAnchorB = objectB.worldToLocal(anchorB);
        const jointDef = new box2d.instance.b2PulleyJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_groundAnchorA(box2d.vec2dTo(groundAnchorA));
        jointDef.set_groundAnchorB(box2d.vec2dTo(groundAnchorB));
        jointDef.set_localAnchorA(box2d.vec2dTo(localAnchorA));
        jointDef.set_localAnchorB(box2d.vec2dTo(localAnchorB));
        jointDef.set_ratio(ratio);
        jointDef.set_lengthA(groundAnchorA.distance(anchorA));
        jointDef.set_lengthB(groundAnchorB.distance(anchorB));
        jointDef.set_collideConnected(collide);
        super(jointDef);
    }

    /** Get the first ground anchor
     *  @return {Vector2} */
    getGroundAnchorA() { return box2d.vec2From(this.box2dJoint.GetGroundAnchorA()); }

    /** Get the second ground anchor
     *  @return {Vector2} */
    getGroundAnchorB() { return box2d.vec2From(this.box2dJoint.GetGroundAnchorB()); }

    /** Get the current length of the segment attached to objectA
     *  @return {number} */
    getLengthA() { return this.box2dJoint.GetLengthA(); }

    /** Get the current length of the segment attached to objectB
     *  @return {number} */
    getLengthB(){ return this.box2dJoint.GetLengthB(); }

    /** Get the pulley ratio
     *  @return {number} */
    getRatio() { return this.box2dJoint.GetRatio(); }

    /** Get the current length of the segment attached to objectA
     *  @return {number} */
    getCurrentLengthA() { return this.box2dJoint.GetCurrentLengthA(); }

    /** Get the current length of the segment attached to objectB
     *  @return {number} */
    getCurrentLengthB() { return this.box2dJoint.GetCurrentLengthB(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Motor Joint
 * - Controls the relative motion between two objects
 * - Typical usage is to control the movement of a object with respect to the ground
 * @extends Box2dJoint
 */
class Box2dMotorJoint extends Box2dJoint
{
    /** Create a motor joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB */
    constructor(objectA, objectB)
    {
        const linearOffset = objectA.worldToLocal(box2d.vec2From(objectB.body.GetPosition()));
        const angularOffset = objectB.body.GetAngle() - objectA.body.GetAngle();
        const jointDef = new box2d.instance.b2MotorJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_linearOffset(box2d.vec2dTo(linearOffset));
        jointDef.set_angularOffset(angularOffset);
        super(jointDef);
    }

    /** Set the target linear offset, in frame A, in meters.
     *  @param {Vector2} offset */
    setLinearOffset(offset) { this.box2dJoint.SetLinearOffset(box2d.vec2dTo(offset)); }

    /** Get the target linear offset, in frame A, in meters.
     *  @return {Vector2} */
    getLinearOffset() { return box2d.vec2From(this.box2dJoint.GetLinearOffset()); }

    /** Set the target angular offset
     *  @param {number} offset */
    setAngularOffset(offset) { this.box2dJoint.SetAngularOffset(offset); }

    /** Get the target angular offset
     *  @return {number} */
    getAngularOffset() { return this.box2dJoint.GetAngularOffset(); }

    /** Set the maximum friction force
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }

    /** Get the maximum friction force
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }

    /** Set the maximum torque
     *  @param {number} torque */
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(torque); }

    /** Get the maximum torque
     *  @return {number} */
    getMaxTorque() { return this.box2dJoint.GetMaxTorque(); }

    /** Set the position correction factor in the range [0,1]
     *  @param {number} factor */
    setCorrectionFactor(factor) { this.box2dJoint.SetCorrectionFactor(factor); }

    /** Get the position correction factor in the range [0,1]
     *  @return {number} */
    getCorrectionFactor() { return this.box2dJoint.GetCorrectionFactor(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Global Object
 * - Wraps Box2d world and provides global functions
 */
class Box2dPlugin
{
    /** Create the global UI system object
     *  @param {Object} instance */
    constructor(instance)
    {
        ASSERT(!box2d, 'Box2D already initialized');
        box2d = this;
        this.instance = instance;
        this.world = new box2d.instance.b2World();

        /** @property {number} - Velocity iterations per update*/
        this.velocityIterations = 8;
        /** @property {number} - Position iterations per update*/
        this.positionIterations = 3;
        /** @property {number} - Static, zero mass, zero velocity, may be manually moved */
        this.bodyTypeStatic = instance.b2_staticBody;
        /** @property {number} - Kinematic, zero mass, non-zero velocity set by user, moved by solver */
        this.bodyTypeKinematic = instance.b2_kinematicBody;
        /** @property {number} - Dynamic, positive mass, non-zero velocity determined by forces, moved by solver */
        this.bodyTypeDynamic = instance.b2_dynamicBody;

        // setup contact listener
        const listener = new box2d.instance.JSContactListener();
        listener.BeginContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            objectA.beginContact(objectB);
            objectB.beginContact(objectA);
        }
        listener.EndContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            objectA.endContact(objectB);
            objectB.endContact(objectA);
        };
        listener.PreSolve  = function() {};
        listener.PostSolve = function() {};
        box2d.world.SetContactListener(listener);
    }

    /** Step the physics world simulation
     *  @param {number} [frames] */
    step(frames=1)
    {
        box2d.world.SetGravity(box2d.vec2dTo(gravity));
        for (let i=frames; i--;)
            box2d.world.Step(timeDelta, this.velocityIterations, this.positionIterations);
    }

    ///////////////////////////////////////////////////////////////////////////////
    // raycasting and querying

    /** raycast and return a list of all the results
     *  @param {Vector2} start 
     *  @param {Vector2} end */
    raycastAll(start, end)
    {
        const raycastCallback = new box2d.instance.JSRayCastCallback();
        raycastCallback.ReportFixture = function(fixturePointer, point, normal, fraction)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            point  = box2d.vec2FromPointer(point);
            normal = box2d.vec2FromPointer(normal);
            raycastResults.push(new Box2dRaycastResult(fixture, point, normal, fraction));
            return 1; // continue getting results
        };

        const raycastResults = [];
        box2d.world.RayCast(raycastCallback, box2d.vec2dTo(start), box2d.vec2dTo(end));
        debugRaycast && debugLine(start, end, raycastResults.length ? '#f00' : '#00f', .02);
        return raycastResults;
    }

    /** raycast and return the first result
     *  @param {Vector2} start 
     *  @param {Vector2} end */
    raycast(start, end)
    {
        const raycastResults = box2d.raycastAll(start, end);
        if (!raycastResults.length)
            return undefined;
        return raycastResults.reduce((a,b)=>a.fraction < b.fraction ? a : b);
    }

    /** box aabb cast and return all the objects
     *  @param {Vector2} pos 
     *  @param {Vector2} size */
    boxCastAll(pos, size)
    {
        const queryCallback = new box2d.instance.JSQueryCallback();
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            const o = fixture.GetBody().object;
            if (!queryObjects.includes(o))
                queryObjects.push(o); // add if not already in list
            return true; // continue getting results
        };

        const aabb = new box2d.instance.b2AABB();
        aabb.set_lowerBound(box2d.vec2dTo(pos.subtract(size.scale(.5))));
        aabb.set_upperBound(box2d.vec2dTo(pos.add(size.scale(.5))));

        let queryObjects = [];
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, size, queryObjects.length ? '#f00' : '#00f', .02);
        return queryObjects;
    }

    /** box aabb cast and return the first object
     *  @param {Vector2} pos 
     *  @param {Vector2} size */
    boxCast(pos, size)
    {
        const queryCallback = new box2d.instance.JSQueryCallback();
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            queryObject = fixture.GetBody().object;
            return false; // stop getting results
        };

        const aabb = new box2d.instance.b2AABB();
        aabb.set_lowerBound(box2d.vec2dTo(pos.subtract(size.scale(.5))));
        aabb.set_upperBound(box2d.vec2dTo(pos.add(size.scale(.5))));

        let queryObject;
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, size, queryObject ? '#f00' : '#00f', .02);
        return queryObject;
    }

    /** circle cast and return all the objects
     *  @param {Vector2} pos 
     *  @param {number} diameter */
    circleCastAll(pos, diameter)
    {
        const radius2 = (diameter/2)**2;
        const results = box2d.boxCastAll(pos, vec2(diameter));
        return results.filter(o=>o.pos.distanceSquared(pos) < radius2);
    }

    /** circle cast and return the first object
     *  @param {Vector2} pos 
     *  @param {number} diameter */
    circleCast(pos, diameter)
    {
        const radius2 = (diameter/2)**2;
        let results = box2d.boxCastAll(pos, vec2(diameter));

        let bestResult, bestDistance2;
        for (const result of results)
        {
            const distance2 = result.pos.distanceSquared(pos);
            if (distance2 < radius2 && (!bestResult || distance2 < bestDistance2))
            {
                bestResult = result;
                bestDistance2 = distance2;
            }
        }
        return bestResult;
    }

    /** point cast and return the first object
     *  @param {Vector2} pos 
     *  @param {boolean} dynamicOnly */
    pointCast(pos, dynamicOnly=true)
    {
        const queryCallback = new box2d.instance.JSQueryCallback();
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            if (dynamicOnly && fixture.GetBody().GetType() != box2d.instance.b2_dynamicBody)
                return true; // continue getting results
            if (!fixture.TestPoint(box2d.vec2dTo(pos)))
                return true; // continue getting results
            queryObject = fixture.GetBody().object;
            return false; // stop getting results
        };

        const aabb = new box2d.instance.b2AABB();
        aabb.set_lowerBound(box2d.vec2dTo(pos));
        aabb.set_upperBound(box2d.vec2dTo(pos));

        let queryObject;
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, vec2(), queryObject ? '#f00' : '#00f', .02);
        return queryObject;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // drawing

    /** draws a fixture
     *  @param {Object} fixture
     *  @param {Vector2} pos
     *  @param {number} angle
     *  @param {Color} [color]
     *  @param {Color} [outlineColor]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixture(fixture, pos, angle, color=WHITE, outlineColor=BLACK, lineWidth=.1, context=mainContext)
    {
        const shape = box2d.castObjectType(fixture.GetShape());
        switch (shape.GetType())
        {
            case box2d.instance.b2Shape.e_polygon:
            {
                let points = [];
                for (let i=shape.GetVertexCount(); i--;)
                    points.push(box2d.vec2From(shape.GetVertex(i)));
                box2d.drawPoly(pos, angle, points, color, outlineColor, lineWidth, context);
                break;
            }
            case box2d.instance.b2Shape.e_circle:
            {
                const radius = shape.get_m_radius();
                box2d.drawCircle(pos, radius, color, outlineColor, lineWidth, context);
                break;
            }
            case box2d.instance.b2Shape.e_edge:
            {
                const v1 = box2d.vec2From(shape.get_m_vertex1());
                const v2 = box2d.vec2From(shape.get_m_vertex2());
                box2d.drawLine(pos, angle, v1, v2, color, lineWidth, context);
                break;
            }
        }
    }

    /** draws a circle
     *  @param {Vector2} pos
     *  @param {number} radius
     *  @param {Color} [color]
     *  @param {Color} [outlineColor]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawCircle(pos, radius, color=WHITE, outlineColor=BLACK, lineWidth=.1, context=mainContext)
    {
        drawCanvas2D(pos, vec2(1), 0, 0, context=>
        {
            context.beginPath();
            context.arc(0, 0, radius, 0, 9);
            box2d.drawFillStroke(color, outlineColor, lineWidth, context);
        }, 0, context);
    }

    /** draws a polygon
     *  @param {Vector2} pos
     *  @param {number} angle
     *  @param {Array<Vector2>} points
     *  @param {Color} [color]
     *  @param {Color} [outlineColor]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawPoly(pos, angle, points, color=WHITE, outlineColor=BLACK, lineWidth=.1, context=mainContext)
    {
        drawCanvas2D(pos, vec2(1), angle, 0, context=>
        {
            context.beginPath();
            points.forEach(p=>context.lineTo(p.x, p.y));
            context.closePath();
            box2d.drawFillStroke(color, outlineColor, lineWidth, context);
        }, 0, context);
    }

    /** draws a line
     *  @param {Vector2} pos
     *  @param {number} angle
     *  @param {Vector2} posA
     *  @param {Vector2} posB
     *  @param {Color} [color]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawLine(pos, angle, posA, posB, color=WHITE, lineWidth=.1, context=mainContext)
    {
        drawCanvas2D(pos, vec2(1), angle, 0, context=>
        {
            context.beginPath();
            context.lineTo(posA.x, posA.y);
            context.lineTo(posB.x, posB.y);
            box2d.drawFillStroke(0, color, lineWidth, context);
        }, 0, context);
    }

    /** performs a fill or stroke as a helper to the other draw functions
     *  @param {Color} [color]
     *  @param {Color} [outlineColor]
     *  @param {number} [lineWidth]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFillStroke(color=WHITE, outlineColor=BLACK, lineWidth=.1, context=mainContext)
    {
        if (color)
        {
            context.fillStyle = color.toString();
            context.fill();
        }
        if (outlineColor && lineWidth)
        {
            context.lineWidth = lineWidth;
            context.lineJoin = context.lineCap = 'round';
            context.strokeStyle = outlineColor.toString();
            context.stroke();
        }
    }

    ///////////////////////////////////////////////////////////////////////////////
    // helper functions

    /** converts a box2d vec2 to a Vector2
     *  @param {Object} v */
    vec2From(v)
    {
        ASSERT(v instanceof box2d.instance.b2Vec2);
        return new Vector2(v.get_x(), v.get_y()); 
    }

    /** converts a box2d vec2 pointer to a Vector2
     *  @param {Object} v */
    vec2FromPointer(v)
    {
        return box2d.vec2From(box2d.instance.wrapPointer(v, box2d.instance.b2Vec2));
    }

    /** converts a Vector2 to a box2 vec2
     *  @param {Vector2} v */
    vec2dTo(v)
    {
        ASSERT(v instanceof Vector2);
        return new box2d.instance.b2Vec2(v.x, v.y);
    }

    /** checks if a box2d object is null
     *  @param {Object} o */
    isNull(o) { return !box2d.instance.getPointer(o); }

    /** casts a box2d object to its correct type
     *  @param {Object} o */
    castObjectType(o)
    {
        switch (o.GetType())
        {
            case box2d.instance.b2Shape.e_circle:
                return box2d.instance.castObject(o, box2d.instance.b2CircleShape);
            case box2d.instance.b2Shape.e_edge:
                return box2d.instance.castObject(o, box2d.instance.b2EdgeShape);
            case box2d.instance.b2Shape.e_polygon:
                return box2d.instance.castObject(o, box2d.instance.b2PolygonShape);
            case box2d.instance.b2Shape.e_chain:
                return box2d.instance.castObject(o, box2d.instance.b2ChainShape);
            case box2d.instance.e_revoluteJoint:
                return box2d.instance.castObject(o, box2d.instance.b2RevoluteJoint);
            case box2d.instance.e_prismaticJoint:
                return box2d.instance.castObject(o, box2d.instance.b2PrismaticJoint);
            case box2d.instance.e_distanceJoint:
                return box2d.instance.castObject(o, box2d.instance.b2DistanceJoint);
            case box2d.instance.e_pulleyJoint:
                return box2d.instance.castObject(o, box2d.instance.b2PulleyJoint);
            case box2d.instance.e_mouseJoint:
                return box2d.instance.castObject(o, box2d.instance.b2MouseJoint);
            case box2d.instance.e_gearJoint:
                return box2d.instance.castObject(o, box2d.instance.b2GearJoint);
            case box2d.instance.e_wheelJoint:
                return box2d.instance.castObject(o, box2d.instance.b2WheelJoint);
            case box2d.instance.e_weldJoint:
                return box2d.instance.castObject(o, box2d.instance.b2WeldJoint);
            case box2d.instance.e_frictionJoint:
                return box2d.instance.castObject(o, box2d.instance.b2FrictionJoint);
            case box2d.instance.e_ropeJoint:
                return box2d.instance.castObject(o, box2d.instance.b2RopeJoint);
            case box2d.instance.e_motorJoint:
                return box2d.instance.castObject(o, box2d.instance.b2MotorJoint);
        }
        
        ASSERT(false, 'Unknown box2d object type');
    }
}

///////////////////////////////////////////////////////////////////////////////
/** Box2d Init - Call with await before starting LittleJS to init box2d
 *  @return {Promise<Box2dPlugin>}
 *  @memberof Box2D */
async function box2dInit()
{
    // load box2d
    new Box2dPlugin(await Box2D());
    setupDebugDraw();
    engineAddPlugin(box2dUpdate, box2dRender);
    return box2d;

    // add the box2d plugin to the engine
    function box2dUpdate()
    {
        if (!paused)
            box2d.step();
    }
    function box2dRender()
    {
        if (box2dDebug || debugPhysics && debugOverlay)
            box2d.world.DrawDebugData();
    }
    
    // box2d debug drawing
    function setupDebugDraw()
    {
        // setup debug draw
        const debugDraw = new box2d.instance.JSDraw();
        const box2dColor = (c)=> new Color(c.get_r(), c.get_g(), c.get_b());
        const box2dColorPointer = (c)=>
            box2dColor(box2d.instance.wrapPointer(c, box2d.instance.b2Color));
        const getDebugColor = (color)=>box2dColorPointer(color).scale(1,.8);
        const getPointsList = (vertices, vertexCount) =>
        {
            const points = [];
            for (let i=vertexCount; i--;)
                points.push(box2d.vec2FromPointer(vertices+i*8));
            return points;
        }
        debugDraw.DrawSegment = function(point1, point2, color)
        {
            color = getDebugColor(color);
            point1 = box2d.vec2FromPointer(point1);
            point2 = box2d.vec2FromPointer(point2);
            box2d.drawLine(vec2(), 0, point1, point2, color, undefined, overlayContext);
        };
        debugDraw.DrawPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            box2d.drawPoly(vec2(), 0, points, undefined, color, undefined, overlayContext);
        };
        debugDraw.DrawSolidPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            box2d.drawPoly(vec2(), 0, points, color, color, undefined, overlayContext);
        };
        debugDraw.DrawCircle = function(center, radius, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            box2d.drawCircle(center, radius, undefined, color, undefined, overlayContext);
        };
        debugDraw.DrawSolidCircle = function(center, radius, axis, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            axis = box2d.vec2FromPointer(axis).scale(radius);
            box2d.drawCircle(center, radius, color, color, undefined, overlayContext);
            box2d.drawLine(center, 0, vec2(), axis, color, undefined, overlayContext);
        };
        debugDraw.DrawTransform = function(transform)
        {
            transform = box2d.instance.wrapPointer(transform, box2d.instance.b2Transform);
            const pos = vec2(transform.get_p());
            const angle = -transform.get_q().GetAngle();
            const p1 = vec2(1,0), c1 = rgb(.75,0,0,.8);
            const p2 = vec2(0,1), c2 = rgb(0,.75,0,.8);
            box2d.drawLine(pos, angle, vec2(), p1, c1, undefined, overlayContext);
            box2d.drawLine(pos, angle, vec2(), p2, c2, undefined, overlayContext);
        }
            
        debugDraw.AppendFlags(box2d.instance.b2Draw.e_shapeBit);
        debugDraw.AppendFlags(box2d.instance.b2Draw.e_jointBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_aabbBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_pairBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_centerOfMassBit);
        box2d.world.SetDebugDraw(debugDraw);
    }
}
