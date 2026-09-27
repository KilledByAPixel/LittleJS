/*
 * LittleJS 3D Voxels Plugin
 * - VoxelMap: a grid of blocks drawn with the faces between them left out, that objects with collideLevel collide
 *   with, the 3D twin of the 2D tile layers
 * - Requires the Render3D plugin and goes after it, everything here is part of its Render3D namespace
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// cells along each side of a chunk, each chunk its own mesh, built again only when something in or beside it changes
const RENDER3D_VOXEL_CHUNK = 16;

// each face of a block: its normal, then the right and up axes across it, right cross up is the normal, as buildBox
// has them, in the order setBlockType takes six faces: +x, -x, +y, -y, +z, -z
const RENDER3D_VOXEL_FACES = [
    [vec3( 1, 0, 0), vec3(0, 0, -1), vec3(0, 1, 0)],
    [vec3(-1, 0, 0), vec3(0, 0, 1),  vec3(0, 1, 0)],
    [vec3(0, 1, 0),  vec3(1, 0, 0),  vec3(0, 0, -1)],
    [vec3(0, -1, 0), vec3(1, 0, 0),  vec3(0, 0, 1)],
    [vec3(0, 0, 1),  vec3(1, 0, 0),  vec3(0, 1, 0)],
    [vec3(0, 0, -1), vec3(-1, 0, 0), vec3(0, 1, 0)],
];

// the shade of a corner by how many solid blocks crowd it, from 0, closed in, to 3, open
const RENDER3D_VOXEL_SHADES = [.55, .7, .85, 1].map(v=> Object.freeze(rgb(v, v, v)));

/** What VoxelMap.raycast finds: how far along the ray, the block's cell and type, and the normal of the face it comes in
 *  through
 *  @typedef {{distance: number, cell: Vector3, normal: Vector3, type: number}} VoxelHit
 *  @memberof Render3D */

/**
 * VoxelMap - A grid of blocks, a 3D tile map: it draws itself, and objects with collideLevel collide with it
 * - pos3D is its corner, as a 2D tile layer's is, and each cell is one world unit, so cell (x, y, z) fills
 *   pos3D + (x..x+1, y..y+1, z..z+1); it stays upright and unscaled at the root
 * - A block's type is a number from 1 to 255, 0 is empty; a type shows that tile of the sheet on every face unless
 *   setBlockType gives it its own faces, or makes it see-through or transparent
 * - Faces between blocks are left out, and the map is drawn in chunks of 16 cells a side, a chunk built again only
 *   when a block in or beside it changes
 * - Objects with collideLevel collide with it, see EngineObject3D.collideWithVoxel, and raycast finds the block a ray
 *   hits and the face it comes in through
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const map = new VoxelMap(vec3(), vec3(32, 16, 32), tile(0, 16));
 * map.setBlockType(1, {top: 0, side: 1, bottom: 2}); // grass
 * map.setVoxel(vec3(3, 0, 5), 1);
 */
class VoxelMap extends EngineObject3D
{
    /** Create a voxel map, it draws itself and joins the level's collision
     *  @param {Vector3} [pos3D] - Its corner
     *  @param {Vector3} [mapSize] - Cells along X, Y and Z
     *  @param {TileInfo} [tileInfo] - The sheet's first tile, as for a TileLayer, a block's type counts tiles from it */
    constructor(pos3D=vec3(), mapSize=vec3(16), tileInfo=tile())
    {
        super(pos3D);
        ASSERT(isVector3(mapSize) && mapSize.x >= 1 && mapSize.y >= 1 && mapSize.z >= 1, 'mapSize must be at least 1 cell each way');
        ASSERT(tileInfo instanceof TileInfo, 'tileInfo must be a TileInfo, the first tile of the sheet');
        /** @property {Vector3} - Cells along X, Y and Z */
        this.mapSize = mapSize.floor();
        /** @property {TileInfo} - The sheet's first tile */
        this.tileInfo = tileInfo;
        /** @property {Uint8Array} - The block type of each cell, x + mapSize.x * (y + mapSize.y * z), 0 empty; call
         *  rebuild() after changing it directly */
        this.data = new Uint8Array(this.mapSize.x * this.mapSize.y * this.mapSize.z);
        /** @property {boolean} - Darken the corners where blocks meet, rebuild() after changing it */
        this.ambientOcclusion = true;
        this.size3D = vec3(); // not a thing to collect or push, its cells are the solid part

        const n = RENDER3D_VOXEL_CHUNK, s = this.mapSize;
        this.chunkCount = vec3(ceil(s.x / n), ceil(s.y / n), ceil(s.z / n));
        /** @type {Array<Mesh|undefined>} */
        this.chunkMeshes = []; // each chunk's solid and see-through blocks, drawn opaque
        /** @type {Array<Mesh|undefined>} */
        this.chunkTransparentMeshes = []; // each chunk's transparent blocks, drawn blended
        /** @type {Array<Vector3>} */
        this.chunkCenters = []; // a chunk mesh's points are around its center, which it is drawn at
        this.chunksChanged = new Set;
        /** @type {Array<{faces: Array<number>, seeThrough: boolean, transparent: boolean}|undefined>} */
        this.blockTypes = [];
        this.tiles = new Map; // tile index to its TileInfo

        // the transparent blocks draw in the transparent stage, blended and sorted, through a child that draws them
        const glass = new EngineObject3D;
        glass.transparent = true;
        glass.render3D = ()=> this.renderChunks(true);
        this.addChild(glass);
        render3DLevel.push(this);
    }

