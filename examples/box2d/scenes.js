/*
    LittleJS Box2D Example - Secenes
    - Each scene demonstrates a feature of Box2D
*/

'use strict';

//box2dDebug = 1; // enable box2d debug draw  
function loadScene(_scene)
{
    scene = _scene;

    // setup
    cameraPos = vec2(20,10);
    setGravity(-20);

    // destroy old scene
    engineObjectsDestroy();
    carWheelJoint = 0;
    mouseJoint = 0;
    
    // create walls
    groundObject = spawnBox(vec2(0,-4), vec2(1e3,8), hsl(0,0,.2), box2dBodyTypeStatic);
    spawnBox(vec2(-4, 0), vec2(8,1e3), BLACK, box2dBodyTypeStatic);
    spawnBox(vec2(44, 0), vec2(8,1e3), BLACK, box2dBodyTypeStatic);
    spawnBox(vec2(0,100), vec2(1e3,8), BLACK, box2dBodyTypeStatic);

    if (scene == 0)
    {
        sceneName = 'Shapes';
        spawnRandomEdges();
        spawnBox(vec2(11,8), 4,  randColor(), box2dBodyTypeStatic, false);
        spawnCircle(vec2(20,8), 4,     randColor(), box2dBodyTypeStatic, false);
        spawnRandomPoly(vec2(29,8), 4, randColor(), box2dBodyTypeStatic, false);
        for (let i=500;i--;)
            spawnRandomObject(vec2(rand(1,39), rand(10,50)));
    }
    if (scene == 1)
    {
        sceneName = 'Pyramid';
        spawnPyramid(vec2(20,0), 15);
        spawnBox(vec2(10,2), 4, randColor());
        spawnCircle(vec2(30,2), 4, randColor());
    }
    if (scene == 2)
    {
        sceneName = 'Dominoes';
        spawnDominoes(vec2(11,11), 11);
        spawnDominoes(vec2(2,0), 13, vec2(1,3));
        spawnCircle(vec2(10,20), 2, randColor());
        spawnCircle(vec2(31.7,12), 2, randColor());
        spawnBox(vec2(16,11), vec2(32,1), randColor(), box2dBodyTypeStatic, false);
        spawnBox(vec2(24,6.5), vec2(32,1), randColor(), box2dBodyTypeStatic, false, -.15);
    }
    if (scene == 3)
    {
        sceneName = 'Car';
        spawnCar(vec2(10,2));
        spawnBox(vec2(20,0), vec2(10,2), randColor(), box2dBodyTypeStatic, false, -.2);
        spawnPyramid(vec2(32,0), 6);
    }
    if (scene == 4)
    {
        sceneName = 'Rope';
        const startPos = vec2(20, 14);
        const angle = PI/2;
        const color = randColor();
        const count = 10;
        const endObject = spawnRope(startPos, count, angle, color);

        // connect box to end
        const endPos = endObject.localToWorld(vec2(0,-endObject.size.y/2));
        const o = spawnBox(endPos, 3, randColor());
        o.setAngularDamping(.5);
        o.setFilterData(2, 2);
        box2dCreateRevoluteJoint(endObject, o);
        spawnPyramid(vec2(20,0), 7);
    }
    if (scene == 5)
    {
        sceneName = 'Raycasts';
        spawnRandomEdges();
        for (let i=100;i--;)
            spawnRandomObject(vec2(rand(1,39), rand(20)), 2, box2dBodyTypeStatic, rand(PI*2));
    }
    if (scene == 6)
    {
        sceneName = 'Joints';
        {
            // prismatic joint
            const o1 = spawnBox(vec2(20,8), vec2(3,2), randColor());
            box2dCreatePrismaticJoint(groundObject, o1, o1.pos, vec2(1,0), true);
            const o2 = spawnBox(vec2(20,15), vec2(2,3), randColor());
            box2dCreatePrismaticJoint(groundObject, o2, o2.pos, vec2(0,1), true);

            // lines to make it look line a track
            const l1 = new EngineObject(vec2(20, 8), vec2(39,.5), 0, 0, GRAY);
            const l2 = new EngineObject(vec2(20,50), vec2(.5,99), 0, 0, GRAY);
            l1.gravityScale = l2.gravityScale = 0;
            l1.renderOrder = l2.renderOrder = -2;
        }
        {
            // pulley object renders a rope to connected point
            class PulleyObjects extends Box2dObject
            {
                constructor(pos, size, color, connectionPos)
                {
                    super(pos, size, tile(3), 0, color);
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

            // pulley joint
            const anchorA = vec2(14,15);
            const anchorB = vec2(26,15);
            const oA = new PulleyObjects(vec2(15,8), vec2(1,2), randColor(), anchorA);
            const oB = new PulleyObjects(vec2(25,8), vec2(1,2), randColor(), anchorB);
            const aA = spawnCircle(anchorA, 2, randColor(), box2dBodyTypeStatic);
            const aB = spawnCircle(anchorB, 2, randColor(), box2dBodyTypeStatic);
            const oaA = oA.localToWorld(vec2(0,oA.size.y/2));
            const oaB = oB.localToWorld(vec2(0,oB.size.y/2));
            box2dCreatePulleyJoint(oA, oB, aA.pos, aB.pos, oaA, oaB);

            // a line to make it look like conneting rope
            const line = new EngineObject(vec2(20,15), vec2(10,.2), 0, 0, BLACK);
            line.gravityScale = 0;
            line.renderOrder = -1;
        }
        {
            // gear joint
            const o1 = spawnCircle(vec2(23.5,3), 3, randColor());
            const j1 = box2dCreateRevoluteJoint(groundObject, o1, o1.pos);
            const o2 = spawnCircle(vec2(28,3), 6, randColor());
            o1.tileInfo = o2.tileInfo = tile(5);
            const j2 = box2dCreateRevoluteJoint(groundObject, o2, o2.pos);
            box2dCreateGearJoint(o1, o2, j1, j2, 2);
        }
        {
            // weld joint
            const o1 = spawnBox(vec2(15,2),   4, randColor());
            const o2 = spawnBox(vec2(17,2), 2, randColor());
            box2dCreateWeldJoint(o1, o2);
        }
        {
            // distance joint
            const o1 = new Box2dObject(vec2(30,11), vec2(4), tile(2), 0, randColor(), box2dBodyTypeStatic);
            o1.renderOrder = -2;
            const o2 = spawnCircle(vec2(30,8), 2, randColor());
            box2dCreateDistanceJoint(o1, o2);
        }
        {
            // motor object renders a rope to connected point
            class MotorObject extends Box2dObject
            {
                constructor(pos, size, color, otherObject)
                {
                    super(pos, size, tile(4), 0, color);
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

            // motor joint
            const o = new Box2dObject(vec2(10,8), vec2(4), tile(2), 0, randColor(), box2dBodyTypeStatic);
            o.renderOrder = -2;
            new MotorObject(vec2(10,8), vec2(2), randColor(), o);
        }
        {
            // friction joint
            const o = spawnBox(vec2(10,15), 3, randColor());
            o.tileInfo = tile(6);
            const joint = box2dCreateFrictionJoint(groundObject, o);
            joint.SetMaxForce(200);
            joint.SetMaxTorque(200);
        }
    }
    if (scene == 7)
    {
        sceneName = 'Contacts';
        // changes objects color when touched
        class ContactTester extends Box2dObject
        {
            constructor(pos, size, color, contactColor, isSensor=false)
            {
                super(pos, size, 0, 0, color, box2dBodyTypeStatic);
                if (isSensor)
                {
                    this.addCircle(size.x);
                    this.setSensor(isSensor);
                }
                else
                    this.addBox(size);
                this.contactColor = contactColor;
            }
            beginContact(other) { other.color = this.contactColor; }
            endContact(other)   { other.color = WHITE; }
        }
        new ContactTester(vec2(15,8), vec2(5), hsl(0,0,0,.3), RED, true);
        new ContactTester(vec2(25,8), vec2(5), hsl(0,0,.1), GREEN);
        for (let i=200;i--;)
            spawnRandomObject(vec2(rand(1,39), rand(10,50)));
    }
    if (scene == 8)
    {
        sceneName = 'Mobile';
        const pos = vec2(20, 16);
        const mobile = spawnMobile(pos, 12, 2, 5);
        box2dCreateRevoluteJoint(groundObject, mobile, pos);
    }
    if (scene == 9)
    {
        sceneName = 'Cloth';

        class ClothObjectNode extends Box2dObject
        {
            constructor(pos,diameter)
            {
                super(pos, vec2(.4), tile(0),0, BLACK);
                this.addCircle(diameter);
                this.setFilterData(1,1);
                this.joints = [];
            }

            makeJoint(other)
            {
                if (!other)
                    return;
                    
                box2dCreateRopeJoint(this, other);
            }

        }
        class ClothObject extends Box2dObject
        {
            constructor(pos, size, sizeCount)
            {
                super(pos, vec2(), 0, 0, BLACK, box2dBodyTypeStatic);
                const nodeSize = sizeCount.subtract(vec2(1));
                const spacing = size.divide(nodeSize);
                const minNodeSpace = min(spacing.x,spacing.y);
                this.gravityScale = 0;
                this.sizeCount = sizeCount.copy();
                this.lineWidth = .2;
                this.nodes = [];
                for (let y=sizeCount.y; y--;)
                for (let x=sizeCount.y;  x--;)
                {
                    const p = pos.add(vec2(x-nodeSize.x/2,y-nodeSize.y/2).multiply(spacing));
                    const o = new ClothObjectNode(p, minNodeSpace);
                    this.nodes.push(o);
                }
                for (let y=sizeCount.y; y--;)
                for (let x=sizeCount.x; x--;)
                {
                    // attach neighbors
                    const o = this.getNode(x, y);
                    const tryAddJoint = (ox,oy) =>
                    { o.makeJoint(this.getNode(x+ox, y+oy)); }
                    tryAddJoint(1,0);
                    tryAddJoint(0,1);
                    tryAddJoint(1,1);
                    tryAddJoint(1,-1);
                    y || box2dCreatePinJoint(this, o);
                }

            }
            getNode(x, y) 
            {
                if (vec2(x,y).arrayCheck(this.sizeCount))
                    return this.nodes[y*this.sizeCount.x+x];
            }
            render()
            {
                // draw background fill
                const fillBackground = (context)=>
                {
                    for (let y=this.sizeCount.y; y--;)
                    for (let x=this.sizeCount.x; x--;)
                    {
                        const o = this.getNode(x, y);
                        const n1 = this.getNode(x+1, y);
                        const n2 = this.getNode(x, y+1);
                        const n3 = this.getNode(x+1, y+1);
                        if (!o || !n1 || !n2|| !n3) continue;

                        const color = o.color.copy();
                        color.a = .5;
                        context.fillStyle = color.toString();
                        context.beginPath();
                        context.lineTo(o.pos.x, o.pos.y);
                        context.lineTo(n1.pos.x, n1.pos.y);
                        context.lineTo(n3.pos.x, n3.pos.y);
                        context.lineTo(n2.pos.x, n2.pos.y);
                        context.fill();
                    }
                }

                if (this.fillBackground)
                    drawCanvas2D(vec2(), vec2(1), 0, 0, fillBackground, 0, mainContext);

                // draw connection lines
                for (let y=this.sizeCount.y; y--;)
                for (let x=this.sizeCount.x; x--;)
                {
                    const o = this.getNode(x, y);
                    if (!o) continue;
                    const drawConnection = (ox, oy)=>
                    {
                        const n = this.getNode(x+ox, y+oy);
                        n && drawLine(p, n.pos, this.lineWidth, o.color);
                    }
                    const p = o.pos;
                    drawConnection(1,0);
                    drawConnection(0,1);
                }
            }
        }
        
        new ClothObject(vec2(20, 9), vec2(15), vec2(20));
    }
    
    // helper functions
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
    function spawnCar(pos)
    {
        // car object
        const car = new Box2dObject(pos, vec2(), 0, 0, randColor());
        const carPoints = [
			vec2(-1.5,-.5),
			vec2(1.5, -.5),
			vec2(1.5,   0),
			vec2(0,    .9),
			vec2(-1.15,.9),
			vec2(-1.5, .2),
        ];
        car.addPoly(carPoints);

        // wheel settings
        const frequencyHz = 4;
        const dampingRatio = .7;
        const wheelDensity = 1;
        const wheelFriction = 2;
        const wheelRestitution = 0;
        const wheelSize = .8;

        // back wheel
        const wheel1Pos = pos.add(vec2(-1, -.65));
        const wheel1 = new Box2dObject(wheel1Pos, vec2(wheelSize), tile(4));
        wheel1.addCircle(wheelSize,vec2(),wheelDensity,wheelFriction,wheelRestitution);
        const joint1 = box2dCreateWheelJoint(car,wheel1);
        joint1.SetSpringDampingRatio(dampingRatio);
        joint1.SetSpringFrequencyHz(frequencyHz);
        joint1.SetMaxMotorTorque(50);
        joint1.EnableMotor(true);
        carWheelJoint = joint1;

        // front wheel
        const wheel2Pos = pos.add(vec2(1, -.6));
        const wheel2 = new Box2dObject(wheel2Pos, vec2(wheelSize), tile(4));
        wheel2.addCircle(wheelSize,vec2(),wheelDensity,wheelFriction,wheelRestitution);
        const joint2 = box2dCreateWheelJoint(car,wheel2);
        joint2.SetSpringDampingRatio(dampingRatio);
        joint2.SetSpringFrequencyHz(frequencyHz);
    }
    function spawnMobile(anchor, w, h, depth)
    {
        // tall box
        const pos = anchor.add(vec2(0,-h/2));
        const o = spawnBox(pos, vec2(h/4, h), randColor(), box2dBodyTypeDynamic, false);
        if (--depth)
        {
            // long box on bottom
            o.addBox(vec2(w, h/4), vec2(0, -h/2));

            // spawn smaller mobiles attached to each side
            for (let i=2; i--;)
            {
                const a = anchor.add(vec2( w/2*(i?1:-1), -h));
                const o2 = spawnMobile(a, w/2, h, depth);
                box2dCreateRevoluteJoint(o, o2, a);
            }
        }
        return o;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Spawn object functions

function spawnBox(pos, size=1, color=WHITE, type=box2dBodyTypeDynamic, applyTexture=true, angle=0)
{
    size = typeof size == 'number' ? vec2(size) : size; // square
    const o = new Box2dObject(pos, size, applyTexture && tile(3), angle, color, type);
    o.addBox(size);
    return o;
}

function spawnCircle(pos, diameter=1, color=WHITE, type=box2dBodyTypeDynamic, applyTexture=true, angle=0)
{
    const size = vec2(diameter);
    const o = new Box2dObject(pos, size, applyTexture && tile(2), angle, color, type);
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

///////////////////////////////////////////////////////////////////////////////
// Effects

const sound_click = new Sound([,.1]);
const sound_explosion = new Sound([,.2,72,.01,.01,.2,4,,,,,,,1,,.5,.1,.5,.02]);

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
        tile(1),                    // tileInfo
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
        tile(1),                        // tileInfo
        hsl(0,1,.5),   hsl(.15,1,.5),   // colorStartA, colorStartB
        hsl(0,1,.5,0), hsl(.1, 1,.5,0), // colorEndA, colorEndB
        .7, 1, .5, .1, .1, // time, sizeStart, sizeEnd, speed, angleSpeed
        .9, 1, 0, PI, .05, // damp, angleDamp, gravity, particleCone, fade
        1, 0, 1, 0, 1e9    // randomness, collide, additive, colorLinear, renderOrder
    );
}
