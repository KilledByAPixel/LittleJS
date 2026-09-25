/*
 * LittleJS 3D Extras Plugin
 * - Things built on the 3D renderer that it does not need in order to draw: the rest of the shape builders,
 *   HeightMap terrain, the camera controls, ParticleEmitter3D and Trail3D, and the OBJ loader
 * - Requires the Render3D plugin and goes after it, everything here is part of its Render3D namespace
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// Helpers used only here

// gap between lines of 3D text, as a share of the character height; flat text can let lines touch
// the way the 2D font does, but extruded glyphs seen from an angle then overlap the line below
const RENDER3D_TEXT_LEADING = 1.3;

// surface normal from the slope of a height function, sampled half a cell each way but kept inside the half sizes
function render3DSlopeNormal(heightFunction, x, z, ex, ez, halfX, halfZ)
{
    const x0 = max(x - ex, -halfX), x1 = min(x + ex, halfX), z0 = max(z - ez, -halfZ), z1 = min(z + ez, halfZ);
    const dx = (heightFunction(x1, z) - heightFunction(x0, z)) / (x1 - x0 || 1);
    const dz = (heightFunction(x, z1) - heightFunction(x, z0)) / (z1 - z0 || 1);
    return vec3(-dx, 1, -dz).normalize();
}

// let go of the parent but stay where the object was in the world, which removeChild keeps by itself; a destroyed
// parent has already let go, so the position remembered by the last update stands in
function render3DDetach(o)
{
    if (o.parent)
        o.parent.removeChild(o);
    else if (o.worldPos3D)
        o.pos3D = o.worldPos3D;
}

// a soft white dot for untextured particles, made once from a canvas, undefined headless or without a canvas
let render3DSoftDotTexture;
function render3DSoftDot()
{
    if (render3DSoftDotTexture || !glContext || typeof OffscreenCanvas == 'undefined') return render3DSoftDotTexture;
    const size = 32, context = createCanvasContext(size);
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [[0, 1], [.33, .9], [.67, .7], [1, 0]]) // the same falloff as a soft disc
        gradient.addColorStop(stop, 'rgba(255,255,255,' + alpha + ')');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return render3DSoftDotTexture = new TextureInfo(context.canvas);
}

///////////////////////////////////////////////////////////////////////////////
// The rest of the shape builders: buildLathe, buildSphere, buildBox, buildGrid and buildSky live with the
// renderer, since it hands those out itself

/**
 * Build a cylinder standing on the Y axis, centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCylinder(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [size / 2, height / 2]], sides, smooth, capped);
}

/**
 * Build a cone standing on the Y axis, centered on the origin, the point up
 * @param {number} [size] - Diameter of the base
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the base
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCone(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true)
{
    return buildLathe([[size / 2, -height / 2], [0, height / 2]], sides, smooth, capped);
}

/**
 * Build a capsule standing on the Y axis, centered on the origin: a cylinder with a half sphere on each end
 * @param {number} [size] - Diameter
 * @param {number} [height] - Total height including the rounded ends, at least the size
 * @param {number} [sides] - Around
 * @param {number} [rings] - On each end
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCapsule(size=1, height=1, sides=16, rings=4, smooth=render3D?.smoothShading)
{
    // the rounded ends alone are already the size tall, so a shorter capsule is only a sphere
    ASSERT(height >= size, 'a capsule is at least as tall as it is wide, the ends take up the size', size, height);
    const profile = [], r = size / 2, straight = max(0, height - size) / 2;
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI / 2;
        profile.push([r * sin(a), -straight - r * cos(a)]);
    }
    for (let i = 0; i <= rings; ++i)
    {
        const a = i / rings * PI / 2;
        profile.push([r * cos(a), straight + r * sin(a)]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a donut lying flat around the Y axis
 * @param {number} [size] - Diameter of the whole donut, outside edge to outside edge
 * @param {number} [tubeSize] - Diameter of the tube
 * @param {number} [sides] - Around the ring
 * @param {number} [tubeSides] - Around the tube
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 */
function buildTorus(size=1, tubeSize=.3, sides=16, tubeSides=8, smooth=render3D?.smoothShading)
{
    ASSERT(tubeSize <= size, 'the tube must fit inside the torus');
    const profile = [], radius = (size - tubeSize) / 2, tubeRadius = tubeSize / 2;
    for (let i = 0; i <= tubeSides; ++i)
    {
        const a = i / tubeSides * 2 * PI;
        profile.push([radius + tubeRadius * cos(a), tubeRadius * sin(a)]);
    }
    return buildLathe(profile, sides, smooth);
}

/**
 * Build a lit ribbon along a path, for roads, tracks and walls
 * - Each segment is a flat quad, the sides are across the path in the plane of the up vector
 * - doubleSided, so it is seen and lit from below as well
 * @param {Array<Vector3>} points - Center line in order
 * @param {number|Array<number>} [width] - Full width, one for all or one per point
 * @param {Color|Array<Color>} [color] - One for all or one per point
 * @param {boolean} [closed] - Join the last point back to the first
 * @param {Vector3} [up] - Which way the ribbon faces
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const road = buildRibbon(trackPoints, 8, GRAY, true); // a loop of road
 */
function buildRibbon(points, width=1, color=WHITE, closed=false, up=vec3(0, 1, 0))
{
    ASSERT(isArray(points) && points.length > 1, 'ribbon needs at least 2 points');
    const mesh = new Mesh, count = points.length, edges = [];
    let across = (abs(up.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0)).cross(up).normalize(); // anything across up
    for (let i = 0; i < count; ++i)
    {
        // across the path, from the tangent through this point; a step along up keeps the last across
        const next = points[closed ? (i + 1) % count : min(i + 1, count - 1)];
        const last = points[closed ? (i + count - 1) % count : max(i - 1, 0)];
        const dir = next.subtract(last).cross(up);
        if (dir.lengthSquared() > 1e-12)
            across = dir.normalize();
        const half = across.scale((isArray(width) ? width[i] : width) / 2);
        edges.push([points[i].subtract(half), points[i].add(half)]);
    }
    for (let i = 0; i + 1 < count + (closed ? 1 : 0); ++i)
    {
        const j = (i + 1) % count, a = edges[i], b = edges[j];
        const c = isArray(color) ? [color[i], color[i], color[j], color[j]] : color;
        mesh.addQuad(a[0], a[1], b[1], b[0], c); // counter clockwise seen from above
    }
    mesh.doubleSided = true; // a flat strip, seen from both sides
    return mesh;
}

/**
 * Build a hull from a row of diamond shaped slices along Z, for ships, planes and cars
 * - Each slice is [z, width, top, bottom, sideHeight]
 * - sideHeight is 0 to 1 and puts the side corners between the bottom and the top
 * - List the slices nose first, with the nose at the largest z
 * @param {Array<Array<number>>} stations
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * const hull = buildLoft([[1.2, .4, .2, -.1], [0, 1.4, .5, -.4], [-1, 1, .3, -.3]]);
 */
