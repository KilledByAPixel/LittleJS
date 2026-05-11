import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PathFinder, vec2 } from '../dist/littlejs.esm.js';

test('PathFinder is exported from the bundle', () =>
{
    assert.equal(typeof PathFinder, 'function');
});

test('PathFinder constructs from a Vector2 size', () =>
{
    const pf = new PathFinder(vec2(10, 8));
    assert.equal(pf.size.x, 10);
    assert.equal(pf.size.y, 8);
    assert.equal(pf.tileLayer, undefined);
    assert.equal(pf.nodes.length, 80);
});

test('PathFinder default tunables match spec', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    assert.equal(pf.heuristicWeight, 1);
    assert.equal(pf.maxLoop, 500);
    assert.equal(pf.smoothPath, true);
    assert.equal(pf.debug, false);
    assert.equal(pf.debugTime, 2);
});
