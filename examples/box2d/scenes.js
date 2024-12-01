/*
    LittleJS Box2D Example - Secenes
    - Each scene demonstrates a feature of Box2D
    - Feel free to use tis code in your own projects
    - 0  = Shapes: box, circle, poly, and edge
    - 1  = Pyramid stack
    - 2  = Dominoes chain reaction
    - 3  = Car with controls
    - 4  = Rope with box attached
    - 5  = Raycasts in all directions
    - 6  = Joints demo with every joint type
    - 7  = Contacts begin and end callbacks
    - 8  = Mobile object with multiple bodies
    - 9  = Cloth object grid using rope joints
    - 10 = Softbody object grid using weld joints
*/

'use strict';

function loadScene(_scene)
{
    scene = _scene;

    // setup
    cameraPos = vec2(20,10);
    setGravity(-20);

    // destroy old scene
    engineObjectsDestroy();
    mouseJoint = 0;
    car = 0;
    
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
        car = new CarObject(vec2(10,2));
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
            // pulley joint
            const anchorA = vec2(14,15);
            const anchorB = vec2(26,15);
            const oA = new PulleyJointObjects(vec2(15,8), vec2(1,2), randColor(), anchorA);
            const oB = new PulleyJointObjects(vec2(25,8), vec2(1,2), randColor(), anchorB);
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
            o1.tileInfo = o2.tileInfo = spriteAtlas.gear;
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
            const o1 = new Box2dObject(vec2(30,11), vec2(4), spriteAtlas.circleOutline, 0, randColor(), box2dBodyTypeStatic);
            o1.renderOrder = -2;
            const o2 = spawnCircle(vec2(30,8), 2, randColor());
            box2dCreateDistanceJoint(o1, o2);
        }
        {
            // motor joint
            const o = new Box2dObject(vec2(10,8), vec2(4), spriteAtlas.circleOutline, 0, randColor(), box2dBodyTypeStatic);
            o.renderOrder = -2;
            new MotorJointObject(vec2(10,8), vec2(2), randColor(), o);
        }
        {
            // friction joint
            const o = spawnBox(vec2(10,15), 3, randColor());
            o.tileInfo = spriteAtlas.squareOutline2;
            const joint = box2dCreateFrictionJoint(groundObject, o);
            joint.SetMaxForce(200);
            joint.SetMaxTorque(200);
        }
    }
    if (scene == 7)
    {
        sceneName = 'Contacts';
        new ContactTester(vec2(15,8), vec2(5), RED,  RED);
        new ContactTester(vec2(25,8), vec2(5), CYAN, CYAN, false, false);
        for (let i=200;i--;)
            spawnRandomObject(vec2(rand(1,39), rand(10,50)));
    }
    if (scene == 8)
    {
        sceneName = 'Mobile';
        const pos = vec2(20, 16);
        const mobile = new MobileObject(pos, 12, 2, 5);
        box2dCreateRevoluteJoint(groundObject, mobile, pos);
    }
    if (scene == 9)
    {
        sceneName = 'Cloth';
        new ClothObject(vec2(20, 9), vec2(15), vec2(24), randColor());
    }
    if (scene == 10)
    {
        sceneName = 'Softbodies';
        for(let i=3;i--;)
            new SoftBodyObject(vec2(20, 3+i*7), vec2(6-i), vec2(9-i), randColor());
    }
}