    /** The block type at a cell, 0 for empty or outside the map
     *  @param {Vector3} cell
     *  @return {number} */
    getVoxel(cell)
    {
        ASSERT(isVector3(cell), 'cell must be a vec3');
        return this.voxelAt(floor(cell.x), floor(cell.y), floor(cell.z));
    }

    /** The block type at whole number cell coordinates, 0 outside
     *  @param {number} x
     *  @param {number} y
     *  @param {number} z
     *  @return {number}
     *  @ignore */
    voxelAt(x, y, z)
    {
        const s = this.mapSize;
        return x < 0 || y < 0 || z < 0 || x >= s.x || y >= s.y || z >= s.z ? 0 : this.data[x + s.x * (y + s.y * z)];
    }

    /** Set the block at a cell, 0 clears it; a cell outside the map is ignored
     *  @param {Vector3} cell
     *  @param {number} type - 0 to 255 */
    setVoxel(cell, type)
    {
        ASSERT(isVector3(cell), 'cell must be a vec3');
        ASSERT(type >= 0 && type <= 255 && type % 1 === 0, 'a block type is a whole number from 0 to 255', type);
        const x = floor(cell.x), y = floor(cell.y), z = floor(cell.z), s = this.mapSize;
        if (x < 0 || y < 0 || z < 0 || x >= s.x || y >= s.y || z >= s.z) return;
        const i = x + s.x * (y + s.y * z);
        if (this.data[i] === type) return;
        this.data[i] = type;
        // its chunk and those of the cells around it, whose faces and corner shading it can change
        for (let dz = -1; dz <= 1; ++dz)
        for (let dy = -1; dy <= 1; ++dy)
        for (let dx = -1; dx <= 1; ++dx)
            this.markChunk(x + dx, y + dy, z + dz);
    }

    /** Mark the chunk holding a cell as changed, a cell outside the map has none
     *  @param {number} x
     *  @param {number} y
     *  @param {number} z
     *  @ignore */
    markChunk(x, y, z)
    {
        const s = this.mapSize, c = this.chunkCount, n = RENDER3D_VOXEL_CHUNK;
        if (x < 0 || y < 0 || z < 0 || x >= s.x || y >= s.y || z >= s.z) return;
        this.chunksChanged.add(floor(x / n) + c.x * (floor(y / n) + c.y * floor(z / n)));
    }

    /** Give a block type its own faces, or make it see-through or transparent
     *  @param {number} type - 1 to 255
     *  @param {number|Array<number>|{top?: number, side: number, bottom?: number}} faces - A tile index for every face,
     *    six in the order +x, -x, +y, -y, +z, -z, or the side's with the top and bottom's, which default to the side's
     *  @param {{seeThrough?: boolean, transparent?: boolean}} [options] - seeThrough for holes in its texture, like
     *    leaves, so the blocks beside it keep their faces; transparent to blend, like glass or water, drawn in the
     *    transparent stage, and see-through too */
    setBlockType(type, faces, {seeThrough=false, transparent=false}={})
    {
        ASSERT(type >= 1 && type <= 255 && type % 1 === 0, 'a block type is a whole number from 1 to 255', type);
        const f = /** @type {any} */ (faces);
        const list = isNumber(f) ? [f, f, f, f, f, f] : isArray(f) ? f :
            [f.side, f.side, f.top ?? f.side, f.bottom ?? f.side, f.side, f.side];
        ASSERT(list.length === 6 && list.every(isNumber), 'faces is a tile index, six of them, or {top, side, bottom}');
        this.blockTypes[type] = {faces: list, seeThrough: seeThrough || transparent, transparent};
        this.rebuild();
    }

