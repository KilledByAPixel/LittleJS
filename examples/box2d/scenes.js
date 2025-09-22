/*
    LittleJS Box2D Example - Scenes
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

// import game module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameObjects from './gameObjects.js';
import * as Game from './game.js';
const {vec2} = LJS;

export let scene, sceneName;

export function loadScene(_scene)
{
    scene = _scene;

    if (scene == 0)
    {
        sceneName = 'Shapes';
        GameObjects.spawnRandomEdges();
        GameObjects.spawnBox(vec2(11,8), 4, LJS.randColor(), LJS.box2d.bodyTypeStatic, false);
        GameObjects.spawnCircle(vec2(20,8), 4, LJS.randColor(), LJS.box2d.bodyTypeStatic, false);
        GameObjects.spawnRandomPoly(vec2(29,8), 4, LJS.randColor(), LJS.box2d.bodyTypeStatic, false);
        for (let i=500;i--;)
            GameObjects.spawnRandomObject(vec2(LJS.rand(1,39), LJS.rand(10,50)));
    }
    if (scene == 1)
    {
        sceneName = 'Pyramid';
        GameObjects.spawnPyramid(vec2(20,0), 15);
        GameObjects.spawnBox(vec2(10,2), 4, LJS.randColor());
        GameObjects.spawnCircle(vec2(30,2), 4, LJS.randColor());
    }
    if (scene == 2)
    {
        sceneName = 'Dominoes';
        GameObjects.spawnDominoes(vec2(11,13), 8);
        GameObjects.spawnDominoes(vec2(3,0), 10, vec2(1,4));
        GameObjects.spawnCircle(vec2(10.2,20), 1.5, LJS.randColor());
        GameObjects.spawnCircle(vec2(31.9,15), 2.5, LJS.randColor());
        GameObjects.spawnBox(vec2(16,13), vec2(32,1), LJS.randColor(), LJS.box2d.bodyTypeStatic, false);
        GameObjects.spawnBox(vec2(24,8), vec2(34,1), LJS.randColor(), LJS.box2d.bodyTypeStatic, false, -.15);
    }
    if (scene == 3)
    {
        sceneName = 'Car';
        new GameObjects.CarObject(vec2(10,2));
        GameObjects.spawnBox(vec2(20,0), vec2(10,2), LJS.randColor(), LJS.box2d.bodyTypeStatic, false, -.2);
        GameObjects.spawnPyramid(vec2(32,0), 6);
    }
    if (scene == 4)
    {
        sceneName = 'Rope';
        const startPos = vec2(20, 14);
        const angle = LJS.PI/2;
        const color = LJS.randColor();
        const count = 10;
        const endObject = GameObjects.spawnRope(startPos, count, angle, color);

        // connect box to end
        const endPos = endObject.localToWorld(vec2(0,-endObject.size.y/2));
        const o = GameObjects.spawnBox(endPos, 3, LJS.randColor());
        o.setAngularDamping(.5);
        o.setFilterData(2, 2);
        new LJS.Box2dRevoluteJoint(endObject, o);
        GameObjects.spawnPyramid(vec2(20,0), 7);
    }
    if (scene == 5)
    {
        sceneName = 'Raycasts';
        GameObjects.spawnRandomEdges();
        for (let i=100;i--;)
            GameObjects.spawnRandomObject(vec2(LJS.rand(1,39), LJS.rand(20)), 2, LJS.box2d.bodyTypeStatic, LJS.rand(LJS.PI*2));
    }
    if (scene == 6)
    {
        sceneName = 'Joints';
        {
            // prismatic joint
            const o1 = GameObjects.spawnBox(vec2(20,8), vec2(3,2), LJS.randColor());
            new LJS.Box2dPrismaticJoint(Game.groundObject, o1, o1.pos, vec2(1,0), true);
            const o2 = GameObjects.spawnBox(vec2(20,15), vec2(2,3), LJS.randColor());
            new LJS.Box2dPrismaticJoint(Game.groundObject, o2, o2.pos, vec2(0,1), true);

            // lines to make it look line a track
            const l1 = new LJS.EngineObject(vec2(20, 8), vec2(39,.5), 0, 0, LJS.GRAY);
            const l2 = new LJS.EngineObject(vec2(20,50), vec2(.5,99), 0, 0, LJS.GRAY);
            l1.gravityScale = l2.gravityScale = 0;
            l1.renderOrder = l2.renderOrder = -2;
        }
        {
            // pulley joint
            const anchorA = vec2(14,15);
            const anchorB = vec2(26,15);
            const oA = new GameObjects.PulleyJointObjects(vec2(15,8), vec2(1,2), LJS.randColor(), anchorA);
            const oB = new GameObjects.PulleyJointObjects(vec2(25,8), vec2(1,2), LJS.randColor(), anchorB);
            const aA = GameObjects.spawnCircle(anchorA, 2, LJS.randColor(), LJS.box2d.bodyTypeStatic);
            const aB = GameObjects.spawnCircle(anchorB, 2, LJS.randColor(), LJS.box2d.bodyTypeStatic);
            const oaA = oA.localToWorld(vec2(0,oA.size.y/2));
            const oaB = oB.localToWorld(vec2(0,oB.size.y/2));
            new LJS.Box2dPulleyJoint(oA, oB, aA.pos, aB.pos, oaA, oaB);

            // a line to make it look like connecting rope
            const line = new LJS.EngineObject(vec2(20,15), vec2(10,.2), 0, 0, LJS.BLACK);
            line.gravityScale = 0;
            line.renderOrder = -1;
        }
        {
            // gear joint
            const o1 = GameObjects.spawnCircle(vec2(23.5,3), 3, LJS.randColor());
            const j1 = new LJS.Box2dRevoluteJoint(Game.groundObject, o1, o1.pos);
            const o2 = GameObjects.spawnCircle(vec2(28,3), 6, LJS.randColor());
            o1.tileInfo = o2.tileInfo = Game.spriteAtlas.gear;
            const j2 = new LJS.Box2dRevoluteJoint(Game.groundObject, o2, o2.pos);
            new LJS.Box2dGearJoint(o1, o2, j1, j2, 2);
        }
        {
            // weld joint
            const o1 = GameObjects.spawnBox(vec2(15,2), 4, LJS.randColor());
            const o2 = GameObjects.spawnBox(vec2(17,2), 2, LJS.randColor());
            new LJS.Box2dWeldJoint(o1, o2);
        }
        {
            // distance joint
            const o1 = new LJS.Box2dObject(vec2(30,11), vec2(4), Game.spriteAtlas.circleOutline, 0, LJS.randColor(), LJS.box2d.bodyTypeStatic);
            o1.renderOrder = -2;
            const o2 = GameObjects.spawnCircle(vec2(30,8), 2, LJS.randColor());
            new LJS.Box2dDistanceJoint(o1, o2);
        }
        {
            // motor joint
            const o = new LJS.Box2dObject(vec2(10,8), vec2(4), Game.spriteAtlas.circleOutline, 0, LJS.randColor(), LJS.box2d.bodyTypeStatic);
            o.renderOrder = -2;
            new GameObjects.MotorJointObject(vec2(10,8), vec2(2), LJS.randColor(), o);
        }
        {
            // friction joint
            const o = GameObjects.spawnBox(vec2(10,15), 3, LJS.randColor());
            o.tileInfo = Game.spriteAtlas.squareOutline2;
            o.setGravityScale(0);
            const joint = new LJS.Box2dFrictionJoint(Game.groundObject, o);
            joint.setMaxForce(200);
            joint.setMaxTorque(200);
        }
    }
    if (scene == 7)
    {
        sceneName = 'Contacts';
        new GameObjects.ContactTester(vec2(15,8), vec2(5), LJS.RED, LJS.RED);
        new GameObjects.ContactTester(vec2(25,8), vec2(5), LJS.CYAN, LJS.CYAN, false, false);
        for (let i=200;i--;)
            GameObjects.spawnRandomObject(vec2(LJS.rand(1,39), LJS.rand(10,50)));
    }
    if (scene == 8)
    {
        sceneName = 'Mobile';
        const pos = vec2(20, 16);
        const mobile = new GameObjects.MobileObject(pos, 12, 2, 5);
        new LJS.Box2dRevoluteJoint(Game.groundObject, mobile, pos);
    }
    if (scene == 9)
    {
        sceneName = 'Cloth'
        new GameObjects.ClothObject(vec2(20, 9), vec2(15), vec2(24), LJS.randColor());
    }
    if (scene == 10)
    {
        sceneName = 'Softbodies';
        for(let i=3;i--;)
            new GameObjects.SoftBodyObject(vec2(20, 3+i*7), vec2(6-i), vec2(9-i), LJS.randColor());
    }
}