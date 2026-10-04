/*
 * LittleJS 3D Mesh Plugin
 * - Mesh, the geometry the renderer draws: triangle strips or indexed lists, uploaded to the GPU on their first draw
 * - The basic builders, buildBox, buildSphere, buildGrid, buildLathe and buildSky, and the helpers that pack a mesh
 * - Goes after the Render3D plugin, everything here is part of its Render3D namespace
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// how many vertices a strip of n points takes with its repeats, and which point vertex k of it is
function render3DStripCount(n) { return n + 2 + (n & 1); }
function render3DStripIndex(k, n) { return k < 1 ? 0 : k <= n ? k - 1 : n - 1; }

// walk a strip's vertices with the repeats applied, calling back with (point, normal, uv, color)
// normals, uvs and colors may be one value for all points, an array per point, or undefined
function render3DForEachStripVertex(points, normals, uvs, colors, callback)
{
    ASSERT(isArray(points) && points.length > 2, 'strip needs at least 3 points');
    const n = points.length, count = render3DStripCount(n);
    const normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
    for (let k = 0; k < count; ++k)
    {
        const i = render3DStripIndex(k, n);
        callback(points[i],
            normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL,
            uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV,
            colorArray ? colors[i] : colors || WHITE);
    }
}

// write one vertex into a packed buffer at float index j
function render3DWriteVertex(floats, ints, j, x, y, z, n, u, v, rgba)
{
    floats[j]   = x;   floats[j+1] = y;   floats[j+2] = z;
    floats[j+3] = n.x; floats[j+4] = n.y; floats[j+5] = n.z;
    floats[j+6] = u;   floats[j+7] = v;
    ints[j+8] = rgba;
}

// turn every triangle of an index list the other way round, in place: the authoring form reads counter clockwise
// from the front and the pass draws clockwise, as a strip's triangles come out after its leading repeat
function render3DFlipTriangles(indices)
{
    for (let t = 0; t < indices.length; t += 3)
    {
        const b = indices[t+1];
        indices[t+1] = indices[t+2], indices[t+2] = b;
    }
    return indices;
}

// the triangles of a strip of count entries as an index list, given which vertex each entry maps to and which place
// it is at: the strip's triangle i is (i-2, i-1, i), its odd ones read the other way as the GPU reads a strip, and a
// triangle with two corners in one place has no area, it is a join between pieces or a sliver at a pole, and is left out
function render3DStripTriangles(count, remap, place)
{
    const indices = [];
    for (let i = 2; i < count; ++i)
    {
        const a = i & 1 ? i - 1 : i - 2, b = i & 1 ? i - 2 : i - 1;
        if (place[a] != place[b] && place[b] != place[i] && place[a] != place[i])
            indices.push(remap[a], remap[b], remap[i]);
    }
    return indices;
}

// a mesh's packed vertex data for the GPU, one vertex per entry of a layout, which is the strip index of each,
// written into data when given, the buffer an earlier call returned for the same layout; it measures the mesh's
// radius and box as it goes, as computeRadius does, over the vertices once instead of every strip entry
function render3DMeshVertexData(mesh, vertices, data=new ArrayBuffer(vertices.length * RENDER3D_VERTEX_BYTES))
{
    const count = vertices.length;
    const floats = new Float32Array(data), ints = new Uint32Array(data);
    let r = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let j = 0; j < count; ++j)
    {
        // a hand built mesh may leave normals, uvs and colors empty
        const i = vertices[j], p = mesh.points[i], uv = mesh.uvs[i] || RENDER3D_DEFAULT_UV;
        const x = p.x, y = p.y, z = p.z;
        render3DWriteVertex(floats, ints, j * RENDER3D_VERTEX_FLOATS, x, y, z,
            mesh.normals[i] || RENDER3D_DEFAULT_NORMAL, uv.x, uv.y, (mesh.colors[i] || WHITE).rgbaInt());
        r = max(r, x*x + y*y + z*z);
        x0 = min(x0, x), y0 = min(y0, y), z0 = min(z0, z);
        x1 = max(x1, x), y1 = max(y1, y), z1 = max(z1, z);
    }
    mesh.radius = r ** .5;
    mesh.bounds = count ? {min: vec3(x0, y0, z0), max: vec3(x1, y1, z1)} : {min: vec3(), max: vec3()};
    return data;
}

// reorder a convex polygon's points, counter clockwise from outside, into one triangle strip
function render3DPolygonStrip(points)
{
    const strip = [points[0]];
    for (let i = 1, j = points.length - 1; i <= j; ++i, --j)
    {
        strip.push(points[i]);
        if (i !== j)
            strip.push(points[j]);
    }
    return strip;
}

// turn every triangle of a mesh the other way round, the normals left alone: an index list reads each one in the
// other order, and a strip gets one extra point at each end, which flips every triangle and keeps the count even
function render3DFlipWinding(mesh)
{
    if (mesh.indices)
        return void render3DFlipTriangles(mesh.indices);
    for (const key of ['points', 'normals', 'uvs', 'colors'])
    {
        const a = mesh[key];
        if (a.length)
            a.unshift(a[0]), a.push(a[a.length - 1]);
    }
    mesh.vertexKeys = undefined;
}

///////////////////////////////////////////////////////////////////////////////

// frees the GPU buffer of a mesh that is garbage collected without dispose, some time after it goes; it holds the
// buffer and its context, never the mesh, or the mesh could not be collected, and dispose unregisters the mesh
const render3DMeshBuffers = typeof FinalizationRegistry == 'undefined' ? undefined :
    new FinalizationRegistry(({buffer, indexBuffer, generation})=>
    {
        if (generation !== render3D?.contextGeneration || !glContext) return;
        glContext.deleteBuffer(buffer);
        glContext.deleteBuffer(indexBuffer);
    });

// the points at one place, to a hundred thousandth, which smooth normals are summed by: each point's group, numbered
// from 0, found by a number made from its place and checked against the place, so no text is made for a point
function render3DPlaceGroups(points)
{
    const groups = new Int32Array(points.length), first = new Map, next = [], places = [];
    for (let i = 0; i < points.length; ++i)
    {
        const p = points[i], x = round(p.x * 1e5), y = round(p.y * 1e5), z = round(p.z * 1e5);
        const hash = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
        let group = first.get(hash);
        while (group !== undefined && !(places[group*3] === x && places[group*3+1] === y && places[group*3+2] === z))
            group = next[group];
        if (group === undefined)
        {
            group = next.length;
            next.push(first.get(hash));
            first.set(hash, group);
            places.push(x, y, z);
        }
        groups[i] = group;
    }
    return {groups, count: next.length};
}

// the face normals meeting at each place added up, each weighted by its corner angle so a cube corner averages its
// three faces evenly however they are cut into triangles; of a strip, every other triangle turned back, with no
// indices, or of the index list; in numbers, with no vector made for a triangle or a corner
function render3DSmoothNormalSums(points, indices)
{
    const strip = !indices, triangles = strip ? max(points.length - 2, 0) : indices.length / 3 | 0;
    const {groups, count} = render3DPlaceGroups(points);
    const sums = new Float64Array(count * 3), touched = new Uint8Array(count);
    let nx = 0, ny = 0, nz = 0;
    const addCorner = (a, b, c, group)=>
    {
        // the angle at corner a, then the face normal scaled by it added to the sum at a's place
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const dot = ux*vx + uy*vy + uz*vz, lengths = (ux**2 + uy**2 + uz**2)**.5 * (vx**2 + vy**2 + vz**2)**.5;
        const angle = Math.acos(clamp(dot / (lengths || 1), -1, 1)), s = group * 3;
        sums[s] += nx * angle, sums[s+1] += ny * angle, sums[s+2] += nz * angle;
        touched[group] = 1;
    };
    for (let t = 0; t < triangles; ++t)
    {
        const i0 = strip ? t : indices[t*3], i1 = strip ? t + 1 : indices[t*3+1], i2 = strip ? t + 2 : indices[t*3+2];
        const a = points[i0], b = points[i1], c = points[i2];
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const cx = uy*vz - uz*vy, cy = uz*vx - ux*vz, cz = ux*vy - uy*vx;
        const lengthSquared = cx**2 + cy**2 + cz**2;
        if (!lengthSquared) continue; // no area, like a triangle joining two strips
        const k = (strip && !(t & 1) ? -1 : 1) / lengthSquared**.5;
        nx = cx * k, ny = cy * k, nz = cz * k;
        addCorner(a, b, c, groups[i0]);
        addCorner(b, c, a, groups[i1]);
        addCorner(c, a, b, groups[i2]);
    }
    return {groups, sums, touched};
}

/**
 * Mesh - Triangles with positions, normals, uvs and colors, uploaded once and drawn by matrix
 * - Build with addStrip, addQuad, combine or the shape builders, then render each frame
 * - Its back faces are skipped unless doubleSided is set, which the open builders like buildGrid do for you
 * - Two forms: a triangle strip, what the builders make, or an indexed list of triangles over their own vertices,
 *   what addTriangles and the model loaders make; upload sends the GPU an indexed list either way, see getTriangles,
 *   so a strip's joins between its pieces cost nothing to draw, and toIndexed turns a strip mesh into the list form
 * - The GPU buffer is created lazily on first render and dropped by dispose, or freed once the mesh is garbage
 *   collected, so dispose is only needed to free it right away, like for a mesh rebuilt often
 * @memberof Render3D
 * @example
 * const mesh = buildLathe([[0, -1], [1, 0], [0, 1]], 4); // octahedron
 * mesh.render(buildMatrix(vec3(0, 1, 0)), undefined, RED);
 */