    /** A block type's faces and how it is seen through
     *  @param {number} type
     *  @return {{faces: Array<number>, seeThrough: boolean, transparent: boolean}}
     *  @ignore */
    blockType(type)
    {
        return this.blockTypes[type] ||= {faces: [type, type, type, type, type, type], seeThrough: false, transparent: false};
    }

    /** Build every chunk again, after changing data directly or ambientOcclusion */
    rebuild()
    {
        const c = this.chunkCount;
        for (let i = c.x * c.y * c.z; i--;)
            this.chunksChanged.add(i);
    }

    /** Build the chunks that changed, the map calls it before it draws */
    buildChunks()
    {
        for (const index of this.chunksChanged)
            this.buildChunk(index);
        this.chunksChanged.clear();
    }

    /** Build one chunk's meshes, a face for each block side that shows
     *  @param {number} index
     *  @ignore */
    buildChunk(index)
    {
        const c = this.chunkCount, n = RENDER3D_VOXEL_CHUNK, s = this.mapSize;
        const x0 = index % c.x * n, y0 = floor(index / c.x) % c.y * n, z0 = floor(index / (c.x * c.y)) * n;
        const x1 = min(x0 + n, s.x), y1 = min(y0 + n, s.y), z1 = min(z0 + n, s.z);
        const center = vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        const opaque = new Mesh, transparent = new Mesh;
        // a block that shades a corner, the see-through ones let the light by
        const solid = (x, y, z)=> { const t = this.voxelAt(x, y, z); return t && !this.blockType(t).seeThrough ? 1 : 0; };
        for (let z = z0; z < z1; ++z)
        for (let y = y0; y < y1; ++y)
        for (let x = x0; x < x1; ++x)
        {
            const type = this.voxelAt(x, y, z);
            if (!type) continue;
            const block = this.blockType(type), mesh = block.transparent ? transparent : opaque;
            for (let f = 0; f < 6; ++f)
            {
                // a face shows toward an empty cell, or a see-through block of another type
                const [normal, right, up] = RENDER3D_VOXEL_FACES[f];
                const bx = x + normal.x, by = y + normal.y, bz = z + normal.z, next = this.voxelAt(bx, by, bz);
                if (next && (next === type || !this.blockType(next).seeThrough)) continue;

                // its corners as a strip, top left, bottom left, top right, bottom right, around the chunk's center
                const middle = vec3(x + .5 - center.x, y + .5 - center.y, z + .5 - center.z).add(normal.scale(.5));
                const corners = render3DQuadAxes(middle, right.scale(.5), up.scale(.5));
                const rect = render3DGetTileUVs(this.tileOf(block.faces[f])); // a shared rect, read it here
                const uvs = RENDER3D_QUAD_UVS.map(q=> vec2(rect.x + q.x * rect.w, rect.y + q.y * rect.h));
                let order = [0, 1, 2, 3], colors = [WHITE, WHITE, WHITE, WHITE];
                if (this.ambientOcclusion)
                {
                    // each corner darkened by the solid blocks beside it on the face's side, the usual voxel shading
                    const shade = [[-1, 1], [-1, -1], [1, 1], [1, -1]].map(([r, u])=>
                    {
                        const side1 = solid(bx + right.x * r, by + right.y * r, bz + right.z * r);
                        const side2 = solid(bx + up.x * u, by + up.y * u, bz + up.z * u);
                        const corner = solid(bx + right.x * r + up.x * u, by + right.y * r + up.y * u, bz + right.z * r + up.z * u);
                        return side1 && side2 ? 0 : 3 - side1 - side2 - corner;
                    });
                    colors = shade.map(k=> RENDER3D_VOXEL_SHADES[k]);
                    // split the quad along the diagonal that keeps the shading even, the other one shows a seam
                    if (shade[0] + shade[3] > shade[1] + shade[2])
                        order = [1, 3, 0, 2];
                }
                mesh.addStrip(order.map(i=> corners[i]), normal, order.map(i=> uvs[i]), order.map(i=> colors[i]));
            }
        }
        this.chunkMeshes[index]?.dispose();
        this.chunkTransparentMeshes[index]?.dispose();
        this.chunkMeshes[index] = opaque.points.length ? opaque : undefined;
        this.chunkTransparentMeshes[index] = transparent.points.length ? transparent : undefined;
        this.chunkCenters[index] = center;
    }

