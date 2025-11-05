/*
    Little JS Box2d Demo Objects
    - Object functions that use Box2D features
    - Feel free to copy and paste these into your own project
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as Game from './game.js';
const {vec2, hsl} = LJS;

///////////////////////////////////////////////////////////////////////////////
// spawn object functions

const density = 1;
const friction = .5;
const restitution = .2;

export function spawnBox(pos, size=1, color=LJS.WHITE, type=LJS.box2d.bodyTypeDynamic, applyTexture=false, angle=0)
{
    size = typeof size === 'number' ? vec2(size) : size; // square
    const o = new LJS.Box2dObject(pos, size, applyTexture && Game.spriteAtlas.squareOutline, angle, color, type);
    o.drawSize = size.scale(1.02); // slightly enlarge to cover gaps
    o.addBox(size, vec2(), 0, density, friction, restitution);
    return o;
}

export function spawnCircle(pos, diameter=1, color=LJS.WHITE, type=LJS.box2d.bodyTypeDynamic, applyTexture=false, angle=0)
{
    const size = vec2(diameter);
    const o = new LJS.Box2dObject(pos, size, applyTexture && Game.spriteAtlas.circleOutline, angle, color, type);
    o.addCircle(diameter, vec2(), density, friction, restitution);
    return o;
}

export function spawnRandomPoly(pos, diameter=1, color=LJS.WHITE, type=LJS.box2d.bodyTypeDynamic, angle=0)
{
    const o = new LJS.Box2dObject(pos, vec2(), 0, angle, color, type);
    o.addRandomPoly(diameter, density, friction, restitution);
    return o;
}

export function spawnRandomObject(pos, scale=1, type=LJS.box2d.bodyTypeDynamic, angle=0)
{
    if (LJS.randInt(2))
    {
        const size = vec2(scale*LJS.rand(.5,1), scale*LJS.rand(.5,1));
        return spawnBox(pos, size, LJS.randColor(), type, true, angle);
    }
    else
    {
        const diameter = scale*LJS.rand(.5,1);
        return spawnCircle(pos, diameter, LJS.randColor(), type, true, angle);
    }
}

export function spawnPyramid(pos, count)
{
    for (let i=count+1;i--;)
    for (let j=i;j--;)
        spawnBox(pos.add(vec2(j-i/2+.5,count-i+.5)), 1, LJS.randColor());
}

export function spawnDominoes(pos, count, size=vec2(.5,3))
{
    for (let i=count; i--;)
        spawnBox(pos.add(vec2(i*size.y*.9,size.y/2)), size, LJS.randColor());
}

export function spawnRandomEdges()
{
    // edge list along bottom
    const edgePoints = [];
    edgePoints.push(vec2(40,0));
    for (let i=40, y=0; i--;)
        edgePoints.push(vec2(i, y=LJS.clamp(y+LJS.rand(-2,2),0,5)));
    edgePoints.push(vec2());
    const o = new LJS.Box2dStaticObject;
    o.addEdgeList(edgePoints);
}

export function spawnRope(startPos, count, angle=PI, color=LJS.WHITE, size=vec2(.3,1))
{
    let lastObject = Game.groundObject;
    for (let i=0; i<count; ++i)
    {
        const pos = startPos.add(size.multiply(vec2(0,i+.5)).rotate(-angle));
        const o = spawnBox(pos, size, color, LJS.box2d.bodyTypeDynamic, false, angle);
        o.setFilterData(2, 2);
        const anchorPos = pos.add(vec2(0,-size.y/2).rotate(-angle));
        new LJS.Box2dRevoluteJoint(lastObject, o, anchorPos);
        lastObject = o;
    }
    const endPos = lastObject.localToWorld(vec2(0,-size.y/2));
    new LJS.Box2dRopeJoint(Game.groundObject, lastObject, startPos, endPos);
    return lastObject;
}

///////////////////////////////////////////////////////////////////////////////

// simple car vehicle using wheel joints
export class CarObject extends LJS.Box2dObject
{
    constructor(pos)
    {
        super(pos, vec2(), 0, 0, LJS.randColor());
        const carPoints = [
            vec2(-1.5,-.5),
            vec2(1.5, -.5),
            vec2(1.5,   0),
            vec2(0,    .9),
            vec2(-1.15,.9),
            vec2(-1.5, .2),
        ];
        this.addPoly(carPoints);

        // create wheels
        const diameter    = 1;
        const density     = 1;
        const friction    = 1;
        const restitution = 0;
        const damping     = .7;
        const frequency   = 4;
        const maxTorque   = 35;
        const sprite      = Game.spriteAtlas.wheel;
        this.wheels = [];
        const makeWheel = (pos, isMotor) =>
        {
            const wheel = new LJS.Box2dObject(pos, vec2(diameter), sprite);
            const joint = new LJS.Box2dWheelJoint(this, wheel);
            joint.setSpringDampingRatio(damping);
            joint.setSpringFrequencyHz(frequency);
            if (isMotor)
            {
                joint.enableMotor();
                joint.setMaxMotorTorque(maxTorque);
                this.wheelMotorJoint = joint;
            }
            wheel.addCircle(diameter, vec2(), density, friction, restitution);
            this.wheels.push(wheel);
        }

        makeWheel(pos.add(vec2( 1, -.6)));
        makeWheel(pos.add(vec2(-1, -.65)), true);
    }
    update()
    {
        // car controls
        const maxSpeed = 40;
        const input = LJS.keyDirection().x;
        let s = this.wheelMotorJoint.getMotorSpeed();
        s = input ? LJS.clamp(s - input, -maxSpeed, maxSpeed) : 0;
        this.wheelMotorJoint.setMotorSpeed(s);
    }
    destroy()
    {
        this.wheels.forEach(o=>o.destroy());
        super.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

// changes objects color when touched
export class ContactTester extends LJS.Box2dStaticObject
{
    constructor(pos, size, color, contactColor, isCircle=true, isSensor=true)
    {
        super(pos, size, 0, 0, color);
        isCircle ? this.addCircle(size.x) : this.addBox(size);
        this.setSensor(isSensor);
        this.contactColor = contactColor;
    }
    beginContact(other) { other.color = this.contactColor; }
    endContact(other)   { other.color = LJS.WHITE; }
}

///////////////////////////////////////////////////////////////////////////////

// balanced recursive mobile object with revolve joints
export class MobileObject extends LJS.Box2dObject
{
    constructor(anchor, w, h, depth)
    {
        super(anchor, vec2(w, h), 0, 0, LJS.randColor());
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
                new LJS.Box2dRevoluteJoint(this, o, a);
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
export class PulleyJointObjects extends LJS.Box2dObject
{
    constructor(pos, size, color, connectionPos)
    {
        super(pos, size, Game.spriteAtlas.squareOutline, 0, color);
        this.addBox(size);
        this.connectionPos = connectionPos;
    }
    render()
    {
        // draw rope
        const topPos = this.localToWorld(vec2(0,this.size.y/2));
        LJS.drawLine(topPos, this.connectionPos, .2, LJS.BLACK);
        super.render();
    }
}

///////////////////////////////////////////////////////////////////////////////

// motor object renders a rope to connected point
export class MotorJointObject extends LJS.Box2dObject
{
    constructor(pos, size, color, otherObject)
    {
        super(pos, size, Game.spriteAtlas.wheel, 0, color);
        this.addCircle(size.x);
        this.connectionPos = pos;
        const joint = new LJS.Box2dMotorJoint(otherObject, this);
        joint.setMaxForce(500);
        joint.setMaxTorque(500);
    }
    render()
    {
        // draw rope
        const width = 2/(1+this.pos.distance(this.connectionPos));
        LJS.drawLine(this.pos, this.connectionPos, width, LJS.BLACK);
        super.render();
    }
}

///////////////////////////////////////////////////////////////////////////////

// soft body sim using grid of weld joints
export class SoftBodyObject extends LJS.Box2dObject
{
    constructor(pos, scale, sizeCount, color)
    {
        super(pos, vec2());
        const nodeSize = sizeCount.subtract(vec2(1));
        const spacing = scale.divide(nodeSize);
        const objectDiameter = LJS.min(spacing.x, spacing.y);
        this.sizeCount = sizeCount.copy();

        // create nodes
        this.nodes = [];
        for (let y=sizeCount.y; y--;)
        for (let x=sizeCount.y; x--;)
        {
            const mass = .1;
            const center = vec2(x-nodeSize.x/2, y-nodeSize.y/2);
            const p = pos.add(center.multiply(spacing));
            const o = new LJS.Box2dObject(p, vec2(objectDiameter*1.1), Game.spriteAtlas.circle, 0, color);
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
                const joint = o2 ? new LJS.Box2dWeldJoint(o, o2) : 0;
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
        LJS.drawPoly(poly, LJS.BLACK)
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
export class ClothObject extends LJS.Box2dStaticObject
{
    constructor(pos, scale, sizeCount, color, maxJointStress=10)
    {
        super(pos, vec2(), 0, 0, color);
        const nodeSize = sizeCount.subtract(vec2(1));
        const spacing = scale.divide(nodeSize);
        const objectDiameter = LJS.min(spacing.x, spacing.y);
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
            const o = new LJS.Box2dObject(p, vec2(.4), Game.spriteAtlas.circle, 0, color);
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
                const joint = o2 ? new LJS.Box2dRopeJoint(o, o2) : 0;
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
                y || new LJS.Box2dPinJoint(this.getNode(x, y), this);
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

                const oA = j.getObjectA();
                const oB = j.getObjectB();
                const d2 = oA.pos.distanceSquared(oB.pos);
                const maxLength2 = j.getMaxLength()**2;
                const stress = j.getReactionForce(1).length();
                if (stress > this.maxJointStress || d2 > maxLength2*4)
                {
                    // remove stressed joint
                    j.destroy();
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
                const oA = joint.getObjectA();
                const oB = joint.getObjectB();
                LJS.drawLine(oA.pos, oB.pos, this.lineWidth, LJS.BLACK);
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

const sound_explosion = new LJS.Sound([.5,.2,72,.01,.01,.2,4,,,,,,,1,,.5,.1,.5,.02]);

export function explosion(pos, radius=3, strength=300)
{
    sound_explosion.play(pos);
    const objects = LJS.box2d.circleCastAll(pos, (radius*2));
    const newColor = LJS.randColor();
    for (const o of objects)
    {
        const p = LJS.percent(o.pos.distance(pos), 2*radius, radius);
        const force = o.pos.subtract(pos).normalize(p*radius*strength);
        o.applyForce(force);
        o.color = newColor;
    }

    // smoke
    new LJS.ParticleEmitter(
        pos, 0,                       // pos, angle
        radius/2, .2, 50*radius, 3.14,// emitSize, emitTime, rate, cone
        Game.spriteAtlas.dot,         // tileInfo
        hsl(0,0,0),   hsl(0,0,0),     // colorStartA, colorStartB
        hsl(0,0,0,0), hsl(0,0,0,0),   // colorEndA, colorEndB
        1, 1, 2, .1, .1,      // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, -.5, 3.14, .1, // damp, angleDamp, gravity, particleCone, fade
        1, 0, 0, 0, 1e8       // randomness, collide, additive, colorLinear, renderOrder
    );

    // fire
    new LJS.ParticleEmitter(
        pos, 0,                        // pos, angle
        radius, .1, 100*radius, 3.14,  // emitSize, emitTime, rate, cone
        Game.spriteAtlas.dot,          // tileInfo
        hsl(0,.8,.5),  hsl(.15,.8,.5), // colorStartA, colorStartB
        hsl(0,1,.5,0), hsl(.1, 1,.5,0),// colorEndA, colorEndB
        .7, 1, .5, .1, .1,   // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, 0, 3.14, .05, // damp, angleDamp, gravity, particleCone, fade
        1, 0, 1, 0, 1e9      // randomness, collide, additive, colorLinear, renderOrder
    );
}