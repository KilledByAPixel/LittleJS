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

test('getNearestClearNode returns the node at the exact position when walkable', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    const node = pf.getNearestClearNode(vec2(2.5, 2.5));
    assert.equal(node.pos.x, 2);
    assert.equal(node.pos.y, 2);
});

test('getNearestClearNode skips blocked cells and finds the nearest walkable', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    // Block only the center tile.
    pf.isWalkable = (x, y) => !(x === 2 && y === 2);
    pf.buildNodeData();
    const node = pf.getNearestClearNode(vec2(2.5, 2.5));
    // Must not be the center; must be one of the 8 neighbors.
    assert.notEqual(node.pos.x === 2 && node.pos.y === 2, true);
    const dx = Math.abs(node.pos.x - 2);
    const dy = Math.abs(node.pos.y - 2);
    assert(dx <= 1 && dy <= 1);
});

test('getNearestClearNode returns null when every cell within searchRange is blocked', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.isWalkable = () => false;
    pf.buildNodeData();
    assert.equal(pf.getNearestClearNode(vec2(2.5, 2.5), 2), null);
});

test('getNearestClearNode returns null for a position outside the grid', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    pf.buildNodeData();
    assert.equal(pf.getNearestClearNode(vec2(-50, -50), 1), null);
});

test('getNearestClearNode skips cost-weighted tiles in favor of zero-cost neighbors', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.getCost = (x, y) => x === 2 && y === 2 ? 5 : 0;
    pf.buildNodeData();
    const node = pf.getNearestClearNode(vec2(2.5, 2.5));
    assert.notEqual(node.pos.x === 2 && node.pos.y === 2, true);
});

test('aStarSearch finds a path on a connected grid', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    const ok = pf.aStarSearch(pf.getNode(0, 0), pf.getNode(4, 4));
    assert.equal(ok, true);
    // End node has a parent chain leading back to start.
    let n = pf.getNode(4, 4);
    let chain = 0;
    while (n.parent) { n = n.parent; chain++; if (chain > 100) break; }
    assert.equal(n, pf.getNode(0, 0));
});

test('aStarSearch returns false when start and end are disconnected', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    // Wall down the middle column 2; no diagonal escape because columns 1 and 3
    // are walkable on every row but the wall blocks every column-2 cell.
    pf.isWalkable = (x, y) => x !== 2;
    pf.buildNodeData();
    const ok = pf.aStarSearch(pf.getNode(0, 0), pf.getNode(4, 4));
    assert.equal(ok, false);
});

test('aStarSearch respects maxLoop and returns false if exceeded', () =>
{
    const pf = new PathFinder(vec2(20, 20));
    pf.buildNodeData();
    pf.maxLoop = 1;
    const ok = pf.aStarSearch(pf.getNode(0, 0), pf.getNode(19, 19));
    assert.equal(ok, false);
});

test('aStarSearch refuses to cut a diagonal between two adjacent walls', () =>
{
    // Layout (W = wall, . = open):
    //   . W
    //   W .
    // From (0,0) the only walkable diagonal neighbor is (1,1), but both
    // cardinals (1,0) and (0,1) are walls, so the diagonal step must be
    // refused. With (1,1) unreachable except through walls, the search fails.
    const pf = new PathFinder(vec2(2, 2));
    pf.isWalkable = (x, y) => !((x === 1 && y === 0) || (x === 0 && y === 1));
    pf.buildNodeData();
    const ok = pf.aStarSearch(pf.getNode(0, 0), pf.getNode(1, 1));
    assert.equal(ok, false);
});