    /** The TileInfo of a tile index, counted from the map's first tile as a TileLayer counts them
     *  @param {number} index
     *  @return {TileInfo}
     *  @ignore */
    tileOf(index)
    {
        let t = this.tiles.get(index);
        if (!t)
        {
            const first = this.tileInfo;
            this.tiles.set(index, t = first.columns ? first.frame(index) : first.index(index));
        }
        return t;
    }

    /** Whether a box hits a block that stops the object, see EngineObject3D.collideWithVoxel
     *  @param {Vector3} pos - Center of the box in the world
     *  @param {Vector3} size
     *  @param {EngineObject3D} o
     *  @return {boolean}
     *  @ignore */
    boxBlocked(pos, size, o)
    {
        // the cells the box is in along an axis, one only touching a cell's face is not in it, but a point, a box with
        // no size, is in the cell it is at, even on a whole number where the two ends pass each other
        const m = this.pos3D, s = this.mapSize, tiny = 1e-9;
        const cells = (center, half, corner, count)=>
        {
            const first = floor(center - half - corner + tiny), last = max(ceil(center + half - corner - tiny) - 1, first);
            return [max(first, 0), min(last, count - 1)];
        };
        const [x0, x1] = cells(pos.x, size.x / 2, m.x, s.x);
        const [y0, y1] = cells(pos.y, size.y / 2, m.y, s.y);
        const [z0, z1] = cells(pos.z, size.z / 2, m.z, s.z);
        for (let z = z0; z <= z1; ++z)
        for (let y = y0; y <= y1; ++y)
        for (let x = x0; x <= x1; ++x)
        {
            const type = this.data[x + s.x * (y + s.y * z)];
            if (type && o.collideWithVoxel(type, vec3(x, y, z)))
                return true;
        }
        return false;
    }

    /** Keep an object out of the blocks, one axis at a time as 2D tiles do, called by the engine for each object with
     *  collideLevel; a sphere collides as its box, and one moving more than about a cell a frame can pass through
     *  @param {EngineObject3D} o
     *  @param {Vector3} oldPos - Where it was before it moved
     *  @ignore */
    levelCollide3D(o, oldPos)
    {
        const k = o.scale3D, size = vec3(o.size3D.x * abs(k.x), o.size3D.y * abs(k.y), o.size3D.z * abs(k.z));
        const p = o.pos3D;
        if (!this.boxBlocked(p, size, o)) return;

        // from where it was, each axis alone, y first so a landing wins; a blocked axis goes flush against the block
        // it ran into, or stays where it was, and its speed bounces by the restitution
        const v = o.velocity3D, m = this.pos3D, epsilon = 1e-4, restitution = max(o.restitution, this.restitution);
        const place = oldPos.copy();
        for (const axis of ['y', 'x', 'z'])
        {
            const moved = place.copy();
            moved[axis] = p[axis];
            if (!this.boxBlocked(moved, size, o))
            {
                place[axis] = p[axis];
                continue;
            }
            const half = size[axis] / 2, move = p[axis] - oldPos[axis];
            if (move)
            {
                moved[axis] = move < 0 ? m[axis] + floor(p[axis] - half - m[axis]) + 1 + half + epsilon :
                    m[axis] + ceil(p[axis] + half - m[axis]) - 1 - half - epsilon;
                if (!this.boxBlocked(moved, size, o))
                    place[axis] = moved[axis];
            }
            if (axis === 'y' && move < 0)
                o.groundObject = this;
            v[axis] *= -restitution;
        }
        p.set(place.x, place.y, place.z);
    }

