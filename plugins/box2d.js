/**
 * LittleJS Box2D Plugin
 * - Box2dObject extends EngineObject with Box2D physics
 * - Uses box2d.js super fast web assembly port of Box2D
 * - More info: https://github.com/kripken/box2d.js
 * - Functions to create polygon, circle, and edge shapes
 * - Raycasting and querying
 * - Joint creation
 * - Contact begin and end callbacks
 * - Debug physics drawing
 * - Call box2dEngineInit to start
 */

'use strict';

let box2d;
let box2dWorld;
let box2dDebugDraw;
let box2dDebug = false;
let box2dStepIterations = 3;
const box2dBodyTypeStatic    = 0;
const box2dBodyTypeKinematic = 1;
const box2dBodyTypeDynamic   = 2;

///////////////////////////////////////////////////////////////////////////////
// Box2D Object - extend with your own custom physics objects

class Box2dObject extends EngineObject 
{
    constructor(pos=vec2(), size, tileInfo, angle=0, color, bodyType=box2dBodyTypeDynamic, renderOrder=0)
    {
        super(pos, size, tileInfo, angle, color, renderOrder);

        // create physics body
        const bodyDef = new box2d.b2BodyDef();
        bodyDef.set_type(bodyType);
        bodyDef.set_position(pos.getBox2d());
        bodyDef.set_angle(-angle);
        this.body = box2dWorld.CreateBody(bodyDef);
        this.body.object = this;
        this.outlineColor = BLACK;
    }

    destroy()
    {
        // destroy physics body, fixtures, and joints
        this.body && box2dWorld.DestroyBody(this.body);
        this.body = 0;
        super.destroy();
    }

    update()
    {
        // use box2d physics update
        this.pos.setBox2d(this.body.GetPosition());
        this.angle = -this.body.GetAngle();
    }

    render()
    {
        // use default render or draw fixtures
        if (this.tileInfo)
            super.render();
        else
            this.box2dDrawFixtures(this.color, this.outlineColor, this.lineWidth);
    }

    renderDebugInfo()
    {
        const isAsleep = !this.getIsAwake();
        const isStatic = this.getIsStatic();
        const color = rgb(isAsleep,isAsleep,isStatic,.5);
        this.box2dDrawFixtures(color);
    }

