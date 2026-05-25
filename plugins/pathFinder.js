/**
 * LittleJS PathFinder Plugin
 * - Grid-based A* pathfinder with two-pass smoothing for natural-looking paths
 * - Works directly on a TileCollisionLayer, or override isWalkable/getCost for any grid
 * - Debug visualization via engine debug primitives (stripped in release builds)
 * - Port of frankforce.com pathFindingBase.cpp (2018)
 * @namespace PathFinding
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// Diagonal step cost — pre-computed for the A* expansion inner loop.
const PATHFINDER_DIAGONAL_COST = Math.SQRT2;

// Shared 1x1 size vector for per-tile debugRect calls. debugRect copies the
// argument internally, so reusing one instance is safe.
const PATHFINDER_TILE_VEC = vec2(1);

///////////////////////////////////////////////////////////////////////////////

/** A single grid cell tracked by the pathfinder. Allocated once per cell at
 *  PathFinder construction; reset (not reallocated) at the start of every
 *  findPath call.
 *  @memberof PathFinding */
class PathFinderNode
{
    /** @param {number} x - Tile x
     *  @param {number} y - Tile y */
    constructor(x, y)
    {
        /** @property {Vector2} - Tile coords (integer) */
        this.pos = vec2(x, y);
        /** @property {Vector2} - World-space center of this tile (set by buildNodeData) */
        this.posWorld = vec2();
        /** @property {boolean} - True if this cell is passable (cleared each findPath call) */
        this.walkable = false;
        /** @property {number} - Extra cost added to A* G-score for stepping on this cell */
        this.cost = 0;
        /** @property {number} - A* G-score: actual cost from start to this node */
        this.g = 0;
        /** @property {number} - A* F-score: G + heuristic */
        this.f = 0;
        /** @property {PathFinderNode|null} - Parent for path reconstruction */
        this.parent = null;
        /** @property {boolean} - In the A* open list */
        this.isOpen = false;
        /** @property {boolean} - In the A* closed list */
        this.isClosed = false;
    }

    /** Reset per-search state (called at the start of buildNodeData). */
    reset()
    {
        this.walkable = false;
        this.cost = 0;
        this.g = 0;
        this.f = 0;
        this.parent = null;
        this.isOpen = false;
        this.isClosed = false;
    }