    /** The first block a ray hits, walking the grid cell by cell: its distance along the ray, its cell, the normal of
     *  the face it comes in through, which a new block goes against, and its type
     *  - A ray that starts inside a block hits it at 0, its normal back along the ray
     *  @param {Ray3D} ray - Its distance is in the ray's own units, as the other raycasts
     *  @param {number} [maxDistance]
     *  @param {function(number, Vector3): boolean} [test] - (type, cell) says which blocks count, every block by default
     *  @return {VoxelHit|undefined} */
    raycast(ray, maxDistance=Infinity, test=()=> true)
    {
        const s = this.mapSize, o = ray.origin.subtract(this.pos3D), d = ray.direction, axes = ['x', 'y', 'z'];
        if (!d.lengthSquared()) return;

        // where it enters the map's box, the axis of the face it comes in through, or where it starts inside it
        let enter = 0, exit = maxDistance, entryAxis = -1;
        for (let k = 0; k < 3; ++k)
        {
            const a = axes[k], dk = d[a], ok = o[a];
            if (!dk)
            {
                if (ok < 0 || ok > s[a]) return; // alongside the map, never in it
                continue;
            }
            let t0 = -ok / dk, t1 = (s[a] - ok) / dk;
            if (t0 > t1) [t0, t1] = [t1, t0];
            if (t0 > enter) enter = t0, entryAxis = k;
            exit = min(exit, t1);
        }
        if (enter > exit) return;

        // walk the cells, stepping across whichever cell edge comes next
        const start = o.add(d.scale(enter)), cell = [], step = [], next = [], delta = [];
        for (let k = 0; k < 3; ++k)
        {
            const a = axes[k], dk = d[a];
            cell[k] = clamp(floor(start[a]), 0, s[a] - 1);
            step[k] = sign(dk);
            next[k] = dk ? enter + (cell[k] + (dk > 0 ? 1 : 0) - start[a]) / dk : Infinity;
            delta[k] = dk ? abs(1 / dk) : Infinity;
        }
        const normalOn = (k)=> vec3(k === 0 ? -step[0] : 0, k === 1 ? -step[1] : 0, k === 2 ? -step[2] : 0);
        let normal, t = enter;
        if (entryAxis >= 0)
            normal = normalOn(entryAxis);
        else
        {
            // starting inside, the normal faces back along the ray's strongest axis
            const k = abs(d.x) >= abs(d.y) && abs(d.x) >= abs(d.z) ? 0 : abs(d.y) >= abs(d.z) ? 1 : 2;
            normal = normalOn(k);
        }
        while (t <= maxDistance)
        {
            const type = this.data[cell[0] + s.x * (cell[1] + s.y * cell[2])];
            if (type)
            {
                const at = vec3(cell[0], cell[1], cell[2]);
                if (test(type, at))
                    return {distance: t, cell: at, normal, type};
            }
            const k = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : (next[1] < next[2] ? 1 : 2);
            t = next[k];
            cell[k] += step[k];
            if (cell[k] < 0 || cell[k] >= s[axes[k]]) return;
            next[k] += delta[k];
            normal = normalOn(k);
        }
    }

    /** How far along a ray the first block is, for picking, see raycast
     *  @param {Ray3D} ray
     *  @return {number|undefined}
     *  @ignore */
    levelRaycast3D(ray) { return this.raycast(ray)?.distance; }

    /** Keeps an eye on its placement, called automatically each frame */
    update()
    {
        super.update();
        ASSERT(!this.parent && !this.rotation3D.lengthSquared() && this.scale3D.x === 1 && this.scale3D.y === 1 &&
            this.scale3D.z === 1, 'a VoxelMap stays upright and unscaled at the root, its cells are world units from its corner');
    }

    /** Draw the solid and see-through blocks, the transparent ones draw through its child */
    render3D() { this.renderChunks(false); }

    /** Draw the chunks, each at its center, with the whole texture so each face shows its own tile
     *  @param {boolean} transparent
     *  @ignore */
    renderChunks(transparent)
    {
        this.buildChunks();
        const meshes = transparent ? this.chunkTransparentMeshes : this.chunkMeshes, p = this.pos3D;
        const texture = this.tileInfo.textureInfo;
        for (let i = 0; i < meshes.length; ++i)
        {
            const mesh = meshes[i], c = this.chunkCenters[i];
            mesh && render3D.drawMesh(mesh, vec3(p.x + c.x, p.y + c.y, p.z + c.z), texture, this.color);
        }
    }

    /** Destroy the map, it leaves the level's collision and lets go of its meshes
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        const i = render3DLevel.indexOf(this);
        i >= 0 && render3DLevel.splice(i, 1);
        for (const mesh of [...this.chunkMeshes, ...this.chunkTransparentMeshes])
            mesh?.dispose();
        super.destroy(immediate);
    }
}
