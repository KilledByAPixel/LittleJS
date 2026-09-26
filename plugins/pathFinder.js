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
        /** @property {boolean} - True if this cell is passable (set by buildNodeData) */
        this.walkable = false;
        /** @property {number} - Extra cost added to A* G-score for stepping on this cell */
        this.cost = 0;
        /** @property {number} - A* G-score: actual cost from start to this node */
        this.g = 0;
        /** @property {number} - A* F-score: G + heuristic */
        this.f = 0;
        /** @property {number} - A* heuristic: the estimated cost left to the goal, breaks ties between equal F */
        this.h = 0;
        /** @property {PathFinderNode|null} - Parent for path reconstruction
         *  @type {PathFinderNode|null} */
        this.parent = null;
        /** @property {boolean} - In the A* open list */
        this.isOpen = false;
        /** @property {boolean} - In the A* closed list */
        this.isClosed = false;
        /** @property {number} - Where it is in the A* open list's heap, while open */
        this.heapIndex = 0;
    }

    /** Clear what a search left on this node, keeping walkable and cost */
    resetSearch()
    {
        this.g = this.f = this.h = 0;
        this.parent = null;
        this.isOpen = this.isClosed = false;
    }

    /** Reset per-search state and walkability (called by buildNodeData). */
    reset() { this.walkable = false; this.cost = 0; this.resetSearch(); }

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
        // Accept a Vector2 size, or a TileCollisionLayer or any object with its size and getCollisionData
        if (isVector2(source))
        {
            /** @property {Vector2} - Grid dimensions in tiles
             *  @type {Vector2} */
            this.size = /** @type {Vector2} */ (source).floor();
            /** @property {TileCollisionLayer|undefined} - Tile layer driving walkability, if any
             *  @type {TileCollisionLayer|undefined} */
            this.tileLayer = undefined;
        }
        else
        {
            const layer = /** @type {TileCollisionLayer} */ (source);
            ASSERT(layer && isVector2(layer.size) && typeof layer.getCollisionData === 'function',
                'PathFinder requires a Vector2 size or a TileCollisionLayer');
            this.size = layer.size;
            this.tileLayer = layer;
        }

        // Tunables (public, freely re-assignable).
        /** @property {number} - A* heuristic multiplier (1 = admissible, higher = greedier) */
        this.heuristicWeight = 1;
        /** @property {number|undefined} - Most A* expansions before giving up, undefined for the number of cells,
         *  so a search always finishes; a lower one caps the time a search takes, see searchGaveUp
         *  @type {number|undefined} */
        this.maxLoop = undefined;
        /** @property {boolean} - True when the last search stopped at maxLoop with no path, so it gave up rather
         *  than that there is no way through */
        this.searchGaveUp = false;
        /** @property {boolean} - If true, post-process paths with two-pass smoothing */
        this.smoothPath = true;
        /** @property {boolean} - If true, draw debug visualization during findPath */
        this.debug = false;
        /** @property {number} - Debug primitive lifetime in seconds (0 disables drawing) */
        this.debugTime = 1;

        /** @property {Array<PathFinderNode>} - Flat row-major array of size.x*size.y nodes
         *  @type {Array<PathFinderNode>} */
        this.nodes = new Array(this.size.x * this.size.y);
        for (let y = 0; y < this.size.y; ++y)
        for (let x = 0; x < this.size.x; ++x)
            this.nodes[x + y * this.size.x] = new PathFinderNode(x, y);

        // Whether buildNodeData has run, a search without a rebuild builds it the first time.
        /** @private */
        this.nodeDataBuilt = false;

        // Scratch Vector2 reused to avoid allocations in the isWalkable hot path.
        /** @private */
        this.collisionScratch = vec2();

        // The nodes the last search changed, reset before the next one so a
        // search without a rebuild starts as fresh as one after it.
        /** @type {Array<PathFinderNode>}
         *  @private */
        this.searchNodes = [];
    }

    /** Default walkability: if a tile layer was provided, returns true when the
     *  cell has no solid (positive) collision data, so negative data is open
     *  like it is to the engine's collision; otherwise returns true. Override on
     *  the instance or via a subclass.
     *  @param {number} x - Tile x
     *  @param {number} y - Tile y
     *  @returns {boolean} */
    isWalkable(x, y)
    {
        if (!this.tileLayer) return true;
        return !(this.tileLayer.getCollisionData(this.collisionScratch.set(x, y)) > 0);
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
        return vec2(floor(worldPos.x - ox), floor(worldPos.y - oy));
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
     *  findPath; call it directly before searches made with rebuild=false. */
    buildNodeData()
    {
        this.nodeDataBuilt = true;
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
     *  reached; false on disconnected goal or maxLoop exhaustion, which sets searchGaveUp.
     *  @param {PathFinderNode} startNode
     *  @param {PathFinderNode} endNode
     *  @returns {boolean}
     *  @private */
    aStarSearch(startNode, endNode)
    {
        ASSERT(startNode && endNode, 'aStarSearch needs both endpoints');
        ASSERT(startNode !== endNode, 'aStarSearch: start and end must differ — caller should handle trivial case');
        ASSERT(startNode.walkable && endNode.walkable, 'aStarSearch: endpoints must be walkable');

        // Undo what the last search changed, so one without a rebuild starts
        // from the same state; after buildNodeData these are fresh already.
        const searchNodes = this.searchNodes;
        for (const n of searchNodes) n.resetSearch();
        searchNodes.length = 0;
        searchNodes.push(startNode);

        // The open list is a binary heap with the smallest f score on top, so a big map searches quickly.
        // Equal scores go to the node nearer the goal, so open ground is
        // crossed nearly straight instead of widening in a band of ties;
        // the path is just as short, only which of equal paths can change.
        // Scores are sums of diagonals, so equal is within a hair.
        const openList = [];
        const isBetter = (a, b)=> a.f < b.f - 1e-9 || a.f < b.f + 1e-9 && a.h < b.h;
        const siftUp = (node)=>
        {
            // a new node, or one whose score went down, moves up past the ones it now beats
            let i = node.heapIndex;
            while (i)
            {
                const parent = (i - 1) >> 1;
                if (!isBetter(node, openList[parent])) break;
                (openList[i] = openList[parent]).heapIndex = i;
                i = parent;
            }
            (openList[i] = node).heapIndex = i;
        };
        const popBest = ()=>
        {
            // take the top, then the last node sinks down from the top to where it belongs
            const best = openList[0], last = openList.pop();
            if (last !== best)
            {
                let i = 0;
                for (;;)
                {
                    const left = 2*i + 1, right = left + 1;
                    if (left >= openList.length) break;
                    const child = right < openList.length && isBetter(openList[right], openList[left]) ? right : left;
                    if (!isBetter(openList[child], last)) break;
                    (openList[i] = openList[child]).heapIndex = i;
                    i = child;
                }
                (openList[i] = last).heapIndex = i;
            }
            return best;
        };
        startNode.isOpen = true;
        startNode.heapIndex = openList.length;
        siftUp(startNode);
        const maxLoop = this.maxLoop ?? this.size.x * this.size.y;
        let loopCount = 0;
        this.searchGaveUp = false;

        while (openList.length > 0)
        {
            const current = openList[0];
            if (current === endNode) break;
            if (++loopCount > maxLoop)
            {
                // the goal may be found already, waiting its turn, and then the path to it comes back
                this.searchGaveUp = !endNode.parent;
                break;
            }

            // Move current from open to closed.
            popBest();
            current.isOpen = false;
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
                const wasOpen = neighbor.isOpen;
                if (!wasOpen)
                {
                    neighbor.isOpen = true;
                    neighbor.heapIndex = openList.length;
                    openList.push(neighbor);
                    searchNodes.push(neighbor);
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
                neighbor.h = h;
                neighbor.f = neighbor.g + h * this.heuristicWeight;
                siftUp(neighbor); // its place in the heap, new or with a lower score now
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
     *  @returns {PathFinderNode|null} */
    getNearestClearNode(worldPos, searchRange = 10, rebuild = true)
    {
        ASSERT(isVector2(worldPos), 'worldPos must be a Vector2');
        if (rebuild || !this.nodeDataBuilt) this.buildNodeData(); // a grid never built has nothing to walk yet
        return pathFinderNearestNode(this, worldPos, searchRange, (node)=> node.isClear());
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

            // stepDx,stepDy is the prev-to-node step and stepDxNext,stepDyNext the node-to-next step; the 135°
            // case uses them to tell mostly vertical from mostly horizontal, the straight case to tell a line
            // from a bump
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
                const useFirst = dist1Sq < dist2Sq;
                const sx = useFirst ? s1x : s2x, sy = useFirst ? s1y : s2y;

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
     *  A node with a cost is kept, and a shortcut only runs between clear
     *  nodes: isLineClear passes only through clear cells, so a straight line
     *  it accepts costs no more than the grid path it replaces.
     *
     *  Replaces the port of ShortenPath2() in pathFinding.cpp, which could
     *  add a segment it had not checked.
     *  @param {PathFinderNode[]} path
     *  @private */
    smoothPathStringPull(path)
    {
        if (path.length <= 2) return;

        // Greedy: from each kept node, jump to the furthest node with a clear
        // line to it, or else the next node. Every segment is one isLineClear
        // accepted or one the path already had, so none can cross a wall.
        const original = path.slice();
        path.length = 0;
        path.push(original[0]);
        for (let k = 0; k < original.length - 1;)
        {
            let j = original.length - 1;
            if (original[k].isClear()) // isLineClear needs both ends clear
                while (j > k + 1 && !(original[j].isClear() && this.isLineClear(original[k].pos, original[j].pos)))
                    --j;
            else
                j = k + 1;
            path.push(original[j]);
            k = j;
        }
    }

    /** Drop any middle node that lies exactly on the line through its two
     *  neighbors. Backstop for the smoothing passes — the corners pass
     *  intentionally keeps truly-straight runs, and the string-pulling pass
     *  falls back to the next node where no longer line is clear, so it can
     *  leave 3+ collinear nodes in some edge cases.
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
     *  Start and end are snapped to the nearest walkable tile (a costed one
     *  counts), within 10 tiles. Intermediate points are tile centers unless the
     *  string-pulling smoothing pass moves them off-grid.
     *
     *  By default, calls `buildNodeData()` first, which asks isWalkable and
     *  getCost about every cell. When finding many paths with unchanged
     *  walkability, pass `rebuild=false` and call `buildNodeData()` once
     *  externally; the paths found are the same.
     *  @param {Vector2} startPos - World-space start
     *  @param {Vector2} endPos - World-space end
     *  @param {boolean} [rebuild] - Whether to call buildNodeData first
     *  @returns {Vector2[]} */
    findPath(startPos, endPos, rebuild = true)
    {
        ASSERT(isVector2(startPos) && isVector2(endPos), 'findPath needs Vector2 endpoints');

        this.searchGaveUp = false;
        if (rebuild || !this.nodeDataBuilt) this.buildNodeData(); // a grid never built has nothing to walk yet

        // rebuild=false because we just built — avoid redundant work per snap.
        // the ends go to the nearest cell that can be walked, whatever it costs to cross
        const walkable = (node)=> node.walkable;
        const startNode = pathFinderNearestNode(this, startPos, 10, walkable);
        const endNode = pathFinderNearestNode(this, endPos, 10, walkable);
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

// the node nearest a world position that passes a test, within a range of tiles, or null: the rings of cells around
// the position are searched outward until the next ring cannot hold anything nearer than the best found, since the
// best of one ring is not always the nearest, a cell one ring out can be closer
function pathFinderNearestNode(finder, worldPos, searchRange, test)
{
    const center = finder.worldToTile(worldPos);
    const centerX = center.x, centerY = center.y;

    let nearest = null, nearestDistSq = 0;
    for (let offset = 0; offset <= searchRange; ++offset)
    {
        // every cell of this ring is more than offset - .5 away along one axis
        const bound = max(0, offset - .5);
        if (nearest && bound * bound >= nearestDistSq) break;

        for (let dy = -offset; dy <= offset; ++dy)
        for (let dx = -offset; dx <= offset; ++dx)
        {
            // only the ring itself, the inside was searched already
            if (offset > 0 && abs(dx) !== offset && abs(dy) !== offset)
                continue;

            const node = finder.getNode(centerX + dx, centerY + dy);
            if (!node || !test(node)) continue;

            const ddx = node.posWorld.x - worldPos.x;
            const ddy = node.posWorld.y - worldPos.y;
            const distSq = ddx * ddx + ddy * ddy;
            if (!nearest || distSq < nearestDistSq)
            {
                nearest = node;
                nearestDistSq = distSq;
            }
        }
    }
    return nearest;
}