function buildLoft(stations)
{
    ASSERT(isArray(stations) && stations.length > 1, 'loft needs at least 2 stations');
    // the caps and the winding both assume the nose leads, so the other order turns the hull inside out
    ASSERT(stations[0][0] > stations[stations.length-1][0], 'loft stations go nose first, from the largest z to the smallest');
    const mesh = new Mesh;
    // section points: left, top, right, bottom, wound clockwise seen from +z
    /** @type {function(Array<number>): Array<Vector3>} */
    const section = ([z, w, t, b, m=.5])=>
        [vec3(-w / 2, lerp(b, t, m), z), vec3(0, t, z), vec3(w / 2, lerp(b, t, m), z), vec3(0, b, z)];
    for (let i = 0; i + 1 < stations.length; ++i)
    {
        const s1 = section(stations[i]), s2 = section(stations[i + 1]);
        for (let k = 0; k < 4; ++k)
            mesh.addQuad(s1[k], s1[(k + 1) % 4], s2[(k + 1) % 4], s2[k]);
    }
    const tail = section(stations[stations.length - 1]), nose = section(stations[0]);
    mesh.addQuad(tail[0], tail[1], tail[2], tail[3]);
    mesh.addQuad(nose[3], nose[2], nose[1], nose[0]);
    return mesh;
}

/**
 * Turn a sprite into a 3D block model by giving its pixels thickness
 * - A pixel counts as solid when it is more than half opaque
 * - Each pixel keeps its own color, so white art takes the object's tint
 * - Runs of matching pixels merge into one face, and side walls appear only at the sprite's edges
 * - A texture's pixels are read once and kept, so redrawing a canvas texture will not change what this builds
 * - Pixels can also be an array of rows, each a Color, a truthy value for white, or a falsy value for empty
 * @param {TileInfo|Array<Array<Color|number|boolean>>} pixels - A tile from a loaded texture, or rows of pixels,
 *  each a Color (empty when see through), a truthy value for white or a falsy value for empty
 * @param {Vector2} [size] - World width and height of the whole tile, centered like buildBox
 * @param {number} [depth] - Thickness along Z
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), buildExtrude(tile(3, 16), vec2(2), .5)); // a chunky version of tile 3
 */
function buildExtrude(pixels, size=vec2(1), depth=1)
{
    let rows = /** @type {Array<Array<Color|number|boolean>>} */ (pixels), width, height;
    if (pixels instanceof TileInfo)
    {
        // colors for the tile's pixels only, undefined where alpha is half or less
        const image = render3DReadPixels(pixels.textureInfo), data = image.data;
        const x0 = pixels.pos.x | 0, y0 = pixels.pos.y | 0;
        width = pixels.size.x | 0, height = pixels.size.y | 0;
        rows = [];
        for (let y = 0; y < height; ++y)
        {
            const row = rows[y] = [];
            for (let x = 0; x < width; ++x)
            {
                const k = ((y0 + y) * image.width + x0 + x) * 4;
                row.push(data[k + 3] > 127 ? rgb(data[k] / 255, data[k + 1] / 255, data[k + 2] / 255) : undefined);
            }
        }
    }
    else
    {
        ASSERT(isArray(pixels) && pixels.length, 'pixels must be a TileInfo or rows of pixels');
        height = rows.length, width = rows[0].length;
    }

    // the color of a solid pixel, undefined outside or where it is empty
    const solid = (x, y)=>
    {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const c = /** @type {Color} */ (rows[y] && rows[y][x]); // or a truthy value for white
        if (!c) return;
        return isColor(c) ? (c.a > .5 ? c : undefined) : WHITE; // a see through Color is empty too
    };
    const same = (a, b)=> a === b || !!a && !!b && a.rgbaInt() === b.rgbaInt();

    // call emit(start, end, color) for each run of same colored pixels, colorAt(i) undefined breaks the run
    const runs = (count, colorAt, emit)=>
    {
        let start = 0, color;
        for (let i = 0; i <= count; ++i)
        {
            const c = i < count ? colorAt(i) : undefined;
            if (same(c, color)) continue;
            if (color) emit(start, i, color);
            start = i, color = c;
        }
    };

    // pixel edges in world space, y runs down the image
    const mesh = new Mesh, sx = size.x / width, sy = size.y / height, hz = depth / 2;
    const px = x=> x * sx - size.x / 2, py = y=> size.y / 2 - y * sy;
    const quad = (origin, right, up, normal, color)=>
        mesh.addStrip(render3DQuadAxes(origin.add(right.scale(.5)).add(up.scale(.5)), right.scale(.5), up.scale(.5)), normal, RENDER3D_QUAD_UVS, color);
    const X = vec3(1, 0, 0), Y = vec3(0, 1, 0), Z = vec3(0, 0, 1);
    for (let y = 0; y < height; ++y)
    {
        // front and back faces along each row
        runs(width, x=> solid(x, y), (a, b, c)=>
        {
            const w = X.scale((b - a) * sx), h = Y.scale(sy);
            quad(vec3(px(a), py(y + 1), hz), w, h, Z, c);
            quad(vec3(px(b), py(y + 1), -hz), w.scale(-1), h, Z.scale(-1), c);
        });
        // walls facing up and down where the pixel above or below is empty
        runs(width, x=> solid(x, y - 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y), hz), X.scale((b - a) * sx), Z.scale(-depth), Y, c));
        runs(width, x=> solid(x, y + 1) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(a), py(y + 1), -hz), X.scale((b - a) * sx), Z.scale(depth), Y.scale(-1), c));
    }
    for (let x = 0; x < width; ++x)
    {
        // walls facing left and right where the pixel beside is empty
        runs(height, y=> solid(x - 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x), py(b), -hz), Z.scale(depth), Y.scale((b - a) * sy), X.scale(-1), c));
        runs(height, y=> solid(x + 1, y) ? undefined : solid(x, y), (a, b, c)=>
            quad(vec3(px(x + 1), py(b), hz), Z.scale(-depth), Y.scale((b - a) * sy), X, c));
    }
    return mesh;
}

/**
 * Build a mesh of extruded text from an image font, the engine font by default so it needs no assets
 * - Each glyph is extruded once per font and reused, the block is centered and faces +Z
 * - Newlines stack downward, spaced a little wider than the character height so the sides do not collide
 * - Every call builds a new mesh, dispose the old one when text changes often
 * - Glyphs are white in the engine font, so the object's color tints the text
 * @param {string|number} text
 * @param {number} [size] - Character height in world units
 * @param {number} [depth] - Thickness along Z
 * @param {ImageFont} [font] - Defaults to engineImageFont
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(0, 2, 0), buildText3D('HELLO'), undefined, YELLOW);
 */
