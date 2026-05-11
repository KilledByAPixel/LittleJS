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

test('aStarSearch routes around high-cost tiles when a cheaper detour exists', () =>
{
    // 5x3 grid. Middle row has cost 100, so the optimal path from (0,1) to
    // (4,1) should NOT cut straight through the middle — it should detour
    // up to row 0 (or down to row 2) where cost is 0.
    const pf = new PathFinder(vec2(5, 3));
    pf.getCost = (x, y) => y === 1 ? 100 : 0;
    pf.buildNodeData();
    const ok = pf.aStarSearch(pf.getNode(0, 1), pf.getNode(4, 1));
    assert.equal(ok, true);
    // Reconstruct the path and confirm at least one intermediate node has cost 0.
    let n = pf.getNode(4, 1);
    let visitedZeroCostTile = false;
    while (n.parent)
    {
        n = n.parent;
        if (n !== pf.getNode(0, 1) && n.cost === 0) visitedZeroCostTile = true;
    }
    assert.equal(visitedZeroCostTile, true);
});

test('findPath returns a single-element path when start and end snap to the same tile', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.smoothPath = false;
    const path = pf.findPath(vec2(2.5, 2.5), vec2(2.5, 2.5));
    assert.equal(path.length, 1);
    assert.equal(path[0].x, 2.5);
    assert.equal(path[0].y, 2.5);
});

test('findPath returns [] when no path exists', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.smoothPath = false;
    pf.isWalkable = (x, y) => x !== 2;
    const path = pf.findPath(vec2(0.5, 0.5), vec2(4.5, 4.5));
    assert.deepEqual(path, []);
});

test('findPath returns a connected path on an open grid', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.smoothPath = false;
    const path = pf.findPath(vec2(0.5, 0.5), vec2(4.5, 4.5));
    assert(path.length >= 2);
    // First point is the snapped start; last is the snapped end.
    assert.equal(path[0].x, 0.5);
    assert.equal(path[0].y, 0.5);
    assert.equal(path[path.length - 1].x, 4.5);
    assert.equal(path[path.length - 1].y, 4.5);
});

test('findPath snaps a start position that lands on a blocked tile', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.smoothPath = false;
    pf.isWalkable = (x, y) => !(x === 0 && y === 0);
    // Click directly on the blocked (0,0) tile; should snap to a neighbor.
    const path = pf.findPath(vec2(0.5, 0.5), vec2(4.5, 4.5));
    assert(path.length >= 2);
    // The snapped start is NOT (0.5, 0.5) since that's blocked.
    assert.notEqual(path[0].x === 0.5 && path[0].y === 0.5, true);
});

test('smoothPathCorners removes a redundant 45-degree corner', () =>
{
    const pf = new PathFinder(vec2(4, 4));
    pf.buildNodeData();
    // Three nodes where (next - prev) is a unit cardinal step (lengthSq=1).
    // Construct: (0,0) -> (1,1) -> (1,0). dx=1,dy=0 → lengthSq=1.
    const path = [pf.getNode(0, 0), pf.getNode(1, 1), pf.getNode(1, 0)];
    pf.smoothPathCorners(path);
    assert.equal(path.length, 2);
    assert.equal(path[0], pf.getNode(0, 0));
    assert.equal(path[1], pf.getNode(1, 0));
});

test('smoothPathCorners collapses a 90-degree corner when the diagonal is clear', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    pf.buildNodeData();
    // (0,0) -> (1,0) -> (1,1): 90° corner. The alternative diagonal cell (0,1)
    // is clear so the middle node should be removed.
    const path = [pf.getNode(0, 0), pf.getNode(1, 0), pf.getNode(1, 1)];
    pf.smoothPathCorners(path);
    // Expect middle node removed.
    assert.equal(path.length, 2);
});

test('smoothPathCorners keeps a 90-degree corner when the diagonal shortcut is blocked', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    // Block (0,1) so the shortcut cell is not clear.
    pf.isWalkable = (x, y) => !(x === 0 && y === 1);
    pf.buildNodeData();
    const path = [pf.getNode(0, 0), pf.getNode(1, 0), pf.getNode(1, 1)];
    pf.smoothPathCorners(path);
    assert.equal(path.length, 3);
});

test('smoothPathCorners is a no-op on a 2-node path', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    pf.buildNodeData();
    const path = [pf.getNode(0, 0), pf.getNode(2, 2)];
    pf.smoothPathCorners(path);
    assert.equal(path.length, 2);
});

test('isLineClear returns true for a horizontal line on an open grid', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    assert.equal(pf.isLineClear(vec2(0, 2), vec2(4, 2)), true);
});

