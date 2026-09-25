import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Box2dPlugin, Box2dObject, Box2dStaticObject, box2d, vec2 } from '../dist/littlejs.esm.js';

// the Box2D the engine ships, so the fixtures handed over are the real ones
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
new Box2dPlugin(instance);

test('contact callbacks say which fixtures touched, so a foot sensor tells the ground from a wall', () =>
{
    const ground = new Box2dStaticObject(vec2(0, 0));
    const groundBox = ground.addBox(vec2(20, 1));
    const player = new Box2dObject(vec2(0, .9)); // resting on it, the foot sensor reaching into it
    const body = player.addBox(vec2(1, 1));
    const foot = player.addBox(vec2(.8, .2), vec2(0, -.55), 0, 1, 0, 0, true); // a sensor under the feet
    const touches = [];
    player.beginContact = (other, fixture, otherFixture)=> touches.push([other, fixture, otherFixture]);
    const groundTouches = [];
    ground.beginContact = (other, fixture, otherFixture)=> groundTouches.push([other, fixture, otherFixture]);
    try
    {
        for (let i = 0; i < 30; ++i)
            box2d.step();
        const footTouch = touches.find(t=> t[1] === foot);
        assert.ok(footTouch, 'the foot sensor touched');
        assert.equal(footTouch[0], ground);
        assert.equal(footTouch[2], groundBox, 'and what it touched');
        assert.ok(touches.every(t=> t[1] === foot || t[1] === body), 'only its own fixtures');
        assert.ok(groundTouches.some(t=> t[1] === groundBox && t[2] === foot), 'the other side sees it the other way round');
    }
    finally { player.destroy(); ground.destroy(); box2d.step(); }
});
