/**
 * LittleJS Box2D Physics Plugin
 * - Box2dObject extends EngineObject with Box2D physics
 * - Call box2dInit() to enable
 * - You will also need to include box2d.wasm.js
 * - Uses a super fast web assembly port of Box2D v2.3.1
 * - More info: https://github.com/kripken/box2d.js
 * - Functions to create polygon, circle, and edge shapes
 * - Contact begin and end callbacks
 * - Wraps b2Vec2 type to/from Vector2
 * - Raycasting and querying
 * - Box2dTileLayer for grid based collision
 * - Every type of joint
 * - Debug physics drawing
 * - Box2D works per second: its velocities and accelerations are in units per second, and it reads the engine's
 *   gravity as units per second squared, where an EngineObject's are per frame
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

// Box2D copies every vector it is given, so the plugin hands it these two instead of making a new one each call,
// which the binding would keep; a call that takes two vectors uses both
let box2dTempVectors;
function box2dTemp(v, slot=0)
{
    ASSERT(isVector2(v));
    const temp = (box2dTempVectors ||= [new box2d.instance.b2Vec2(), new box2d.instance.b2Vec2()])[slot];
    temp.Set(v.x, v.y);
    return temp;
}

// the native objects a query needs, one of each kind made once and reused, since the binding keeps every one made;
// a query sets the callback's ReportFixture before each use, so the one callback serves every query of its kind
const box2dQueryObjects = {};
const box2dGravity = {x:NaN, y:NaN}; // the gravity the world was last given
function box2dQueryObject(key, type) { return box2dQueryObjects[key] ||= new box2d.instance[type](); }

// Box2D finds fixtures by boxes it pads and stretches ahead along the velocity, so a query checks the shape's own box
function box2dFixtureOverlaps(fixture, aabb)
{
    const shape = fixture.GetShape(), transform = fixture.GetBody().GetTransform();
    const shapeBox = box2dQueryObject('shapeAABB', 'b2AABB');
    const lower = aabb.get_lowerBound(), upper = aabb.get_upperBound();
    for (let i = shape.GetChildCount(); i--;)
    {
        shape.ComputeAABB(shapeBox, transform, i);
        const a = shapeBox.get_lowerBound(), b = shapeBox.get_upperBound();
        if (a.get_x() <= upper.get_x() && b.get_x() >= lower.get_x() &&
            a.get_y() <= upper.get_y() && b.get_y() >= lower.get_y())
            return true;
    }
    return false;
}

// wake a body and whatever touches it, Box2D does not when a body is moved, and a sleeping pair never updates
function box2dWakeWithContacts(body)
{
    body.SetAwake(true);
    for (let edge = body.GetContactList(); !box2d.isNull(edge); edge = edge.get_next())
        edge.get_other().SetAwake(true);
}

// wake both bodies of a joint whose length changed, a sleeping body would stay where it was
function box2dWakeJoint(joint)
{
    joint.GetBodyA().SetAwake(true);
    joint.GetBodyB().SetAwake(true);
}

// what Box2D adds to the inertia for a center of mass away from the origin, in float32 as it does it, so taking it
// off again gives exactly what Box2D keeps: an inertia of 0, a locked rotation, stays 0 and not a speck either side
function box2dCenterInertia(mass, x, y)
{
    const f = Math.fround;
    return f(f(mass)*f(f(f(x)*f(x)) + f(f(y)*f(y))));
}

// what cannot happen while the world steps, like losing a body from a contact callback: done now, or queued until
// the step is done; a body going calls endContact for what it touched, and a destroy from there waits in the queue
// too, since the contact it would free is still in use, so the queue runs one at a time in the order things came
const box2dPending = [];
let box2dPendingBusy = 0;
function box2dWhenUnlocked(f)
{
    box2dPending.push(f);
    if (!box2d.world.IsLocked() && !box2dPendingBusy)
        box2dRunPending();
}
function box2dRunPending()
{
    ++box2dPendingBusy;
    try { while (box2dPending.length) box2dPending.shift()(); }
    finally { --box2dPendingBusy; }
}

// each Box2dJoint by its native pointer, so a joint Box2D destroys along with a body can let go of its wrapper
const box2dJoints = new Map;

// a gear joint keeps pointers to the joints it gears and to their bodies, so it goes before either joint does
function box2dDestroyGears(joint)
{
    for (const gear of box2dJoints.values())
        if (gear instanceof Box2dGearJoint && (gear.joint1 === joint || gear.joint2 === joint))
            gear.destroy();
}

/** Enable Box2D debug drawing
 *  @param {boolean} enable
 *  @memberof Box2D */