test('isLineClear returns true for a vertical line on an open grid', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    assert.equal(pf.isLineClear(vec2(2, 0), vec2(2, 4)), true);
});

test('isLineClear returns true for a pure diagonal on an open grid', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    assert.equal(pf.isLineClear(vec2(0, 0), vec2(4, 4)), true);
});

test('isLineClear returns false when a wall blocks the line', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.isWalkable = (x, y) => !(x === 2 && y === 2);
    pf.buildNodeData();
    // Diagonal from (0,0) to (4,4) passes through (2,2).
    assert.equal(pf.isLineClear(vec2(0, 0), vec2(4, 4)), false);
});

test('isLineClear returns true for a shallow slope (2:1) on an open grid', () =>
{
    const pf = new PathFinder(vec2(6, 6));
    pf.buildNodeData();
    assert.equal(pf.isLineClear(vec2(0, 0), vec2(4, 2)), true);
});

test('isLineClear returns true for a steep slope (1:2) on an open grid', () =>
{
    const pf = new PathFinder(vec2(6, 6));
    pf.buildNodeData();
    assert.equal(pf.isLineClear(vec2(0, 0), vec2(2, 4)), true);
});

test('isLineClear returns true for a negative-slope diagonal on an open grid', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    // (4, 0) -> (0, 4): negative dx, positive dy. Exercises Math.trunc with negative dividend.
    assert.equal(pf.isLineClear(vec2(4, 0), vec2(0, 4)), true);
});

test('smoothPathStringPull collapses a stairstep path across open space', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.buildNodeData();
    // Stairstep diagonal: 5 nodes that can all be reached by a single LOS line.
    const stair = [
        pf.getNode(0, 0),
        pf.getNode(1, 0),
        pf.getNode(1, 1),
        pf.getNode(2, 1),
        pf.getNode(2, 2),
    ];
    pf.smoothPathStringPull(stair);
    // Should collapse to 2 nodes — start and end — since the line is clear.
    assert.equal(stair.length, 2);
    assert.equal(stair[0].pos.x, 0);
    assert.equal(stair[stair.length - 1].pos.x, 2);
});

test('smoothPathStringPull bails out when a node has nonzero cost', () =>
{
    const pf = new PathFinder(vec2(5, 5));
    pf.getCost = (x, y) => x === 1 && y === 1 ? 3 : 0;
    pf.buildNodeData();
    const stair = [
        pf.getNode(0, 0),
        pf.getNode(1, 0),
        pf.getNode(1, 1),
        pf.getNode(2, 1),
        pf.getNode(2, 2),
    ];
    const originalLength = stair.length;
    pf.smoothPathStringPull(stair);
    assert.equal(stair.length, originalLength);
});

test('smoothPathStringPull is a no-op on a 2-node path', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    pf.buildNodeData();
    const path = [pf.getNode(0, 0), pf.getNode(2, 2)];
    pf.smoothPathStringPull(path);
    assert.equal(path.length, 2);
});

test('findPath with smoothPath=true produces a shorter or equal node count than raw A*', () =>
{
    const pf = new PathFinder(vec2(8, 8));
    pf.smoothPath = false;
    const raw = pf.findPath(vec2(0.5, 0.5), vec2(7.5, 7.5));
    pf.smoothPath = true;
    const smooth = pf.findPath(vec2(0.5, 0.5), vec2(7.5, 7.5));
    assert(smooth.length <= raw.length);
});

test('findPath with smoothPath=true on an open grid collapses to start+end', () =>
{
    const pf = new PathFinder(vec2(8, 8));
    pf.smoothPath = true;
    const path = pf.findPath(vec2(0.5, 0.5), vec2(7.5, 7.5));
    assert.equal(path.length, 2);
    assert.equal(path[0].x, 0.5);
    assert.equal(path[0].y, 0.5);
    assert.equal(path[1].x, 7.5);
    assert.equal(path[1].y, 7.5);
});

test('findPath returns copies, not live node references', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    const path = pf.findPath(vec2(0.5, 0.5), vec2(2.5, 2.5));
    assert(path.length >= 1);
    path[0].x = 999;
    const node = pf.getNode(0, 0);
    assert.notEqual(node.posWorld.x, 999);
});

test('findPath single-element path is also a copy, not a live reference', () =>
{
    const pf = new PathFinder(vec2(3, 3));
    const path = pf.findPath(vec2(1.5, 1.5), vec2(1.5, 1.5));
    assert.equal(path.length, 1);
    path[0].x = 999;
    const node = pf.getNode(1, 1);
    assert.notEqual(node.posWorld.x, 999);
});
