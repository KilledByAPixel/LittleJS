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
            this.size = source.floor();
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
        this.heuristicWeight = 1;
        this.maxLoop = 500;
        this.smoothPath = true;
        this.debug = false;
        this.debugTime = 2;

        // Pre-allocate the node array — one node per tile, reused across calls.
        this.nodes = new Array(this.size.x * this.size.y);
        for (let y = 0; y < this.size.y; ++y)
        for (let x = 0; x < this.size.x; ++x)
            this.nodes[x + y * this.size.x] = new PathFinderNode(x, y);

        // Scratch Vector2 reused to avoid allocations in the isWalkable hot path.
        this._collisionScratch = vec2();
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
        return !this.tileLayer.getCollisionData(this._collisionScratch.set(x, y));
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
     *  @returns {Vector2} */
    worldToTile(worldPos)
    {
        const ox = this.tileLayer ? this.tileLayer.pos.x : 0;
        const oy = this.tileLayer ? this.tileLayer.pos.y : 0;
        return vec2(Math.floor(worldPos.x - ox), Math.floor(worldPos.y - oy));
    }

    /** Convert integer tile coords to the world-space center of that tile.
     *  @param {number} x
     *  @param {number} y
     *  @returns {Vector2} */
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
        if (this.debug && this.debugTime > 0)
        {
            // Faint red overlay on blocked tiles during build.
            // (Drawn after the per-cell walkable check below.)
        }
        const w = this.size.x;
        const h = this.size.y;
        for (let y = 0; y < h; ++y)
        for (let x = 0; x < w; ++x)
        {
            const node = this.nodes[x + y * w];
            node.reset();
            const walkable = !!this.isWalkable(x, y);
            const cost = walkable ? Math.max(0, this.getCost(x, y)) : 0;
            node.walkable = walkable;
            node.cost = cost;
            node.posWorld = this.tileToWorld(x, y);

            if (this.debug && this.debugTime > 0)
            {
                if (!walkable)
                    debugRect(node.posWorld, vec2(1), rgb(1, 0, 0, 0.25), this.debugTime);
                else if (cost > 0)
                    debugRect(node.posWorld, vec2(1), rgb(1, 0, 0, Math.min(0.2, cost * 0.05)), this.debugTime);
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
                debugRect(current.posWorld, vec2(1), rgb(1, 1, 1, 0.05), this.debugTime);

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
                    // blocked or has cost. Prevents cutting through corners.
                    const card1 = this.getNode(current.pos.x + dx, current.pos.y);
                    if (!card1 || card1.cost > 0 || !card1.walkable) continue;
                    const card2 = this.getNode(current.pos.x, current.pos.y + dy);
                    if (!card2 || card2.cost > 0 || !card2.walkable) continue;
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
                const gdx = endNode.pos.x - neighbor.pos.x;
                const gdy = endNode.pos.y - neighbor.pos.y;
                neighbor.f = neighbor.g + (gdx * gdx + gdy * gdy) * this.heuristicWeight;
            }
        }

        return endNode.parent !== null;
    }

    /** Find the clear (walkable, zero-cost) node closest to the given world
     *  position. Spirals outward in expanding boxes until a clear node is
     *  found or the search range is exhausted. Useful for snapping a click
     *  or NPC spawn position to the nearest open tile.
     *
     *  Requires `buildNodeData()` to have been called first. `findPath`
     *  invokes it automatically; if you call `getNearestClearNode` directly
     *  on a fresh PathFinder, call `buildNodeData()` once beforehand.
     *  @param {Vector2} worldPos
     *  @param {number} [searchRange=10] - Max box-radius in tiles
     *  @returns {PathFinderNode|null}
     *  @memberof PathFinding */
    getNearestClearNode(worldPos, searchRange = 10)
    {
        ASSERT(isVector2(worldPos), 'worldPos must be a Vector2');
        const center = this.worldToTile(worldPos);

        for (let offset = 0; offset <= searchRange; ++offset)
        {
            let nearest = null;
            let nearestDistSq = 0;

            for (let dy = -offset; dy <= offset; ++dy)
            for (let dx = -offset; dx <= offset; ++dx)
            {
                // Only scan the perimeter of the current ring (skip the
                // interior we've already searched in earlier iterations).
                if (offset > 0 && Math.abs(dx) !== offset && Math.abs(dy) !== offset)
                    continue;

                const node = this.getNode(center.x + dx, center.y + dy);
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

        const startNode = this.getNearestClearNode(startPos);
        const endNode = this.getNearestClearNode(endPos);
        if (!startNode || !endNode) return [];

        // Trivial case: start and end snapped to the same tile.
        if (startNode === endNode) return [startNode.posWorld];

        if (!this.aStarSearch(startNode, endNode)) return [];

        // Walk back from endNode via parent pointers to build the node list.
        const nodePath = [];
        for (let n = endNode; n; n = n.parent)
            nodePath.unshift(n);

        // Convert to world-space Vector2 path.
        return nodePath.map(n => n.posWorld);
    }
}
