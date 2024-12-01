/*
    Little JS Box2d Demo Objects
    - Object functions that use Box2D features
    - Feel free to copy and paste these into your own project
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// spawn object functions

function spawnBox(pos, size=1, color=WHITE, type=box2dBodyTypeDynamic, applyTexture=true, angle=0)
{
    size = typeof size == 'number' ? vec2(size) : size; // square
    const o = new Box2dObject(pos, size, applyTexture && spriteAtlas.squareOutline, angle, color, type);
    o.drawSize = size.scale(1.02); // slightly enarge to cover gaps
    o.addBox(size);
    return o;
}

function spawnCircle(pos, diameter=1, color=WHITE, type=box2dBodyTypeDynamic, applyTexture=true, angle=0)
{
    const size = vec2(diameter);
    const o = new Box2dObject(pos, size, applyTexture && spriteAtlas.circleOutline, angle, color, type);
    o.addCircle(diameter);
    return o;
}

function spawnRandomPoly(pos, diameter=1, color=WHITE, type=box2dBodyTypeDynamic, angle=0)
{
    const o = new Box2dObject(pos, vec2(), 0, angle, color, type);
    o.addRandomPoly(diameter);
    return o;
}

function spawnRandomObject(pos, scale=1, type=box2dBodyTypeDynamic, angle=0)
{
    if (randInt(2))
    {
        const size = vec2(scale*rand(.5,1), scale*rand(.5,1));
        return spawnBox(pos, size, randColor(), type, true, angle);
    }
    else
    {
        const diameter = scale*rand(.5,1);
        return spawnCircle(pos, diameter, randColor(), type, true, angle);
    }
}

function spawnPyramid(pos, count)
{
    for (let i=count+1;i--;)
    for (let j=i;j--;)
        spawnBox(pos.add(vec2(j-i/2+.5,count-i+.5)), 1, randColor());
}

function spawnDominoes(pos, count, size=vec2(.5,2))
{
    for (let i=count; i--;)
        spawnBox(pos.add(vec2(i*size.y*.9,size.y/2)), size, randColor());
}

function spawnRandomEdges()
{
    // edge list along bottom
    const edgePoints = [];
    edgePoints.push(vec2(40,0));
    for (let i=40, y=0; i--;)
        edgePoints.push(vec2(i, y=clamp(y+rand(-2,2),0,5)));
    edgePoints.push(vec2(0,0));
    const o = new Box2dObject(vec2(), vec2(), 0, 0, BLACK, box2dBodyTypeStatic);
    o.addEdgeList(edgePoints);
}

function spawnRope(startPos, count, angle=PI, color=WHITE, size=vec2(.3,1))
{
    let lastObject = groundObject;
    for (let i=0; i<count; ++i)
    {
        const pos = startPos.add(size.multiply(vec2(0,i+.5)).rotate(-angle));
        const o = spawnBox(pos, size, color, box2dBodyTypeDynamic, false, angle);
        o.setFilterData(2, 2);
        const anchorPos = pos.add(vec2(0,-size.y/2).rotate(-angle));
        box2dCreateRevoluteJoint(lastObject, o, anchorPos);
        lastObject = o;
    }
    const endPos = lastObject.localToWorld(vec2(0,-size.y/2));
    box2dCreateRopeJoint(groundObject, lastObject, startPos, endPos);
    return lastObject;
}

///////////////////////////////////////////////////////////////////////////////

// simple car vehicle using wheel joints
class CarObject extends Box2dObject
{
    constructor(pos)
    {
        super(pos, vec2(), 0, 0, randColor());
        const carPoints = [
            vec2(-1.5,-.5),
            vec2(1.5, -.5),
            vec2(1.5,   0),
            vec2(0,    .9),
            vec2(-1.15,.9),
            vec2(-1.5, .2),
        ];
        this.addPoly(carPoints);

        {
            // wheel settings
            const diameter    = .8;
            const density     = 1;
            const friction    = 2;
            const restitution = 0;
            const damping     = .7;
            const frequencyHz = 4;
            const maxTorque   = 50;
            const sprite      = spriteAtlas.wheel;

            // create wheels
            this.wheels = [];
            const makeWheel = (pos, isMotor) =>
            {
                const wheel = new Box2dObject(pos, vec2(diameter), sprite);
                wheel.addCircle(diameter, vec2(), density, friction, restitution);
                this.wheels.push(wheel);
                const joint = box2dCreateWheelJoint(this, wheel);
                joint.SetSpringDampingRatio(damping);
                joint.SetSpringFrequencyHz(frequencyHz);
                if (isMotor)
                {
                    joint.SetMaxMotorTorque(maxTorque);
                    joint.EnableMotor(true);
                    this.wheelMotorJoint = joint;
                }
            }

            makeWheel(pos.add(vec2( 1, -.6)));
            makeWheel(pos.add(vec2(-1, -.65)), true);
        }
    }
    applyMotorInput(input)
    {
        const maxSpeed = 40;
        const brakeAmount = .8;
        let s = this.wheelMotorJoint.GetMotorSpeed();
        s = input ? clamp(s + input, -maxSpeed, maxSpeed) : s * brakeAmount;
        this.wheelMotorJoint.SetMotorSpeed(s);
    }
    destroy()
    {
        this.wheels.forEach(o=>o && o.destroy());
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

// changes objects color when touched
class ContactTester extends Box2dObject
{
    constructor(pos, size, color, contactColor, isCircle=true, isSensor=true)
    {
        super(pos, size, 0, 0, color, box2dBodyTypeStatic);
        isCircle ? this.addCircle(size.x) : this.addBox(size);
        this.setSensor(isSensor);
        this.contactColor = contactColor;
    }
    beginContact(other) { other.color = this.contactColor; }
    endContact(other)   { other.color = WHITE; }
}

///////////////////////////////////////////////////////////////////////////////

// balanced recursive mobile object with revolve joints
class MobileObject extends Box2dObject
{
    constructor(anchor, w, h, depth)
    {
        super(anchor, vec2(w, h), 0, 0, randColor());
        this.addBox(vec2(h/4, h), vec2(0, -h/2));
        this.childMobiles = [];
        if (--depth)
        {
            // long box on bottom
            this.addBox(vec2(w, h/4), vec2(0, -h));
            for (let i=2; i--;)
            {
                // spawn smaller mobiles attached to each side
                const a = anchor.add(vec2( w/(i?2:-2), -h));
                const o = new MobileObject(a, w/2, h, depth);
                box2dCreateRevoluteJoint(this, o, a);
                this.childMobiles.push(o);
            }
        }
    }
    destroy()
    {
        this.childMobiles.forEach(o=>o && o.destroy());
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

// pulley object renders a rope to connected point
class PulleyJointObjects extends Box2dObject
{
    constructor(pos, size, color, connectionPos)
    {
        super(pos, size, spriteAtlas.squareOutline, 0, color);
        this.addBox(size);
        this.connectionPos = connectionPos;
    }
    render()
    {
        // draw rope
        const topPos = this.localToWorld(vec2(0,this.size.y/2));
        drawLine(topPos, this.connectionPos, .2, BLACK);
        super.render();
    }
}

///////////////////////////////////////////////////////////////////////////////

// motor object renders a rope to connected point
class MotorJointObject extends Box2dObject
{
    constructor(pos, size, color, otherObject)
    {
        super(pos, size, spriteAtlas.wheel, 0, color);
        this.addCircle(size.x);
        this.connectionPos = pos;
        const joint = box2dCreateMotorJoint(otherObject, this);
        joint.SetMaxForce(500);
        joint.SetMaxTorque(500);
    }
    render()
    {
        // draw rope
        const width = 2/(1+this.pos.distance(this.connectionPos));
        drawLine(this.pos, this.connectionPos, width, BLACK);
        super.render();
    }
}

///////////////////////////////////////////////////////////////////////////////

// soft body sim using grid of weld joints
class SoftBodyObject extends Box2dObject
{
    constructor(pos, scale, sizeCount, color)
    {
        super(pos, vec2());
        const nodeSize = sizeCount.subtract(vec2(1));
        const spacing = scale.divide(nodeSize);
        const objectDiameter = min(spacing.x, spacing.y);
        this.sizeCount = sizeCount.copy();

        // create nodes
        this.nodes = [];
        for (let y=sizeCount.y; y--;)
        for (let x=sizeCount.y; x--;)
        {
            const mass = .1;
            const center = vec2(x-nodeSize.x/2, y-nodeSize.y/2);
            const p = pos.add(center.multiply(spacing));
            const o = new Box2dObject(p, vec2(objectDiameter*1.1), spriteAtlas.circle, 0, color);
            o.addCircle(objectDiameter);
            o.setMass(mass);
            o.setAngularDamping(10);
            o.joints = [];
            this.nodes.push(o);
        }
        // attach joints
        for (let y=sizeCount.y; y--;)
        for (let x=sizeCount.x; x--;)
        {
            const o = this.getNode(x, y);
            const tryAddJoint = (xo, yo) =>
            {
                const o2 = this.getNode(x+xo, y+yo);
                const joint = o2 ? box2dCreateWeldJoint(o, o2) : 0;
                o.joints.push(joint);
            }

            // attach horizontal and vertical joints first
            tryAddJoint(1, 0);
            tryAddJoint(0, 1);
        }
    }
    render()
    {
        // fill inside background with a poly around the perimeter
        const poly = [];
        const sx = this.sizeCount.x;
        const sy = this.sizeCount.y;
        for (let x = 0; x < sx; ++x) poly.push(this.getNode(x, 0).pos);
        for (let y = 0; y < sy.y; ++y) poly.push(this.getNode(sx-1, y).pos);
        for (let x = sx; x--;) poly.push(this.getNode(x, sy-1).pos);
        for (let y = sy; y--;) poly.push(this.getNode(0, y).pos);
        box2dDrawPoly(vec2(), 0, poly, BLACK)
    }
    getNode(x, y) 
    {
        if (vec2(x,y).arrayCheck(this.sizeCount))
            return this.nodes[y*this.sizeCount.x+x];
    }
    destroy()
    {
        this.nodes.forEach(o=>o && o.destroy());
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

// cloth sim using grid of rope joints
class ClothObject extends Box2dObject
{
    constructor(pos, scale, sizeCount, color, maxJointStress=10)
    {
        super(pos, vec2(), 0, 0, color, box2dBodyTypeStatic);
        const nodeSize = sizeCount.subtract(vec2(1));
        const spacing = scale.divide(nodeSize);
        const objectDiameter = min(spacing.x, spacing.y);
        this.sizeCount = sizeCount.copy();
        this.maxJointStress = maxJointStress;
        this.lineWidth = .1;

        // create nodes
        this.nodes = [];
        for (let y=sizeCount.y; y--;)
        for (let x=sizeCount.y; x--;)
        {
            const mass = .5;
            const center = vec2(x-nodeSize.x/2, y-nodeSize.y/2);
            const p = pos.add(center.multiply(spacing));
            const o = new Box2dObject(p, vec2(.4), spriteAtlas.circle, 0, color);
            o.addCircle(objectDiameter);
            o.setFilterData(2, 2);
            o.setLinearDamping(1);
            o.setMass(mass);
            o.joints = [];
            this.nodes.push(o);
        }
        // attach joints
        for (let pass=2; pass--;)
        for (let y=sizeCount.y; y--;)
        for (let x=sizeCount.x; x--;)
        {
            // alternate direction each row for stability
            const d = y%2 ? 1 : -1;
            const x2 = d>1 ? x : sizeCount.x-1-x;
            const o = this.getNode(x2, y);
            const tryAddJoint = (xo, yo) =>
            {
                const o2 = this.getNode(x2+xo, y+yo);
                const joint = o2 ? box2dCreateRopeJoint(o, o2) : 0;
                o.joints.push(joint);
            }

            if (pass)
            {
                // attach horizontal and vertical joints first
                tryAddJoint(d, 0);
                tryAddJoint(0, 1);
            }
            else
            {
                // attach cross joints
                tryAddJoint(-d, 1);
                tryAddJoint( d, 1);

                // attach pin joint to top row
                y || box2dCreatePinJoint(this, this.getNode(x, y));
            }
        }
    }
    getNode(x, y) 
    {
        if (vec2(x,y).arrayCheck(this.sizeCount))
            return this.nodes[y*this.sizeCount.x+x];
    }
    update()
    {
        for (let y=this.sizeCount.y; y--;)
        for (let x=this.sizeCount.x; x--;)
        {
            const o = this.getNode(x, y)
            if (!o) continue;

            // check node joints
            const joints = o.joints;
            for (let i=joints.length; i--;)
            {
                const j = joints[i];
                if (!j) continue;

                const oA = j.GetBodyA().object;
                const oB = j.GetBodyB().object;
                const d2 = oA.pos.distanceSquared(oB.pos);
                const maxLength2 = j.GetMaxLength()**2;
                const stress = vec2(j.GetReactionForce(1)).length();
                if (stress > this.maxJointStress || d2 > maxLength2*4)
                {
                    // remove stessed joint
                    box2dDestroyJoint(j);
                    joints[i] = 0;
                }
            }
            if (!o.hasJoints())
            {
                // destroy if not connected to anything
                o.destroy();
                this.nodes[y*this.sizeCount.x+x] = 0;
            }
        }
        super.update();
    }
    render()
    {
        // draw connections
        for (const o of this.nodes)
        {
            if (!o) continue;
            for (const joint of o.joints)
            {
                if (!joint) continue;
                const oA = joint.GetBodyA().object;
                const oB = joint.GetBodyB().object;
                drawLine(oA.pos, oB.pos, this.lineWidth, BLACK);
            }
        }
    }
    destroy()
    {
        this.nodes.forEach(o=>o && o.destroy());
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////
// Effects

const sound_click = new Sound([.2,.1,,,,.01,,,,,,,,,,,,,,,-500]); // Loaded Sound 0
const sound_explosion = new Sound([.5,.2,72,.01,.01,.2,4,,,,,,,1,,.5,.1,.5,.02]);

function explosion(pos, radius=3, strength=300)
{
    sound_explosion.play(pos);
    const objects = box2dCircleCastAll(pos, (radius*2));
    const newColor = randColor();
    for (const o of objects)
    {
        const p = percent(o.pos.distance(pos), 2*radius, radius);
        const force = o.pos.subtract(pos).normalize(p*radius*strength);
        o.applyForce(force);
        o.color = newColor;
    }

    // smoke
    new ParticleEmitter(
        pos, 0,                     // pos, angle
        radius/2, .2, 50*radius, PI,// emitSize, emitTime, emitRate, emiteCone
        spriteAtlas.dot,            // tileInfo
        hsl(0,0,0),   hsl(0,0,0),   // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,0,0), // colorEndA, colorEndB
        1, 1, 2, .1, .1,    // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.5, PI, .1, // damp, angleDamp, gravity, particleCone, fade
        1, 0, 0, 0, 1e8     // randomness, collide, additive, colorLinear, renderOrder
    );

    // fire
    new ParticleEmitter(
        pos, 0,                         // pos, angle
        radius, .1, 100*radius, PI,     // emitSize, emitTime, emitRate, emiteCone
        spriteAtlas.dot,                // tileInfo
        hsl(0,1,.5),   hsl(.15,1,.5),   // colorStartA, colorStartB
        hsl(0,1,.5,0), hsl(.1, 1,.5,0), // colorEndA, colorEndB
        .7, 1, .5, .1, .1, // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, 0, PI, .05, // damp, angleDamp, gravity, particleCone, fade
        1, 0, 1, 0, 1e9    // randomness, collide, additive, colorLinear, renderOrder
    );
}