class Mesh
{
    /** Create an empty mesh */
    constructor()
    {
        /** @property {Array<Vector3>} - Vertex positions, in strip order or one per vertex of an indexed mesh
         *  @type {Array<Vector3>} */
        this.points = [];
        /** @property {Array<Vector3>} - Vertex normals
         *  @type {Array<Vector3>} */
        this.normals = [];
        /** @property {Array<Vector2>} - Vertex texture coords, 0-1 across the tile
         *  @type {Array<Vector2>} */
        this.uvs = [];
        /** @property {Array<Color>} - Vertex colors
         *  @type {Array<Color>} */
        this.colors = [];
        /** @property {WebGLBuffer|undefined} - GPU vertex buffer, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.buffer = undefined;
        /** @property {WebGLBuffer|undefined} - GPU index buffer, the triangles, created by upload
         *  @type {WebGLBuffer|undefined} */
        this.indexBuffer = undefined;
        /** @property {number} - Indices in the GPU index buffer, three per triangle */
        this.bufferCount = 0;
        this.indexType = 0; // gl.UNSIGNED_SHORT, or UNSIGNED_INT past 65535 vertices
        /** @property {boolean} - The mesh changed and needs uploading again, set it yourself if you edit the arrays */
        this.dirty = false;
        /** @property {boolean|undefined} - Draw every use of this mesh in the opaque stage as one instanced call,
         *  undefined follows render3D.instancing
         *  @type {boolean|undefined} */
        this.instanced = undefined;
        /** @property {boolean} - Draw both sides, each lit as the side that is seen; off skips the faces pointing away,
         *  which is faster and right for closed shapes, the open builders like buildGrid and buildRibbon turn it on */
        this.doubleSided = false;
        /** @property {boolean} - The values change often but the shape never does, for a water surface or a cloth: set
         *  once, the mesh keeps its GPU layout and a dirty upload only rewrites the vertices into the buffer it has;
         *  the strip must keep the same points in the same order, a new point count asserts; the layout is decided by
         *  the first upload, so strip entries equal then stay one vertex and triangles with no area then stay dropped,
         *  set vertexKeys or give it distinct values at the start, not a flat grid of one color or points all in one place */
        this.dynamicDraw = false;
        /** @property {Array<number>|undefined} - The mesh as an indexed triangle list instead of a strip: the arrays
         *  hold each vertex once and this says how they join, three vertex numbers per triangle, counter clockwise seen
         *  from the front like a strip's first triangle; addTriangles and the loaders fill it, toIndexed turns a strip
         *  mesh into this form
         *  @type {Array<number>|undefined} */
        this.indices = undefined;
        /** @property {Int32Array|undefined} - Which strip entries are one vertex, set by a builder that knows, one
         *  whole number per entry with equal numbers meaning the same vertex; upload skips its search for them, then
         *  drops the keys, since an edit after that may tell the entries apart; adding geometry or recomputing normals
         *  drops them too
         *  @type {Int32Array|undefined} */
        this.vertexKeys = undefined;
        /** @type {{vertices: Array<number>, pointCount: number, data: ArrayBuffer}|undefined} */
        // the strip index of each GPU vertex, the point count and packed data of the last upload, for a dynamicDraw mesh
        this.vertexLayout = undefined;
        // the layout's data already holds the mesh as it is, with its radius and box, written by a glTF skin as it
        // bent the mesh, so the next upload sends it without packing it again
        this.vertexDataPacked = false;
        this.instanceCount = 0; // draws waiting in this mesh's batch, with their values, texture and draw state
        /** @type {Float32Array|undefined} */
        this.instanceData = undefined;
        /** @property {number} - Bounding sphere radius around the origin, for culling and picking, computed by upload */
        this.radius = 0;
        /** @property {{min: Vector3, max: Vector3}|undefined} - Bounding box, for picking, measured with the radius
         *  @type {{min: Vector3, max: Vector3}|undefined} */
        this.bounds = undefined;
        this.contextGeneration = 0; // the context the buffer belongs to, see render3D.contextGeneration
    }

    /** Number of vertices in the mesh
     *  @return {number} */
    get vertexCount() { return this.points.length; }