    box2dDrawFixtures(fillColor=WHITE, outlineColor, lineWidth=.1)
    {
        this.getFixtureList().forEach(fixture=>
            box2dDrawFixture(fixture, this.pos, this.angle, fillColor, outlineColor, lineWidth));
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics contact callbacks

    beginContact(otherObject, contact) {}
    endContact(otherObject, contact)   {}

    ///////////////////////////////////////////////////////////////////////////////
    // physics fixtures and shapes

    addFixture(fixtureDef) { return this.body.CreateFixture(fixtureDef); }
    addShape(shape, density, friction, restitution, isSensor)
    {
        const fd = box2dCreateFixtureDef(shape, density, friction, restitution, isSensor);
        return this.addFixture(fd);
    }

    addBox(size=vec2(1), offset=vec2(), angle=0, density, friction, restitution, isSensor)
    {
        const shape = new box2d.b2PolygonShape();
        shape.SetAsBox(size.x/2, size.y/2, offset.getBox2d(), angle);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    addPoly(points, density, friction, restitution, isSensor)
    {
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
        const shape = new box2d.b2CircleShape();
        shape.set_m_p(offset.getBox2d());
        shape.set_m_radius(diameter/2);
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    addEdge(point1, point2, density, friction, restitution, isSensor)
    {
        const shape = new box2d.b2EdgeShape();
        shape.Set(point1.getBox2d(), point2.getBox2d());
        return this.addShape(shape, density, friction, restitution, isSensor);
    }

    addEdgeLoop(points, density, friction, restitution, isSensor)
    {
        const fixtures = [];
        const getPoint = i=> points[mod(i,points.length)];
        for (let i=0; i<points.length; ++i)
        {
            const shape = new box2d.b2EdgeShape();
            shape.set_m_vertex0(getPoint(i-1).getBox2d());
            shape.set_m_vertex1(getPoint(i+0).getBox2d());
            shape.set_m_vertex2(getPoint(i+1).getBox2d());
            shape.set_m_vertex3(getPoint(i+2).getBox2d());
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
            const shape = new box2d.b2EdgeShape();
            points[i-1] && shape.set_m_vertex0(points[i-1].getBox2d());
            points[i+0] && shape.set_m_vertex1(points[i+0].getBox2d());
            points[i+1] && shape.set_m_vertex2(points[i+1].getBox2d());
            points[i+2] && shape.set_m_vertex3(points[i+2].getBox2d());
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            fixtures.push(f);
        }
        return fixtures;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // lists of fixtures and joints

    hasFixtures() { return !box2dIsNull(this.body.GetFixtureList()); }
    getFixtureList()
    {
        const fixtures = [];
        for (let fixture=this.body.GetFixtureList(); !box2dIsNull(fixture); )
        {
            fixtures.push(fixture);
            fixture = fixture.GetNext();
        }
        return fixtures;
    }

    hasJoints() { return !box2dIsNull(this.body.GetJointList()); }
    getJointList()
    {
        const joints = [];
        for (let joint=this.body.GetJointList(); !box2dIsNull(joint); )
        {
            joints.push(joint);
            joint = joint.get_next();
        }
        return joints;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics get functions

    getCenterOfMass()    { return vec2(this.body.GetWorldCenter()); }
    getLinearVelocity()  { return vec2(this.body.GetLinearVelocity()); }
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
        this.body.SetTransform(position.getBox2d(), angle);
    }
    setPosition(position) { this.setTransform(position, this.body.GetAngle()); }
    setAngle(angle)       { this.setTransform(vec2(this.body.GetPosition()), -angle); }
    setLinearVelocity(velocity) { this.body.SetLinearVelocity(velocity.getBox2d()); }
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
        const data = new box2d.b2MassData();
        this.body.GetMassData(data);
        localCenter && data.set_center(localCenter.getBox2d());
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
        this.body.ApplyForce(force.getBox2d(), pos.getBox2d());
    }
    applyAcceleration(acceleration, pos)
    { 
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyLinearImpulse(acceleration.getBox2d(), pos.getBox2d());
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
// Box2D Raycasting and Querying

// result info for raycasts
class Box2dRaycastResult
{
    constructor(fixture, point, normal, fraction)
    {
        this.fixture  = fixture;
        this.point    = point;
        this.normal   = normal;
        this.fraction = fraction;
        this.object   = fixture.GetBody().object;
    }
}

// raycast and return a list of all the results
function box2dRaycastAll(start, end)
{
    const raycastCallback = new box2d.JSRayCastCallback();
    raycastCallback.ReportFixture = function(fixturePointer, point, normal, fraction)
    {
        const fixture = box2d.wrapPointer(fixturePointer, box2d.b2Fixture);
        point  = vec2().setBox2dPointer(point);
        normal = vec2().setBox2dPointer(normal);
        raycastResults.push(new Box2dRaycastResult(fixture, point, normal, fraction));
        return 1; // continue getting results
    };

    const raycastResults = [];
    box2dWorld.RayCast(raycastCallback, start.getBox2d(), end.getBox2d());
    debugRaycast && debugLine(start, end, raycastResults.length ? '#f00' : '#00f', .02);
    return raycastResults;
}

// raycast and return the first result
function box2dRaycast(start, end)
{
    const raycastResults = box2dRaycastAll(start, end);
    if (!raycastResults.length)
        return undefined;
    return raycastResults.reduce((a,b)=>a.fraction < b.fraction ? a : b);
}

// box aabb cast and return all the objects
function box2dBoxCastAll(pos, size)
{
    const queryCallback = new box2d.JSQueryCallback();
    queryCallback.ReportFixture = function(fixturePointer)
    {
        const fixture = box2d.wrapPointer(fixturePointer, box2d.b2Fixture);
        const o = fixture.GetBody().object;
        if (!queryObjects.includes(o))
            queryObjects.push(o); // add if not already in list
        return true; // continue getting results
    };

    const aabb = new box2d.b2AABB();
    aabb.set_lowerBound(pos.subtract(size.scale(.5)).getBox2d());
    aabb.set_upperBound(pos.add(size.scale(.5)).getBox2d());

    let queryObjects = [];
    box2dWorld.QueryAABB(queryCallback, aabb);
    debugRaycast && debugRect(pos, size, raycstResult ? '#f00' : '#00f', .02);
    return queryObjects;
}

// box aabb cast and return the first object
function box2dBoxCast(pos, size)
{
    const queryCallback = new box2d.JSQueryCallback();
    queryCallback.ReportFixture = function(fixturePointer)
    {
        const fixture = box2d.wrapPointer(fixturePointer, box2d.b2Fixture);
        queryObject = fixture.GetBody().object;
        return false; // stop getting results
    };

    const aabb = new box2d.b2AABB();
    aabb.set_lowerBound(pos.subtract(size.scale(.5)).getBox2d());
    aabb.set_upperBound(pos.add(size.scale(.5)).getBox2d());

    let queryObject;
    box2dWorld.QueryAABB(queryCallback, aabb);
    debugRaycast && debugRect(pos, size, raycstResult ? '#f00' : '#00f', .02);
    return queryObject;
}

// circle cast and return all the objects
function box2dCircleCastAll(pos, diameter)
{
    const radius2 = (diameter/2)**2;
    const results = box2dBoxCastAll(pos, vec2(diameter));
    return results.filter(o=>o.pos.distanceSquared(pos) < radius2);
}

// circle cast and return the first object
function box2dCircleCast(pos, diameter)
{
    const radius2 = (diameter/2)**2;
    let results = box2dBoxCastAll(pos, vec2(diameter));

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
function box2dPointCast(pos, dynamicOnly=true)
{
    const queryCallback = new box2d.JSQueryCallback();
    queryCallback.ReportFixture = function(fixturePointer)
    {
        const fixture = box2d.wrapPointer(fixturePointer, box2d.b2Fixture);
        if (dynamicOnly && fixture.GetBody().GetType() != box2d.b2_dynamicBody)
            return true; // continue getting results
        if (!fixture.TestPoint(pos.getBox2d()))
            return true; // continue getting results
        queryResult = fixture.GetBody().object;
        return false; // stop getting results
    };

    const aabb = new box2d.b2AABB();
    aabb.set_lowerBound(pos.getBox2d());
    aabb.set_upperBound(pos.getBox2d());

    let queryResult;
    debugRaycast && debugRect(pos, vec2(), queryResult ? '#f00' : '#00f', .02);
    box2dWorld.QueryAABB(queryCallback, aabb);
    return queryResult;
}

// box aabb cast and return all the fixtures
function box2dBoxCastAllFixtures(pos, size)
{
    const queryCallback = new box2d.JSQueryCallback();
    queryCallback.ReportFixture = function(fixturePointer)
    {
        const fixture = box2d.wrapPointer(fixturePointer, box2d.b2Fixture);
        if (!queryObjects.includes(fixture))
            queryObjects.push(fixture); // add if not already in list
        return true; // continue getting results
    };

    const aabb = new box2d.b2AABB();
    aabb.set_lowerBound(pos.subtract(size.scale(.5)).getBox2d());
    aabb.set_upperBound(pos.add(size.scale(.5)).getBox2d());

    let queryFixtures = [];
    box2dWorld.QueryAABB(queryCallback, aabb);
    debugRaycast && debugRect(pos, size, raycstResult ? '#f00' : '#00f', .02);
    return queryFixtures;
}

///////////////////////////////////////////////////////////////////////////////
// Box2D Joints

function box2dCreateMouseJoint(object, fixedObject, worldPos)
{
    object.setAwake();
    const jointDef = new box2d.b2MouseJointDef();
    jointDef.set_bodyA(fixedObject.body);
    jointDef.set_bodyB(object.body);
    jointDef.set_target(worldPos.getBox2d());
    jointDef.set_maxForce(2e3 * object.getMass());
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreatePinJoint(objectA, objectB, collide=false)
{
    return box2dCreateDistanceJoint(objectA, objectB, objectB.pos, undefined, collide);
}

function box2dCreateDistanceJoint(objectA, objectB, anchorA, anchorB, collide=false)
{
    anchorA ||= vec2(objectA.body.GetPosition());
    anchorB ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchorA);
    const localAnchorB = objectB.worldToLocal(anchorB);
    const jointDef = new box2d.b2DistanceJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_length(anchorA.distance(anchorB));
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateRevoluteJoint(objectA, objectB, anchor, collide=false)
{
    anchor ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchor);
    const localAnchorB = objectB.worldToLocal(anchor);
    const jointDef = new box2d.b2RevoluteJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreatePrismaticJoint(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
{
    anchor ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchor);
    const localAnchorB = objectB.worldToLocal(anchor);
    const localAxisA = objectB.worldToLocalVector(worldAxis);
    const jointDef = new box2d.b2PrismaticJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_localAxisA(localAxisA.getBox2d());
    jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateWheelJoint(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
{
    anchor ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchor);
    const localAnchorB = objectB.worldToLocal(anchor);
    const localAxisA = objectB.worldToLocalVector(worldAxis);
    const jointDef = new box2d.b2WheelJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_localAxisA(localAxisA.getBox2d());
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateWeldJoint(objectA, objectB, anchor, collide=false)
{
    anchor ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchor);
    const localAnchorB = objectB.worldToLocal(anchor);
    const jointDef = new box2d.b2WeldJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_referenceAngle(objectA.body.GetAngle() - objectB.body.GetAngle());
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateFrictionJoint(objectA, objectB, anchor, collide=false)
{
    anchor ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchor);
    const localAnchorB = objectB.worldToLocal(anchor);
    const jointDef = new box2d.b2FrictionJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateRopeJoint(objectA, objectB, anchorA, anchorB, extraLength=0, collide=false)
{
    anchorA ||= vec2(objectA.body.GetPosition());
    anchorB ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchorA);
    const localAnchorB = objectB.worldToLocal(anchorB);
    const jointDef = new box2d.b2RopeJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_maxLength(anchorA.distance(anchorB)+extraLength);
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreatePulleyJoint(objectA, objectB, groundAnchorA, groundAnchorB, anchorA, anchorB, ratio=1, collide=false)
{
    anchorA ||= vec2(objectA.body.GetPosition());
    anchorB ||= vec2(objectB.body.GetPosition());
    const localAnchorA = objectA.worldToLocal(anchorA);
    const localAnchorB = objectB.worldToLocal(anchorB);
    const jointDef = new box2d.b2PulleyJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_groundAnchorA(groundAnchorA.getBox2d());
    jointDef.set_groundAnchorB(groundAnchorB.getBox2d());
    jointDef.set_localAnchorA(localAnchorA.getBox2d());
    jointDef.set_localAnchorB(localAnchorB.getBox2d());
    jointDef.set_ratio(ratio);
    jointDef.set_lengthA(groundAnchorA.distance(anchorA));
    jointDef.set_lengthB(groundAnchorB.distance(anchorB));
    jointDef.set_collideConnected(collide);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateMotorJoint(objectA, objectB)
{
    const linearOffset = objectA.worldToLocal(vec2(objectB.body.GetPosition()));
    const angularOffset = objectB.body.GetAngle() - objectA.body.GetAngle();
    const jointDef = new box2d.b2MotorJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_linearOffset(linearOffset.getBox2d());
    jointDef.set_angularOffset(angularOffset);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dCreateGearJoint(objectA, objectB, joint1, joint2, ratio=1)
{
    const jointDef = new box2d.b2GearJointDef();
    jointDef.set_bodyA(objectA.body);
    jointDef.set_bodyB(objectB.body);
    jointDef.set_joint1(joint1);
    jointDef.set_joint2(joint2);
    jointDef.set_ratio(ratio);
    return box2dCastObject(box2dWorld.CreateJoint(jointDef));
}

function box2dDestroyJoint(joint) { box2dWorld.DestroyJoint(joint); }

///////////////////////////////////////////////////////////////////////////////
// Box2D Helper Functions

function box2dIsNull(object) { return !box2d.getPointer(object); }

function box2dCreateFixtureDef(shape, density=1, friction=.2, restitution=0, isSensor=false)
{
    const fd = new box2d.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(density);
    fd.set_friction(friction);
    fd.set_restitution(restitution);
    fd.set_isSensor(isSensor);
    return fd;
}

function box2dCreatePointList(points)
{     
    const buffer = box2d._malloc(points.length * 8);
    for (let i=0, offset=0; i<points.length; ++i)
    {
        box2d.HEAPF32[buffer + offset >> 2] = points[i].x;
        offset += 4;
        box2d.HEAPF32[buffer + offset >> 2] = points[i].y;
        offset += 4;
    }            
    return box2d.wrapPointer(buffer, box2d.b2Vec2);
}

function box2dCreatePolygonShape(points)
{
    ASSERT(3 <= points.length && points.length <= 8);
    const shape = new box2d.b2PolygonShape();    
    const box2dPoints = box2dCreatePointList(points);
    shape.Set(box2dPoints, points.length);
    return shape;
}

function box2dCastObject(object)
{
    if (object instanceof box2d.b2Shape)
    {
        switch (object.GetType())
        {
            case box2d.b2Shape.e_circle:
                return box2d.castObject(object, box2d.b2CircleShape);
            case box2d.b2Shape.e_edge:
                return box2d.castObject(object, box2d.b2EdgeShape);
            case box2d.b2Shape.e_polygon:
                return box2d.castObject(object, box2d.b2PolygonShape);
            case box2d.b2Shape.e_chain:
                return box2d.castObject(object, box2d.b2ChainShape);
        }
    }
    else if (object instanceof box2d.b2Joint)
    {
        switch (object.GetType())
        {
            case box2d.e_revoluteJoint:
                return box2d.castObject(object, box2d.b2RevoluteJoint);
            case box2d.e_prismaticJoint:
                return box2d.castObject(object, box2d.b2PrismaticJoint);
            case box2d.e_distanceJoint:
                return box2d.castObject(object, box2d.b2DistanceJoint);
            case box2d.e_pulleyJoint:
                return box2d.castObject(object, box2d.b2PulleyJoint);
            case box2d.e_mouseJoint:
                return box2d.castObject(object, box2d.b2MouseJoint);
            case box2d.e_gearJoint:
                return box2d.castObject(object, box2d.b2GearJoint);
            case box2d.e_wheelJoint:
                return box2d.castObject(object, box2d.b2WheelJoint);
            case box2d.e_weldJoint:
                return box2d.castObject(object, box2d.b2WeldJoint);
            case box2d.e_frictionJoint:
                return box2d.castObject(object, box2d.b2FrictionJoint);
            case box2d.e_ropeJoint:
                return box2d.castObject(object, box2d.b2RopeJoint);
            case box2d.e_motorJoint:
                return box2d.castObject(object, box2d.b2MotorJoint);
        }
    }
    
    ASSERT(false, 'Unknown object type');
}

function box2dWarmup(frames=100)
{
    // run the sim for a few frames to let objects settle
    for (let i=frames; i--;)
        box2dWorld.Step(timeDelta, box2dStepIterations, box2dStepIterations);
}

///////////////////////////////////////////////////////////////////////////////
// Box2D Drawing

function box2dDrawFixture(fixture, pos, angle, fillColor, outlineColor, lineWidth)
{
    const shape = box2dCastObject(fixture.GetShape());
    switch (shape.GetType())
    {
        case box2d.b2Shape.e_polygon:
        {
            let points = [];
            for (let i=shape.GetVertexCount(); i--;)
                points.push(vec2(shape.GetVertex(i)));
            box2dDrawPoly(pos, angle, points, fillColor, outlineColor, lineWidth);
            break;
        }
        case box2d.b2Shape.e_circle:
        {
            const radius = shape.get_m_radius();
            box2dDrawCircle(pos, radius, fillColor, outlineColor, lineWidth);
            break;
        }
        case box2d.b2Shape.e_edge:
        {
            const v1 = vec2(shape.get_m_vertex1());
            const v2 = vec2(shape.get_m_vertex2());
            box2dDrawLine(pos, angle, v1, v2, fillColor, lineWidth);
            break;
        }
    }
}

function box2dDrawCircle(pos, radius, color=WHITE, outlineColor, lineWidth=.1, context)
{
    drawCanvas2D(pos, vec2(1), 0, 0, context=>
    {
        context.beginPath();
        context.arc(0, 0, radius, 0, 9);
        box2dDrawFillStroke(context, color, outlineColor, lineWidth);
    }, 0, context);
}

function box2dDrawPoly(pos, angle, points, color=WHITE, outlineColor, lineWidth=.1, context)
{
    drawCanvas2D(pos, vec2(1), angle, 0, context=>
    {
        context.beginPath();
        points.forEach(p=>context.lineTo(p.x, p.y));
        context.closePath();
        box2dDrawFillStroke(context, color, outlineColor, lineWidth);
    }, 0, context);
}

function box2dDrawLine(pos, angle, posA, posB, color=WHITE, lineWidth=.1, context)
{
    drawCanvas2D(pos, vec2(1), angle, 0, context=>
    {
        context.beginPath();
        context.lineTo(posA.x, posA.y);
        context.lineTo(posB.x, posB.y);
        box2dDrawFillStroke(context, 0, color, lineWidth);
    }, 0, context);
}

function box2dDrawFillStroke(context, color, outlineColor, lineWidth)
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
// Box2D Setup

function box2dEngineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources)
{
    Box2D().then(_box2d=>
    {
        // setup box2d
        box2d = _box2d;
        box2dWorld = new box2d.b2World();

        // override functions for box2d
        setGravity = function(newGravity) 
        {
            box2dWorld.SetGravity(vec2(0,newGravity).getBox2d());
            gravity = newGravity*timeDelta*timeDelta; // engine gravity
        }

        // allow passing box2d vectors to vec2
        const defaultVec2 = vec2;
        vec2 = function(x, y)
        {
            return (x instanceof box2d.b2Vec2) ? 
                new Vector2(x.get_x(), x.get_y()) : defaultVec2(x, y);
        }

        // functions to convert between vec2 and box2d vectors
        Vector2.prototype.setBox2d = function(p) { return this.set(p.get_x(), p.get_y()); }
        Vector2.prototype.getBox2d = function()  { return new box2d.b2Vec2(this.x, this.y); }
        Vector2.prototype.setBox2dPointer = function(p)  
        { return this.setBox2d(box2d.wrapPointer(p, box2d.b2Vec2)); }

        // functions to convert between color and box2d colors
        Color.prototype.setBox2d = function(c)  
        { return this.set(c.get_r(), c.get_g(), c.get_b()); }
        Color.prototype.setBox2dPointer = function(c)  
        { return this.setBox2d(box2d.wrapPointer(c, box2d.b2Color)); }

        // setup contact listener
        const listener = new box2d.JSContactListener();
        listener.BeginContact = function(contactPtr)
        {
            const contact  = box2d.wrapPointer(contactPtr, box2d.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            objectA.beginContact(objectB, contact);
            objectB.beginContact(objectA, contact);
        }
        listener.EndContact = function(contactPtr)
        {
            const contact  = box2d.wrapPointer(contactPtr, box2d.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            objectA.endContact(objectB, contact);
            objectB.endContact(objectA, contact);
        };
        listener.PreSolve  = function() {};
        listener.PostSolve = function() {};
        box2dWorld.SetContactListener(listener);

        // setup debug draw
        box2dDebugDraw = box2dGetDebugDraw();          
        box2dDebugDraw.AppendFlags(box2d.b2Draw.e_shapeBit);
        box2dDebugDraw.AppendFlags(box2d.b2Draw.e_jointBit);
        //box2dDebugDraw.AppendFlags(box2d.b2Draw.e_aabbBit);
        //box2dDebugDraw.AppendFlags(box2d.b2Draw.e_pairBit);
        //box2dDebugDraw.AppendFlags(box2d.b2Draw.e_centerOfMassBit);
        box2dWorld.SetDebugDraw(box2dDebugDraw);

        // hook up box2d plugin to update and render
        engineAddPlugin(box2dUpdate, box2dRender);
        function box2dUpdate()
        {
            box2dWorld.Step(timeDelta, box2dStepIterations, box2dStepIterations);
        }
        function box2dRender()
        {
            if (box2dDebug || debugPhysics && debugOverlay)
                box2dWorld.DrawDebugData();
        }

        // start littlejs
        engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, imageSources);
  
        // box2d debug drawing implementation
        function box2dGetDebugDraw()
        {
            const debugDraw = new box2d.JSDraw();
            debugDraw.DrawSegment = function(point1, point2, color)
            {
                color = getDebugColor(color);
                point1 = vec2().setBox2dPointer(point1);
                point2 = vec2().setBox2dPointer(point2);
                box2dDrawLine(vec2(), 0, point1, point2, color, undefined, overlayContext);
            };
            debugDraw.DrawPolygon = function(vertices, vertexCount, color)
            {
                color = getDebugColor(color);
                const points = getPointsList(vertices, vertexCount);
                box2dDrawPoly(vec2(), 0, points, undefined, color, undefined, overlayContext);
            };
            debugDraw.DrawSolidPolygon = function(vertices, vertexCount, color)
            {
                color = getDebugColor(color);
                const points = getPointsList(vertices, vertexCount);
                box2dDrawPoly(vec2(), 0, points, color, color, undefined, overlayContext);
            };
            debugDraw.box2dDrawCircle = function(center, radius, color)
            {
                color = getDebugColor(color);
                center = vec2().setBox2dPointer(center);
                box2dDrawCircle(center, radius, undefined, color, undefined, overlayContext);
            };
            debugDraw.DrawSolidCircle = function(center, radius, axis, color)
            {
                color = getDebugColor(color);
                center = vec2().setBox2dPointer(center);
                axis = vec2().setBox2dPointer(axis).scale(radius);
                box2dDrawCircle(center, radius, color, color, undefined, overlayContext);
                box2dDrawLine(center, 0, vec2(), axis, color, undefined, overlayContext);
            };
            debugDraw.DrawTransform = function(transform)
            {
                transform = box2d.wrapPointer(transform, box2d.b2Transform);
                const pos = vec2(transform.get_p());
                const angle = -transform.get_q().GetAngle();
                const p1 = vec2(1,0), c1 = rgb(.75,0,0,.8)
                const p2 = vec2(0,1), c2 = rgb(0,.75,0,.8);
                box2dDrawLine(pos, angle, vec2(), p1, c1, undefined, overlayContext);
                box2dDrawLine(pos, angle, vec2(), p2, c2, undefined, overlayContext);
            }
            function getDebugColor(color)
            {
                color = rgb().setBox2dPointer(color);
                color.a = .8;
                return color;
            }
            function getPointsList(vertices, vertexCount)
            {
                const points = [];
                for (let i=vertexCount; i--;)
                    points.push(vec2().setBox2dPointer(vertices+i*8));
                return points
            }
            return debugDraw;
        }
    });
}