function box2dSetDebug(enable) { box2dDebug = enable; }

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Object - extend with your own custom physics objects
 * - A LittleJS object with Box2D physics, dynamic by default
 * - Provides interface for Box2D body and fixture functions
 * - Each object can have multiple fixtures and joints
 * - Angular values are clockwise like angle: angular velocity, torque, joint angles, limits and motor speeds
 * @extends EngineObject
 * @memberof Box2D
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
    constructor(pos=vec2(), size=vec2(), tileInfo, angle=0, color, bodyType=box2d.bodyTypeDynamic, renderOrder=0)
    {
        ASSERT(!box2d.world.IsLocked(), 'cannot create Box2D bodies during a contact callback');
        super(pos, size, tileInfo, angle, color, renderOrder);

        // create physics body, Box2D copies the def
        const bodyDef = new box2d.instance.b2BodyDef();
        bodyDef.set_type(bodyType);
        bodyDef.set_position(box2dTemp(pos));
        bodyDef.set_angle(-angle);
        
        /** @property {Object} - The Box2d body, undefined once it is destroyed */
        this.body = box2d.world.CreateBody(bodyDef);
        box2d.instance.destroy(bodyDef);
        /** @property {Color} - Line color used for default box2d drawing */
        this.lineColor = BLACK.copy();
        /** @property {number} - Line width used for default box2d drawing */
        this.lineWidth = .1;
        /** @property {Array<Array<Vector2>>} - List of all edges for default box2d drawing
         *  @type {Array<Array<Vector2>>} */
        this.edgeLists = [];
        /** @property {Array<Array<Vector2>>} - List of all edge loops for default box2d drawing
         *  @type {Array<Array<Vector2>>} */
        this.edgeLoops = [];
        // the fixtures of the edge lists and loops, by pointer, each to the points it is drawn with
        this.edgeListFixtures = new Map;

        this.body.object = this; // link body to this object
        box2d.objects.push(this); // keep track of all box2d objects
    }

    /** Destroy this object and its physics body
     *  @param {boolean} [immediate] - Remove it now, as EngineObject.destroy does, children included */
    destroy(immediate=false)
    {
        if (this.destroyed) return;

        // destroy physics body, fixtures, and joints; from a contact callback the world is still
        // stepping and cannot lose a body, so it goes as soon as the step is done; the object
        // leaves box2d.objects at the next step, or the next frame while paused or time is stopped;
        // the body lets go of it after, since destroying it calls endContact, which finds it there
        ASSERT(this.body, 'Box2dObject has no body to destroy');
        const body = this.body;
        box2dWhenUnlocked(()=> { box2d.world.DestroyBody(body); body.object = undefined; this.body = undefined; });
        super.destroy(immediate);
    }

    /** Box2d objects updated with Box2d world step */
    updatePhysics() {}

    /** Render the object, uses box2d drawing if no tile info exists */
    render()
    {
        // use default render or draw fixtures
        if (this.tileInfo)
            super.render();
        else
            this.drawFixtures(this.color, this.lineColor, this.lineWidth);
    }

    /** Render debug info */
    renderDebugInfo()
    {
        const isAsleep = !this.getIsAwake();
        const isStatic = this.getBodyType() === box2d.bodyTypeStatic;
        const color = rgb(isAsleep?1:0, isAsleep?1:0, isStatic?1:0, .5);
        this.drawFixtures(color);
    }

    /** Draws all this object's fixtures 
     *  @param {Color}   [color]
     *  @param {Color}   [lineColor]
     *  @param {number}  [lineWidth]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixtures(color=WHITE, lineColor=BLACK, lineWidth=.1, useWebGL, context)
    {
        // draw each fixture, but the edges of an edge list or loop, which draw below as one line
        const edgeFixtures = this.edgeListFixtures;
        this.getFixtureList().forEach((fixture)=>
        {
            if (!edgeFixtures.has(box2d.instance.getPointer(fixture)))
                box2d.drawFixture(fixture, this.pos, this.angle, color, lineColor, lineWidth, useWebGL, context);
        });

        // draw edges using a single draw line for better connections
        this.edgeLists.forEach(points=>
            drawLineList(points, lineWidth, lineColor, false, this.pos, this.angle, useWebGL, false, context));
        this.edgeLoops.forEach(points=>
            drawLineList(points, lineWidth, lineColor, true, this.pos, this.angle, useWebGL, false, context));
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics contact callbacks

    /** Called when a contact begins, while the world steps: a destroy or a setter waits until the step is done,
     *  and creating objects, fixtures or joints must wait until after the step
     *  - The fixtures say which shapes touched, the same objects addBox and the others returned, so a small sensor
     *    under a player's feet can tell standing on the ground from touching a wall
     *  @param {Box2dObject} otherObject
     *  @param {Object} [fixture] - This object's fixture that touched
     *  @param {Object} [otherFixture] - The other object's fixture that touched */
    beginContact(otherObject, fixture, otherFixture) {}

    /** Called when a contact ends, while the world steps or a body is destroyed: a destroy or a setter waits
     *  until the step is done, and creating objects, fixtures or joints must wait until after the step
     *  @param {Box2dObject} otherObject
     *  @param {Object} [fixture] - This object's fixture that touched
     *  @param {Object} [otherFixture] - The other object's fixture that touched */
    endContact(otherObject, fixture, otherFixture) {}

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
        ASSERT(isNumber(density), 'density must be a number');
        ASSERT(isNumber(friction), 'friction must be a number');
        ASSERT(isNumber(restitution), 'restitution must be a number');
        ASSERT(!box2d.world.IsLocked(), 'cannot create Box2D fixtures during a contact callback');

        // Box2D copies the def and the shape
        const fd = new box2d.instance.b2FixtureDef();
        fd.set_shape(shape);
        fd.set_density(density);
        fd.set_friction(friction);
        fd.set_restitution(restitution);
        fd.set_isSensor(isSensor);
        const fixture = this.body.CreateFixture(fd);
        box2d.instance.destroy(fd);
        return fixture;
    }

    /** Add a box shape to the body
     *  @param {Vector2} [size]
     *  @param {Vector2} [offset]
     *  @param {number}  [angle] - LittleJS convention (clockwise positive).
     *      Negated internally to match Box2D's CCW-positive convention so the
     *      fixture aligns with the same angle passed to drawRect/drawTile.
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addBox(size=vec2(1), offset=vec2(), angle=0, density, friction, restitution, isSensor)
    {
        ASSERT(isVector2(size), 'size must be a Vector2');
        ASSERT(size.x > 0 && size.y > 0, 'size must be positive');
        ASSERT(isVector2(offset), 'offset must be a Vector2');
        ASSERT(isNumber(angle), 'angle must be a number');

        // Box2D stops for good on a box with almost no area, like addPoly no fixture is made from one
        ASSERT(size.x * size.y > 1e-6, 'box is too small for Box2D');
        if (!(size.x * size.y > 1e-6)) return;

        const shape = new box2d.instance.b2PolygonShape();
        shape.SetAsBox(size.x/2, size.y/2, box2dTemp(offset), -angle);
        const fixture = this.addShape(shape, density, friction, restitution, isSensor);
        box2d.instance.destroy(shape); // the fixture has its own copy
        return fixture;
    }

    /** Add a polygon shape to the body, the convex hull of its points; Box2D takes 3 to 8 points,
     *  not all in a line, and no fixture is made from any other; points closer than .001 count as one
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addPoly(points, density, friction, restitution, isSensor)
    {
        ASSERT(isArray(points), 'points must be an array');

        function box2dCreatePolygonShape(points)
        {
            // Box2D stops for good on two hull points that nearly meet, like a loop whose last point is its first
            points = points.filter((p, i)=> points.slice(0, i).every(q=> p.distanceSquared(q) > 1e-6));

            // Box2D stops for good on a polygon it cannot take, so one with too many points or no area makes none;
            // it takes the convex hull, which is at least as big as the biggest triangle of the points
            let area = 0; // twice the biggest triangle's
            if (3 <= points.length && points.length <= 8)
                for (const a of points) for (const b of points) for (const c of points)
                    area = max(area, abs(b.subtract(a).cross(c.subtract(a))));
            ASSERT(area >= 1e-6, 'Box2D polygons need 3 to 8 points, not all in a line');
            if (!(area >= 1e-6)) return;

            const buffer = box2d.instance._malloc(points.length * 8);
            for (let i=0, offset=0; i<points.length; ++i)
            {
                box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].x;
                offset += 4;
                box2d.instance.HEAPF32[buffer + offset >> 2] = points[i].y;
                offset += 4;
            }
            const box2dPoints = box2d.instance.wrapPointer(buffer, box2d.instance.b2Vec2);
            const shape = new box2d.instance.b2PolygonShape();
            shape.Set(box2dPoints, points.length);
            box2d.instance._free(buffer);
            return shape;
        }

        const shape = box2dCreatePolygonShape(points);
        if (!shape) return;
        const fixture = this.addShape(shape, density, friction, restitution, isSensor);
        box2d.instance.destroy(shape); // the fixture has its own copy
        return fixture;
    }

    /** Add a regular polygon shape to the body
     *  @param {number}  [diameter]
     *  @param {number}  [sides] - 3 to 8, the most Box2D polygons have
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addRegularPoly(diameter=1, sides=8, density, friction, restitution, isSensor)
    {
        ASSERT(isNumber(diameter) && diameter>0, 'diameter must be a positive number');
        ASSERT(isNumber(sides) && sides>2, 'sides must be a positive number greater than 2');
        ASSERT(sides <= 8, 'Box2D polygons have at most 8 sides');
        sides = min(sides, 8); // more would stop Box2D for good

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
        ASSERT(isNumber(diameter) && diameter>0, 'diameter must be a positive number');

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
        ASSERT(isNumber(diameter) && diameter>0, 'diameter must be a positive number');
        ASSERT(isVector2(offset), 'offset must be a Vector2');
        
        const shape = new box2d.instance.b2CircleShape();
        shape.set_m_p(box2dTemp(offset));
        shape.set_m_radius(diameter/2);
        const fixture = this.addShape(shape, density, friction, restitution, isSensor);
        box2d.instance.destroy(shape); // the fixture has its own copy
        return fixture;
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
        ASSERT(isVector2(point1), 'point1 must be a Vector2');
        ASSERT(isVector2(point2), 'point2 must be a Vector2');

        const shape = new box2d.instance.b2EdgeShape();
        shape.Set(box2dTemp(point1), box2dTemp(point2, 1));
        const fixture = this.addShape(shape, density, friction, restitution, isSensor);
        box2d.instance.destroy(shape); // the fixture has its own copy
        return fixture;
    }

    /** Add an edge list to the body
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdgeList(points, density, friction, restitution, isSensor)
    {
        ASSERT(isArray(points), 'points must be an array');
        const fixtures = [], edgePoints = [];
        for (let i=0; i<points.length-1; ++i)
        {
            // the ghost vertices, where there is a neighbor, make the edges one smooth surface
            const shape = new box2d.instance.b2EdgeShape();
            points[i-1] && shape.set_m_vertex0(box2dTemp(points[i-1]));
            points[i+0] && shape.set_m_vertex1(box2dTemp(points[i+0]));
            points[i+1] && shape.set_m_vertex2(box2dTemp(points[i+1]));
            points[i+2] && shape.set_m_vertex3(box2dTemp(points[i+2]));
            shape.set_m_hasVertex0(!!points[i-1]);
            shape.set_m_hasVertex3(!!points[i+2]);
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            box2d.instance.destroy(shape); // the fixture has its own copy
            fixtures.push(f);
            edgePoints.push(points[i].copy());
        }
        edgePoints.push(points[points.length-1].copy());
        this.edgeLists.push(edgePoints);
        fixtures.forEach(f=> this.edgeListFixtures.set(box2d.instance.getPointer(f), edgePoints));
        return fixtures;
    }

    /** Add an edge loop to the body, an edge loop connects the end points
     *  @param {Array<Vector2>} points
     *  @param {number}  [density]
     *  @param {number}  [friction]
     *  @param {number}  [restitution]
     *  @param {boolean} [isSensor] */
    addEdgeLoop(points, density, friction, restitution, isSensor)
    {
        ASSERT(isArray(points), 'points must be an array');
        const fixtures = [], edgePoints = [];
        const getPoint = i=> points[mod(i,points.length)];
        for (let i=0; i<points.length; ++i)
        {
            const shape = new box2d.instance.b2EdgeShape();
            shape.set_m_vertex0(box2dTemp(getPoint(i-1)));
            shape.set_m_vertex1(box2dTemp(getPoint(i+0)));
            shape.set_m_vertex2(box2dTemp(getPoint(i+1)));
            shape.set_m_vertex3(box2dTemp(getPoint(i+2)));
            shape.set_m_hasVertex0(true);
            shape.set_m_hasVertex3(true);
            const f = this.addShape(shape, density, friction, restitution, isSensor);
            box2d.instance.destroy(shape); // the fixture has its own copy
            fixtures.push(f);
            edgePoints.push(points[i].copy());
        }
        this.edgeLoops.push(edgePoints);
        fixtures.forEach(f=> this.edgeListFixtures.set(box2d.instance.getPointer(f), edgePoints));
        return fixtures;
    }

    /** Destroy a fixture from the body, from a contact callback once the step is done
     *  @param {Object} fixture */
    destroyFixture(fixture)
    {
        // an edge list or loop that loses a fixture is no longer one line, what is left of it draws edge by edge
        const edgeFixtures = this.edgeListFixtures, points = edgeFixtures.get(box2d.instance.getPointer(fixture));
        if (points)
        {
            this.edgeLists = this.edgeLists.filter(p=> p !== points);
            this.edgeLoops = this.edgeLoops.filter(p=> p !== points);
            edgeFixtures.forEach((p, pointer)=> p === points && edgeFixtures.delete(pointer));
        }

        // not once the body is gone, which takes its fixtures with it, or once the fixture is,
        // since a second destroy of it, like one from each of two contacts in a step, stops Box2D for good
        const pointer = box2d.instance.getPointer(fixture);
        box2dWhenUnlocked(()=> this.body && this.getFixtureList().some(f=> box2d.instance.getPointer(f) === pointer)
            && this.body.DestroyFixture(fixture));
    }

    /** Destroy all fixtures from the body, from a contact callback once the step is done */
    destroyAllFixtures()
    {
        // the fixtures it has now, each destroyed if still there, in one pass so a big tile layer rebuilds quickly
        this.edgeLists = [];
        this.edgeLoops = [];
        this.edgeListFixtures.clear();
        const fixtures = this.getFixtureList(), getPointer = box2d.instance.getPointer;
        box2dWhenUnlocked(()=>
        {
            if (!this.body) return;
            const alive = new Set(this.getFixtureList().map(getPointer));
            for (const fixture of fixtures)
                alive.has(getPointer(fixture)) && this.body.DestroyFixture(fixture);
        });
    }

    ///////////////////////////////////////////////////////////////////////////////
    // physics get functions

    /** Gets the center of mass in world space
     *  @return {Vector2} */
    getCenterOfMass() { return box2d.vec2From(this.body.GetWorldCenter()); }

    /** Gets the linear velocity
     *  @return {Vector2} */
    getLinearVelocity() { return box2d.vec2From(this.body.GetLinearVelocity()); }

    /** Gets the angular velocity, clockwise like angle
     *  @return {number} */
    getAngularVelocity() { return -this.body.GetAngularVelocity(); } // box2d uses reverse angle

    /** Gets the mass
     *  @return {number} */
    getMass() { return this.body.GetMass(); }

    /** Gets the rotational inertia about the center of mass
     *  @return {number} */
    getInertia()
    {
        // Box2D gives it about the body origin
        const center = this.body.GetLocalCenter();
        return max(0, Math.fround(this.body.GetInertia() - box2dCenterInertia(this.getMass(), center.get_x(), center.get_y())));
    }

    /** Check if this object is awake
     *  @return {boolean} */
    getIsAwake() { return this.body.IsAwake(); }

    /** Gets the physics body type
     *  @return {number} */
    getBodyType() { return this.body.GetType(); }
    
    /** Get the speed of this object
     *  @return {number} */
    getSpeed() { return this.getLinearVelocity().length(); }

    ///////////////////////////////////////////////////////////////////////////////
    // physics set functions

    /** Sets the position and angle, from a contact callback the body moves once the step is done
     *  @param {Vector2} pos
     *  @param {number} angle */
    setTransform(pos, angle)
    {
        this.pos = pos.copy();
        this.angle = angle;
        // box2d uses reverse angle
        const x = pos.x, y = pos.y;
        box2dWhenUnlocked(()=>
        {
            if (!this.body) return;
            this.body.SetTransform(box2dTemp(vec2(x, y)), -angle);
            box2dWakeWithContacts(this.body); // Box2D leaves a sleeping body, and what rests on it, in the air
        });
    }
    
    /** Sets the position
     *  @param {Vector2} pos */
    setPosition(pos)
    { this.setTransform(pos, this.angle); }

    /** Sets the angle
     *  @param {number} angle */
    setAngle(angle)
    { this.setTransform(this.pos, angle); }

    /** Sets the linear velocity
     *  @param {Vector2} velocity */
    setLinearVelocity(velocity)
    { this.body.SetLinearVelocity(box2dTemp(velocity)); }

    /** Sets the angular velocity, clockwise like angle
     *  @param {number} angularVelocity */
    setAngularVelocity(angularVelocity)
    { this.body.SetAngularVelocity(-angularVelocity); }

    /** Sets the linear damping
     *  @param {number} damping */
    setLinearDamping(damping)
    { this.body.SetLinearDamping(damping); }

    /** Sets the angular damping
     *  @param {number} damping */
    setAngularDamping(damping)
    { this.body.SetAngularDamping(damping); }

    /** Sets the gravity scale
     *  @param {number} [scale] */
    setGravityScale(scale=1)
    {
        this.body.SetGravityScale(this.gravityScale = scale);
        this.body.SetAwake(true); // a sleeping body would not feel it
    }

    /** Should be like a bullet for continuous collision detection?
     *  @param {boolean} [isBullet] */
    setBullet(isBullet=true) { this.body.SetBullet(isBullet); }

    /** Set the sleep state of the body
     *  @param {boolean} [isAwake] */
    setAwake(isAwake=true) { this.body.SetAwake(isAwake); }
    
    /** Set the physics body type, from a contact callback it changes once the step is done
     *  @param {number} type */
    setBodyType(type) { box2dWhenUnlocked(()=> this.body && this.body.SetType(type)); }

    /** Set whether the body is allowed to sleep
     *  @param {boolean} [isAllowed] */
    setSleepingAllowed(isAllowed=true)
    { this.body.SetSleepingAllowed(isAllowed); }
    
    /** Set whether the body can rotate
     *  @param {boolean} [isFixed] */
    setFixedRotation(isFixed=true)
    { this.body.SetFixedRotation(isFixed); }

    /** Set the center of mass of the body, local to it
     *  @param {Vector2} center */
    setCenterOfMass(center) { this.setMassData(center) }

    /** Set the mass of the body
     *  @param {number} mass */
    setMass(mass) { this.setMassData(undefined, mass) }
    
    /** Set the moment of inertia of the body, about its center of mass
     *  @param {number} momentOfInertia */
    setMomentOfInertia(momentOfInertia)
    { this.setMassData(undefined, undefined, momentOfInertia) }

    /** Reset the mass, center of mass, and moment, from a contact callback once the step is done */
    resetMassData() { box2dWhenUnlocked(()=> this.body && this.body.ResetMassData()); }

    /** Set the mass data of the body, from a contact callback once the step is done;
     *  a mass of 0 or less becomes 1, use setBodyType for a static body; call it after adding fixtures and after
     *  setFixedRotation, both of which put the mass back to what the fixtures give
     *  @param {Vector2} [localCenter]
     *  @param {number}  [mass]
     *  @param {number}  [momentOfInertia] - About the center of mass */
    setMassData(localCenter, mass, momentOfInertia)
    {
        localCenter = localCenter && localCenter.copy(); // as it is now, even if it waits for the step
        box2dWhenUnlocked(()=>
        {
            if (!this.body) return;
            const data = box2dQueryObject('massData', 'b2MassData'); // reused, GetMassData fills it in
            this.body.GetMassData(data);

            // Box2D's inertia is about the body origin, so it is turned to the center of mass and back; kept as
            // it was, one for the old mass and center goes below 0 about the new ones, which stops Box2D for good
            const center = data.get_center(), oldMass = data.get_mass();
            const cx = localCenter ? localCenter.x : center.get_x(), cy = localCenter ? localCenter.y : center.get_y();
            // it is worked out in float32 as Box2D does it, which must come out above 0 or the rotation is locked
            const f = Math.fround;
            const oldInertia = f(data.get_I() - box2dCenterInertia(oldMass, center.get_x(), center.get_y()));
            const inertia = momentOfInertia ?? oldInertia;
            mass ??= oldMass;
            const offset = box2dCenterInertia(mass > 0 ? mass : 1, cx, cy); // a mass of 0 or less is 1 to Box2D
            const I = f(inertia + offset);
            data.set_mass(mass);
            data.set_center(box2dTemp(vec2(cx, cy)));
            data.set_I(inertia > 0 && f(I - offset) > 0 ? I : 0);
            this.body.SetMassData(data);
            this.body.SetAwake(true); // a sleeping body would not tip over a new center of mass
        });
    }

    /** Set the collision filter data for the fixtures this body has now, a fixture added later has the default
     *  filter, category 1 colliding with everything
     *  @param {number} [categoryBits]
     *  @param {number} [ignoreCategoryBits]
     *  @param {number} [groupIndex] */
    setFilterData(categoryBits=1, ignoreCategoryBits=0, groupIndex=0)
    {
        this.getFixtureList().forEach(fixture=>
        {
            const filter = fixture.GetFilterData();
            filter.set_categoryBits(categoryBits);
            filter.set_maskBits(0xffff & ~ignoreCategoryBits);
            filter.set_groupIndex(groupIndex);
            fixture.SetFilterData(filter); // applies and refilters contacts
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
        this.body.ApplyForce(box2dTemp(force), box2dTemp(pos, 1));
    }

    /** Apply acceleration to this object (changes velocity by acceleration,
     *  mass-independent like EngineObject.applyAcceleration, but in units per second).
     *  Use applyImpulse if you want the mass-dependent velocity change
     *  Δv = impulse / mass, or applyForce for a Newton-style sustained force.
     *  @param {Vector2} acceleration
     *  @param {Vector2} [pos] */
    applyAcceleration(acceleration, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        const impulse = acceleration.scale(this.getMass());
        this.body.ApplyLinearImpulse(box2dTemp(impulse), box2dTemp(pos, 1));
    }

    /** Apply an instantaneous linear impulse. Changes velocity immediately by
     *  impulse / mass (so heavier bodies move less for the same impulse).
     *  @param {Vector2} impulse
     *  @param {Vector2} [pos] */
    applyImpulse(impulse, pos)
    {
        pos ||= this.getCenterOfMass();
        this.setAwake();
        this.body.ApplyLinearImpulse(box2dTemp(impulse), box2dTemp(pos, 1));
    }

    /** Apply torque to this object, clockwise like angle
     *  @param {number} torque */
    applyTorque(torque)
    {
        this.setAwake();
        this.body.ApplyTorque(-torque);
    }

    /** Apply angular acceleration to this object (changes angular velocity by
     *  acceleration, mass-independent, clockwise — matches EngineObject.applyAngularAcceleration).
     *  @param {number} acceleration */
    applyAngularAcceleration(acceleration)
    {
        // the velocity itself, since the inertia Box2D gives is about the origin, not the center of mass;
        // like the impulse this was, only a dynamic body turns
        if (this.getBodyType() !== box2d.bodyTypeDynamic || this.body.IsFixedRotation()) return;
        this.setAwake();
        this.setAngularVelocity(this.getAngularVelocity() + acceleration);
    }

    /** Apply an instantaneous angular impulse. Changes angular velocity by
     *  impulse / inertia immediately, clockwise like angle.
     *  @param {number} impulse */
    applyAngularImpulse(impulse)
    {
        this.setAwake();
        this.body.ApplyAngularImpulse(-impulse);
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
    
    /** Get list of joints for this object, the Box2dJoint for each one made through LittleJS,
     *  and the Box2D joint, cast to its type, for any made on the world directly
     *  @return {Array<Box2dJoint|Object>} */
    getJointList()
    {
        // the body keeps a list of edges, each holding a joint and the next edge
        const joints = [];
        for (let edge=this.body.GetJointList(); !box2d.isNull(edge); edge = edge.get_next())
        {
            const joint = edge.get_joint(), wrapper = box2dJoints.get(box2d.instance.getPointer(joint));
            if (wrapper && !wrapper.box2dJoint)
                continue; // destroyed in a contact callback, Box2D lets go of it once the step is done
            joints.push(wrapper || box2d.castJointObject(joint));
        }
        return joints;
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Static Object - Box2d with a static physics body
 * @extends Box2dObject
 * @memberof Box2D
 */
class Box2dStaticObject extends Box2dObject 
{
    /** Create a LittleJS object with Box2d physics
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {number}   [angle]
     *  @param {Color}    [color]
     *  @param {number}   [renderOrder] */
    constructor(pos, size, tileInfo, angle=0, color, renderOrder=0)
    {
        const bodyType = box2d.bodyTypeStatic;
        super(pos, size, tileInfo, angle, color, bodyType, renderOrder);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Kinematic Object - Box2d with a kinematic physics body
 * @extends Box2dObject
 * @memberof Box2D
 */
class Box2dKinematicObject extends Box2dObject 
{
    /** Create a LittleJS object with Box2d physics
     *  @param {Vector2}  [pos]
     *  @param {Vector2}  [size]
     *  @param {TileInfo} [tileInfo]
     *  @param {number}   [angle]
     *  @param {Color}    [color]
     *  @param {number}   [renderOrder] */
    constructor(pos, size, tileInfo, angle=0, color, renderOrder=0)
    {
        const bodyType = box2d.bodyTypeKinematic;
        super(pos, size, tileInfo, angle, color, bodyType, renderOrder);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Box2d Tile Layer
 * - adds Box2d support to tile layers
 * - creates static box2d fixtures for solid tiles, call buildCollision to rebuild them after the tiles change
 * @extends Box2dStaticObject
 * @memberof Box2D
 */
class Box2dTileLayer extends Box2dStaticObject
{
    /** Create a Box2d tile layer object
    *  @param {TileCollisionLayer} tileLayer - Tile layer for this object */
    constructor(tileLayer)
    {
        ASSERT(tileLayer instanceof TileCollisionLayer, 'tileLayer must be a TileCollisionLayer');
        super(tileLayer.pos, tileLayer.size);

        /** @property {TileCollisionLayer} - The tile layer */
        this.tileLayer = tileLayer;
        this.addChild(tileLayer);

        // collision for the solid tiles it has now, call buildCollision again after changing them
        this.buildCollision();
    }

    render()
    {
        // do not render fixtures, tile layer handles rendering
    }
    
    /** Create box2d collision fixtures for solid tiles
    *  @param {number} [friction]
    *  @param {number} [restitution] */
    buildCollision(friction=.2, restitution=0)
    {
        // destroy all fixtures and create new ones
        this.destroyAllFixtures();

        // create box2d object for this layer
        this.pos = this.tileLayer.pos.copy();
        this.size = this.tileLayer.size.copy();

        // track which tiles have been processed
        const processed = [];
        const getIndex = (x, y)=> x + y * this.size.x;
        const isSolidUnprocessed = (x, y)=>
            !processed[getIndex(x, y)] &&
            this.tileLayer.getCollisionData(vec2(x, y)) > 0;

        // combine tiles into larger boxes
        for (let x = 0; x < this.size.x; ++x)
        for (let y = 0; y < this.size.y; ++y)
        {
            if (!isSolidUnprocessed(x, y)) continue;

            // find max width by scanning right
            let width = 1, height = 1, canExpand = true;
            while (isSolidUnprocessed(x + width, y))
                ++width;

            // find max height by scanning up, ensuring all rows have the same width
            while (canExpand)
            {
                for (let checkX = 0; checkX < width; ++checkX)
                {
                    if (!isSolidUnprocessed(x + checkX, y + height))
                    {
                        canExpand = false;
                        break;
                    }
                }
                if (canExpand)
                    ++height;
            }

            // mark all tiles in this rectangle as processed
            for (let rectX = width;  rectX--;)
            for (let rectY = height; rectY--;)
                processed[getIndex(x + rectX, y + rectY)] = true;

            // create a single fixture for the entire rectangle
            const shapeSize = vec2(width, height);
            const offset = vec2(x + width/2, y + height/2);
            this.addBox(shapeSize, offset, 0, 0, friction, restitution);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Raycast Result
 * - Holds results from a box2d raycast queries
 * - Automatically created by box2d raycast functions
 * @memberof Box2D
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
        /** @property {Box2dObject} - The box2d object
         *  @type {Box2dObject} */
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
 * - Angular values are clockwise like angle: joint angles and speeds, limits, motor speeds and torques
 * @memberof Box2D
 */
class Box2dJoint
{
    /** Create a box2d joint, the base class is not intended to be used directly
     *  @param {Object} jointDef - Freed once the joint is made, Box2D copies it */
    constructor(jointDef)
    {
        ASSERT(!box2d.world.IsLocked(), 'cannot create Box2D joints during a contact callback');
        ASSERT(box2d.instance.getPointer(jointDef.get_bodyA()) !== box2d.instance.getPointer(jointDef.get_bodyB()),
            'a joint needs two different objects');

        /** @property {Object} - The Box2d joint, 0 once it is destroyed, as it is when either object is */
        this.box2dJoint = box2d.castJointObject(box2d.world.CreateJoint(jointDef));
        box2d.instance.destroy(jointDef);
        box2dJoints.set(box2d.instance.getPointer(this.box2dJoint), this);
    }

    /** Destroy this joint */
    destroy()
    {
        const joint = this.box2dJoint;
        if (!joint) return; // destroyed already, or with one of its objects
        this.box2dJoint = 0;
        box2dDestroyGears(this);

        // a body destroyed before it, in the same step, takes the joint with it and lets go of it here
        const pointer = box2d.instance.getPointer(joint);
        box2dWhenUnlocked(()=>
        {
            if (box2dJoints.get(pointer) !== this) return;
            box2dJoints.delete(pointer);
            box2d.world.DestroyJoint(joint);
        });
    }

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

    /** Get the reaction torque on bodyB in N*m given a time step, clockwise like angle
     *  @param {number} time
     *  @return {number} */
    getReactionTorque(time) { return -this.box2dJoint.GetReactionTorque(1/time);} // box2d uses reverse angle
    
    /** Check if the connected bodies should collide
     *  @return {boolean} */
    getCollideConnected()   { return this.box2dJoint.GetCollideConnected();}

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
 * - The object must be dynamic, and stay dynamic while the joint holds it, Box2D stops for good on one with no mass
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dTargetJoint extends Box2dJoint
{
    /** Create a target joint
     *  @param {Box2dObject} object
     *  @param {Box2dObject} fixedObject
     *  @param {Vector2} worldPos */
    constructor(object, fixedObject, worldPos)
    {
        ASSERT(object.getBodyType() === box2d.bodyTypeDynamic, 'a target joint needs a dynamic object');
        object.setAwake();
        const jointDef = new box2d.instance.b2MouseJointDef();
        jointDef.set_bodyA(fixedObject.body);
        jointDef.set_bodyB(object.body);
        jointDef.set_target(box2dTemp(worldPos));
        jointDef.set_maxForce(2e3 * object.getMass());
        super(jointDef);
    }

    /** Set the target point in world coordinates
     *  @param {Vector2} pos */
    setTarget(pos) { this.box2dJoint.SetTarget(box2dTemp(pos)); }
    
    /** Get the target point in world coordinates
     *  @return {Vector2} */
    getTarget(){ return box2d.vec2From(this.box2dJoint.GetTarget()); }

    /** Sets the maximum force in Newtons
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(force); }
    
    /** Gets the maximum force in Newtons
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }
    
    /** Sets the joint frequency in Hertz, above 0, Box2D stops for good on 0
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(max(hz, 1e-3)); }
    
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
 * @memberof Box2D
 */
class Box2dDistanceJoint extends Box2dJoint
{
    /** Create a distance joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchorA] - World position, objectA's position if not given
     *  @param {Vector2} [anchorB] - World position, objectB's position if not given
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
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
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
    setLength(length) { this.box2dJoint.SetLength(length); box2dWakeJoint(this.box2dJoint); }
    
    /** Get the length of the joint
     *  @return {number} */
    getLength() { return this.box2dJoint.GetLength(); }
    
    /** Set the frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(hz); box2dWakeJoint(this.box2dJoint); }
    
    /** Get the frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }
    
    /** Set the damping ratio
     *  @param {number} ratio */
    setDampingRatio(ratio) { this.box2dJoint.SetDampingRatio(ratio); box2dWakeJoint(this.box2dJoint); }
    
    /** Get the damping ratio
     *  @return {number} */
    getDampingRatio() { return this.box2dJoint.GetDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Pin Joint
 * - Pins two objects together at a point
 * @extends Box2dDistanceJoint
 * @memberof Box2D
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
        super(objectA, objectB, pos, pos, collide);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Rope Joint
 * - Enforces a maximum distance between two points on two objects
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dRopeJoint extends Box2dJoint
{
    /** Create a rope joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchorA] - World position, objectA's position if not given
     *  @param {Vector2} [anchorB] - World position, objectB's position if not given
     *  @param {number} [extraLength]
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
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
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
    setMaxLength(length) { this.box2dJoint.SetMaxLength(length); box2dWakeJoint(this.box2dJoint); }

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
 * @memberof Box2D
 */
class Box2dRevoluteJoint extends Box2dJoint
{
    /** Create a revolute joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchor] - World position, objectB's position if not given
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2RevoluteJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
        jointDef.set_referenceAngle(objectB.body.GetAngle() - objectA.body.GetAngle());
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
    getReferenceAngle() { return -this.box2dJoint.GetReferenceAngle(); } // box2d uses reverse angle

    /** Get the current joint angle, clockwise like angle
     *  @return {number} */
    getJointAngle() { return -this.box2dJoint.GetJointAngle(); }

    /** Get the current joint angle speed in radians per second, clockwise like angle
     *  @return {number} */
    getJointSpeed() { return -this.box2dJoint.GetJointSpeed(); }

    /** Is the joint limit enabled?
     *  @return {boolean} */
    isLimitEnabled() { return this.box2dJoint.IsLimitEnabled(); }

    /** Enable/disable the joint limit
     *  @param {boolean} [enable] */
    enableLimit(enable=true) { return this.box2dJoint.EnableLimit(enable); }

    /** Get the lower joint limit, clockwise like angle
     *  @return {number} */
    getLowerLimit() { return -this.box2dJoint.GetUpperLimit(); } // reversed, so Box2D's upper is the lower

    /** Get the upper joint limit, clockwise like angle
     *  @return {number} */
    getUpperLimit() { return -this.box2dJoint.GetLowerLimit(); }

    /** Set the joint limits, clockwise like angle
     *  @param {number} min
     *  @param {number} max */
    setLimits(min, max)
    {
        ASSERT(min <= max, 'the lower limit must not be above the upper one');
        if (min > max) [min, max] = [max, min]; // Box2D stops on them reversed
        return this.box2dJoint.SetLimits(-max, -min);
    }

    /** Is the joint motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }

    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }

    /** Set the motor speed, clockwise like angle
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(-speed); }

    /** Get the motor speed, clockwise like angle
     *  @return {number} */
    getMotorSpeed() { return -this.box2dJoint.GetMotorSpeed(); }

    /** Set the max motor torque, a magnitude
     *  @param {number} torque */
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }

    /** Get the max motor torque
     *  @return {number} */
    getMaxMotorTorque() { return this.box2dJoint.GetMaxMotorTorque(); }

    /** Get the motor torque given a time step, clockwise like angle
     *  @param {number} time
     *  @return {number} */
    getMotorTorque(time) { return -this.box2dJoint.GetMotorTorque(1/time); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Gear Joint
 * - A gear joint is used to connect two joints together
 * - Either joint can be a revolute or prismatic joint
 * - You specify a gear ratio to bind the motions together
 * - joint1's angle or translation plus ratio times joint2's stays constant, angles clockwise like angle
 * - It is destroyed along with either joint, or an object either joint is on
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dGearJoint extends Box2dJoint
{
    /** Create a gear joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Box2dJoint} joint1
     *  @param {Box2dJoint} joint2
     *  @param {number} [ratio] */
    constructor(objectA, objectB, joint1, joint2, ratio=1)
    {
        // Box2D's angles are reversed and its translations are not, so a revolute joint geared to a prismatic one
        // needs the ratio reversed too, two of a kind keep it
        const isGearable = (j)=> (j instanceof Box2dRevoluteJoint || j instanceof Box2dPrismaticJoint) && !!j.box2dJoint;
        ASSERT(isGearable(joint1) && isGearable(joint2), 'a gear joint needs two revolute or prismatic joints that exist');
        const ratioSign = (joint1 instanceof Box2dRevoluteJoint) === (joint2 instanceof Box2dRevoluteJoint) ? 1 : -1;
        const jointDef = new box2d.instance.b2GearJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_joint1(joint1.box2dJoint);
        jointDef.set_joint2(joint2.box2dJoint);
        jointDef.set_ratio(ratio * ratioSign);
        super(jointDef);

        this.joint1 = joint1;
        this.joint2 = joint2;
        this.ratioSign = ratioSign;
    }

    /** Get the first joint
     *  @return {Box2dJoint} */
    getJoint1() { return this.joint1; }

    /** Get the second joint
     *  @return {Box2dJoint} */
    getJoint2() { return this.joint2; }

    /** Set the gear ratio
     *  @param {number} ratio */
    setRatio(ratio) { this.box2dJoint.SetRatio(ratio * this.ratioSign); box2dWakeJoint(this.box2dJoint); }

    /** Get the gear ratio
     *  @return {number} */
    getRatio() { return this.box2dJoint.GetRatio() * this.ratioSign; }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Prismatic Joint
 * - Provides one degree of freedom: translation along an axis fixed in objectA
 * - Relative rotation is prevented
 * - You can use a joint limit to restrict the range of motion
 * - You can use a joint motor to drive the motion or to model joint friction
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dPrismaticJoint extends Box2dJoint
{
    /** Create a prismatic joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchor] - World position, objectB's position if not given
     *  @param {Vector2} [worldAxis]
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const localAxisA = objectA.worldToLocalVector(worldAxis);
        const jointDef = new box2d.instance.b2PrismaticJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
        jointDef.set_localAxisA(box2dTemp(localAxisA));
        jointDef.set_referenceAngle(objectB.body.GetAngle() - objectA.body.GetAngle());
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
    
    /** Get the reference angle, objectB angle minus objectA angle in the reference state
     *  @return {number} */
    getReferenceAngle() { return -this.box2dJoint.GetReferenceAngle(); } // box2d uses reverse angle

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
    enableLimit(enable=true) { return this.box2dJoint.EnableLimit(enable); }
    
    /** Get the lower joint limit
     *  @return {number} */
    getLowerLimit() { return this.box2dJoint.GetLowerLimit(); }
    
    /** Get the upper joint limit
     *  @return {number} */
    getUpperLimit() { return this.box2dJoint.GetUpperLimit(); }
    
    /** Set the joint limits
     *  @param {number} min
     *  @param {number} max */
    setLimits(min, max)
    {
        ASSERT(min <= max, 'the lower limit must not be above the upper one');
        if (min > max) [min, max] = [max, min]; // Box2D stops on them reversed
        return this.box2dJoint.SetLimits(min, max);
    }
    
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
 * - You can use a joint motor to drive the motion or to model joint friction
 * - This joint is designed for vehicle suspensions
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dWheelJoint extends Box2dJoint
{
    /** Create a wheel joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchor] - World position, objectB's position if not given
     *  @param {Vector2} [worldAxis]
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, worldAxis=vec2(0,1), collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const localAxisA = objectA.worldToLocalVector(worldAxis).normalize(); // Box2D uses the wheel axis as given
        const jointDef = new box2d.instance.b2WheelJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
        jointDef.set_localAxisA(box2dTemp(localAxisA));
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

    /** Get the current joint rotation speed in radians per second, clockwise like angle,
     *  which is what this version of Box2D measures for a wheel joint
     *  @return {number} */
    getJointSpeed() { return -this.box2dJoint.GetJointSpeed(); } // box2d uses reverse angle

    /** Is the joint motor enabled?
     *  @return {boolean} */
    isMotorEnabled() { return this.box2dJoint.IsMotorEnabled(); }

    /** Enable/disable the joint motor
     *  @param {boolean} [enable] */
    enableMotor(enable=true) { return this.box2dJoint.EnableMotor(enable); }

    /** Set the motor speed, the wheel's turn in radians per second, clockwise like angle
     *  @param {number} speed */
    setMotorSpeed(speed) { return this.box2dJoint.SetMotorSpeed(-speed); }

    /** Get the motor speed, clockwise like angle
     *  @return {number} */
    getMotorSpeed() { return -this.box2dJoint.GetMotorSpeed(); }

    /** Set the maximum motor torque, a magnitude
     *  @param {number} torque */
    setMaxMotorTorque(torque) { return this.box2dJoint.SetMaxMotorTorque(torque); }

    /** Get the max motor torque
     *  @return {number} */
    getMaxMotorTorque() { return this.box2dJoint.GetMaxMotorTorque(); }

    /** Get the motor torque for a time step, clockwise like angle
     *  @param {number} time
     *  @return {number} */
    getMotorTorque(time) { return -this.box2dJoint.GetMotorTorque(1/time); }

    /** Set the spring frequency in Hertz
     *  @param {number} hz */
    setSpringFrequencyHz(hz) { this.box2dJoint.SetSpringFrequencyHz(hz); box2dWakeJoint(this.box2dJoint); }

    /** Get the spring frequency in Hertz
     *  @return {number} */
    getSpringFrequencyHz() { return this.box2dJoint.GetSpringFrequencyHz(); }

    /** Set the spring damping ratio
     *  @param {number} ratio */
    setSpringDampingRatio(ratio) { this.box2dJoint.SetSpringDampingRatio(ratio); box2dWakeJoint(this.box2dJoint); }

    /** Get the spring damping ratio
     *  @return {number} */
    getSpringDampingRatio() { return this.box2dJoint.GetSpringDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Weld Joint
 * - Glues two objects together
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dWeldJoint extends Box2dJoint
{
    /** Create a weld joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchor] - World position, objectB's position if not given
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const referenceAngle = objectB.body.GetAngle() - objectA.body.GetAngle();
        const jointDef = new box2d.instance.b2WeldJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
        jointDef.set_referenceAngle(referenceAngle);
        jointDef.set_collideConnected(collide);
        super(jointDef);

        // kept here, since the binding cannot read it back from a weld joint; box2d uses reverse angle
        this.referenceAngle = -referenceAngle;
    }

    /** Get the local anchor point relative to objectA's origin
     *  @return {Vector2} */
    getLocalAnchorA() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorA()); }

    /** Get the local anchor point relative to objectB's origin
     *  @return {Vector2} */
    getLocalAnchorB() { return box2d.vec2From(this.box2dJoint.GetLocalAnchorB()); }

    /** Get the reference angle, objectB angle minus objectA angle in the reference state
     *  @return {number} */
    getReferenceAngle() { return this.referenceAngle; }

    /** Set the frequency in Hertz
     *  @param {number} hz */
    setFrequency(hz) { this.box2dJoint.SetFrequency(hz); box2dWakeJoint(this.box2dJoint); }

    /** Get the frequency in Hertz
     *  @return {number} */
    getFrequency() { return this.box2dJoint.GetFrequency(); }

    /** Set the damping ratio
     *  @param {number} ratio */
    setDampingRatio(ratio) { this.box2dJoint.SetDampingRatio(ratio); box2dWakeJoint(this.box2dJoint); }

    /** Get the damping ratio
     *  @return {number} */
    getDampingRatio() { return this.box2dJoint.GetDampingRatio(); }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Box2D Friction Joint
 * - Used to apply top-down friction
 * - Provides 2D translational friction and angular friction
 * @extends Box2dJoint
 * @memberof Box2D
 */
class Box2dFrictionJoint extends Box2dJoint
{
    /** Create a friction joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} [anchor] - World position, objectB's position if not given
     *  @param {boolean} [collide] */
    constructor(objectA, objectB, anchor, collide=false)
    {
        anchor ||= box2d.vec2From(objectB.body.GetPosition());
        const localAnchorA = objectA.worldToLocal(anchor);
        const localAnchorB = objectB.worldToLocal(anchor);
        const jointDef = new box2d.instance.b2FrictionJointDef();
        jointDef.set_bodyA(objectA.body);
        jointDef.set_bodyB(objectB.body);
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
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
    setMaxForce(force) { this.box2dJoint.SetMaxForce(max(force, 0)); } // Box2D stops on a negative one

    /** Get the maximum friction force
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }

    /** Set the maximum friction torque
     *  @param {number} torque */
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(max(torque, 0)); } // Box2D stops on a negative one

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
 * @memberof Box2D
 */
class Box2dPulleyJoint extends Box2dJoint
{
    /** Create a pulley joint
     *  @param {Box2dObject} objectA
     *  @param {Box2dObject} objectB
     *  @param {Vector2} groundAnchorA
     *  @param {Vector2} groundAnchorB
     *  @param {Vector2} [anchorA] - World position, objectA's position if not given
     *  @param {Vector2} [anchorB] - World position, objectB's position if not given
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
        jointDef.set_groundAnchorA(box2dTemp(groundAnchorA));
        jointDef.set_groundAnchorB(box2dTemp(groundAnchorB));
        jointDef.set_localAnchorA(box2dTemp(localAnchorA));
        jointDef.set_localAnchorB(box2dTemp(localAnchorB));
        ASSERT(ratio, 'a pulley ratio can not be 0');
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

    /** Get the rest length of the segment attached to objectA, set at creation
     *  @return {number} */
    getLengthA() { return this.box2dJoint.GetLengthA(); }

    /** Get the rest length of the segment attached to objectB, set at creation
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
 * @memberof Box2D
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
        jointDef.set_linearOffset(box2dTemp(linearOffset));
        jointDef.set_angularOffset(angularOffset);
        super(jointDef);
    }

    /** Set the target linear offset, in frame A, in meters.
     *  @param {Vector2} offset */
    setLinearOffset(offset) { this.box2dJoint.SetLinearOffset(box2dTemp(offset)); }

    /** Get the target linear offset, in frame A, in meters.
     *  @return {Vector2} */
    getLinearOffset() { return box2d.vec2From(this.box2dJoint.GetLinearOffset()); }

    /** Set the target angular offset, objectB angle minus objectA angle, clockwise like angle
     *  @param {number} offset */
    setAngularOffset(offset) { this.box2dJoint.SetAngularOffset(-offset); } // box2d uses reverse angle

    /** Get the target angular offset, objectB angle minus objectA angle, clockwise like angle
     *  @return {number} */
    getAngularOffset() { return -this.box2dJoint.GetAngularOffset(); }

    /** Set the maximum force
     *  @param {number} force */
    setMaxForce(force) { this.box2dJoint.SetMaxForce(max(force, 0)); } // Box2D stops on a negative one

    /** Get the maximum force
     *  @return {number} */
    getMaxForce() { return this.box2dJoint.GetMaxForce(); }

    /** Set the maximum torque
     *  @param {number} torque */
    setMaxTorque(torque) { this.box2dJoint.SetMaxTorque(max(torque, 0)); } // Box2D stops on a negative one

    /** Get the maximum torque
     *  @return {number} */
    getMaxTorque() { return this.box2dJoint.GetMaxTorque(); }

    /** Set the position correction factor in the range [0,1]
     *  @param {number} factor */
    setCorrectionFactor(factor) { this.box2dJoint.SetCorrectionFactor(clamp(factor)); }

    /** Get the position correction factor in the range [0,1]
     *  @return {number} */
    getCorrectionFactor() { return this.box2dJoint.GetCorrectionFactor(); }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Box2D Global Object
 * - Wraps Box2d world and provides global functions
 * @memberof Box2D
 */
class Box2dPlugin
{
    /** Create the global Box2D plugin object, box2dInit does this
     *  @param {Object} instance */
    constructor(instance)
    {
        ASSERT(!box2d, 'Box2D already initialized');
        box2d = this;

        /** @property {Object} - The Box2d instance */
        this.instance = instance;
        /** @property {Object} - The Box2d world */
        this.world = new box2d.instance.b2World();
        /** @property {Array<Box2dObject>} - List of all Box2d objects, a destroyed one stays until the next step
         *  with its body undefined
         *  @type {Array<Box2dObject>} */
        this.objects = [];
        /** @property {number} - Velocity iterations per update*/
        this.velocityIterations = 8;
        /** @property {number} - Position iterations per update*/
        this.positionIterations = 3;
        /** @property {number} - Static, zero mass, zero velocity, may be manually moved
         *  @type {number} */
        this.bodyTypeStatic = instance.b2_staticBody;
        /** @property {number} - Kinematic, zero mass, non-zero velocity set by user, moved by solver
         *  @type {number} */
        this.bodyTypeKinematic = instance.b2_kinematicBody;
        /** @property {number} - Dynamic, positive mass, non-zero velocity determined by forces, moved by solver
         *  @type {number} */
        this.bodyTypeDynamic = instance.b2_dynamicBody;

        // a body that goes takes its joints with it, their wrappers let go of them, and a gear joint on one of them
        // goes too, since it would keep pointers to what was freed; it hangs off other bodies, so it goes after
        const destructionListener = new box2d.instance.JSDestructionListener();
        destructionListener.SayGoodbyeJoint = function(jointPointer)
        {
            const joint = box2dJoints.get(jointPointer);
            if (joint)
            {
                box2dDestroyGears(joint);
                joint.box2dJoint = 0;
            }
            box2dJoints.delete(jointPointer);
        };
        destructionListener.SayGoodbyeFixture = function() {};
        box2d.world.SetDestructionListener(destructionListener);

        // setup contact listener
        const listener = new box2d.instance.JSContactListener();
        listener.BeginContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            // raw user-created b2Bodies may have no .object — skip those
            if (!objectA || !objectB) return;
            objectA.beginContact(objectB, fixtureA, fixtureB);
            objectB.beginContact(objectA, fixtureB, fixtureA);
        }
        listener.EndContact = function(contactPtr)
        {
            const contact  = box2d.instance.wrapPointer(contactPtr, box2d.instance.b2Contact);
            const fixtureA = contact.GetFixtureA();
            const fixtureB = contact.GetFixtureB();
            const objectA  = fixtureA.GetBody().object;
            const objectB  = fixtureB.GetBody().object;
            if (!objectA || !objectB) return;
            objectA.endContact(objectB, fixtureA, fixtureB);
            objectB.endContact(objectA, fixtureB, fixtureA);
        };
        listener.PreSolve  = function() {};
        listener.PostSolve = function() {};
        box2d.world.SetContactListener(listener);
    }

    /** Step the physics world simulation
     *  @param {number} [frames] */
    step(frames=1)
    {
        // the engine's gravity, Box2D does not wake a sleeping body for a new one, so a change wakes them all
        if (gravity.x !== box2dGravity.x || gravity.y !== box2dGravity.y)
        {
            box2dGravity.x = gravity.x, box2dGravity.y = gravity.y;
            box2d.world.SetGravity(box2dTemp(gravity));
            for (let b = box2d.world.GetBodyList(); !box2d.isNull(b); b = b.GetNext())
                b.SetAwake(true);
        }
        for (let i=frames; i--;)
        {
            box2d.world.Step(timeDelta, this.velocityIterations, this.positionIterations);

            // what a contact callback destroyed or changed, now the world can take it
            box2dRunPending();
        }

        // remove destroyed objects, once for all of them
        this.objects = this.objects.filter(o=>!o.destroyed);
    }

    ///////////////////////////////////////////////////////////////////////////////
    // raycasting and querying

    /** raycast and return a list of all the results, nearest first
     *  @param {Vector2} start
     *  @param {Vector2} end
     *  @return {Array<Box2dRaycastResult>} */
    raycastAll(start, end)
    {
        // a ray with no length fails an assert that stops Box2D for good, measured as Box2D does in 32 bit floats,
        // where two ends a float apart are one point; one that is not a number has no length either
        const f = Math.fround, dx = f(f(end.x) - f(start.x)), dy = f(f(end.y) - f(start.y));
        const lengthSquared = f(f(dx*dx) + f(dy*dy));
        if (!(lengthSquared > 0 && lengthSquared < Infinity))
            return [];

        const raycastCallback = box2dQueryObject('rayCast', 'JSRayCastCallback');
        raycastCallback.ReportFixture = function(fixturePointer, point, normal, fraction)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            const o = fixture.GetBody().object;
            if (!o || o.destroyed)
                return 1; // a raw body with no Box2dObject or one destroyed this step, continue getting results
            point  = box2d.vec2FromPointer(point);
            normal = box2d.vec2FromPointer(normal);
            raycastResults.push(new Box2dRaycastResult(fixture, point, normal, fraction));
            return 1; // continue getting results
        };

        const raycastResults = [];
        box2d.world.RayCast(raycastCallback, box2dTemp(start), box2dTemp(end, 1));
        raycastResults.sort((a,b)=> a.fraction - b.fraction); // Box2D reports them in its tree's order
        debugRaycast && debugLine(start, end, raycastResults.length ? '#f00' : '#00f', .02);
        return raycastResults;
    }

    /** raycast and return the first result
     *  @param {Vector2} start
     *  @param {Vector2} end
     *  @return {Box2dRaycastResult|undefined} */
    raycast(start, end)
    {
        return box2d.raycastAll(start, end)[0];
    }

    /** box aabb cast and return all the objects
     *  @param {Vector2} pos
     *  @param {Vector2} size
     *  @return {Array<Box2dObject>} */
    boxCastAll(pos, size)
    {
        const queryCallback = box2dQueryObject('query', 'JSQueryCallback');
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            const o = fixture.GetBody().object;
            if (o && !o.destroyed && !queryObjects.includes(o) // skip raw bodies and ones destroyed this step
                && box2dFixtureOverlaps(fixture, aabb))
                queryObjects.push(o); // add if not already in list
            return true; // continue getting results
        };

        const aabb = box2dQueryObject('aabb', 'b2AABB');
        aabb.set_lowerBound(box2dTemp(pos.subtract(size.scale(.5))));
        aabb.set_upperBound(box2dTemp(pos.add(size.scale(.5))));

        let queryObjects = [];
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, size, queryObjects.length ? '#f00' : '#00f');
        return queryObjects;
    }

    /** box aabb cast and return the first object
     *  @param {Vector2} pos
     *  @param {Vector2} size
     *  @return {Box2dObject|undefined} */
    boxCast(pos, size)
    {
        const queryCallback = box2dQueryObject('query', 'JSQueryCallback');
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            const o = fixture.GetBody().object;
            if (!o || o.destroyed)
                return true; // a raw body with no Box2dObject or one destroyed this step, continue getting results
            if (!box2dFixtureOverlaps(fixture, aabb))
                return true; // only near the box, continue getting results
            queryObject = o;
            return false; // stop getting results
        };

        const aabb = box2dQueryObject('aabb', 'b2AABB');
        aabb.set_lowerBound(box2dTemp(pos.subtract(size.scale(.5))));
        aabb.set_upperBound(box2dTemp(pos.add(size.scale(.5))));

        let queryObject;
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, size, queryObject ? '#f00' : '#00f');
        return queryObject;
    }

    /** circle cast and return all the objects whose position is within the circle
     *  @param {Vector2} pos
     *  @param {number} diameter
     *  @return {Array<Box2dObject>} */
    circleCastAll(pos, diameter)
    {
        const radius2 = (diameter/2)**2;
        const results = box2d.boxCastAll(pos, vec2(diameter));
        return results.filter(o=>o.pos.distanceSquared(pos) < radius2);
    }

    /** circle cast and return the object whose position is nearest, of those within the circle
     *  @param {Vector2} pos
     *  @param {number} diameter
     *  @return {Box2dObject|undefined} */
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
     *  @param {boolean} [dynamicOnly]
     *  @return {Box2dObject|undefined} */
    pointCast(pos, dynamicOnly=true)
    {
        const queryCallback = box2dQueryObject('query', 'JSQueryCallback');
        queryCallback.ReportFixture = function(fixturePointer)
        {
            const fixture = box2d.instance.wrapPointer(fixturePointer, box2d.instance.b2Fixture);
            if (dynamicOnly && fixture.GetBody().GetType() !== box2d.instance.b2_dynamicBody)
                return true; // continue getting results
            if (!fixture.TestPoint(box2dTemp(pos)))
                return true; // continue getting results
            const o = fixture.GetBody().object;
            if (!o || o.destroyed)
                return true; // a raw body with no Box2dObject or one destroyed this step, continue getting results
            queryObject = o;
            return false; // stop getting results
        };

        const aabb = box2dQueryObject('aabb', 'b2AABB');
        aabb.set_lowerBound(box2dTemp(pos));
        aabb.set_upperBound(box2dTemp(pos));

        let queryObject;
        box2d.world.QueryAABB(queryCallback, aabb);
        debugRaycast && debugRect(pos, vec2(), queryObject ? '#f00' : '#00f');
        return queryObject;
    }

    ///////////////////////////////////////////////////////////////////////////////
    // drawing

    /** draws a fixture
     *  @param {Object} fixture
     *  @param {Vector2} pos
     *  @param {number} angle
     *  @param {Color} [color]
     *  @param {Color} [lineColor]
     *  @param {number} [lineWidth]
     *  @param {boolean} [useWebGL=glEnable]
     *  @param {CanvasRenderingContext2D} [context] */
    drawFixture(fixture, pos, angle, color=WHITE, lineColor=BLACK, lineWidth=.1, useWebGL, context)
    {
        const shape = box2d.castShapeObject(fixture.GetShape());
        switch (shape.GetType())
        {
            case box2d.instance.b2Shape.e_polygon:
            {
                let points = [];
                for (let i=shape.GetVertexCount(); i--;)
                    points.push(box2d.vec2From(shape.GetVertex(i)));
                drawPoly(points, color, lineWidth, lineColor, pos, angle, useWebGL, false, context);
                break;
            }
            case box2d.instance.b2Shape.e_circle:
            {
                const radius = shape.get_m_radius(), offset = box2d.vec2From(shape.get_m_p());
                drawCircle(pos.add(offset.rotate(angle)), radius*2, color, lineWidth, lineColor, useWebGL, false, context);
                break;
            }
            case box2d.instance.b2Shape.e_edge:
            {
                const v1 = box2d.vec2From(shape.get_m_vertex1());
                const v2 = box2d.vec2From(shape.get_m_vertex2());
                drawLine(v1, v2, lineWidth, lineColor, pos, angle, useWebGL, false, context);
                break;
            }
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
     *  @param {Object} vp */
    vec2FromPointer(vp)
    {
        const v = box2d.instance.wrapPointer(vp, box2d.instance.b2Vec2);
        return box2d.vec2From(v);
    }

    /** converts a Vector2 to a new box2d vec2, which stays until destroyed with box2d.instance.destroy;
     *  the plugin itself passes Box2D reused ones, since Box2D copies every vector it is given
     *  @param {Vector2} v */
    vec2dTo(v)
    {
        ASSERT(isVector2(v));
        return new box2d.instance.b2Vec2(v.x, v.y);
    }

    /** checks if a box2d object is null
     *  @param {Object} o */
    isNull(o) { return !box2d.instance.getPointer(o); }

    /** casts a box2d object to a shape type
     *  @param {Object} o */
    castShapeObject(o)
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
        }
        
        ASSERT(false, 'Unknown box2d object type');
    }

    /** casts a box2d object to a joint type
     *  @param {Object} o */
    castJointObject(o)
    {
        switch (o.GetType())
        {
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
/** Box2d Init - Call with await to init box2d
 *  @example
 *  await box2dInit();
 *  @return {Promise<Box2dPlugin>}
 *  @memberof Box2D */
async function box2dInit()
{
    // load box2d
    // @ts-ignore - Box2D is the global that box2d.wasm.js defines
    new Box2dPlugin(await Box2D());
    setupDebugDraw();
    engineAddPlugin(box2dUpdate, box2dRender);
    return box2d;

    // add the box2d plugin to the engine
    function box2dUpdate()
    {
        // frozen like the engine objects while paused or time is stopped
        if (paused || !timeScale)
        {
            // what was destroyed while frozen leaves the list, the step does it otherwise
            box2d.objects = box2d.objects.filter(o=>!o.destroyed);
            return;
        }

        box2d.step();

        // copy box2d physics results to engine objects
        for (const o of box2d.objects)
        {
            if (o.body)
            {
                // box2d uses reverse angle
                o.pos = box2d.vec2From(o.body.GetPosition());
                o.angle = -o.body.GetAngle();
            }
        }
    }
    function box2dRender()
    {
        if (box2dDebug || debugPhysics)
            box2d.world.DrawDebugData();
    }
    
    // box2d debug drawing
    function setupDebugDraw()
    {
        // setup debug draw
        const debugLineWidth = .1;
        const debugDraw = new box2d.instance.JSDraw();
        const box2dColor = (c)=> new Color(c.get_r(), c.get_g(), c.get_b());
        const box2dColorPointer = (c)=>
            box2dColor(box2d.instance.wrapPointer(c, box2d.instance.b2Color));
        const getDebugColor = (color)=>box2dColorPointer(color).scale(1,.8);
        const getPointsList = (vertices, vertexCount)=>
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
            drawLine(point1, point2, debugLineWidth, color, vec2(), 0, false);
        };
        debugDraw.DrawPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            drawPoly(points, CLEAR_WHITE, debugLineWidth, color, vec2(), 0, false);
        };
        debugDraw.DrawSolidPolygon = function(vertices, vertexCount, color)
        {
            color = getDebugColor(color);
            const points = getPointsList(vertices, vertexCount);
            drawPoly(points, color, 0, color, vec2(), 0, false);
        };
        debugDraw.DrawCircle = function(center, radius, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            drawCircle(center, radius*2, CLEAR_WHITE, debugLineWidth, color, false);
        };
        debugDraw.DrawSolidCircle = function(center, radius, axis, color)
        {
            color = getDebugColor(color);
            center = box2d.vec2FromPointer(center);
            axis = box2d.vec2FromPointer(axis).scale(radius);
            drawCircle(center, radius*2, color, debugLineWidth, color, false);
            drawLine(vec2(), axis, debugLineWidth, color, center, 0, false);
        };
        debugDraw.DrawTransform = function(transform)
        {
            transform = box2d.instance.wrapPointer(transform, box2d.instance.b2Transform);
            const pos = box2d.vec2From(transform.get_p());
            const angle = -transform.get_q().GetAngle();
            const p1 = vec2(1,0), c1 = rgb(.75,0,0,.8);
            const p2 = vec2(0,1), c2 = rgb(0,.75,0,.8);
            drawLine(vec2(), p1, debugLineWidth, c1, pos, angle, false);
            drawLine(vec2(), p2, debugLineWidth, c2, pos, angle, false);
        }
            
        debugDraw.AppendFlags(box2d.instance.b2Draw.e_shapeBit);
        debugDraw.AppendFlags(box2d.instance.b2Draw.e_jointBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_aabbBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_pairBit);
        //debugDraw.AppendFlags(box2d.instance.b2Draw.e_centerOfMassBit);
        box2d.world.SetDebugDraw(debugDraw);
    }
}