    /** Add a triangle strip, joined to the previous one by invisible flat triangles so one mesh holds many strips
     *  - Strip order: the first three points make a triangle, then each point makes another with the two before it
     *  - List the first three points counter clockwise as seen from the front, or the face points away
     *    and may vanish when back faces are culled
     *  @param {Array<Vector3>} points - Strip order
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, default zero
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, default white
     *  @return {Mesh} */
    addStrip(points, normals, uvs, colors)
    {
        if (this.indices)
        {
            // an indexed mesh takes the strip as the triangles it makes
            const part = new Mesh().addStrip(points, normals, uvs, colors).toIndexed();
            return this.addTriangles(part.points, part.indices, part.normals, part.uvs, part.colors);
        }
        render3DForEachStripVertex(points, normals, uvs, colors, (p, n, uv, c)=>
        {
            this.points.push(p);
            this.normals.push(n);
            this.uvs.push(uv);
            this.colors.push(c);
        });
        this.vertexKeys = undefined; // the new entries have no keys
        this.dirty = true;
        return this;
    }

    /** Add triangles over their own vertices, the indexed form a model file comes in
     *  - The mesh becomes indexed: a strip mesh is turned into triangles first, and strips added later join as triangles
     *  - List each triangle counter clockwise as seen from the front, like a strip's first triangle
     *  @param {Array<Vector3>} points - Each vertex once
     *  @param {Array<number>} indices - Three vertex numbers per triangle, into points
     *  @param {Vector3|Array<Vector3>} [normals] - One for all or one per point, default up
     *  @param {Vector2|Array<Vector2>} [uvs] - One for all or one per point, default zero
     *  @param {Color|Array<Color>} [colors] - One for all or one per point, default white
     *  @return {Mesh} */
    addTriangles(points, indices, normals, uvs, colors)
    {
        ASSERT(isArray(points) && isArray(indices) && indices.length % 3 === 0,
            'addTriangles takes points and three indices per triangle');
        ASSERT(indices.every(i=> i >= 0 && i < points.length && i % 1 === 0), 'an index points past the vertices given');
        this.toIndexed();
        const offset = this.points.length, normalArray = isArray(normals), uvArray = isArray(uvs), colorArray = isArray(colors);
        for (let i = 0; i < points.length; ++i)
        {
            this.points.push(points[i]);
            this.normals.push(normalArray ? normals[i] : normals || RENDER3D_DEFAULT_NORMAL);
            this.uvs.push(uvArray ? uvs[i] : uvs || RENDER3D_DEFAULT_UV);
            this.colors.push(colorArray ? colors[i] : colors || WHITE);
        }
        for (const i of indices)
            this.indices.push(i + offset);
        this.dirty = true;
        return this;
    }

    /** Turn a strip mesh into the indexed form, each distinct vertex once and the real triangles over them, in place
     *  - An indexed mesh is left as it is; the builders make strips and a loader makes this, and either draws the same
     *  @return {Mesh} */
    toIndexed()
    {
        if (this.indices) return this;
        const {vertices, indices} = this.getTriangles();
        this.points = vertices.map(i=> this.points[i]);
        this.normals = vertices.map(i=> this.normals[i] || RENDER3D_DEFAULT_NORMAL);
        this.uvs = vertices.map(i=> this.uvs[i] || RENDER3D_DEFAULT_UV);
        this.colors = vertices.map(i=> this.colors[i] || WHITE);
        // the list upload sends reads clockwise, the pass draws it that way; the authoring form is counter clockwise
        this.indices = render3DFlipTriangles(indices);
        this.vertexKeys = undefined;
        this.dirty = true;
        return this;
    }

    /** Add a flat quad from four corners in loop order, counter clockwise seen from the front, a is the top left of the texture
     *  @param {Vector3} a
     *  @param {Vector3} b
     *  @param {Vector3} c
     *  @param {Vector3} d
     *  @param {Color|Array<Color>} [color] - One for all or one per corner
     *  @param {Array<Vector2>} [uvs] - One per corner, default across the tile
     *  @return {Mesh} */
    addQuad(a, b, c, d, color, uvs)
    {
        return this.addStrip(render3DQuadStrip(a, b, c, d), render3DFaceNormal(a, b, c, d),
            uvs ? render3DQuadValues(uvs) : RENDER3D_QUAD_UVS, render3DQuadValues(color));
    }

    /** Append another mesh transformed by a matrix, for building one shape out of several
     *  @param {Mesh} mesh
     *  @param {Matrix4|Vector3} [matrix] - Transform, or just a position to move it to
     *  @param {Color} [color] - Multiplies the appended vertex colors
     *  @return {Mesh} */
    combine(mesh, matrix=RENDER3D_IDENTITY, color=WHITE)
    {
        matrix = render3DMatrix(matrix); // most parts only need moving into place
        const normalMatrix = render3DNormalMatrix(matrix), mirrors = render3DMirrors(matrix);
        let part = mesh, order;
        if (this.indices || mesh.indices)
        {
            // one of them is indexed, so both are: the part as a copy if it is a strip
            this.toIndexed();
            part = mesh.indices ? mesh : new Mesh().combine(mesh).toIndexed();
            const offset = this.points.length, indices = part.indices;
            // the count read once, a mesh combined with itself grows as it is read; a mirror turns every triangle the
            // other way round
            for (let t = 0, n = indices.length; t < n; t += 3)
                this.indices.push(indices[t] + offset, indices[t + (mirrors ? 2 : 1)] + offset,
                    indices[t + (mirrors ? 1 : 2)] + offset);
        }
        else if (mirrors && part.points.length)
        {
            // a strip reads the other way round with one more point at each end, as render3DFlipWinding does
            const last = part.points.length - 1;
            order = [0, ...part.points.keys(), last];
        }
        for (let j = 0, count = order ? order.length : part.points.length; j < count; ++j)
        {
            const i = order ? order[j] : j;
            this.points.push(matrix.transformPoint(part.points[i]));
            this.normals.push(normalMatrix.transformDirection(part.normals[i] || RENDER3D_DEFAULT_NORMAL).normalize());
            this.uvs.push((part.uvs[i] || RENDER3D_DEFAULT_UV).copy());
            this.colors.push((part.colors[i] || WHITE).multiply(color));
        }
        this.doubleSided ||= mesh.doubleSided; // an open part leaves the whole mesh open
        this.vertexKeys = undefined; // the new entries have no keys
        this.dirty = true;
        return this;
    }

    /** Returns a new mesh: this one and its mirror image across the plane through the origin facing axis
     *  - For modeling half a shape against that plane, a part that crosses it overlaps its image
     *  @param {Vector3} [axis] - Faces the mirror plane, vec3(1,0,0) mirrors across x
     *  @return {Mesh} */
    mirror(axis=vec3(1, 0, 0))
    {
        ASSERT(isVector3(axis) && axis.lengthSquared() > 0, 'mirror needs an axis');
        const n = axis.normalize(), a = -2 * n.x, b = -2 * n.y, c = -2 * n.z;
        const reflect = new Matrix4([1 + a * n.x, b * n.x, c * n.x, 0, a * n.y, 1 + b * n.y, c * n.y, 0,
            a * n.z, b * n.z, 1 + c * n.z, 0, 0, 0, 0, 1]);
        return new Mesh().combine(this).combine(this, reflect); // combine turns the image's faces the right way out
    }

