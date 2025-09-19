/**
 * LittleJS Box2D Physics Plugin
 * - Box2dObject extends EngineObject with Box2D physics
 * - Uses box2d.js super fast web assembly port of Box2D
 * - More info: https://github.com/kripken/box2d.js
 * - Fully wraps everything in Box2d
 * - Functions to create polygon, circle, and edge shapes
 * - Raycasting and querying
 * - Joint creation
 * - Contact begin and end callbacks
 * - Debug physics drawing
 * - Call box2dEngineInit to start instead of normal engineInit
 * - You allso will need to include the box2d wasm.js file
 * @namespace Plugins
 */

'use strict';
 
/** Global Box2d Plugin object
 *  @type {Box2dPlugin}
 *  @memberof Box2dPlugin */
let box2d;

/** Enable Box2D debug drawing
 *  @type {boolean}
 *  @default
 *  @memberof Box2dPlugin */
let box2dDebug = false;

/** Static body type - zero mass, zero velocity, may be manually moved
 *  @type {number}
 *  @default
 *  @memberof Box2dPlugin */
const box2dBodyTypeStatic = 0;

/** Kinematic body type - zero mass, non-zero velocity set by user, moved by solver
 *  @type {number}
 *  @default
 *  @memberof Box2dPlugin */
const box2dBodyTypeKinematic = 1;

/** Dynamic body type - positive mass, non-zero velocity determined by forces, moved by solver
 *  @type {number}
 *  @default
 *  @memberof Box2dPlugin */