    /** True if walkable and not blocked by cost. */
    isClear()
    {
        return this.walkable && this.cost === 0;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Grid pathfinder using A* with two optional smoothing passes.
 *  @memberof PathFinding
 *  @example
 *  // Tile-layer driven (most common):
 *  const pf = new PathFinder(myTileCollisionLayer);
 *  const path = pf.findPath(player.pos, mousePos);
 *
 *  // Bare grid with custom walkability:
 *  const pf = new PathFinder(vec2(50, 50));
 *  pf.isWalkable = (x, y) => myGrid[y*50 + x] === 0;
 */
class PathFinder
{
    /** @param {TileCollisionLayer|Vector2} source - Either a TileCollisionLayer
     *  (size and walkability auto-derived) or a Vector2 grid size (user
     *  overrides isWalkable). */
    constructor(source)
    {
        // Accept either a Vector2 size or a TileCollisionLayer (which has a .size).
        // We don't import TileCollisionLayer to avoid coupling; we duck-type on
        // .size + .getCollisionData.
        if (isVector2(source))
        {
            /** @property {Vector2} - Grid dimensions in tiles */
            this.size = source.floor();
            /** @property {TileCollisionLayer|undefined} - Tile layer driving walkability, if any */
            this.tileLayer = undefined;
        }
        else
        {
            ASSERT(source && isVector2(source.size) && typeof source.getCollisionData === 'function',
                'PathFinder requires a Vector2 size or a TileCollisionLayer');
            this.size = source.size;
            this.tileLayer = source;
        }

        // Tunables (public, freely re-assignable).
        /** @property {number} - A* heuristic multiplier (1 = admissible, higher = greedier) */
        this.heuristicWeight = 1;
        /** @property {number} - Maximum A* expansions before giving up */
        this.maxLoop = 1e3;
        /** @property {boolean} - If true, post-process paths with two-pass smoothing */
        this.smoothPath = true;
        /** @property {boolean} - If true, draw debug visualization during findPath */
        this.debug = false;
        /** @property {number} - Debug primitive lifetime in seconds (0 disables drawing) */
        this.debugTime = 1;

        /** @property {Array<PathFinderNode>} - Flat row-major array of size.x*size.y nodes */
        this.nodes = new Array(this.size.x * this.size.y);
        for (let y = 0; y < this.size.y; ++y)
        for (let x = 0; x < this.size.x; ++x)
            this.nodes[x + y * this.size.x] = new PathFinderNode(x, y);

        // Scratch Vector2 reused to avoid allocations in the isWalkable hot path.
        this.collisionScratch = vec2();
    }

    /** Default walkability: if a tile layer was provided, returns true when the
     *  cell has no solid collision data; otherwise returns true. Override on
     *  the instance or via a subclass.
     *  @param {number} x - Tile x
     *  @param {number} y - Tile y
     *  @returns {boolean} */
    isWalkable(x, y)
    {
        if (!this.tileLayer) return true;
        return !this.tileLayer.getCollisionData(this.collisionScratch.set(x, y));
    }

    /** Default extra cost for stepping on a cell. Returns 0 (free) by default.
     *  Override to add cost-weighted terrain (mud, swamp, etc).
     *  @param {number} x - Tile x
     *  @param {number} y - Tile y
     *  @returns {number} */
    getCost(x, y)
    {
        return 0;
    }

    /** Get the node at tile coords, or null if out of bounds.
     *  @param {number} x
     *  @param {number} y
     *  @returns {PathFinderNode|null} */
    getNode(x, y)
    {
        if (x < 0 || y < 0 || x >= this.size.x || y >= this.size.y) return null;
        return this.nodes[x + y * this.size.x];
    }

    /** Convert a world-space position to integer tile coords (no clamping).
     *  @param {Vector2} worldPos
     *  @returns {Vector2}
     *  @memberof PathFinding */
    worldToTile(worldPos)
    {
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        return vec2(floor(worldPos.x - ox), floor(worldPos.y - oy));
    }

    /** Convert integer tile coords to the world-space center of that tile.
     *  @param {number} x
     *  @param {number} y
     *  @returns {Vector2}
     *  @memberof PathFinding */
    tileToWorld(x, y)
    {
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        return vec2(x + 0.5 + ox, y + 0.5 + oy);
    }

    /** Reset all nodes and re-populate walkable / cost / posWorld from the
     *  current isWalkable / getCost overrides. Called at the start of
     *  findPath; exposed so tests and tooling can drive it directly.
     *  @private */
    buildNodeData()
    {
        const w = this.size.x;
        const h = this.size.y;
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        for (let y = 0; y < h; ++y)
        for (let x = 0; x < w; ++x)
        {
            const node = this.nodes[x + y * w];
            node.reset();
            const walkable = !!this.isWalkable(x, y);
            const cost = walkable ? max(0, this.getCost(x, y)) : 0;
            node.walkable = walkable;
            node.cost = cost;
            node.posWorld.set(x + 0.5 + ox, y + 0.5 + oy);

            if (this.debug && this.debugTime > 0)
            {
                if (!walkable)
                    debugRect(node.posWorld, PATHFINDER_TILE_VEC, rgb(1, 0, 0, 0.25), this.debugTime);
                else if (cost > 0)
                    debugRect(node.posWorld, PATHFINDER_TILE_VEC, rgb(1, 0, 0, min(0.2, cost * 0.05)), this.debugTime);
            }
        }
    }

    /** Core A* search loop. Expects buildNodeData() to have been called first.
     *  Marks node.parent for path reconstruction. Returns true if endNode was
     *  reached; false on disconnected goal or maxLoop exhaustion.
     *  @param {PathFinderNode} startNode
     *  @param {PathFinderNode} endNode
     *  @returns {boolean}
     *  @private */
    aStarSearch(startNode, endNode)
    {
        ASSERT(startNode && endNode, 'aStarSearch needs both endpoints');
        ASSERT(startNode !== endNode, 'aStarSearch: start and end must differ — caller should handle trivial case');
        ASSERT(startNode.walkable && endNode.walkable, 'aStarSearch: endpoints must be walkable');

        const openList = [startNode];
        startNode.isOpen = true;
        let loopCount = 0;

        while (openList.length > 0)
        {
            // Find the open node with the smallest f score (linear scan).
            // Same as the C++ — fine up to a few thousand nodes.
            let bestIndex = 0;
            let bestF = openList[0].f;
            for (let i = 1; i < openList.length; ++i)
            {
                if (openList[i].f < bestF)
                {
                    bestF = openList[i].f;
                    bestIndex = i;
                }
            }
            const current = openList[bestIndex];

            if (current === endNode) break;
            if (++loopCount > this.maxLoop) break;

            // Move current from open to closed.
            current.isOpen = false;
            openList.splice(bestIndex, 1);
            current.isClosed = true;

            if (this.debug && this.debugTime > 0)
                debugRect(current.posWorld, PATHFINDER_TILE_VEC, rgb(1, 1, 1, 0.05), this.debugTime);

            // Expand all 8 neighbors.
            for (let dy = -1; dy <= 1; ++dy)
            for (let dx = -1; dx <= 1; ++dx)
            {
                if (dx === 0 && dy === 0) continue;
                const neighbor = this.getNode(current.pos.x + dx, current.pos.y + dy);
                if (!neighbor || !neighbor.walkable || neighbor.isClosed) continue;

                let stepCost = 1;
                if (dx !== 0 && dy !== 0)
                {
                    // Diagonal step: refuse if either cardinal neighbor is
                    // blocked. Prevents cutting through walls at corners.
                    // (Costed-but-walkable cardinals do not block — diagonal
                    // movement around expensive terrain is standard A*.)
                    const card1 = this.getNode(current.pos.x + dx, current.pos.y);
                    if (!card1 || !card1.walkable) continue;
                    const card2 = this.getNode(current.pos.x, current.pos.y + dy);
                    if (!card2 || !card2.walkable) continue;
                    stepCost = PATHFINDER_DIAGONAL_COST;
                }

                const tentativeG = current.g + stepCost + neighbor.cost;
                if (!neighbor.isOpen)
                {
                    neighbor.isOpen = true;
                    openList.push(neighbor);
                }
                else if (tentativeG >= neighbor.g)
                {
                    continue;
                }

                // Best path so far through neighbor — record it.
                neighbor.parent = current;
                neighbor.g = tentativeG;
                // Octile heuristic — tightest admissible distance for an
                // 8-connected grid with cardinal cost 1 and diagonal cost √2.
                const adx = abs(endNode.pos.x - neighbor.pos.x);
                const ady = abs(endNode.pos.y - neighbor.pos.y);
                const h = max(adx, ady) + (Math.SQRT2 - 1) * min(adx, ady);
                neighbor.f = neighbor.g + h * this.heuristicWeight;
            }
        }

        return endNode.parent !== null;
    }

    /** Find the clear (walkable, zero-cost) node closest to the given world
     *  position. Spirals outward in expanding boxes until a clear node is
     *  found or the search range is exhausted. Useful for snapping a click
     *  or NPC spawn position to the nearest open tile.
     *
     *  By default, calls `buildNodeData()` first so it works correctly on a
     *  fresh PathFinder. If you're calling it many times in a row with
     *  unchanged walkability, pass `rebuild=false` and call `buildNodeData()`
     *  once externally to avoid redundant work.
     *  @param {Vector2} worldPos
     *  @param {number} [searchRange=10] - Max box-radius in tiles
     *  @param {boolean} [rebuild=true] - Whether to call buildNodeData first
     *  @returns {PathFinderNode|null}
     *  @memberof PathFinding */
    getNearestClearNode(worldPos, searchRange = 10, rebuild = true)
    {
        ASSERT(isVector2(worldPos), 'worldPos must be a Vector2');
        if (rebuild) this.buildNodeData();

        // Inline worldToTile to avoid a Vector2 allocation per call.
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        const centerX = floor(worldPos.x - ox);
        const centerY = floor(worldPos.y - oy);

        for (let offset = 0; offset <= searchRange; ++offset)
        {
            let nearest = null;
            let nearestDistSq = 0;

            for (let dy = -offset; dy <= offset; ++dy)
            for (let dx = -offset; dx <= offset; ++dx)
            {
                // Only scan the perimeter of the current ring (skip the
                // interior we've already searched in earlier iterations).
                if (offset > 0 && abs(dx) !== offset && abs(dy) !== offset)
                    continue;

                const node = this.getNode(centerX + dx, centerY + dy);
                if (!node || !node.isClear()) continue;

                const ddx = node.posWorld.x - worldPos.x;
                const ddy = node.posWorld.y - worldPos.y;
                const distSq = ddx * ddx + ddy * ddy;
                if (!nearest || distSq < nearestDistSq)
                {
                    nearest = node;
                    nearestDistSq = distSq;
                }
            }
            if (nearest) return nearest;
        }
        return null;
    }

    /** Smooth a node path by removing redundant turns and tightening corners
     *  where a grid-aligned diagonal is clear. Modifies the path in place.
     *  Stays on the grid — does not introduce off-tile-center points.
     *  Port of ShortenPath() in pathFinding.cpp.
     *  @param {PathFinderNode[]} path
     *  @private */
    smoothPathCorners(path)
    {
        if (path.length <= 2) return;

        let i = 1;
        while (i < path.length - 1)
        {
            const prev = path[i - 1];
            const node = path[i];
            const next = path[i + 1];

            const dx = next.pos.x - prev.pos.x;
            const dy = next.pos.y - prev.pos.y;
            const lenSq = dx * dx + dy * dy;

            // dx,dy is the prev-to-current step direction; needed for the
            // 135° "mostly vertical/horizontal" disambiguation.
            const stepDx = node.pos.x - prev.pos.x;
            const stepDy = node.pos.y - prev.pos.y;
            const stepDxNext = next.pos.x - node.pos.x;
            const stepDyNext = next.pos.y - node.pos.y;

            if (lenSq === 1)
            {
                // 45° angle — middle node is off the straight line. Drop it.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(0.5, 0, 0.5, 0.5), this.debugTime);
                path.splice(i, 1);
                i = max(1, i - 1);
                continue;
            }
            else if (lenSq === 2)
            {
                // 90° corner. Check the alternative-diagonal cell.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(1, 0, 0, 0.5), this.debugTime);

                let sx, sy;
                if (prev.pos.y === node.pos.y && next.pos.x === node.pos.x)
                { sx = prev.pos.x; sy = next.pos.y; }
                else
                { sx = next.pos.x; sy = prev.pos.y; }

                const shortcut = this.getNode(sx, sy);
                if (shortcut && shortcut.isClear())
                {
                    path.splice(i, 1);
                    i = max(1, i - 1);
                    continue;
                }
            }
            else if (lenSq === 5)
            {
                // 135° angle (a knight's-move offset). Try to relocate the
                // middle node to whichever of two candidate cells is closer
                // to prev-of-prev, and only if the corner cut is also clear.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(1, 1, 0, 0.5), this.debugTime);

                const prevPrev = i >= 2 ? path[i - 2] : prev;
                let s1x, s1y, s2x, s2y;
                if (stepDx === 0 || stepDxNext === 0)
                {
                    // mostly vertical
                    s1x = next.pos.x; s1y = node.pos.y;
                    s2x = prev.pos.x; s2y = node.pos.y;
                }
                else
                {
                    // mostly horizontal
                    s1x = node.pos.x; s1y = next.pos.y;
                    s2x = node.pos.x; s2y = prev.pos.y;
                }
                const dd1x = s1x - prevPrev.pos.x;
                const dd1y = s1y - prevPrev.pos.y;
                const dd2x = s2x - prevPrev.pos.x;
                const dd2y = s2y - prevPrev.pos.y;
                const dist1Sq = dd1x * dd1x + dd1y * dd1y;
                const dist2Sq = dd2x * dd2x + dd2y * dd2y;
                const sx = dist1Sq < dist2Sq ? s1x : s1x === s2x && s1y === s2y ? s1x : s2x;
                const sy = dist1Sq < dist2Sq ? s1y : s1x === s2x && s1y === s2y ? s1y : s2y;

                const shortcut = this.getNode(sx, sy);
                if (shortcut && shortcut !== node && shortcut.isClear())
                {
                    // Also check the cut-corner cell is clear.
                    const ccx = next.pos.x + s2x - s1x;
                    const ccy = next.pos.y + s2y - s1y;
                    const cutCorner = this.getNode(ccx, ccy);
                    if (cutCorner && cutCorner.isClear())
                    {
                        path[i] = shortcut;
                        i = max(1, i - 1);
                        continue;
                    }
                }
            }
            else if (lenSq === 4 || lenSq === 8)
            {
                // Straight line or a 1-cell bump.
                if (this.debug && this.debugTime > 0)
                    debugCircle(node.posWorld, 0.3, rgb(0, 1, 0, 0.5), this.debugTime);

                if (stepDx === stepDxNext && stepDy === stepDyNext)
                {
                    // Truly straight — nothing to do, advance.
                    ++i;
                    continue;
                }
                else
                {
                    // Bump — try to flatten via the in-line cell.
                    let sx, sy;
                    if (prev.pos.y === next.pos.y)
                    { sx = node.pos.x; sy = prev.pos.y; }
                    else
                    { sx = prev.pos.x; sy = node.pos.y; }
                    const shortcut = this.getNode(sx, sy);
                    if (shortcut && shortcut.isClear())
                    {
                        path[i] = shortcut;
                        i = max(1, i - 1);
                        continue;
                    }
                }
            }

            ++i;
        }
    }

    /** Smooth a node path via line-of-sight ("string pulling"). Walks the
     *  input path collapsing runs of nodes into straight segments whenever
     *  isLineClear permits, so the result can leave grid centers and cut
     *  cleanly across open spaces.
     *
     *  Bails (leaves the path unchanged) if any node has nonzero cost — a
     *  straight geometric shortcut can't be trusted to be the lowest-cost
     *  route when cost-weighted terrain is in play.
     *
     *  Port of ShortenPath2() in pathFinding.cpp.
     *  @param {PathFinderNode[]} path
     *  @private */
    smoothPathStringPull(path)
    {
        if (path.length <= 2) return;
        for (const n of path)
        {
            if (!n.isClear()) return;
        }

        const original = path.slice();
        path.length = 0;
        path.push(original[0]);
        let searchIndex = 0;

        for (let i = 1; i < original.length; ++i)
        {
            const node = original[i];

            // Skip if node is collinear with the search-window start and the
            // previous node — it adds no information. Note: a == b is the
            // degenerate i=1, searchIndex=0 case; skip the test then.
            {
                const a = original[searchIndex];
                const b = original[i - 1];
                if (a !== b)
                {
                    const cross =
                        (b.pos.x - a.pos.x) * (node.pos.y - a.pos.y) -
                        (b.pos.y - a.pos.y) * (node.pos.x - a.pos.x);
                    if (cross === 0) continue;
                }
            }

            if (!this.isLineClear(node.pos, path[path.length - 1].pos))
            {
                // Look ahead — if any later node has a clear shot to the
                // back of our new path, skip this node and try later.
                let foundClearAfter = false;
                for (let j = i + 1; j < original.length; ++j)
                {
                    if (this.isLineClear(original[j].pos, path[path.length - 1].pos))
                    {
                        foundClearAfter = true;
                        break;
                    }
                }
                if (foundClearAfter)
                {
                    if (this.debug && this.debugTime > 0)
                        debugLine(node.posWorld, path[path.length - 1].posWorld, rgb(0, 0, 1, 0.3), 0.02, this.debugTime);
                    continue;
                }

                // No clear line ahead — fall back to the last waypoint we did
                // have a clear line to. searchIndex tracks our scan position.
                for (; searchIndex < original.length; ++searchIndex)
                {
                    const cand = original[searchIndex];
                    if (this.isLineClear(node.pos, cand.pos))
                    {
                        path.push(cand);
                        i = searchIndex;
                        break;
                    }
                }
                ASSERT(searchIndex < original.length, 'smoothPathStringPull: ran out of candidates');
            }
        }

        path.push(original[original.length - 1]);
    }

    /** Drop any middle node that lies exactly on the line through its two
     *  neighbors. Backstop for the smoothing passes — the corners pass
     *  intentionally keeps truly-straight runs, and the string-pulling pass
     *  checks collinearity against the original path, not the in-progress
     *  result, so it can leave 3+ collinear nodes in some edge cases.
     *  @param {PathFinderNode[]} path
     *  @private */
    dropCollinearNodes(path)
    {
        for (let i = path.length - 2; i >= 1; --i)
        {
            const a = path[i - 1], b = path[i], c = path[i + 1];
            if ((b.pos.x - a.pos.x) * (c.pos.y - a.pos.y) ===
                (b.pos.y - a.pos.y) * (c.pos.x - a.pos.x))
                path.splice(i, 1);
        }
    }

    /** Lookup helper: true when the node at tile coords (x, y) is in-bounds
     *  and clear (walkable, zero-cost). Used by isLineClear's hot path.
     *  @param {number} x
     *  @param {number} y
     *  @returns {boolean}
     *  @private */
    isNodeClear(x, y)
    {
        const n = this.getNode(x, y);
        return n !== null && n.isClear();
    }

    /** Check that the line between two tile-coord endpoints stays entirely
     *  inside walkable, zero-cost cells. Stricter than just sampling along
     *  the line — it also checks the diagonal-corner-adjacent cells so the
     *  line can never "scrape past" a wall corner.
     *
     *  Both endpoints must themselves be clear (asserted in debug). Port of
     *  CheckLine() in pathFinding.cpp.
     *  @param {Vector2} startPos - Tile coords
     *  @param {Vector2} endPos - Tile coords
     *  @returns {boolean}
     *  @private */
    isLineClear(startPos, endPos)
    {
        ASSERT(isVector2(startPos) && isVector2(endPos), 'isLineClear needs Vector2 endpoints');
        ASSERT(this.isNodeClear(startPos.x, startPos.y) && this.isNodeClear(endPos.x, endPos.y),
            'isLineClear endpoints must be in-bounds and clear');

        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const adx = abs(dx);
        const ady = abs(dy);
        const sx = sign(dx);
        const sy = sign(dy);
        let x = startPos.x;
        let y = startPos.y;

        if (ady === adx)
        {
            // Pure diagonal.
            while (x !== endPos.x)
            {
                if (x !== startPos.x)
                {
                    if (!this.isNodeClear(x, y)) return false;
                    if (!this.isNodeClear(x, y - sy)) return false;
                }
                if (!this.isNodeClear(x, y + sy)) return false;
                x += sx;
                y += sy;
            }
            if (!this.isNodeClear(endPos.x, endPos.y - sy)) return false;
        }
        else if (ady < adx)
        {
            // Mostly horizontal.
            if (dy === 0)
            {
                // Purely horizontal.
                x += sx;
                while (x !== endPos.x)
                {
                    if (!this.isNodeClear(x, y)) return false;
                    x += sx;
                }
            }
            else
            {
                let lastY = startPos.y;
                while (x !== endPos.x)
                {
                    y = startPos.y + Math.trunc((dy * (x - startPos.x)) / dx);
                    if (lastY !== y)
                    {
                        if (!this.isNodeClear(x - sx, y + sy)) return false;
                        if (!this.isNodeClear(x, y - sy)) return false;
                    }
                    lastY = y;
                    if (x !== startPos.x)
                    {
                        if (!this.isNodeClear(x, y)) return false;
                    }
                    y += sy;
                    if (!this.isNodeClear(x, y)) return false;
                    x += sx;
                }
                const finalY = endPos.y - sy;
                if (!this.isNodeClear(endPos.x, finalY)) return false;
            }
        }
        else
        {
            // Mostly vertical.
            if (dx === 0)
            {
                y += sy;
                while (y !== endPos.y)
                {
                    if (!this.isNodeClear(x, y)) return false;
                    y += sy;
                }
            }
            else
            {
                let lastX = startPos.x;
                while (y !== endPos.y)
                {
                    x = startPos.x + Math.trunc((dx * (y - startPos.y)) / dy);
                    if (lastX !== x)
                    {
                        if (!this.isNodeClear(x + sx, y - sy)) return false;
                        if (!this.isNodeClear(x - sx, y)) return false;
                    }
                    lastX = x;
                    if (y !== startPos.y)
                    {
                        if (!this.isNodeClear(x, y)) return false;
                    }
                    x += sx;
                    if (!this.isNodeClear(x, y)) return false;
                    y += sy;
                }
                const finalX = endPos.x - sx;
                if (!this.isNodeClear(finalX, endPos.y)) return false;
            }
        }
        return true;
    }

    /** Find a path from startPos to endPos in world space. Returns an array
     *  of world-space Vector2 points; empty array if no path exists.
     *
     *  Start and end are snapped to the nearest walkable tile via
     *  getNearestClearNode. Intermediate points are tile centers unless the
     *  string-pulling smoothing pass moves them off-grid.
     *  @param {Vector2} startPos - World-space start
     *  @param {Vector2} endPos - World-space end
     *  @returns {Vector2[]}
     *  @memberof PathFinding */
    findPath(startPos, endPos)
    {
        ASSERT(isVector2(startPos) && isVector2(endPos), 'findPath needs Vector2 endpoints');

        this.buildNodeData();

        // rebuild=false because we just built — avoid redundant work per snap.
        const startNode = this.getNearestClearNode(startPos, 10, false);
        const endNode = this.getNearestClearNode(endPos, 10, false);
        if (!startNode || !endNode) return [];

        // Trivial case: start and end snapped to the same tile.
        if (startNode === endNode) return [startNode.posWorld.copy()];

        if (!this.aStarSearch(startNode, endNode)) return [];

        // Walk back from endNode via parent pointers, then reverse — cheaper
        // than unshifting on every step.
        const nodePath = [];
        for (let n = endNode; n; n = n.parent)
            nodePath.push(n);
        nodePath.reverse();

        if (this.smoothPath)
        {
            this.smoothPathCorners(nodePath);
            this.smoothPathStringPull(nodePath);
            this.dropCollinearNodes(nodePath);
        }

        // Convert to world-space Vector2 path. Return copies, not live node
        // references — callers shouldn't be able to mutate the grid.
        const result = nodePath.map(n => n.posWorld.copy());

        if (this.debug && this.debugTime > 0 && result.length > 0)
        {
            for (let i = 1; i < result.length; ++i)
                debugLine(result[i - 1], result[i], RED, 0.1, this.debugTime);
            for (const p of result)
                debugCircle(p, 0.5, rgb(1, 0, 0, 0.3), this.debugTime);
            debugCircle(result[0], 0.5, rgb(0, 1, 0, 0.5), this.debugTime);
            debugCircle(result[result.length - 1], 0.5, rgb(0, 1, 0, 0.5), this.debugTime);
        }

        return result;
    }
}