    /** Returns a new mesh of count copies of this one, each turned further around an axis through the origin
     *  @param {number} count - Copies, spaced evenly around the whole turn
     *  @param {Vector3} [axis] - Up by default
     *  @return {Mesh} */
    spin(count, axis=vec3(0, 1, 0))
    {
        ASSERT(count >= 1 && count % 1 === 0, 'spin count must be a whole number, 1 or more');
        ASSERT(isVector3(axis) && axis.lengthSquared() > 0, 'spin needs an axis');
        const mesh = new Mesh, unit = axis.normalize();
        for (let i = 0; i < count; ++i)
            mesh.combine(this, render3DAxisRotation(unit, i / count * 2 * PI));
        return mesh;
    }

    /** Returns a new mesh of everything in this mesh or the other, see subtract
     *  @param {Mesh} mesh - Closed, as the builders make them apart from the open ones like buildGrid
     *  @param {Matrix4|Vector3} [matrix] - Places the other mesh, or just a position to move it to
     *  @return {Mesh} */
    union(mesh, matrix) { return render3DMeshCSG(this, mesh, matrix, 0); }

    /** Returns a new mesh of this one with the other cut out of it, CSG with BSP trees
     *  - Both must be closed, every edge shared by two triangles, as the builders make them apart from the open
     *    ones like buildGrid and buildRibbon; the result is closed and indexed, and neither mesh changes
     *  - The faces a cut makes come from the other mesh's surface, turned to face out, with its normals, uvs and
     *    colors, so a smooth cylinder drills a round hole
     *  - Parts that overlap must be joined with union to be one solid, not with combine, mirror or spin, which
     *    leave them overlapping, and CSG then gives a wrong shape
     *  - Cuts split the triangles near them, so the result has more: a few thousand triangles take tens to a few
     *    hundred milliseconds, so build shapes this way at load time, not every frame; joining several cutters
     *    with union and cutting once is quicker than cutting with each in turn
     *  - Details closer than about 1e-4 are made one, so build a very small part larger and scale it after
     *  @param {Mesh} mesh - Closed, as the builders make them apart from the open ones like buildGrid
     *  @param {Matrix4|Vector3} [matrix] - Places the other mesh, or just a position to move it to
     *  @return {Mesh}
     *  @example
     *  const wall = buildBox(vec3(4, 3, .5)).subtract(buildBox(vec3(1, 2, 1)), vec3(0, -.5, 0)); // a doorway */
    subtract(mesh, matrix) { return render3DMeshCSG(this, mesh, matrix, 1); }

    /** Returns a new mesh of only what is in both this mesh and the other, see subtract
     *  @param {Mesh} mesh - Closed, as the builders make them apart from the open ones like buildGrid
     *  @param {Matrix4|Vector3} [matrix] - Places the other mesh, or just a position to move it to
     *  @return {Mesh} */
    intersect(mesh, matrix) { return render3DMeshCSG(this, mesh, matrix, 2); }

    /** Scale every uv, so a whole texture repeats across the mesh when its TextureInfo wraps
     *  @param {Vector2|number} scale - Repeats across and up, a number for both
     *  @return {Mesh} */
    scaleUVs(scale)
    {
        const s = render3DSize2(scale);
        // new vectors, builders share uv objects between faces
        this.uvs = this.uvs.map(uv=> vec2(uv.x * s.x, uv.y * s.y));
        this.dirty = true;
        return this;
    }

    /** Move, turn or scale every vertex in place, normals follow along
     *  @param {Matrix4|Vector3} matrix - Transform, or just an offset to move by
     *  @return {Mesh} */
    transform(matrix)
    {
        matrix = render3DMatrix(matrix);
        const normalMatrix = render3DNormalMatrix(matrix);
        for (let i = 0; i < this.points.length; ++i)
        {
            this.points[i] = matrix.transformPoint(this.points[i]);
            // a mesh built by hand may have no normals yet, and then there is nothing to turn
            this.normals[i] &&= normalMatrix.transformDirection(this.normals[i]).normalize();
        }
        render3DMirrors(matrix) && render3DFlipWinding(this); // a mirror would leave the faces pointing in
        this.dirty = true;
        return this;
    }

    /** Turn the mesh inside out so it is lit and drawn from within, for rooms and domes
     *  @return {Mesh} */
    flipNormals()
    {
        render3DFlipWinding(this);
        this.normals = this.normals.map(n=> n.scale(-1));
        this.dirty = true;
        return this;
    }

    /** Set every vertex color
     *  @param {Color} color
     *  @return {Mesh} */
    setColor(color)
    {
        // one per point, not one per color already there, so a mesh built by hand with no
        // colors gets them instead of quietly staying white
        this.colors = this.points.map(()=> color);
        this.dirty = true;
        return this;
    }

    /** Measure the axis aligned box around the vertices
     *  @return {{min: Vector3, max: Vector3}} */
    getBounds()
    {
        if (!this.points.length)
            return {min: vec3(), max: vec3()};
        const lo = vec3(Infinity), hi = vec3(-Infinity);
        for (const p of this.points)
        {
            lo.x = min(lo.x, p.x); lo.y = min(lo.y, p.y); lo.z = min(lo.z, p.z);
            hi.x = max(hi.x, p.x); hi.y = max(hi.y, p.y); hi.z = max(hi.z, p.z);
        }
        return {min: lo, max: hi};
    }

    /** Move the mesh so the center of its bounds is on the origin
     *  @return {Mesh} */
    center()
    {
        const bounds = this.getBounds();
        return this.transform(bounds.min.add(bounds.max).scale(-.5));
    }

    /** Scale the mesh evenly so its largest extent is a size, for loaded models of unknown units
     *  @param {number} [size]
     *  @return {Mesh} */
    fit(size=1)
    {
        const bounds = this.getBounds();
        const extent = bounds.max.subtract(bounds.min);
        const scale = size / (max(extent.x, extent.y, extent.z) || 1);
        return this.transform(Matrix4.scaling(vec3(scale)));
    }

    /** Measure the bounding sphere around the origin into radius, called by upload
     *  @return {number} */
    computeRadius()
    {
        let r = 0;
        for (const p of this.points)
            r = max(r, p.lengthSquared());
        this.bounds = this.getBounds(); // measured with it, a pick tests a mesh's box after its sphere
        return this.radius = r ** .5;
    }

