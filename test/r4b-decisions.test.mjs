import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
const { EngineObject, PathFinder, engineObjectsUpdate, drawTextScreen, drawText, oscillate, vec2, WHITE, BLACK } = LJS;

// review round 4 decisions: one collision ask per pair, clockwise screen text, the triangle wave, open ground paths,
// and the new exports

test('two moving objects left overlapping are each asked about the pair once a frame', () =>
{
    // a pickup the player walks through: its callback says do not collide, so they stay overlapping
    const player = new EngineObject(vec2(50, 50), vec2(1)), pickup = new EngineObject(vec2(50.2, 50), vec2(1));
    player.setCollision(); pickup.setCollision(true, false);
    player.damping = pickup.damping = 1;
    let playerAsked = 0, pickupAsked = 0;
    player.collideWithObject = ()=> (++playerAsked, true);
    pickup.collideWithObject = ()=> (++pickupAsked, false);
    engineObjectsUpdate();
    assert.equal(pickupAsked, 1, 'the pickup');
    assert.equal(playerAsked, 1, 'the player');
    engineObjectsUpdate();
    assert.equal(pickupAsked, 2, 'and once again the next frame');
    player.destroy(); pickup.destroy();
    engineObjectsUpdate();
});

test('two moving objects spawned overlapping are asked once a frame while they drift apart', () =>
{
    const a = new EngineObject(vec2(60, 50), vec2(1)), b = new EngineObject(vec2(60.1, 50), vec2(1));
    a.setCollision(); b.setCollision();
    let asked = 0;
    a.collideWithObject = ()=> (++asked, true);
    engineObjectsUpdate();
    assert.equal(asked, 1);
    a.destroy(); b.destroy();
    engineObjectsUpdate();
});

test('drawTextScreen turns clockwise like the other screen space draws, drawText looks the same as before', () =>
{
    const calls = [];
    const context = { save(){}, restore(){}, translate(){}, fillText(){}, strokeText(){},
        rotate(a){ calls.push(a); } };
    drawTextScreen('hi', vec2(), 10, WHITE, 0, BLACK, 'center', 'arial', '', undefined, .5, context);
    assert.equal(calls[0], .5, 'canvas rotate is clockwise on screen');
    drawText('hi', vec2(), 1, WHITE, 0, BLACK, 'center', 'arial', '', undefined, .5, context);
    assert.equal(calls[1], .5, 'world text keeps its turn');
});

test('the triangle wave starts at 0 and peaks half way, like the sine', () =>
{
    assert.equal(oscillate(1, 1, 0, 0, 1), 0);
    assert.equal(oscillate(1, 1, .5, 0, 1), 1);
    assert.ok(Math.abs(oscillate(1, 1, .25, 0, 1) - .5) < 1e-9);
});

test('a long path across open ground is found within the default search limit', () =>
{
    const pf = new PathFinder(vec2(200, 200));
    pf.isWalkable = ()=> true;
    const path = pf.findPath(vec2(5.5, 5.5), vec2(195.5, 120.5));
    assert.ok(path.length >= 2, 'no path');
    assert.equal(path[path.length - 1].x, 195.5);
});

test('ties between equal paths do not make them longer', () =>
{
    // around a wall the search still finds the shortest way, the same length as before
    const pf = new PathFinder(vec2(30, 30));
    pf.isWalkable = (x, y)=> !(x === 15 && y < 25);
    pf.buildNodeData();
    const start = pf.getNode(5, 5), end = pf.getNode(25, 5);
    assert.ok(pf.aStarSearch(start, end));
    // octile length: 20 across, up to row 25 and back, around the wall's end
    assert.ok(end.g < 20 + 2 * 20 * Math.SQRT2, 'path cost ' + end.g);
});

test('setDebugOverlay and loadTexture are exported', () =>
{
    assert.equal(typeof LJS.setDebugOverlay, 'function');
    assert.equal(typeof LJS.loadTexture, 'function');
});
