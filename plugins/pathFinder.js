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
}