    /** Derive normals from the triangles, of the strip or of the index list
     *  @param {boolean} [smooth] - Round the lighting across faces instead of giving each face a hard edge; flat
     *    normals on an indexed mesh give every corner its own vertex
     *  @return {Mesh} */
    computeNormals(smooth=false)
    {
        if (this.indices)
        {
            // the triangles are listed: smooth normals add up around each position, weighted by the corner angle
            // like the strip's, so vertices split apart at one place smooth back together and a mesh can go flat and
            // smooth again; flat ones need a vertex per corner, so the vertices are split up first
            if (smooth)
            {
                const {groups, sums, touched} = render3DSmoothNormalSums(this.points, this.indices);
                this.normals = this.points.map((p, i)=>
                {
                    const s = groups[i] * 3, x = sums[s], y = sums[s+1], z = sums[s+2];
                    const lengthSquared = x**2 + y**2 + z**2, k = 1 / lengthSquared**.5;
                    return touched[groups[i]] && lengthSquared ? vec3(x * k, y * k, z * k) : RENDER3D_DEFAULT_NORMAL;
                });
                this.dirty = true;
                return this;
            }
            const split = (a)=> this.indices.map(i=> a[i]);
            this.points = split(this.points), this.normals = split(this.normals);
            this.uvs = split(this.uvs), this.colors = split(this.colors);
            this.indices = this.indices.map((_, i)=> i);
            const points = this.points, indices = this.indices;
            const normals = points.map(()=> RENDER3D_DEFAULT_NORMAL);
            for (let t = 0; t < indices.length; t += 3)
            {
                const a = points[indices[t]], b = points[indices[t+1]], c = points[indices[t+2]];
                const cross = b.subtract(a).cross(c.subtract(a));
                if (cross.lengthSquared()) // its own three corners
                    normals[indices[t]] = normals[indices[t+1]] = normals[indices[t+2]] = cross.normalize();
            }
            this.normals = normals;
            this.dirty = true;
            return this;
        }

        // smooth normals are the sums at each place made unit length, or straight up for a place with none
        const points = this.points, n = points.length;
        if (smooth)
        {
            const {groups, sums, touched} = render3DSmoothNormalSums(points);
            this.normals = points.map((p, i)=>
            {
                const s = groups[i] * 3, x = sums[s], y = sums[s+1], z = sums[s+2], l = (x**2 + y**2 + z**2)**.5;
                return !touched[groups[i]] ? vec3(0, 1, 0) : l ? vec3(x * (1/l), y * (1/l), z * (1/l)) : vec3();
            });
            this.vertexKeys = undefined;
            this.dirty = true;
            return this;
        }

        // the outward normal of each triangle in the strip
        const faceNormals = [];
        for (let i = 0; i + 2 < n; ++i)
        {
            const a = points[i], b = points[i+1], c = points[i+2];
            const normal = b.subtract(a).cross(c.subtract(a));
            // triangles in a strip alternate which way they wind, so every other one is flipped back
            // a zero normal means a flat triangle joining two strips, so skip it
            faceNormals.push(normal.lengthSquared() ? normal.normalize(i & 1 ? 1 : -1) : undefined);
        }

        // then hand those to the vertices: every triangle writes its own three corners, so the only vertices left
        // with the default are the repeats at the ends of a strip, which no triangle with any area uses
        const normals = points.map(()=> RENDER3D_DEFAULT_NORMAL);
        faceNormals.forEach((f, i)=> f && (normals[i] = normals[i+1] = normals[i+2] = f));

        this.normals = normals;
        this.vertexKeys = undefined; // flat normals tell entries at one place apart
        this.dirty = true;
        return this;
    }

