import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as LJS from '../dist/littlejs.esm.js';

// A Box2D tile layer rebuilt from a contact callback, a tile that breaks when hit, builds once the step is done,
// where the old fixtures went at the step's end and the new ones were refused while the world was locked

const { vec2, Box2dObject } = LJS;
const Box2D = createRequire(import.meta.url)('../dist/box2d.wasm.js');
const instance = await Box2D({ wasmBinary: readFileSync(new URL('../dist/box2d.wasm.wasm', import.meta.url)) });
globalThis.Box2D = async()=> instance;
await LJS.box2dInit();
LJS.setHeadlessMode(true);
LJS.setEngineManualStep(true);
await LJS.engineInit(()=> {}, ()=> {}, ()=> {});
LJS.setGravity(vec2(0, -9.8));

test('a Box2D tile layer rebuilt from beginContact keeps its collision', ()=>
{
    const box2d = LJS.box2d;
    const layer = new LJS.TileCollisionLayer(vec2(10, 0), vec2(8, 4));
    for (let x = 8; x--;) layer.setCollisionData(vec2(x, 0), 1);
    layer.setCollisionData(vec2(3, 1), 1);
    const tiles = new LJS.Box2dTileLayer(layer);
    const before = tiles.getFixtureList().length;
    const ball = new Box2dObject(vec2(13.5, 3)); ball.addCircle(1);
    for (let i = 120; i--;) box2d.step();

    // the tile under the ball breaks when it is hit again
    layer.setCollisionData(vec2(3, 1), 0);
    let rebuilt = 0;
    ball.beginContact = ()=> { if (!rebuilt++) tiles.buildCollision(); };
    tiles.buildCollision(); // changed in play, so the ball meets the floor anew
    ball.setPosition(vec2(13.5, 2));
    ball.setLinearVelocity(vec2(0, -5));
    for (let i = 120; i--;) box2d.step();
    assert.equal(rebuilt > 0, true, 'the callback ran');
    const after = tiles.getFixtureList().length;
    assert.ok(after > 0 && after <= before, 'the level has collision: ' + before + ' then ' + after);
    const y = box2d.vec2From(ball.body.GetPosition()).y;
    assert.ok(y > 1.5 && y < 2.2, 'the ball rests on the floor row, not fallen through: ' + y);
});
