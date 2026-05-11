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

test('PathFinder.buildNodeData populates walkable=true for all cells by default', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    pf.buildNodeData();
    for (let i = 0; i < 9; ++i)
        assert.equal(pf.nodes[i].walkable, true);
});

test('PathFinder.buildNodeData honors a custom isWalkable override', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    // diagonal of walls
    pf.isWalkable = (x, y) => x !== y;
    pf.buildNodeData();
    assert.equal(pf.getNode(0, 0).walkable, false);
    assert.equal(pf.getNode(1, 1).walkable, false);
    assert.equal(pf.getNode(2, 2).walkable, false);
    assert.equal(pf.getNode(1, 0).walkable, true);
    assert.equal(pf.getNode(0, 1).walkable, true);
});

test('PathFinder.buildNodeData populates getCost into node.cost', () =>
{
    const pf = new PathFinder(vec2(2, 2));
    pf.getCost = (x, y) => x + y;
    pf.buildNodeData();
    assert.equal(pf.getNode(0, 0).cost, 0);
    assert.equal(pf.getNode(1, 0).cost, 1);
    assert.equal(pf.getNode(0, 1).cost, 1);
    assert.equal(pf.getNode(1, 1).cost, 2);
});

test('PathFinder.buildNodeData sets posWorld to tile centers', () =>
{
    const pf = new PathFinder(vec2(3, 2));
    pf.buildNodeData();
    // Tile (0,0) center should be (0.5, 0.5) with no tile layer offset
    assert.equal(pf.getNode(0, 0).posWorld.x, 0.5);
    assert.equal(pf.getNode(0, 0).posWorld.y, 0.5);
    assert.equal(pf.getNode(2, 1).posWorld.x, 2.5);
    assert.equal(pf.getNode(2, 1).posWorld.y, 1.5);
});