    /** Pack the vertices and create the GPU buffer, called automatically by render
     *  @return {Mesh} */
    upload()
    {
        // the packing below measures the radius and box, with nothing to pack to they are measured here
        if (!render3D?.program || !glContext) return this.computeRadius(), this;
        const gl = glContext, layout = this.vertexLayout;
        // no layout when dynamicDraw was turned on after an upload, the next upload makes one
        if (this.dynamicDraw && layout && this.buffer && this.contextGeneration === render3D.contextGeneration)
        {
            // the layout of the last upload stands, only the values are written again into the buffer it has,
            // packed into the same memory each time so a mesh uploaded every frame makes no garbage
            ASSERT(layout.pointCount === this.points.length,
                'a dynamicDraw mesh keeps its shape, the same points in the same order; ' +
                'for a new shape make a new mesh or turn dynamicDraw off', this.points.length);
            if (layout.pointCount === this.points.length)
            {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0,
                    this.vertexDataPacked ? layout.data : render3DMeshVertexData(this, layout.vertices, layout.data));
                gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer);
                this.dirty = this.vertexDataPacked = false;
                return this;
            }
        }
        this.dispose();
        const {vertices, indices} = this.getTriangles(), count = vertices.length, wide = count > 65535;
        const data = render3DMeshVertexData(this, vertices);
        this.vertexLayout = this.dynamicDraw ? {vertices, pointCount: this.points.length, data} : undefined;
        this.vertexKeys = undefined; // used once: an edit after this may tell entries apart
        this.buffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();
        this.bufferCount = indices.length;
        this.indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        this.dirty = this.vertexDataPacked = false;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, this.dynamicDraw ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wide ? new Uint32Array(indices) : new Uint16Array(indices), gl.STATIC_DRAW);
        this.contextGeneration = render3D.contextGeneration;
        const buffers = {buffer: this.buffer, indexBuffer: this.indexBuffer, generation: this.contextGeneration};
        render3DMeshBuffers?.register(this, buffers, this);
        gl.bindBuffer(gl.ARRAY_BUFFER, glArrayBuffer); // the engine's 2D batch writes through this binding
        return this;
    }

    /** The mesh as an indexed triangle list, what upload sends to the GPU: the strip's real triangles over its
     *  distinct vertices, the joins between its pieces dropped and every triangle facing the way it did in the strip
     *  - Vertices are compared to a millionth, so two at one place with the same normal, uv and color are one
     *  @return {{vertices: Array<number>, indices: Array<number>}} - vertices are strip indices, one per distinct
     *    vertex; indices are the triangles, three per triangle, into vertices */
    getTriangles()
    {
        const count = this.points.length, vertices = [];
        if (this.indices)
        {
            // already a list: every vertex as it is, and the triangles read the way the pass draws, clockwise
            for (let i = 0; i < count; ++i)
                vertices.push(i);
            return {vertices, indices: render3DFlipTriangles(this.indices.slice())};
        }
        const remap = new Int32Array(count), place = new Int32Array(count), keys = this.vertexKeys;
        if (keys && keys.length === count)
        {
            // a builder said which entries are one vertex: the first entry with a key stands for every entry with it,
            // and is their place, so nothing is searched
            const first = new Int32Array(count).fill(-1);
            for (let i = 0; i < count; ++i)
            {
                const key = keys[i];
                ASSERT(key >= 0 && key < count, 'vertexKeys must be whole numbers below the entry count', key);
                const j = first[key];
                if (j < 0)
                    first[key] = i, remap[i] = vertices.length, vertices.push(i);
                else
                    remap[i] = remap[j];
                place[i] = first[key];
            }
            return {vertices, indices: render3DStripTriangles(count, remap, place)};
        }

        // each vertex as nine whole numbers, its values in millionths and its color, so vertices hash and compare as
        // numbers; a hash table over all nine finds the distinct vertices and one over the first three the places,
        // each slot holding a vertex index plus one and a taken slot moving on to the next
        const values = new Float64Array(count * 9);
        let size = 1;
        while (size < count * 2) size *= 2;
        const mask = size - 1, seen = new Int32Array(size), places = new Int32Array(size);
        const mix = (h, v)=> Math.imul(h ^ v, 0x9e3779b1) >>> 0;
        for (let i = 0; i < count; ++i)
        {
            const p = this.points[i], n = this.normals[i] || RENDER3D_DEFAULT_NORMAL;
            const uv = this.uvs[i] || RENDER3D_DEFAULT_UV, k = i * 9;
            const x = values[k] = round(p.x * 1e6), y = values[k+1] = round(p.y * 1e6), z = values[k+2] = round(p.z * 1e6);
            values[k+3] = round(n.x * 1e6), values[k+4] = round(n.y * 1e6), values[k+5] = round(n.z * 1e6);
            values[k+6] = round(uv.x * 1e6), values[k+7] = round(uv.y * 1e6);
            values[k+8] = (this.colors[i] || WHITE).rgbaInt();
            let h = mix(mix(mix(0x811c9dc5, x), y), z);

            // the place, shared with a vertex there that has another normal or uv, as at a lathe's poles
            for (let slot = h & mask;; slot = (slot + 1) & mask)
            {
                const o = places[slot] - 1;
                if (o < 0) { places[slot] = i + 1, place[i] = i; break; }
                if (values[o*9] === x && values[o*9+1] === y && values[o*9+2] === z) { place[i] = o; break; }
            }

            // the whole vertex
            for (let m = 3; m < 9; ++m)
                h = mix(h, values[k+m]);
            for (let slot = h & mask;; slot = (slot + 1) & mask)
            {
                const o = seen[slot] - 1;
                if (o < 0) { seen[slot] = i + 1, remap[i] = vertices.length, vertices.push(i); break; }
                let same = true;
                for (let m = 0; same && m < 9; ++m)
                    same = values[o*9+m] === values[k+m];
                if (same) { remap[i] = remap[o]; break; }
            }
        }
        return {vertices, indices: render3DStripTriangles(count, remap, place)};
    }

    /** Draw the mesh with the current draw state, batched with its other uses in the opaque stage
     *  @param {Matrix4|Vector3} [matrix] - Object transform, or just a position to draw it at
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile or the whole texture
     *  @param {Color} [color] - Tint */
    render(matrix, tileInfo, color) { render3D?.drawMesh(this, matrix, tileInfo, color); }

    /** Delete the GPU buffer now, the CPU arrays stay so the mesh can be rendered again
     *  - Optional, the buffer is freed anyway once the mesh is garbage collected, this frees it right away */
    dispose()
    {
        if (!this.buffer) return;
        render3DMeshBuffers?.unregister(this); // freed here, so not again when the mesh is collected
        // a buffer from a context that was lost is gone with it, and the new context refuses to delete it
        if (this.contextGeneration === render3D?.contextGeneration)
            glContext?.deleteBuffer(this.buffer), glContext?.deleteBuffer(this.indexBuffer);
        this.buffer = this.indexBuffer = undefined;
        this.bufferCount = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Shape builders, all centered on the origin so buildMatrix does placement
// Sizes are full sizes like buildBox and the 2D drawCircle, sides go around an axis and rings along it

/**
 * Spin a flat outline around the Y axis to make a round shape, like a vase or a wheel
 * - profile is [[radius, y], ...] from bottom to top
 * - A profile that ends where it starts makes a closed ring like a donut
 * - An end left open, with a radius and no cap, makes the mesh doubleSided so its inside shows
 * - An end on the axis smooth shades as a round pole like a sphere's when its segment is within 45 degrees of
 *   level, and as a point like a cone's tip when it is steeper
 * @param {Array<Array<number>>} profile
 * @param {number} [sides] - Around the axis
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends that have a radius with flat discs
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const vase = buildLathe([[0, -1], [.8, -.3], [.9, .2], [.4, .6], [0, 1]], 12);
 */
function buildLathe(profile, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    ASSERT(isArray(profile) && profile.length > 1, 'lathe profile needs at least 2 points');
    sides |= 0;
    ASSERT(sides > 2, 'lathe needs at least 3 sides');
    const mesh = new Mesh;
    const rings = profile.length;
    const point = (i, a)=> vec3(sin(a) * profile[i][0], profile[i][1], cos(a) * profile[i][0]);

    // 2D outward normal of each profile segment, in (radius, y) space
    const segmentNormal = (i)=>
    {
        const [r0, y0] = profile[i], [r1, y1] = profile[i+1];
        const n = vec2(y1 - y0, r0 - r1);
        return n.length() ? n.normalize() : vec2(1, 0);
    };
    // vertex normal: average of the adjacent segment normals, across the seam when the profile is closed,
    // and a closed profile needs no caps
    const closed = rings > 2 && abs(profile[0][0] - profile[rings-1][0]) < 1e-9 &&
        abs(profile[0][1] - profile[rings-1][1]) < 1e-9;
    const segmentLength = (i)=> hypot(profile[i+1][0] - profile[i][0], profile[i+1][1] - profile[i][1]);
    const vertexNormal = (i)=>
    {
        // an open end on the axis is a pole and points along it, like a sphere's, when the surface there is
        // within 45 degrees of level; a steeper one is a point like a cone's tip and takes its side's normal
        if (!closed && (!i || i == rings - 1) && abs(profile[i][0]) < 1e-9)
        {
            const up = i ? 1 : -1;
            if (segmentNormal(i ? i - 1 : 0).y * up > Math.SQRT1_2 - 1e-9)
                return vec2(0, up);
        }
        // otherwise the neighbors weighted by their length, so a short band does not tilt a long wall
        let n = vec2();
        const add = (s)=> n = n.add(segmentNormal(s).scale(segmentLength(s)));
        if (i > 0) add(i - 1);
        else if (closed) add(rings - 2);
        if (i < rings - 1) add(i);
        else if (closed) add(0);
        return n.length() ? n.normalize() : vec2(1, 0);
    };
    const normal3D = (n, a)=> vec3(sin(a) * n.x, n.y, cos(a) * n.x);

    // v runs along the profile by arc length
    const lengths = [0];
    for (let i = 1; i < rings; ++i)
        lengths[i] = lengths[i-1] + hypot(profile[i][0] - profile[i-1][0], profile[i][1] - profile[i-1][1]);
    const total = lengths[rings - 1] || 1;
    const v = (i)=> 1 - lengths[i] / total;

    for (let i = 0; i + 1 < rings; ++i)
    {
        if (smooth)
        {
            // one ribbon around the ring pair, top point then bottom point per column
            const points = [], normals = [], uvs = [];
            const n0 = vertexNormal(i), n1 = vertexNormal(i + 1);
            // a point on the axis is one per column, each drawn by the face beside it, so its normal turns half
            // a side toward the middle of that face; a pole's points along the axis and does not turn
            const half = PI / sides;
            const turn1 = abs(profile[i + 1][0]) < 1e-9 ? -half : 0, turn0 = abs(profile[i][0]) < 1e-9 ? half : 0;
            for (let j = 0; j <= sides; ++j)
            {
                const a = j / sides * 2 * PI, u = j / sides;
                points.push(point(i + 1, a), point(i, a));
                normals.push(normal3D(n1, a + turn1), normal3D(n0, a + turn0));
                uvs.push(vec2(u, v(i + 1)), vec2(u, v(i)));
            }
            mesh.addStrip(points, normals, uvs);
        }
        else
        {
            // one quad per side with its face normal
            const n = segmentNormal(i);
            for (let j = 0; j < sides; ++j)
            {
                const a0 = j / sides * 2 * PI, a1 = (j + 1) / sides * 2 * PI;
                const u0 = j / sides, u1 = (j + 1) / sides;
                mesh.addStrip(
                    [point(i + 1, a0), point(i, a0), point(i + 1, a1), point(i, a1)],
                    normal3D(n, (a0 + a1) / 2),
                    [vec2(u0, v(i + 1)), vec2(u0, v(i)), vec2(u1, v(i + 1)), vec2(u1, v(i))]);
            }
        }
    }

    // flat discs close the ends that have a radius, a hard edge even when the sides are smooth
    if (capped && !closed)
        for (const [i, up] of /** @type {Array<[number, boolean]>} */ ([[0, false], [rings - 1, true]]))
        {
            if (abs(profile[i][0]) < 1e-9) continue; // a pole has no cap
            const points = [], uvs = [];
            for (let j = 0; j < sides; ++j)
            {
                const a = (up ? j : -j) / sides * 2 * PI; // counter clockwise seen from outside
                points.push(point(i, a));
                uvs.push(vec2(sin(a) * .5 + .5, cos(a) * .5 + .5));
            }
            mesh.addStrip(render3DPolygonStrip(points), vec3(0, up ? 1 : -1, 0), render3DPolygonStrip(uvs));
        }

    // an end left open shows the inside, so it is seen from both sides
    mesh.doubleSided = !closed && !capped && (abs(profile[0][0]) > 1e-9 || abs(profile[rings-1][0]) > 1e-9);
    return mesh;
}

/**
 * Build a sphere centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSphere(size=1, sides=16, rings=8, smooth=render3D?.smoothShading)
{
    ASSERT(rings > 1, 'sphere needs at least 2 rings');
    const profile = [];
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI - PI/2;
        profile.push([cos(a) * size / 2, sin(a) * size / 2]);
    }
    return buildLathe(profile, sides, smooth);
}

// a box with its edges cut by a bevel of size t: each face shrunk by t, a strip along each edge around a quarter
// circle, and an eighth of a sphere at each corner; one segment makes them flat, a chamfer
function render3DBevelBox(half, t, segments, faces)
{
    const mesh = new Mesh, inner = half.subtract(vec3(t)), n = max(1, segments | 0);

    // a triangle facing out, since the box is convex around the origin, flat shaded or with the normals of the
    // round, and uvs from the face it faces most, as a plain box maps that face
    const triangle = (a, b, c, na, nb, nc)=>
    {
        let normal = b.subtract(a).cross(c.subtract(a));
        if (normal.lengthSquared() < 1e-20) return; // an edge or face with no size
        if (normal.dot(a.add(b).add(c)) < 0)
            [b, c, nb, nc, normal] = [c, b, nc, nb, normal.scale(-1)];
        normal = normal.normalize();
        let face = faces[0];
        for (const f of faces)
            if (f[0].dot(normal) > face[0].dot(normal))
                face = f;
        const [, r, u] = face, hr = abs(half.dot(r)), hu = abs(half.dot(u));
        const uv = (p)=> vec2(.5 + p.dot(r) / (2 * hr), .5 - p.dot(u) / (2 * hu));
        mesh.addStrip([a, b, c], n > 1 && na ? [na, nb, nc] : normal, [uv(a), uv(b), uv(c)]);
    };

    // the faces, shrunk by the bevel
    for (const [normal, r, u] of faces)
    {
        const [a, b, c, d] = render3DQuadAxes(normal.multiply(half), r.multiply(inner), u.multiply(inner));
        triangle(a, b, c);
        triangle(c, b, d);
    }

    // the edges, each a strip around a quarter circle from one face to the next
    const axes = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];
    for (let k = 0; k < 3; ++k)
    for (const si of [-1, 1])
    for (const sj of [-1, 1])
    {
        const n1 = axes[(k + 1) % 3].scale(si), n2 = axes[(k + 2) % 3].scale(sj);
        const middle = n1.multiply(inner).add(n2.multiply(inner)), along = axes[k].multiply(inner);
        const start = middle.subtract(along), end = middle.add(along);
        const dir = (m)=> n1.scale(cos(m / n * PI / 2)).add(n2.scale(sin(m / n * PI / 2)));
        for (let m = 0; m < n; ++m)
        {
            const d0 = dir(m), d1 = dir(m + 1);
            const a = start.add(d0.scale(t)), b = end.add(d0.scale(t));
            const c = start.add(d1.scale(t)), d = end.add(d1.scale(t));
            triangle(a, b, c, d0, d0, d1);
            triangle(c, b, d, d1, d0, d1);
        }
    }

    // the corners, an eighth of a sphere in rows from one face's axis down to the edge between the other two
    for (const sx of [-1, 1])
    for (const sy of [-1, 1])
    for (const sz of [-1, 1])
    {
        const nx = vec3(sx, 0, 0), ny = vec3(0, sy, 0), nz = vec3(0, 0, sz), corner = inner.multiply(vec3(sx, sy, sz));
        const dir = (i, j)=>
        {
            const polar = i / n * PI / 2, around = i ? j / i * PI / 2 : 0;
            return nz.scale(cos(polar)).add(nx.scale(cos(around) * sin(polar))).add(ny.scale(sin(around) * sin(polar)));
        };
        const point = (i, j)=> corner.add(dir(i, j).scale(t));
        for (let i = 0; i < n; ++i)
        {
            for (let j = 0; j <= i; ++j)
                triangle(point(i, j), point(i + 1, j), point(i + 1, j + 1), dir(i, j), dir(i + 1, j), dir(i + 1, j + 1));
            for (let j = 0; j < i; ++j)
                triangle(point(i, j), point(i + 1, j + 1), point(i, j + 1), dir(i, j), dir(i + 1, j + 1), dir(i, j + 1));
        }
    }
    return mesh;
}

/**
 * Build a box centered on the origin, six flat faces with uvs covering each face
 * - bevel cuts its edges and corners: 1 segment is a flat chamfer, more round them, and the biggest bevel, half
 *   the smallest side, rounds a cube into a ball
 * @param {Vector3|number} [size] - Full size, a number for a cube
 * @param {number} [bevel] - Size of the cut on each edge, clamped to half the smallest side
 * @param {number} [bevelSegments] - Steps around each edge, 1 for a flat chamfer
 * @return {Mesh}
 * @memberof Render3D
 */
function buildBox(size=1, bevel=0, bevelSegments=1)
{
    ASSERT(isNumber(bevel) && bevel >= 0, 'bevel must be a number, 0 or more');
    const half = render3DSize3(size).scale(.5);
    // each face: normal, right axis, up axis (right cross up = normal)
    const faces = [
        [vec3(0, 0, 1),  vec3(1, 0, 0),  vec3(0, 1, 0)],
        [vec3(0, 0, -1), vec3(-1, 0, 0), vec3(0, 1, 0)],
        [vec3(1, 0, 0),  vec3(0, 0, -1), vec3(0, 1, 0)],
        [vec3(-1, 0, 0), vec3(0, 0, 1),  vec3(0, 1, 0)],
        [vec3(0, 1, 0),  vec3(1, 0, 0),  vec3(0, 0, -1)],
        [vec3(0, -1, 0), vec3(1, 0, 0),  vec3(0, 0, 1)],
    ];
    const t = min(bevel, half.x, half.y, half.z);
    if (t > 0)
        return render3DBevelBox(half, t, bevelSegments, faces);
    const mesh = new Mesh;
    for (const [n, r, u] of faces)
    {
        const center = n.multiply(half);
        const right = r.multiply(half), up = u.multiply(half);
        mesh.addStrip(render3DQuadAxes(center, right, up), n, RENDER3D_QUAD_UVS);
    }
    return mesh;
}

/**
 * Build a heightfield grid in the XZ plane centered on the origin
 * - smooth rounds the lighting across cells and colors each corner
 * - flat lights and colors each cell on its own, so a checkerboard stays crisp
 * - doubleSided, a sheet seen from both sides; turn it off for ground only ever seen from above
 * - One cell is a plain square, render3D.planeMesh and planeMeshDoubleSided are shared ones
 * @param {Vector2|number} [size] - World size along X and Z, a number for a square
 * @param {Vector2|number} [segments] - Cells along X and Z, a number for both
 * @param {Color|function(number, number): Color} [color] - One Color for the whole grid, or (x, z) => Color
 * @param {function(number, number): number} [heightFunction] - (x, z) => y, default flat
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading with a heightFunction; a flat grid is flat shaded,
 *   since its light is even anyway and smoothing would only blend its cell colors; pass smooth to blend a gradient
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const ground = buildGrid(vec2(20), 10, (x, z)=> (floor(x / 2) + floor(z / 2)) & 1 ? GRAY : WHITE); // 2 unit checks
 */
function buildGrid(size=vec2(1), segments=1, color, heightFunction, smooth=heightFunction && render3D?.smoothShading)
{
    heightFunction ||= ()=> 0;
    size = render3DSize2(size);
    segments = render3DSize2(segments);
    ASSERT(segments.x > 0 && segments.y > 0 && segments.x % 1 === 0 && segments.y % 1 === 0,
        'grid segments must be whole numbers above zero');
    const mesh = new Mesh;
    const segmentsX = segments.x, segmentsZ = segments.y;
    const cellX = size.x / segmentsX, cellZ = size.y / segmentsZ;
    const halfX = size.x / 2, halfZ = size.y / 2, ex = cellX / 2, ez = cellZ / 2;
    const px = (i)=> i * cellX - halfX, pz = (j)=> j * cellZ - halfZ;
    const colorAt = /** @type {function(number, number): Color} */ (color);
    const cellColor = (i, j)=> !color ? WHITE : isColor(color) ? /** @type {Color} */ (color) : colorAt(px(i), pz(j));
    // a big terrain has millions of vertices, so each one is made once, shared by the rows above and below it
    const row = (j)=>
    {
        const points = [], normals = [], uvs = [], colors = [], z = pz(j);
        for (let i = 0; i <= segmentsX; ++i)
        {
            const x = px(i);
            points.push(vec3(x, heightFunction(x, z), z));
            uvs.push(vec2(i / segmentsX, j / segmentsZ));
            if (!smooth) continue;
            normals.push(render3DSlopeNormal(heightFunction, x, z, ex, ez, halfX, halfZ));
            colors.push(cellColor(i, j));
        }
        return {points, normals, uvs, colors};
    };
    let above = row(0);
    for (let j = 0; j < segmentsZ; ++j)
    {
        const below = row(j + 1);
        if (smooth)
        {
            // one ribbon per row with vertex normals from the slope
            const points = [], normals = [], uvs = [], colors = [];
            for (let i = 0; i <= segmentsX; ++i)
            {
                points.push(above.points[i], below.points[i]);
                normals.push(above.normals[i], below.normals[i]);
                uvs.push(above.uvs[i], below.uvs[i]);
                colors.push(above.colors[i], below.colors[i]);
            }
            mesh.addStrip(points, normals, uvs, colors);
        }
        else
        {
            // one quad per cell with its face normal and one color sampled at its center
            for (let i = 0; i < segmentsX; ++i)
                mesh.addQuad(above.points[i], below.points[i], below.points[i+1], above.points[i+1], cellColor(i + .5, j + .5),
                    [above.uvs[i], below.uvs[i], below.uvs[i+1], above.uvs[i+1]]);
        }
        above = below;
    }
    if (smooth)
    {
        // the grid knows which strip entries are one vertex, each shared by the rows above and below it and by the
        // repeats at the ends of its ribbons, so the upload of a big terrain skips searching millions of entries
        const n = 2 * (segmentsX + 1) + 2, keys = mesh.vertexKeys = new Int32Array(mesh.points.length);
        const id = (i, j)=> j * (segmentsX + 1) + i;
        for (let j = 0; j < segmentsZ; ++j)
        {
            const start = j * n;
            keys[start] = id(0, j); // the leading repeat
            for (let i = 0; i <= segmentsX; ++i)
                keys[start + 1 + 2*i] = id(i, j), keys[start + 2 + 2*i] = id(i, j + 1);
            keys[start + n - 1] = id(segmentsX, j + 1); // the trailing repeat
        }
    }
    mesh.doubleSided = true; // a sheet, seen from both sides; terrain seen only from above can turn it off
    return mesh;
}

/**
 * Build a sky dome: a sphere colored by direction, wound to be seen from inside
 * - set it as render3D.sky and the pass draws it around the camera behind everything
 * @param {Color} [topColor] - Straight up
 * @param {Color} [horizonColor] - Level with the camera
 * @param {Color} [bottomColor] - Straight down, what a camera looking at the ground sees past its edge; defaults to the
 *   horizon color
 * @param {number} [sides] - Around
 * @param {number} [rings] - Top to bottom
 * @return {Mesh}
 * @memberof Render3D
 */
function buildSky(topColor=hsl(.6, .8, .55), horizonColor=hsl(.6, 1, .9), bottomColor=horizonColor, sides=16, rings=8)
{
    // a sphere turned inside out so it is seen from within, each point colored by how high it is
    const mesh = buildSphere(2, sides, rings, true).flipNormals();
    mesh.colors = mesh.points.map(p=> p.y < 0 ? horizonColor.lerp(bottomColor, -p.y) : horizonColor.lerp(topColor, p.y));
    render3DSkyColors.set(mesh, [topColor.copy(), horizonColor.copy(), bottomColor.copy()]);
    return mesh;
}

// the top, horizon and bottom colors of each sky dome buildSky made, which a reflection shows while that dome is
// render3D.sky, whether setSky set it or the game did
const render3DSkyColors = new WeakMap;