const box2dBodyTypeDynamic = 2;

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
    constructor(pos=vec2(), size, tileInfo, angle=0, color, bodyType=box2dBodyTypeDynamic, renderOrder=0)
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

    destroy()
    {
        // destroy physics body, fixtures, and joints
        this.body && box2d.world.DestroyBody(this.body);
        this.body = 0;
        super.destroy();
    }

    update()
    {
        // use box2d physics update
        this.pos = box2d.vec2From(this.body.GetPosition());
        this.angle = -this.body.GetAngle();
    }

    render()
    {
        // use default render or draw fixtures
        if (this.tileInfo)
            super.render();
        else
            this.drawFixtures(this.color, this.outlineColor, this.lineWidth);
    }

    renderDebugInfo()
    {
        const isAsleep = !this.getIsAwake();
        const isStatic = this.getIsStatic();
        const color = rgb(isAsleep?1:0 ,isAsleep?1:0, isStatic?1:0, .5);
        this.drawFixtures(color);
    }

    drawFixtures(fillColor=WHITE, outlineColor, lineWidth=.1)
    {
        this.getFixtureList().forEach(fixture=>
            box2d.drawFixture(fixture, this.pos, this.angle, fillColor, outlineColor, lineWidth));
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics contact callbacks

    beginContact(otherObject, contact) {}
    endContact(otherObject, contact)   {}

    ///////////////////////////////////////////////////////////////////////////////
    // physics fixtures and shapes

    addFixture(fixtureDef) { return this.body.CreateFixture(fixtureDef); }
    addShape(shape, density=1, friction=.2, restitution=0, isSensor=false)
    {
        const fd = new box2d.instance.b2FixtureDef();
        fd.set_shape(shape);
        fd.set_density(density);
        fd.set_friction(friction);
        fd.set_restitution(restitution);
        fd.set_isSensor(isSensor);
        return this.addFixture(fd);
    }

    addBox(size=vec2(1), offset=vec2(), angle=0, density, friction, restitution, isSensor)
    {
        const shape = new box2d.instance.b2PolygonShape();
        shape.SetAsBox(size.x/2, size.y/2, box2d.vec2dTo(offset), angle);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

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

    addRegularPoly(diameter=1, sides=8, density, friction, restitution, isSensor)
    {
        const points = [];
        const radius = diameter/2;
        for (let i=sides; i--;)
            points.push(vec2(radius,0).rotate((i+.5)/sides*PI*2));
        return this.addPoly(points, density, friction, restitution, isSensor);
    }

    addRandomPoly(diameter=1, density, friction, restitution, isSensor)
    {
        const sides = randInt(3, 9);
        const points = [];
        const radius = diameter/2;
        for (let i=sides; i--;)
            points.push(vec2(rand(radius/2,radius*1.5),0).rotate(i/sides*PI*2));
        return this.addPoly(points, density, friction, restitution, isSensor);
    }

    addCircle(diameter=1, offset=vec2(), density, friction, restitution, isSensor)
    {
        const shape = new box2d.instance.b2CircleShape();
        shape.set_m_p(box2d.vec2dTo(offset));
        shape.set_m_radius(diameter/2);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    addEdge(point1, point2, density, friction, restitution, isSensor)
    {
        const shape = new box2d.instance.b2EdgeShape();
        shape.Set(box2d.vec2dTo(point1), box2d.vec2dTo(point2));
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

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
    // lists of fixtures and joints

    hasFixtures() { return !box2d.isNull(this.body.GetFixtureList()); }
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

    hasJoints() { return !box2d.isNull(this.body.GetJointList()); }
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

    ///////////////////////////////////////////////////////////////////////////////
    // physics get functions

    getCenterOfMass()    { return box2d.vec2From(this.body.GetWorldCenter()); }
    getLinearVelocity()  { return box2d.vec2From(this.body.GetLinearVelocity()); }
    getAngularVelocity() { return this.body.GetAngularVelocity(); }
    getMass()            { return this.body.GetMass(); }
    getInertia()         { return this.body.GetInertia(); }
    getIsAwake()         { return this.body.IsAwake(); }
    getBodyType()        { return this.body.GetType(); }
    getIsStatic()        { return this.getBodyType() == box2dBodyTypeStatic; }
    getIsKinematic()     { return this.getBodyType() == box2dBodyTypeStatic; }
    getIsDynamic()       { return this.getBodyType() == box2dBodyTypeDynamic; }
    
    ///////////////////////////////////////////////////////////////////////////////
    // physics set functions

    setTransform(position, angle)
    {
        this.pos = position;
        this.angle = angle;
        this.body.SetTransform(box2d.vec2dTo(position), angle);
    }
    setPosition(position) { this.setTransform(position, this.body.GetAngle()); }
    setAngle(angle)       { this.setTransform(box2d.vec2From(this.body.GetPosition()), -angle); }
    setLinearVelocity(velocity) { this.body.SetLinearVelocity(box2d.vec2dTo(velocity)); }
    setAngularVelocity(angularVelocity) { this.body.SetAngularVelocity(angularVelocity); }
    setLinearDamping(damping)  { this.body.SetLinearDamping(damping); }
    setAngularDamping(damping) { this.body.SetAngularDamping(damping); }
    setGravityScale(scale=1)   { this.body.SetGravityScale(this.gravityScale = scale); }
    setBullet(isBullet=true)   { this.body.SetBullet(isBullet); }
    setAwake(isAwake=true)     { this.body.SetAwake(isAwake); }
    setBodyType(type)          { this.body.SetType(type); }
    setSleepingAllowed(isAllowed=true) { this.body.SetSleepingAllowed(isAllowed); }
    setFixedRotation(isFixed=true)     { this.body.SetFixedRotation(isFixed); }
    setCenterOfMass(center)      { this.setMassData(center) }
    setMass(mass)                { this.setMassData(undefined, mass) }
    setMomentOfInertia(I)        { this.setMassData(undefined, undefined, I) }
    resetMassData()              { this.body.ResetMassData(); }
    setMassData(localCenter, mass, momentOfInertia)
    {
        const data = new box2d.instance.b2MassData();
        this.body.GetMassData(data);
        localCenter && data.set_center(box2d.vec2dTo(localCenter));
        mass && data.set_mass(mass);
        momentOfInertia && data.set_I(momentOfInertia);
        this.body.SetMassData(data);
    }
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
    setSensor(isSensor=true)
    { this.getFixtureList().forEach(f=>f.SetSensor(isSensor)); }

    ///////////////////////////////////////////////////////////////////////////////
    // physics force and torque functions

    applyForce(force, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyForce(box2d.vec2dTo(force), box2d.vec2dTo(pos));
    }
    applyAcceleration(acceleration, pos)
    { 
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyLinearImpulse(box2d.vec2dTo(acceleration), box2d.vec2dTo(pos));
    }
    applyTorque(torque)
    {
        this.setAwake();
        this.body.ApplyTorque(torque);
    }
    applyAngularAcceleration(acceleration)
    {
        this.setAwake();
        this.ApplyAngularImpulse(acceleration);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Raycast Result
 * - Results from a box2d raycast queries
 */
class Box2dRaycastResult
{
    constructor(fixture, point, normal, fraction)
    {
        this.object   = fixture.GetBody().object;
        this.fixture  = fixture;
        this.point    = point;
        this.normal   = normal;
        this.fraction = fraction;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Joint
 * - Base class for Box2D joints 
 * - A jointis used to connect objects together
 */
class Box2dJoint
{
    constructor(jointDef)
    {
        this.box2dJoint = box2d.castObjectType(box2d.world.CreateJoint(jointDef));
    }

    destroy() { box2d.world.DestroyJoint(this.box2dJoint); this.box2dJoint = 0; }
    getObjectA() { return this.box2dJoint.GetBodyA().object; }
    getObjectB() { return this.box2dJoint.GetBodyB().object; }
    getAnchorA() { return box2d.vec2From(this.box2dJoint.GetAnchorA());}
    getAnchorB() { return box2d.vec2From(this.box2dJoint.GetAnchorB());}
    getReactionForce(time)  { return box2d.vec2From(this.box2dJoint.GetReactionForce(1/time));}
    getReactionTorque(time) { return this.box2dJoint.GetReactionTorque(1/time);}
    getCollideConnected()   { return this.box2dJoint.getCollideConnected();}
    isActive() { return this.box2dJoint.IsActive();}
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Target Joint
 * - Used to make a point on a object track a specific world point target
 * - This a soft constraint with a max force
 * - This allows the constraint to stretch and without applying huge forces
 * - Implements Box2d Mouse Joint
 * @extends Box2dJoint
 */
class Box2dTargetJoint extends Box2dJoint
{
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

    setTarget(pos)     { this.box2dJoint.SetTarget(box2d.vec2dTo(pos)); }
    getTarget()        { return box2d.vec2From(this.box2dJoint.GetTarget()); }
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }
    getMaxForce()      { return this.box2dJoint.GetMaxForce(); }
    setFrequency(hz)   { this.box2dJoint.SetFrequency(hz); }
    getFrequency()     { return this.box2dJoint.GetFrequency(); }
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

    getLocalAnchorA()      { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB()      { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    setLength()            { this.box2dJoint.SetLength(length); }
    getLength()            { return this.box2dJoint.GetLength(); }
    setFrequency(hz)       { this.box2dJoint.SetFrequency(hz); }
    getFrequency()         { return this.box2dJoint.GetFrequency(); }
    setDampingRatio(ratio) { this.box2dJoint.SetDampingRatio(ratio); }
    getDampingRatio()      { return this.box2dJoint.GetDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Pin Joint
 * - Pins two objects together at a point
 * @extends Box2dDistanceJoint
 */
class Box2dPinJoint extends Box2dDistanceJoint
{
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

    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    setMaxLength()    { this.box2dJoint.SetMaxLength(length); }
    getMaxLength()    { return this.box2dJoint.GetMaxLength(); }
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

    getLocalAnchorA()         { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB()         { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    getReferenceAngle()       { return this.box2dJoint.GetReferenceAngle(); }
    getJointAngle()           { return this.box2dJoint.GetJointAngle(); }
    getJointSpeed()           { return this.box2dJoint.GetJointSpeed(); }
    isLimitEnabled()          { return this.box2dJoint.IsLimitEnabled(); }
    enableLimit(enable)       { return this.box2dJoint.enableLimit(enable); }
    getLowerLimit()           { return this.box2dJoint.GetLowerLimit(); }
    getUpperLimit()           { return this.box2dJoint.GetUpperLimit(); }
    setLimits(min, max)       { return this.box2dJoint.SetLimits(min, max); }
    isMotorEnabled()          { return this.box2dJoint.IsMotorEnabled(); }
    enableMotor(enable)       { return this.box2dJoint.EnableMotor(enable); }
    setMotorSpeed(speed)      { return this.box2dJoint.SetMotorSpeed(speed); }
    getMotorSpeed()           { return this.box2dJoint.GetMotorSpeed(); }
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }
    getMaxMotorTorque()       { return this.box2dJoint.GetMaxMotorTorque(); }
    getMotorTorque(time)      { return this.box2dJoint.GetMotorTorque(1/time); }
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

    getJoint1()     { return this.joint1; }
    getJoint2()     { return this.joint2; }
    setRatio(ratio) { return this.box2dJoint.SetRatio(ratio); }
    getRatio()      { return this.box2dJoint.GetRatio(); }
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

    getLocalAnchorA()       { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB()       { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    getLocalAxisA()         { return box2d.vec2From(this.box2dJoint.GetLocalAxisA()); }
    getReferenceAngle()     { return this.box2dJoint.GetReferenceAngle(); }
    getJointTranslation()   { return this.box2dJoint.GetJointTranslation(); }
    getJointSpeed()         { return this.box2dJoint.GetJointSpeed(); }
    isLimitEnabled()        { return this.box2dJoint.IsLimitEnabled(); }
    enableLimit(enable)     { return this.box2dJoint.enableLimit(enable); }
    getLowerLimit()         { return this.box2dJoint.GetLowerLimit(); }
    getUpperLimit()         { return this.box2dJoint.GetUpperLimit(); }
    setLimits(min, max)     { return this.box2dJoint.SetLimits(min, max); }
    isMotorEnabled()        { return this.box2dJoint.IsMotorEnabled(); }
    enableMotor(enable)     { return this.box2dJoint.EnableMotor(enable); }
    setMotorSpeed(speed)    { return this.box2dJoint.SetMotorSpeed(speed); }
    getMotorSpeed()         { return this.box2dJoint.GetMotorSpeed(); }
    setMaxMotorForce(force) { return this.box2dJoint.SetMaxMotorForce(force); }
    getMaxMotorForce()      { return this.box2dJoint.GetMaxMotorForce(); }
    getMotorForce(time)     { return this.box2dJoint.GetMotorForce(1/time); }
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

    getLocalAnchorA()            { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB()            { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    getLocalAxisA()              { return box2d.vec2From(this.box2dJoint.GetLocalAxisA()); }
    getJointTranslation()        { return this.box2dJoint.GetJointTranslation(); }
    getJointSpeed()              { return this.box2dJoint.GetJointSpeed(); }
    isMotorEnabled()             { return this.box2dJoint.IsMotorEnabled(); }
    enableMotor(enable)          { return this.box2dJoint.EnableMotor(enable); }
    setMotorSpeed(speed)         { return this.box2dJoint.SetMotorSpeed(speed); }
    getMotorSpeed()              { return this.box2dJoint.GetMotorSpeed(); }
    setMaxMotorTorque(torque)    { return this.box2dJoint.SetMaxMotorTorque(torque); }
    getMaxMotorTorque()          { return this.box2dJoint.GetMaxMotorTorque(); }
    getMotorTorque(time)         { return this.box2dJoint.GetMotorTorque(1/time); }
    setSpringFrequencyHz(hz)     { return this.box2dJoint.SetSpringFrequencyHz(hz); }
    getSpringFrequencyHz()       { return this.box2dJoint.GetSpringFrequencyHz(); }
    setSpringDampingRatio(ratio) { return this.box2dJoint.SetSpringDampingRatio(ratio); }
    getSpringDampingRatio()      { return this.box2dJoint.GetSpringDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Weld Joint
 * - Glues two objects together
 * @extends Box2dJoint
 */
class Box2dWeldJoint extends Box2dJoint
{
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

    getLocalAnchorA()            { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB()            { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    getReferenceAngle()          { return this.box2dJoint.GetReferenceAngle(); }
    setFrequency(hz)             { return this.box2dJoint.SetFrequency(hz); }
    getFrequency()               { return this.box2dJoint.GetFrequency(); }
    setSpringDampingRatio(ratio) { return this.box2dJoint.SetSpringDampingRatio(ratio); }
    getSpringDampingRatio()      { return this.box2dJoint.GetSpringDampingRatio(); }
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

    getLocalAnchorA()    { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }
    getLocalAnchorB()    { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }
    setMaxForce(force)   { this.box2dJoint.SetMaxForce(force); }
    getMaxForce()        { return this.box2dJoint.GetMaxForce(); }
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(torque); }
    getMaxTorque()       { return this.box2dJoint.GetMaxTorque(); }
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

    getGroundAnchorA()  { return box2d.vec2From(this.box2dJoint.GetGroundAnchorA()); }
    getGroundAnchorB()  { return box2d.vec2From(this.box2dJoint.GetGroundAnchorB()); }
    getLengthA()        { return this.box2dJoint.GetLengthA(); }
    getLengthB()        { return this.box2dJoint.GetLengthB(); }
    getRatio()          { return this.box2dJoint.GetRatio(); }
    getCurrentLengthA() { return this.box2dJoint.GetCurrentLengthA(); }
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

    setLinearOffset(offset)     { this.box2dJoint.SetLinearOffset(box2d.vec2dTo(offset)); }
    getLinearOffset()           { return box2d.vec2From(this.box2dJoint.GetLinearOffset()); }
    setAngularOffset(offset)    { this.box2dJoint.SetAngularOffset(offset); }
    getAngularOffset()          { return box2d.vec2From(this.box2dJoint.GetAngularOffset()); }
    setMaxForce(force)          { this.box2dJoint.SetMaxForce(force); }
    getMaxForce()               { return box2d.vec2From(this.box2dJoint.GetMaxForce()); }
    setMaxTorque(torque)        { this.box2dJoint.SetMaxTorque(torque); }
    getMaxTorque()              { return box2d.vec2From(this.box2dJoint.GetMaxTorque()); }
    setCorrectionFactor(factor) { this.box2dJoint.SetCorrectionFactor(factor); }
    getCorrectionFactor()       { return box2d.vec2From(this.box2dJoint.GetCorrectionFactor()); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Global Object
 * - Wraps Box2d world and provides global functions
 */
class Box2dPlugin
{
    constructor(instance, stepIterations=3)
    {
        ASSERT(!box2d, 'Box2D already initialized');
        ASSERT(box2dBodyTypeStatic == instance.b2_staticBody);
        ASSERT(box2dBodyTypeKinematic == instance.b2_kinematicBody);
        ASSERT(box2dBodyTypeDynamic == instance.b2_dynamicBody);

        // setup box2d
        box2d = this;
        this.instance = instance;
        this.world = new box2d.instance.b2World();
        this.stepIterations = stepIterations;

        // setup contact listener
        const listener = new box2d.instance.JSContactListener();
        listener.BeginContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            objectA.beginContact(objectB, contact);
            objectB.beginContact(objectA, contact);
        }
        listener.EndContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            objectA.endContact(objectB, contact);
            objectB.endContact(objectA, contact);
        };
        listener.PreSolve  = function() {};
        listener.PostSolve = function() {};
        box2d.world.SetContactListener(listener);
    }

    step(frames=1)
    {
        box2d.world.SetGravity(box2d.vec2dTo(vec2(0,gravity)));
        for (let i=frames; i--;)
            box2d.world.Step(timeDelta, this.stepIterations, this.stepIterations);
    }

    ///////////////////////////////////////////////////////////////////////////////
    // raycasting and querying
        
    // raycast and return a list of all the results
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

    // raycast and return the first result
    raycast(start, end)
    {
        const raycastResults = box2d.raycastAll(start, end);
        if (!raycastResults.length)
            return undefined;
        return raycastResults.reduce((a,b)=>a.fraction < b.fraction ? a : b);
    }

    // box aabb cast and return all the objects
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

    // box aabb cast and return the first object
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

    // circle cast and return all the objects
    circleCastAll(pos, diameter)
    {
        const radius2 = (diameter/2)**2;
        const results = box2d.boxCastAll(pos, vec2(diameter));
        return results.filter(o=>o.pos.distanceSquared(pos) < radius2);
    }

    // circle cast and return the first object
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

    // point cast and return the first object
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
        debugRaycast && debugRect(pos, vec2(), queryObject ? '#f00' : '#00f', .02);
        box2d.world.QueryAABB(queryCallback, aabb);
        return queryObject;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // drawing

    drawFixture(fixture, pos, angle, fillColor, outlineColor, lineWidth)
    {
        const shape = box2d.castObjectType(fixture.GetShape());
        switch (shape.GetType())
        {
            case box2d.instance.b2Shape.e_polygon:
            {
                let points = [];
                for (let i=shape.GetVertexCount(); i--;)
                    points.push(box2d.vec2From(shape.GetVertex(i)));
                this.drawPoly(pos, angle, points, fillColor, outlineColor, lineWidth);
                break;
            }
            case box2d.instance.b2Shape.e_circle:
            {
                const radius = shape.get_m_radius();
                this.drawCircle(pos, radius, fillColor, outlineColor, lineWidth);
                break;
            }
            case box2d.instance.b2Shape.e_edge:
            {
                const v1 = box2d.vec2From(shape.get_m_vertex1());
                const v2 = box2d.vec2From(shape.get_m_vertex2());
                this.drawLine(pos, angle, v1, v2, fillColor, lineWidth);
                break;
            }
        }
    }

    drawCircle(pos, radius, color=WHITE, outlineColor, lineWidth=.1, context)
    {
        drawCanvas2D(pos, vec2(1), 0, 0, context=>
        {
            context.beginPath();
            context.arc(0, 0, radius, 0, 9);
            box2d.drawFillStroke(context, color, outlineColor, lineWidth);
        }, 0, context);
    }

    drawPoly(pos, angle, points, color=WHITE, outlineColor, lineWidth=.1, context)
    {
        drawCanvas2D(pos, vec2(1), angle, 0, context=>
        {
            context.beginPath();
            points.forEach(p=>context.lineTo(p.x, p.y));
            context.closePath();
            box2d.drawFillStroke(context, color, outlineColor, lineWidth);
        }, 0, context);
    }

    drawLine(pos, angle, posA, posB, color=WHITE, lineWidth=.1, context)
    {
        drawCanvas2D(pos, vec2(1), angle, 0, context=>
        {
            context.beginPath();
            context.lineTo(posA.x, posA.y);
            context.lineTo(posB.x, posB.y);
            box2d.drawFillStroke(context, 0, color, lineWidth);
        }, 0, context);
    }

    drawFillStroke(context, color, outlineColor, lineWidth)
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

    vec2From(v)
    {
        ASSERT(v instanceof box2d.instance.b2Vec2);
        return new Vector2(v.get_x(), v.get_y()); 
    }

    vec2FromPointer(v)
    {
        return box2d.vec2From(box2d.instance.wrapPointer(v, box2d.instance.b2Vec2));
    }

    vec2dTo(v)
    {
        ASSERT(v instanceof Vector2);
        return new box2d.instance.b2Vec2(v.x, v.y);
    }

    isNull(object) { return !box2d.instance.getPointer(object); }

    castObjectType(object)
    {
        if (object instanceof box2d.instance.b2Shape)
        {
            switch (object.GetType())
            {
                case box2d.instance.b2Shape.e_circle:
                    return box2d.instance.castObject(object, box2d.instance.b2CircleShape);
                case box2d.instance.b2Shape.e_edge:
                    return box2d.instance.castObject(object, box2d.instance.b2EdgeShape);
                case box2d.instance.b2Shape.e_polygon:
                    return box2d.instance.castObject(object, box2d.instance.b2PolygonShape);
                case box2d.instance.b2Shape.e_chain:
                    return box2d.instance.castObject(object, box2d.instance.b2ChainShape);
            }
        }
        else if (object instanceof box2d.instance.b2Joint)
        {
            switch (object.GetType())
            {
                case box2d.instance.e_revoluteJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2RevoluteJoint);
                case box2d.instance.e_prismaticJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2PrismaticJoint);
                case box2d.instance.e_distanceJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2DistanceJoint);
                case box2d.instance.e_pulleyJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2PulleyJoint);
                case box2d.instance.e_mouseJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2MouseJoint);
                case box2d.instance.e_gearJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2GearJoint);
                case box2d.instance.e_wheelJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2WheelJoint);
                case box2d.instance.e_weldJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2WeldJoint);
                case box2d.instance.e_frictionJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2FrictionJoint);
                case box2d.instance.e_ropeJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2RopeJoint);
                case box2d.instance.e_motorJoint:
                    return box2d.instance.castObject(object, box2d.instance.b2MotorJoint);
            }
        }
        
        ASSERT(false, 'Unknown object type');
    }
}

///////////////////////////////////////////////////////////////////////////////
/** Box2d Init - Startup LittleJS engine with your callback functions
 *  @param {Function|function():Promise} gameInit - Called once after the engine starts up
 *  @param {Function} gameUpdate - Called every frame before objects are updated
 *  @param {Function} gameUpdatePost - Called after physics and objects are updated, even when paused
 *  @param {Function} gameRender - Called before objects are rendered, for drawing the background
 *  @param {Function} gameRenderPost - Called after objects are rendered, useful for drawing UI
 *  @param {Array<string>} [imageSources=[]] - List of images to load
 *  @param {HTMLElement} [rootElement] - Root element to attach to, the document body by default
 *  @memberof Box2dPlugin */
function box2dEngineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources, rootElement)
{
    Box2D().then(box2dInstance=>
    {
        // create box2d object
        new Box2dPlugin(box2dInstance);
        setupDebugDraw();

        // start littlejs
        engineAddPlugin(box2dUpdate, box2dRender);
        engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources, rootElement);
    });

    // hook up box2d plugin to update and render
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
            return points
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
            const p1 = vec2(1,0), c1 = rgb(.75,0,0,.8)
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