function buildText3D(text, size=1, depth=.2, font=engineImageFont)
{
    ASSERT(font instanceof ImageFont, 'font must be an ImageFont, the engine font loads before gameInit');
    const tileInfo = font.tileInfo;
    let glyphs = render3DGlyphCache.get(font); // unit sized, scaled when combined
    glyphs || render3DGlyphCache.set(font, glyphs = new Map);
    const charSize = vec2(size * tileInfo.size.x / tileInfo.size.y, size);
    const mesh = new Mesh, lines = (text + '').split('\n');
    lines.forEach((line, j)=>
    {
        const y = ((lines.length - 1) / 2 - j) * charSize.y * RENDER3D_TEXT_LEADING;
        for (let i = 0; i < line.length; ++i)
        {
            const charCode = line.charCodeAt(i);
            const index = charCode < 32 || charCode > 127 ? 95 : charCode - 32; // like ImageFont
            if (!index) continue; // space
            let glyph = glyphs.get(index);
            if (!glyph)
            {
                const pos = font.getGlyphPos(index); // where ImageFont finds it
                glyphs.set(index, glyph = buildExtrude(new TileInfo(pos, tileInfo.size, tileInfo.textureInfo)));
            }
            const x = (i - (line.length - 1) / 2) * charSize.x;
            mesh.combine(glyph, buildMatrix(vec3(x, y, 0), undefined, vec3(charSize.x, charSize.y, depth)));
        }
    });
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * HeightMap - Terrain built from a grid of heights, with a mesh, a height lookup and a raycast
 * - heights is a 2D array [row][column] of 0 to 1 values
 * - Row 0 is the far edge at -Z and column 0 is the left edge at -X
 * - It can be an image instead, where the red channel is the height
 * - colors is an optional 2D array of Colors or an image, sampled per vertex
 * - images are read through a canvas, so they must be same origin or loaded with crossOrigin set
 * @memberof Render3D
 * @example
 * const terrain = new HeightMap(heightImage, vec2(100, 100), 10, colorImage);
 * new EngineObject3D(vec3(), terrain.buildMesh());
 * const y = terrain.getHeight(x, z); // stand things on it
 */
class HeightMap
{
    /** Create a height map from an array or an image
     *  @param {Array<Array<number>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} heights
     *  @param {Vector2} [size] - World size along X and Z
     *  @param {number} [height] - World height of a full value
     *  @param {Array<Array<Color>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} [colors] */
    constructor(heights, size=vec2(1), height=1, colors)
    {
        if (!isArray(heights))
            heights = render3DImageToArray(heights, (r)=> r / 255);
        if (colors && !isArray(colors))
            colors = render3DImageToArray(colors, (r, g, b, a)=> rgb(r / 255, g / 255, b / 255, a / 255));
        ASSERT(isArray(heights) && heights.length > 1 && isArray(heights[0]) && heights[0].length > 1, 'height map needs at least 2 rows and 2 columns');
        ASSERT(size.x > 0 && size.y > 0, 'height map size must be positive, a zero size has nowhere to look things up');

        /** @property {Array<Array<number>>} - Heights 0-1 as [row][column], rows along Z */
        this.heights = heights;
        /** @property {Array<Array<Color>>|undefined} - Vertex colors as [row][column], undefined for white
         *  @type {Array<Array<Color>>|undefined} */
        this.colors = /** @type {Array<Array<Color>>|undefined} */ (colors);
        /** @property {Vector2} - World size along X and Z */
        this.size = size.copy();
        /** @property {number} - World height of a full value */
        this.height = height;
    }

    /** Number of rows, along Z
     *  @return {number} */
    get rows() { return this.heights.length; }

    /** Number of columns, along X
     *  @return {number} */
    get columns() { return this.heights[0].length; }

    /** World height at a position, exactly the height of the mesh buildMesh draws there, clamped at the edges
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {number} */
    getHeight(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x; // a position works as well as its two numbers, its own y is ignored
        const columns = this.columns, rows = this.rows, h = this.heights;
        const u = clamp((x / this.size.x + .5) * (columns - 1), 0, columns - 1);
        const v = clamp((z / this.size.y + .5) * (rows - 1), 0, rows - 1);
        const i = min(floor(u), columns - 2), j = min(floor(v), rows - 2);
        const fu = u - i, fv = v - j;
        // each cell is two triangles split from (i, j+1) to (i+1, j), the same split buildGrid's quads use
        const a = h[j][i], b = h[j+1][i], c = h[j+1][i+1], d = h[j][i+1];
        const height = fu + fv <= 1 ? a + fu * (d - a) + fv * (b - a) : c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
        return height * this.height;
    }

    /** Surface normal at a position, from the slope across a sample
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Vector3} */
    getNormal(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const ex = this.size.x / (this.columns - 1) / 2, ez = this.size.y / (this.rows - 1) / 2;
        return render3DSlopeNormal((x, z)=> this.getHeight(x, z), x, z, ex, ez, this.size.x / 2, this.size.y / 2);
    }

    /** Color of the nearest sample to a position, white when there are no colors
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Color} */
    getColor(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const c = this.colors;
        if (!c) return WHITE;
        const columns = c[0].length, rows = c.length;
        const i = clamp(round((x / this.size.x + .5) * (columns - 1)), 0, columns - 1);
        const j = clamp(round((z / this.size.y + .5) * (rows - 1)), 0, rows - 1);
        return c[j][i];
    }

    /** Distance along a ray to where it crosses the terrain surface, or undefined for a miss
     *  - Exact: the ground is flat inside each triangle, so the ray is checked between each grid line and
     *    cell diagonal it crosses, and a hill it only grazes is still hit
     *  - A ray that starts under the ground crosses on its way out, so the hit is still on the surface
     *  @param {Ray3D} ray - From screenToRay, or any ray
     *  @return {number|undefined} */
    raycast(ray)
    {
        const {origin, direction} = ray;
        const size = this.size, height = this.height, length = direction.length();
        if (!length) return;

        // clip to the box around the terrain, from where the ray enters it to where it leaves the map's footprint
        const start = raycastBox(ray, vec3(0, height / 2, 0), vec3(size.x, abs(height) + 1e-3, size.y));
        if (start === undefined || !(size.x > 0 && size.y > 0)) return;
        let end = start + hypot(size.x, size.y, height) / length;
        if (direction.x)
            end = min(end, (sign(direction.x) * size.x / 2 - origin.x) / direction.x);
        if (direction.z)
            end = min(end, (sign(direction.z) * size.y / 2 - origin.z) / direction.z);

        // the grid lines and cell diagonals it crosses, in grid units u across the columns and v across the rows,
        // each linear along the ray; between two of them the ground under it is one flat triangle
        const scaleU = (this.columns - 1) / size.x, scaleV = (this.rows - 1) / size.y;
        const u0 = (origin.x / size.x + .5) * (this.columns - 1), u1 = direction.x * scaleU;
        const v0 = (origin.z / size.y + .5) * (this.rows - 1), v1 = direction.z * scaleV;
        const breaks = [start, end];
        for (const [f0, f1] of [[u0, u1], [v0, v1], [u0 + v0, u1 + v1]])
        {
            if (!f1) continue;
            const a = f0 + f1 * start, b = f0 + f1 * end;
            for (let k = ceil(min(a, b)); k <= max(a, b); ++k)
                breaks.push((k - f0) / f1);
        }
        breaks.sort((a, b)=> a - b);

        // how far above the ground the ray is, straight along each piece, so a crossing is solved exactly;
        // one that starts under the ground finds where it comes out, the surface it breaks through
        const above = (at)=>
        {
            const p = origin.add(direction.scale(at));
            return p.y - this.getHeight(p.x, p.z);
        };
        let a = start, da = above(a);
        const startUnder = da <= 0;
        for (const b of breaks)
        {
            if (b <= a || b > end) continue;
            const db = above(b);
            if (db <= 0 !== startUnder)
                return da === db ? b : a + (b - a) * da / (da - db);
            a = b, da = db;
        }
    }

    /** Build the terrain mesh, one vertex per sample, centered on the origin
     *  @param {boolean} [smooth] - Defaults to render3D.smoothShading
     *  @return {Mesh} */
    buildMesh(smooth=render3D?.smoothShading)
    {
        // flat shading colors each cell from its center, halfway between two samples where rounding could pick
        // either, so it is nudged a thousandth of a cell back to make it the cell's first corner every time
        const nudgeX = smooth ? 0 : this.size.x / (this.columns - 1) / 1e3;
        const nudgeZ = smooth ? 0 : this.size.y / (this.rows - 1) / 1e3;
        return buildGrid(this.size, vec2(this.columns - 1, this.rows - 1),
            this.colors && ((x, z)=> this.getColor(x - nudgeX, z - nudgeZ)), (x, z)=> this.getHeight(x, z), smooth);
    }
}

// read an image's pixel bytes through the engine's work canvas, as {data, width, height}
function render3DImageData(image)
{
    if (image instanceof TextureInfo)
        image = image.image;
    ASSERT(image && image.width && image.height, 'image is not loaded');
    ASSERT(workReadCanvas, 'reading an image needs a canvas, pass arrays in headless mode');
    const width = image.width, height = image.height;
    workReadCanvas.width = width;
    workReadCanvas.height = height;
    workReadContext.drawImage(image, 0, 0);
    return workReadContext.getImageData(0, 0, width, height);
}

// read an image into a 2D array [row][column], sample is called with (r, g, b, a) bytes for each pixel
function render3DImageToArray(image, sample)
{
    const {data, width, height} = render3DImageData(image);
    const rows = [];
    for (let y = 0; y < height; ++y)
    {
        const row = rows[y] = [];
        for (let x = 0; x < width; ++x)
        {
            const k = (y * width + x) * 4;
            row.push(sample(data[k], data[k+1], data[k+2], data[k+3]));
        }
    }
    return rows;
}

// extruded glyph meshes by font, and the pixel bytes of a texture, read once per image
const render3DGlyphCache = new WeakMap, render3DPixelCache = new WeakMap;
function render3DReadPixels(textureInfo)
{
    const image = textureInfo.image;
    let pixels = render3DPixelCache.get(image);
    if (!pixels)
        render3DPixelCache.set(image, pixels = render3DImageData(image));
    return pixels;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * CameraControl3D - Drag to turn the camera around a point, roll the wheel to zoom
 * - An EngineObject3D, so move its pos3D to follow something, or parent it to an object
 * - Destroy it to hand the camera back, and it stops driving the camera
 * - Set persistent to keep it when engineObjectsDestroy clears out a level
 * - Every part of it is a field, so a game can change the buttons, speeds and limits
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * new CameraControl3D(vec3(0, 1, 0), 15); // look at a point from 15 units away
 */
class CameraControl3D extends EngineObject3D
{
    /** Create a camera control, it drives render3D.camera every frame
     *  @param {Vector3} [target] - The point to look at, its pos3D
     *  @param {number} [distance] - How far the camera sits from the target
     *  @param {number} [pitch] - Angle above the horizon, PI/2 looks straight down, clamped to pitchRange
     *  @param {number} [idleSpin] - Turned each frame while not dragging, 0 holds still */
    constructor(target=vec3(), distance=10, pitch=.4, idleSpin=0)
    {
        super(target);
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - How far the camera sits from the target */
        this.distance = distance;
        /** @property {number} - Angle above the horizon */
        this.pitch = pitch;
        /** @property {number} - Turned each frame while not dragging */
        this.idleSpin = idleSpin;
        /** @property {number} - Angle around the target, dragging changes it */
        this.yaw = 0;
        /** @property {number} - Mouse button that turns the camera, 0 is left and 2 is right */
        this.dragButton = 0;
        /** @property {number} - How far dragging a pixel turns the camera */
        this.dragSpeed = .01;
        /** @property {number} - How much one wheel notch zooms, 0 turns zooming off */
        this.zoomSpeed = .1;
        /** @property {Vector2} - Closest and furthest the wheel can zoom to */
        this.zoomRange = vec2(distance/4, distance*3);
        /** @property {Vector2} - Lowest and highest pitch, so it cannot tip over the top, widened to hold the pitch given */
        this.pitchRange = vec2(min(-.2, pitch), max(1.4, pitch));
    }

    /** Read the mouse and put the camera on its orbit, called automatically each frame */
    update()
    {
        if (mouseIsDown(this.dragButton))
        {
            // the scene follows the drag
            this.yaw -= mouseDeltaScreen.x * this.dragSpeed;
            this.pitch += mouseDeltaScreen.y * this.dragSpeed;
        }
        else
            this.yaw += this.idleSpin;
        this.pitch = clamp(this.pitch, this.pitchRange.x, this.pitchRange.y);
        if (this.zoomSpeed && mouseWheel)
            this.distance = clamp(this.distance * (1 + sign(mouseWheel) * this.zoomSpeed), this.zoomRange.x, this.zoomRange.y);
        render3D.camera.orbit(this.getWorldPos3D(), this.distance, this.yaw, this.pitch);
    }

    /** Camera controls draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * FirstPersonCamera3D - Look around with the mouse and move with the keys, with the camera at its position
 * - Click to capture the mouse so looking needs no button held, Esc lets it go; holding the button looks too, for touch
 * - WASD or the arrow keys walk level, or move the way it looks when fly is set
 * - An EngineObject3D that moves by velocity3D, so give it a size3D and call setCollision to walk into solid
 *   objects instead of through them; walking keeps velocity3D.y, so render3D.gravity can pull it down
 * - Starts from wherever render3D.camera is, so it can take over from another camera without a jump
 * - As the child of an EngineObject3D, like a player on a ship, its yaw, pitch and walking are relative to the parent,
 *   so it turns and moves with it
 * - Destroy it to hand the camera back
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const player = new FirstPersonCamera3D(vec3(0, 1.5, 5));
 * player.size3D = vec3(1); // bump into solid objects
 * player.collideAsSphere3D = true;
 * player.setCollision();
 */
class FirstPersonCamera3D extends EngineObject3D
{
    /** Create a first person camera, it drives render3D.camera every frame
     *  @param {Vector3} [pos3D] - Where the eye is, defaults to where the camera is now
     *  @param {number} [yaw] - Radians around Y, defaults to the camera's
     *  @param {number} [pitch] - Radians up from level, defaults to the camera's */
    constructor(pos3D=render3D.camera.pos, yaw=render3D.camera.rotation.y, pitch=render3D.camera.rotation.x)
    {
        super(pos3D);
        this.size3D = vec3(); // not a solid thing to pick or collect until it is given a size
        this.mass = 1; // so solids push it out, and render3D.gravity pulls on it
        /** @property {number} - Angle around Y, the mouse turns it */
        this.yaw = yaw;
        /** @property {number} - Angle up from level, the mouse tilts it */
        this.pitch = pitch;
        /** @property {number} - World units per frame at full speed */
        this.moveSpeed = .1;
        /** @property {number} - How far a pixel of mouse movement turns the view */
        this.lookSpeed = .003;
        /** @property {Vector2} - Lowest and highest pitch */
        this.pitchRange = vec2(-1.5, 1.5);
        /** @property {boolean} - Move the way it looks, up and down included, instead of walking level */
        this.fly = false;
        /** @property {boolean} - Capture the mouse on a click, so looking needs no button held */
        this.lockPointer = true;
    }

    /** Move by velocity3D, and fall by render3D.gravity unless flying, called automatically each frame */
    updatePhysics()
    {
        // flying moves the way it looks and nothing else, so gravity does not pull while fly is on; the scale set
        // on it is put back, for walking
        const gravityScale = this.gravityScale;
        if (this.fly)
            this.gravityScale = 0;
        super.updatePhysics();
        this.gravityScale = gravityScale;
    }

    /** Read the mouse and keys and put the camera at the eye, called automatically each frame */
    update()
    {
        // only a root moves by its own physics, a child follows its parent, so gravity would still pull one that flies
        ASSERT(!this.fly || !this.parent, 'a flying FirstPersonCamera3D moves on its own, it cannot be a child');

        // a click captures the mouse, then it looks around while captured or while a button is held
        if (this.lockPointer && mouseWasPressed(0))
            pointerLockRequest();
        if (pointerLockIsActive() || mouseIsDown(0))
        {
            this.yaw -= mouseDeltaScreen.x * this.lookSpeed;
            this.pitch -= mouseDeltaScreen.y * this.lookSpeed;
        }
        this.pitch = clamp(this.pitch, this.pitchRange.x, this.pitchRange.y);

        // the keys move it level, or the way it looks when flying, and walking keeps its fall
        const input = keyDirection();
        const move = vec3(input.x, 0, -input.y).clampLength(1).scale(this.moveSpeed)
            .rotateX(this.fly ? this.pitch : 0).rotateY(this.yaw);
        this.velocity3D = this.fly ? move : vec3(move.x, this.velocity3D.y, move.z);

        // the camera sits at the eye, where this frame's physics left it, looking the way it does in its parent's
        // space, since a child's velocity3D moves it in that space too
        const rotation = vec3(this.pitch, this.yaw, 0);
        render3D.camera.pos = this.getWorldPos3D();
        render3D.camera.rotation = this.parent instanceof EngineObject3D ?
            this.parent.getMatrix().multiply(Matrix4.rotation(rotation)).getRotation() : rotation;
    }

    /** Let go of the mouse and stop driving the camera
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        this.lockPointer && pointerLockIsActive() && pointerLockExit();
        super.destroy(immediate);
    }

    /** Camera controls draw nothing */
    render3D() {}
}

///////////////////////////////////////////////////////////////////////////////
// a particle is this many floats of its emitter's particleData: position, velocity, start color, end color, start
// and end size, life, age, angle, spin, and how many trail points it has in trailData
const RENDER3D_PARTICLE_FLOATS = 21;
// the position, color and size of the particle being drawn, shared by every emitter so the draw loop makes no objects
const render3DParticlePos = vec3(), render3DParticleColor = new Color, render3DParticleSize = vec2();

/**
 * ParticleEmitter3D - Spawns camera facing particles, the 3D twin of ParticleEmitter
 * - Each particle is a flat square facing the camera, with a soft round dot when no tile is given
 * - Set trailTime to draw each particle as a streak along where it has been, for sparks
 * - Set angleSpeed to tumble them in the camera plane, which the 2D emitter takes as an argument
 * - Particles shoot out along the emitter's own up axis, turned by rotation3D
 * - emitConeAngle spreads them, PI sprays in every direction
 * - Speeds are per frame and sizes are world units, the same as the 2D emitter
 * - scale3D, its own or a parent's, grows the whole effect: the spawn area, the sizes, the speed and the fall
 * - gravity here is its own number added to velocity y each frame: it is neither the engine's 2D
 *   gravity nor render3D.gravity, so an effect keeps its own fall wherever it is used
 * - An emitter with an emitTime destroys itself once its last particle is gone, like the 2D emitter
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * // fire: a stream upward, yellow fading to transparent red, additive
 * new ParticleEmitter3D(vec3(), .5, 0, 100, .3, undefined, hsl(.12, 1, .6), hsl(.08, 1, .5), hsl(0, 1, .5, 0), hsl(0, 1, .25, 0), 1, .5, 1.5, .05, .95, 0, .3, .2, true);
 */
class ParticleEmitter3D extends EngineObject3D
{
    /** Create a particle emitter
     *  @param {Vector3} [pos3D] - World space position of the emitter
     *  @param {number|Vector3} [emitSize] - Spawn area, a number for a sphere diameter or a vec3 for a box
     *  @param {number} [emitTime] - How long to keep emitting, 0 is forever
     *  @param {number} [emitRate] - Particles per second, 0 does not emit
     *  @param {number} [emitConeAngle] - Half angle around the emit direction, PI is every direction
     *  @param {TileInfo|TextureInfo} [tileInfo] - Tile to render particles with, or a whole texture, undefined is untextured
     *  @param {Color} [colorStartA] - Color at start of life, randomized between the start colors
     *  @param {Color} [colorStartB]
     *  @param {Color} [colorEndA] - Color at end of life, randomized between the end colors
     *  @param {Color} [colorEndB]
     *  @param {number} [particleTime] - How long particles live in seconds
     *  @param {number} [sizeStart] - Particle size at start of life
     *  @param {number} [sizeEnd] - Particle size at end of life
     *  @param {number} [speed] - Spawn speed in world units per frame
     *  @param {number} [damping] - Per frame velocity multiplier, 1 is none
     *  @param {number} [gravity] - Per frame change to velocity y, negative pulls down; its own number,
     *    not render3D.gravity, so the 2D emitter's gravityScale has no equivalent here
     *  @param {number} [fadeRate] - Fraction of life spent fading, half in and half out
     *  @param {number} [randomness] - Extra randomness applied to speed, size and life
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), emitSize=0, emitTime=0, emitRate=100, emitConeAngle=PI, tileInfo,
        colorStartA=WHITE, colorStartB=WHITE, colorEndA=CLEAR_WHITE, colorEndB=CLEAR_WHITE,
        particleTime=.5, sizeStart=.1, sizeEnd=1, speed=.1, damping=1, gravity=0, fadeRate=.1, randomness=.2, additive=false)
    {
        super(pos3D, undefined, tileInfo);
        this.transparent = true;
        this.castShadow = false;
        this.size3D = vec3(); // not a solid thing to pick or collect

        /** @property {number|Vector3} - Spawn area, a number for a sphere diameter or a vec3 for a box */
        this.emitSize = emitSize;
        /** @property {number} - How long to keep emitting, 0 is forever */
        this.emitTime = emitTime;
        /** @property {number} - Particles per second, 0 does not emit */
        this.emitRate = emitRate;
        /** @property {number} - Half angle around the emit direction, PI is every direction */
        this.emitConeAngle = emitConeAngle;
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartA = colorStartA.copy();
        /** @property {Color} - Color at start of life, randomized between the start colors */
        this.colorStartB = colorStartB.copy();
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndA = colorEndA.copy();
        /** @property {Color} - Color at end of life, randomized between the end colors */
        this.colorEndB = colorEndB.copy();
        /** @property {number} - How long particles live in seconds */
        this.particleTime = particleTime;
        /** @property {number} - Particle size at start of life */
        this.sizeStart = sizeStart;
        /** @property {number} - Particle size at end of life */
        this.sizeEnd = sizeEnd;
        /** @property {number} - Spawn speed in world units per frame */
        this.speed = speed;
        /** @property {number} - Per frame velocity multiplier */
        this.damping = damping;
        /** @property {number} - Per frame change to velocity y, its own number and not render3D.gravity */
        this.gravity = gravity;
        /** @property {number} - Fraction of life spent fading, half in and half out */
        this.fadeRate = fadeRate;
        /** @property {number} - Extra randomness applied to speed, size and life */
        this.randomness = randomness;
        /** @property {boolean} - Additive blending */
        this.additive = additive;
        /** @property {number} - Seconds of each particle's path to draw as a ribbon behind it, 0 draws billboards */
        this.trailTime = 0;
        /** @property {number} - Radians per frame each particle turns in the camera plane, either way; 0 is no spin */
        this.angleSpeed = 0;
        /** @property {number} - Per frame multiplier on that spin, 1 keeps it */
        this.angleDamping = 1;
        /** @property {Float32Array} - The live particles, 21 floats each: position, velocity, start and end color, start
         *  and end size, life, age, angle, spin, and trail point count; the emitter owns them, nothing else needs to */
        this.particleData = new Float32Array(64 * RENDER3D_PARTICLE_FLOATS);
        /** @property {number} - How many particles are alive, the first that many of particleData */
        this.particleCount = 0;
        /** @property {Float32Array|undefined} - The trail points of every particle, trailMax per particle oldest first, when trailTime is set
         *  @type {Float32Array|undefined} */
        this.trailData = undefined;
        /** @property {number} - Trail points kept per particle, from trailTime */
        this.trailMax = 0;
        /** @property {Vector3|undefined} - Where the emitter was at its last update, for when its parent is destroyed
         *  @type {Vector3|undefined} */
        this.worldPos3D = undefined;
        this.emitTimeBuffer = 0;
    }

    /** Spawn new particles, move the live ones, and go away when done */
    update()
    {
        // one transform for the frame: where the emitter is, and how big the effect it makes is
        const matrix = render3DObjectMatrix(this); // the object's own, read only
        this.worldPos3D = matrix.getTranslation(); // remembered for when the parent is destroyed
        const scale = render3DMaxScale(matrix.m);

        // emit until the emit time is up, then wait for the last particle and go away
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // a rate of zero is an emitter fed by hand, and the global scale only quiets it,
            // neither is a reason to stop counting down the emit time
            if (this.emitRate && particleEmitRateScale)
            {
                this.emitTimeBuffer += this.emitRate * particleEmitRateScale * timeDelta;
                for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                    this.emitParticle();
            }
        }
        else if (!this.particleCount)
            this.destroy();

        // the trail storage follows trailTime, a change starts every trail over
        const trailMax = this.trailTime ? max(1, round(this.trailTime / timeDelta)) : 0;
        if (trailMax !== this.trailMax)
        {
            this.trailMax = trailMax;
            this.trailData = trailMax ? new Float32Array(this.particleData.length / RENDER3D_PARTICLE_FLOATS * trailMax * 3) : undefined;
            for (let k = 20; k < this.particleData.length; k += RENDER3D_PARTICLE_FLOATS)
                this.particleData[k] = 0;
        }

        // move the particles and drop the dead ones, all in the typed array: this runs for every particle every frame
        const F = RENDER3D_PARTICLE_FLOATS, data = this.particleData, trail = this.trailData;
        const damping = this.damping, gravity = this.gravity * scale, angleDamping = this.angleDamping; // a bigger effect has to fall faster to keep the same arc
        for (let i = this.particleCount; i--;)
        {
            // damped first and gravity added after, the order the 2D particle uses, so the same
            // damping and gravity give the same arc in both
            const k = i * F;
            const vx = data[k+3] *= damping, vy = data[k+4] = data[k+4] * damping + gravity, vz = data[k+5] *= damping;
            data[k] += vx, data[k+1] += vy, data[k+2] += vz;
            data[k+18] += data[k+19] *= angleDamping;
            const t = i * trailMax * 3;
            if (trailMax)
            {
                // remember where it has been, oldest first; a full trail drops its oldest point
                let n = data[k+20];
                if (n === trailMax)
                    trail.copyWithin(t, t + 3, t + n * 3), --n;
                const j = t + n * 3;
                trail[j] = data[k], trail[j+1] = data[k+1], trail[j+2] = data[k+2];
                data[k+20] = n + 1;
            }
            if ((data[k+17] += timeDelta) >= data[k+16])
            {
                // dead: the last particle takes its slot, trail and all, order does not matter
                const last = --this.particleCount, kl = last * F;
                if (i !== last)
                {
                    data.copyWithin(k, kl, kl + F);
                    trailMax && trail.copyWithin(t, last * trailMax * 3, (last + 1) * trailMax * 3);
                }
            }
        }
    }

    /** Stop emitting, and go away once the particles already out have finished like the 2D emitter's do
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (immediate || !this.particleCount || this.destroyed)
            return super.destroy(immediate);
        this.emitTime = -1; // stops emitting, and update destroys it once the particles are gone
        render3DDetach(this); // the particles are in world space, they no longer need the parent
    }

    /** Spawn one particle now */
    emitParticle()
    {
        const random = ()=> rand(1 - this.randomness, 1 + this.randomness);
        const matrix = render3DObjectMatrix(this); // the object's own, read only
        // the whole effect grows with the emitter, not just the area the particles start in
        const scale = render3DMaxScale(matrix.m);

        // spawn offset: inside a box or a sphere
        const size = this.emitSize, box = /** @type {Vector3} */ (size);
        const offset = isVector3(size) ? vec3(rand(-.5, .5) * box.x, rand(-.5, .5) * box.y, rand(-.5, .5) * box.z)
            : randInSphere(/** @type {number} */ (size) / 2);

        // direction inside the cone around local +Y
        const direction = matrix.transformDirection(randVector3(1, this.emitConeAngle)).normalize();

        const pos = matrix.transformPoint(offset), speed = this.speed * random() * scale;
        const colorStart = randColor(this.colorStartA, this.colorStartB, true), colorEnd = randColor(this.colorEndA, this.colorEndB, true);

        // room for one more, doubling as the set grows, the trails along with it
        const F = RENDER3D_PARTICLE_FLOATS, k = this.particleCount++ * F;
        if (k + F > this.particleData.length)
        {
            const grown = new Float32Array(this.particleData.length * 2);
            grown.set(this.particleData);
            this.particleData = grown;
            if (this.trailData)
            {
                const trails = new Float32Array(this.trailData.length * 2);
                trails.set(this.trailData);
                this.trailData = trails;
            }
        }
        const data = this.particleData;
        data[k] = pos.x, data[k+1] = pos.y, data[k+2] = pos.z;
        data[k+3] = direction.x * speed, data[k+4] = direction.y * speed, data[k+5] = direction.z * speed;
        data[k+6] = colorStart.r, data[k+7] = colorStart.g, data[k+8] = colorStart.b, data[k+9] = colorStart.a;
        data[k+10] = colorEnd.r, data[k+11] = colorEnd.g, data[k+12] = colorEnd.b, data[k+13] = colorEnd.a;
        data[k+14] = this.sizeStart * random() * scale;
        data[k+15] = this.sizeEnd * random() * scale;
        data[k+16] = this.particleTime * random(); // life
        data[k+17] = 0; // age
        // a spinning particle starts anywhere and turns either way, one that is not stays at zero
        data[k+18] = this.angleSpeed ? rand(2*PI) : 0;
        data[k+19] = this.angleSpeed ? this.angleSpeed * random() * randSign() : 0;
        data[k+20] = 0; // trail points
    }

    /** Draw the particles, as flat squares or as streaks when trailTime is set
     *  - The whole emitter sorts as one thing, its particles are not sorted against each other
     *  - With render3D.instancing on the squares go out as one instanced draw of render3D.billboardMesh
     *  @return {void} */
    render3D()
    {
        const r = render3D;
        if (r.transparentQueue)
            return r.queueTransparent(this.getWorldPos3D(), ()=> this.render3D());
        const fade = this.fadeRate / 2, texture = this.tileInfo || render3DSoftDot(); // no dot headless
        const color = render3DParticleColor, size = render3DParticleSize; // shared, so a particle makes no objects

        // the instanced path: one matrix per particle, its right and up axes the quad's size long, facing the camera,
        // written straight into the batch; the batch draws at the end so the order of the transparent stage holds
        const quad = r.billboardMesh, instanced = texture && r.instancing && !r.capture && render3DCanDraw();
        let data, textureInfo, uv, lit;
        if (instanced)
        {
            if (!quad.buffer || quad.dirty || quad.contextGeneration !== r.contextGeneration)
                quad.upload();
            textureInfo = texture instanceof TileInfo ? texture.textureInfo : texture;
            uv = render3DGetTileUVs(texture);
            lit = r.lighting;
            r.lighting = r.shadowPass && lit; // unlit on screen, in the shadow map the object's flag decides
            r.cullBackFaces = r.mirrored = false;
        }
        const cr = r.cameraRight, cu = r.cameraUp, cb = r.cameraBack, shadowPass = r.shadowPass;
        const F = RENDER3D_PARTICLE_FLOATS, particles = this.particleData, trailMax = this.trailMax, pos = render3DParticlePos;
        try
        {
            for (let i = 0, count = this.particleCount; i < count; ++i)
            {
                const p = i * F, t = particles[p+17] / particles[p+16];
                const alpha = t < fade ? t / fade : t > 1 - fade ? (1 - t) / fade : 1;
                color.r = particles[p+6] + (particles[p+10] - particles[p+6]) * t;
                color.g = particles[p+7] + (particles[p+11] - particles[p+7]) * t;
                color.b = particles[p+8] + (particles[p+12] - particles[p+8]) * t;
                color.a = (particles[p+9] + (particles[p+13] - particles[p+9]) * t) * alpha;
                const s = size.x = size.y = lerp(particles[p+14], particles[p+15], t), angle = particles[p+18];
                const trailCount = particles[p+20];
                if (trailCount > 1)
                {
                    // a ribbon from the tail to the head, the tail thins and fades out
                    const trail = this.trailData, points = [], widths = [], colors = [];
                    for (let j = 0; j < trailCount; ++j)
                    {
                        const f = (j + 1) / trailCount, q = (i * trailMax + j) * 3;
                        points.push(vec3(trail[q], trail[q+1], trail[q+2]));
                        widths.push(s * f);
                        colors.push(color.scale(1, f));
                    }
                    r.drawRibbon(points, widths, this.tileInfo, colors);
                }
                else if (instanced)
                {
                    // the axes turned by the particle's angle in the camera plane, as drawBillboard turns them
                    let rx = cr.x, ry = cr.y, rz = cr.z, ux = cu.x, uy = cu.y, uz = cu.z;
                    if (angle)
                    {
                        const c = cos(angle), n = sin(angle);
                        rx = cr.x * c + cu.x * n, ry = cr.y * c + cu.y * n, rz = cr.z * c + cu.z * n;
                        ux = cu.x * c - cr.x * n, uy = cu.y * c - cr.y * n, uz = cu.z * c - cr.z * n;
                    }
                    const k = render3DInstanceSlot(quad, textureInfo);
                    data = quad.instanceData;
                    data[k]    = rx * s; data[k+1]  = ry * s; data[k+2]  = rz * s; data[k+3]  = 0;
                    data[k+4]  = ux * s; data[k+5]  = uy * s; data[k+6]  = uz * s; data[k+7]  = 0;
                    data[k+8]  = cb.x;   data[k+9]  = cb.y;   data[k+10] = cb.z;   data[k+11] = 0;
                    data[k+12] = particles[p]; data[k+13] = particles[p+1]; data[k+14] = particles[p+2]; data[k+15] = 1;
                    if (!shadowPass)
                        data[k+16] = color.r, data[k+17] = color.g, data[k+18] = color.b, data[k+19] = color.a;
                    data[k+20] = uv.x; data[k+21] = uv.y; data[k+22] = uv.w; data[k+23] = uv.h;
                }
                else
                {
                    pos.x = particles[p], pos.y = particles[p+1], pos.z = particles[p+2];
                    if (texture)
                        r.drawBillboard(pos, size, texture, color, angle);
                    else
                        r.drawSoftDisc(pos, s, color, undefined, 8); // no canvas for the dot, headless
                }
            }
        }
        finally
        {
            if (instanced)
            {
                r.lighting = lit;
                r.flush(); // whatever the stream holds from before this emitter draws first
                render3DFlushInstances(quad);
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Trail3D - A ribbon through where the object has been, thinning and fading with age
 * - Records its world position each frame it moves, so parent it to something that moves or set pos3D yourself
 * - The samples are world space, so width is a world width and scale3D does nothing to the ribbon
 * - Drawn unlit in the transparent stage, dies down on its own once the object stops
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const trail = new Trail3D(vec3(), 1, .3, undefined, hsl(.08, 1, .5), hsl(0, 1, .5, 0), true);
 * ball.addChild(trail); // follows the ball
 */
class Trail3D extends EngineObject3D
{
    /** Create a trail
     *  @param {Vector3} [pos3D]
     *  @param {number} [lifeTime] - Seconds the ribbon takes to thin and fade from head to tail,
     *    Infinity keeps every sample at full width and never drops one, so it grows as long as the object moves
     *  @param {number} [width] - Width at the head, it thins to nothing at the tail
     *  @param {TileInfo|TextureInfo} [tileInfo] - Tile or whole texture stretched along the trail, undefined is untextured
     *  @param {Color} [color] - Color at the head
     *  @param {Color} [colorEnd] - Color at the tail
     *  @param {boolean} [additive] - Additive blending */
    constructor(pos3D=vec3(), lifeTime=1, width=.2, tileInfo, color=WHITE, colorEnd=CLEAR_WHITE, additive=false)
    {
        super(pos3D, undefined, tileInfo, color);
        this.transparent = true;
        this.additive = additive;
        this.castShadow = false;
        this.size3D = vec3(); // not a solid thing to pick or collect
        this.finishing = false; // set by destroy, the ribbon fades out then goes away

        /** @property {number} - Seconds the ribbon takes to thin and fade from head to tail, Infinity never drops a sample */
        this.lifeTime = lifeTime;
        /** @property {number} - Width at the head */
        this.width = width;
        /** @property {Color} - Color at the tail */
        this.colorEnd = colorEnd.copy();
        /** @property {Vector3|undefined} - Direction across the ribbon, recorded with each sample, undefined faces the camera
         *  @type {Vector3|undefined} */
        this.side = undefined;
        /** @property {Array<{pos: Vector3, side: Vector3|undefined, time: number}>} - Recorded samples, oldest first
         *  @type {Array<{pos: Vector3, side: Vector3|undefined, time: number}>} */
        this.samples = [];
    }

    /** Forget the trail so far, for when the object teleports */
    clear() { this.samples.length = 0; }

    /** Stop recording, and go away once the ribbon has faded
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (immediate || !this.samples.length || this.destroyed || this.lifeTime == Infinity)
            return super.destroy(immediate);
        this.finishing = true;
        render3DDetach(this); // the samples are in world space, they no longer need the parent
    }

    /** Record the position when it moved and drop old samples, called automatically each frame */
    update()
    {
        const samples = this.samples;
        if (!this.finishing)
        {
            const pos = this.worldPos3D = this.getWorldPos3D(), last = samples[samples.length - 1];
            if (!last || pos.distanceSquared(last.pos) > 1e-8)
                samples.push({pos, side: this.side?.copy(), time});
        }
        while (samples.length && time - samples[0].time > this.lifeTime)
            samples.shift();
        this.finishing && !samples.length && this.destroy();
    }

    /** Draw the ribbon
     *  @return {void} */
    render3D()
    {
        const samples = this.samples;
        if (samples.length < 2) return;
        const points = [], widths = [], colors = [], sides = this.side ? [] : undefined;
        for (const s of samples)
        {
            const age = clamp((time - s.time) / this.lifeTime);
            points.push(s.pos);
            widths.push(this.width * (1 - age));
            colors.push(this.color.lerp(this.colorEnd, age));
            sides?.push(s.side);
        }
        render3D.drawRibbon(points, widths, this.tileInfo, colors, sides);
    }
}

///////////////////////////////////////////////////////////////////////////////
// OBJ meshes

/**
 * Parse Wavefront OBJ text into a Mesh
 * - Reads v, vt, vn and f lines with convex polygons of any size, materials and groups are ignored
 * - Normals come from the file when every corner of a face has one, otherwise from the face
 * - Use mesh.center() and mesh.fit(size) to bring a model of unknown units to the origin
 * - Back faces are skipped like any mesh, set doubleSided for a model with open walls or single sided parts
 * @param {string} text
 * @param {boolean} [smooth] - Compute smooth normals for the faces the file gives none, defaults to render3D.smoothShading
 * @return {Mesh}
 * @memberof Render3D
 * @example
 * new EngineObject3D(vec3(), parseOBJ(objText).center().fit(4));
 */
function parseOBJ(text, smooth=render3D?.smoothShading)
{
    const positions = [], normals = [], uvs = [];
    const points = [], vertexNormals = [], vertexUVs = [], indices = [], seen = new Map;
    const fromFile = []; // which vertices have a normal from the file, the rest are smoothed when smooth is on
    let missingNormals = false, face = 0;

    // OBJ indices count from 1, and a negative one counts back from the end of the list so far
    const index = (s, list)=> { const i = parseInt(s); return i < 0 ? list.length + i : i - 1; };
    const lookup = (s, list)=> list[index(s, list)];
    for (const line of text.split('\n'))
    {
        const parts = line.trim().split(/\s+/);
        switch (parts[0])
        {
            case 'v':  positions.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vn': normals.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vt': uvs.push(vec2(+parts[1], 1 - +parts[2])); break; // OBJ v runs up, tiles run down
            case 'f':
            {
                const corners = parts.slice(1).map(c=> c.split('/'));
                if (corners.length < 3) break;
                const facePoints = corners.map(c=> lookup(c[0], positions));
                ASSERT(facePoints.every(isVector3), 'OBJ face uses a vertex index the file does not have', line);
                const hasNormals = corners.every(c=> c[2]);
                missingNormals ||= !hasNormals;
                const faceNormal = hasNormals ? undefined : render3DFaceNormal(facePoints[0], facePoints[1], facePoints[2], facePoints[3]);
                // a corner is one vertex with the same position, uv and normal; without file normals the face's own
                // normal keeps its corners apart, unless they will be smoothed, when the position and uv are enough
                const ids = corners.map((c, i)=>
                {
                    // by the vertices they are, a negative index means another vertex as the lists grow
                    const key = index(c[0], positions) + '/' + (c[1] ? index(c[1], uvs) : '') + '/' +
                        (hasNormals ? index(c[2], normals) : smooth ? '' : 'f' + face);
                    let id = seen.get(key);
                    if (id === undefined)
                    {
                        seen.set(key, id = points.length);
                        points.push(facePoints[i]);
                        vertexUVs.push(c[1] ? lookup(c[1], uvs) : RENDER3D_DEFAULT_UV);
                        vertexNormals.push(hasNormals ? lookup(c[2], normals) : faceNormal);
                        fromFile.push(hasNormals);
                    }
                    return id;
                });
                // a fan around the second corner, counter clockwise as the file lists them; that cuts a quad along
                // the same diagonal the strip form did, so a smoothed model shades the same as before
                for (let k = 2; k < ids.length; ++k)
                    indices.push(ids[1], ids[k], ids[(k + 1) % ids.length]);
                ++face;
            }
        }
    }
    const mesh = new Mesh().addTriangles(points, indices, vertexNormals, vertexUVs);
    if (missingNormals && smooth)
    {
        // smooth the faces the file gave no normals, and keep the normals it did give
        const given = mesh.normals;
        mesh.computeNormals(true);
        fromFile.forEach((f, i)=> f && (mesh.normals[i] = given[i]));
    }
    return mesh;
}

/**
 * Fetch and parse an OBJ file
 * @param {string} url
 * @param {boolean} [smooth] - Compute smooth normals when the file has none, defaults to render3D.smoothShading
 * @return {Promise<Mesh>}
 * @memberof Render3D
 * @example
 * const mesh = await loadOBJ('ship.obj'); // in an async gameInit
 */
async function loadOBJ(url, smooth=render3D?.smoothShading)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('loadOBJ failed: ' + url);
    return parseOBJ(await response.text(), smooth);
}
