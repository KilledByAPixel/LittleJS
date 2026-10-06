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

// let go of the parent but stay where and as the object was in the world, which removeChild keeps by itself; a
// destroyed parent has already let go, so the world matrix last built with it in stands in, scale and turn as well
function render3DDetach(o)
{
    if (o.parent)
        o.parent.removeChild(o);
    else if (o.matrixParent)
        render3DTakeWorld(o, o.worldMatrix);
}

// a soft white dot for untextured particles, made once from a canvas, undefined headless or without a canvas
let render3DSoftDotTexture;
function render3DSoftDot()
{
    if (render3DSoftDotTexture || !glContext || !canvasAvailable()) return render3DSoftDotTexture;
    const size = 32, context = createCanvasContext(size);
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [stop, alpha] of [[0, 1], [.33, .9], [.67, .7], [1, 0]]) // the same falloff as a soft disc
        gradient.addColorStop(stop, 'rgba(255,255,255,' + alpha + ')');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return render3DSoftDotTexture = new TextureInfo(context.canvas);
}

/** Make a normal map from a height at each pixel, for bumps and grooves with no image file: the slope at each pixel
 *  from its neighbors' heights, taken around the edges so the map tiles; set it as an object's normalMap
 *  @param {Vector2} size - In pixels
 *  @param {function(number, number): number} heightFunction - The height 0 to 1 at a pixel, x across and y down
 *  @param {number} [strength] - How steep the slopes are: a height change of 1 over one pixel leans the normal
 *  by strength
 *  @return {TextureInfo} - Wraps; headless it has no image
 *  @memberof Render3D */
function normalMapFromHeight(size, heightFunction, strength=1)
{
    ASSERT(isVector2(size) && size.x >= 1 && size.y >= 1, 'normalMapFromHeight size must be a Vector2 of pixels');
    const width = size.x | 0, height = size.y | 0;
    if (!canvasAvailable())
    {
        // headless, nothing to draw into; the right size so what reads it still works
        const textureInfo = new TextureInfo(undefined, false, true);
        textureInfo.size = vec2(width, height), textureInfo.sizeInverse = vec2(1 / width, 1 / height);
        return textureInfo;
    }
    const context = createCanvasContext(width, height);
    const pixels = render3DNormalMapPixels(width, height, heightFunction, strength);
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return new TextureInfo(context.canvas, true, true);
}

// the pixels of a normal map made from heights, rgba with the top row first: each normal leans away from the uphill
// side, green up the image as OpenGL has it, and a flat height is (128, 128, 255); rounded before they are stored,
// since the clamped array would round a flat 127.5 to even
function render3DNormalMapPixels(width, height, heightFunction, strength)
{
    const heights = new Float32Array(width * height), pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; ++y)
    for (let x = 0; x < width; ++x)
        heights[y * width + x] = heightFunction(x, y);
    const h = (x, y)=> heights[mod(y, height) * width + mod(x, width)];
    for (let y = 0; y < height; ++y)
    for (let x = 0; x < width; ++x)
    {
        const dx = (h(x+1, y) - h(x-1, y)) / 2 * strength, dy = (h(x, y+1) - h(x, y-1)) / 2 * strength;
        const k = 1 / hypot(dx, dy, 1), i = (y * width + x) * 4;
        pixels[i] = round((-dx * k * .5 + .5) * 255);
        pixels[i+1] = round((dy * k * .5 + .5) * 255);
        pixels[i+2] = round((k * .5 + .5) * 255);
        pixels[i+3] = 255;
    }
    return pixels;
}

///////////////////////////////////////////////////////////////////////////////
// The rest of the shape builders: buildLathe, buildSphere, buildBox, buildGrid and buildSky live with the
// renderer, since it hands those out itself

// lathe profile points rounding the corner at [r, y] where two sides leave it along the unit directions d1 and d2,
// from t along d1 to t along d2; one segment is a flat chamfer, its points doubled so the lathe shades both of its
// edges hard, more follow the circle that touches both sides
function render3DBevelProfile(corner, d1, d2, t, segments)
{
    const p1 = [corner[0] + d1[0] * t, corner[1] + d1[1] * t];
    const p2 = [corner[0] + d2[0] * t, corner[1] + d2[1] * t];
    segments = max(1, segments | 0);
    if (segments === 1)
        return [p1, p1, p2, p2];

    // the circle's center is on the line halfway between the sides, as far from each as its radius
    const half = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1)) / 2;
    const bx = d1[0] + d2[0], by = d1[1] + d2[1], reach = t / cos(half) / hypot(bx, by);
    const cx = corner[0] + bx * reach, cy = corner[1] + by * reach, radius = t * tan(half);
    const start = atan2(p1[1] - cy, p1[0] - cx);
    const turn = mod(atan2(p2[1] - cy, p2[0] - cx) - start + PI, 2 * PI) - PI; // the short way round
    const points = [p1];
    for (let i = 1; i < segments; ++i)
    {
        const a = start + turn * i / segments;
        points.push([cx + cos(a) * radius, cy + sin(a) * radius]);
    }
    points.push(p2);
    return points;
}

/**
 * Build a cylinder standing on the Y axis, centered on the origin
 * @param {number} [size] - Diameter
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the ends
 * @param {number} [bevel] - Size of the cut on the top and bottom rims, clamped to the radius and half the height
 * @param {number} [bevelSegments] - Steps around each rim, 1 for a flat chamfer
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCylinder(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true, bevel=0, bevelSegments=1)
{
    ASSERT(isNumber(bevel) && bevel >= 0, 'bevel must be a number, 0 or more');
    const r = size / 2, h = height / 2, t = min(bevel, r, h);
    if (!(t > 0))
        return buildLathe([[r, -h], [r, h]], sides, smooth, capped);
    return buildLathe([...render3DBevelProfile([r, -h], [-1, 0], [0, 1], t, bevelSegments),
        ...render3DBevelProfile([r, h], [0, -1], [-1, 0], t, bevelSegments)], sides, smooth, capped);
}

/**
 * Build a cone standing on the Y axis, centered on the origin, the point up
 * @param {number} [size] - Diameter of the base
 * @param {number} [height]
 * @param {number} [sides] - Around
 * @param {boolean} [smooth] - Defaults to render3D.smoothShading
 * @param {boolean} [capped] - Close the base
 * @param {number} [bevel] - Size of the cut on the base rim, clamped to the radius and half the slanted side
 * @param {number} [bevelSegments] - Steps around the rim, 1 for a flat chamfer
 * @return {Mesh}
 * @memberof Render3D
 */
function buildCone(size=1, height=1, sides=16, smooth=render3D?.smoothShading, capped=true, bevel=0, bevelSegments=1)
{
    ASSERT(isNumber(bevel) && bevel >= 0, 'bevel must be a number, 0 or more');
    const r = size / 2, h = height / 2, slant = hypot(r, height), t = min(bevel, r, slant / 2);
    if (!(t > 0))
        return buildLathe([[r, -h], [0, h]], sides, smooth, capped);
    const up = [-r / slant, height / slant]; // along the slanted side from the rim toward the point
    return buildLathe([...render3DBevelProfile([r, -h], [-1, 0], up, t, bevelSegments), [0, h]],
        sides, smooth, capped);
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
 * HeightMap - Terrain from a grid of heights: an object that draws itself, and that objects with collideLevel stand on
 * - heights is a 2D array [row][column] of 0 to 1 values
 * - Row 0 is the far edge at -Z and column 0 is the left edge at -X
 * - It can be an image instead, where the red channel is the height
 * - colors is an optional 2D array of Colors or an image, sampled per vertex
 * - images are read through a canvas, so they must be same origin or loaded with crossOrigin set
 * - pos3D is the center of the map, its grid spans mapSize on X and Z around it, and a full value is height above it
 * - getHeight, getNormal, getColor and raycast are in world space, with the map's position taken off
 * - It stays upright and unscaled, its lookups do not turn with it
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const terrain = new HeightMap(heightImage, vec2(100, 100), 10, colorImage);
 * const y = terrain.getHeight(x, z); // stand things on it, or give them collideLevel
 */
class HeightMap extends EngineObject3D
{
    /** Create a height map from an array or an image, it draws itself and joins the level's collision
     *  @param {Array<Array<number>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} heights
     *  @param {Vector2} [mapSize] - World size along X and Z
     *  @param {number} [height] - World height of a full value
     *  @param {Array<Array<Color>>|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas|TextureInfo} [colors]
     *  @param {Vector3} [pos3D] - Center of the map
     *  @param {boolean} [smooth] - Defaults to render3D.smoothShading */
    constructor(heights, mapSize=vec2(1), height=1, colors, pos3D=vec3(), smooth=render3D?.smoothShading)
    {
        super(pos3D);
        if (!isArray(heights))
            heights = render3DImageToArray(heights, (r)=> r / 255);
        if (colors && !isArray(colors))
            colors = render3DImageToArray(colors, (r, g, b, a)=> rgb(r / 255, g / 255, b / 255, a / 255));
        ASSERT(isArray(heights) && heights.length > 1 && isArray(heights[0]) && heights[0].length > 1, 'height map needs at least 2 rows and 2 columns');
        ASSERT(mapSize.x > 0 && mapSize.y > 0, 'height map size must be positive, a zero size has nowhere to look things up');

        /** @property {Array<Array<number>>} - Heights 0-1 as [row][column], rows along Z, rebuild() after changing them */
        this.heights = heights;
        /** @property {Array<Array<Color>>|undefined} - Vertex colors as [row][column], undefined for white
         *  @type {Array<Array<Color>>|undefined} */
        this.colors = /** @type {Array<Array<Color>>|undefined} */ (colors);
        /** @property {Vector2} - World size along X and Z */
        this.mapSize = mapSize.copy();
        /** @property {number} - World height of a full value */
        this.height = height;
        /** @property {boolean} - Smooth shading, rebuild() after changing it */
        this.smooth = !!smooth;
        this.size3D = vec3(mapSize.x, height, mapSize.y);
        this.rebuild();
        render3DLevel.push(this);
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
        const p = this.pos3D;
        x -= p.x, z -= p.z;
        const columns = this.columns, rows = this.rows, h = this.heights;
        const u = clamp((x / this.mapSize.x + .5) * (columns - 1), 0, columns - 1);
        const v = clamp((z / this.mapSize.y + .5) * (rows - 1), 0, rows - 1);
        const i = min(floor(u), columns - 2), j = min(floor(v), rows - 2);
        const fu = u - i, fv = v - j;
        // each cell is two triangles split from (i, j+1) to (i+1, j), the same split buildGrid's quads use
        const a = h[j][i], b = h[j+1][i], c = h[j+1][i+1], d = h[j][i+1];
        const height = fu + fv <= 1 ? a + fu * (d - a) + fv * (b - a) : c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
        return height * this.height + p.y;
    }

    /** Surface normal at a position, from the slope across a sample
     *  @param {number|Vector3} x - X, or a position to take X and Z from
     *  @param {number} [z]
     *  @return {Vector3} */
    getNormal(x, z)
    {
        if (x instanceof Vector3)
            z = x.z, x = x.x;
        const p = this.pos3D, size = this.mapSize;
        const ex = size.x / (this.columns - 1) / 2, ez = size.y / (this.rows - 1) / 2;
        const local = (lx, lz)=> this.getHeight(lx + p.x, lz + p.z);
        return render3DSlopeNormal(local, x - p.x, z - p.z, ex, ez, size.x / 2, size.y / 2);
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
        x -= this.pos3D.x, z -= this.pos3D.z;
        const columns = c[0].length, rows = c.length;
        const i = clamp(round((x / this.mapSize.x + .5) * (columns - 1)), 0, columns - 1);
        const j = clamp(round((z / this.mapSize.y + .5) * (rows - 1)), 0, rows - 1);
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
        // in the map's own space, its position taken off the ray
        const p = this.pos3D, origin = ray.origin.subtract(p), direction = ray.direction;
        const size = this.mapSize, height = this.height, length = direction.length();
        if (!length) return;

        // clip to the box around the terrain, from where the ray enters it to where it leaves the map's footprint
        const start = raycastBox(new Ray3D(origin, direction), vec3(0, height / 2, 0), vec3(size.x, abs(height) + 1e-3, size.y));
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
            const q = origin.add(direction.scale(at));
            return q.y + p.y - this.getHeight(q.x + p.x, q.z + p.z);
        };
        // touching the surface counts as a hit too, where it starts, at the map's edge, or grazing it from below
        const touching = (d)=> abs(d) <= 1e-9;
        let a = start, da = above(a);
        if (touching(da)) return start;
        const startUnder = da <= 0;
        for (const b of breaks)
        {
            if (b <= a || b > end) continue;
            const db = above(b);
            if (touching(db)) return b;
            if (db <= 0 !== startUnder)
                return da === db ? b : a + (b - a) * da / (da - db);
            a = b, da = db;
        }
    }

    /** Build the terrain mesh, one vertex per sample, centered on the map's own origin
     *  @param {boolean} [smooth] - Defaults to render3D.smoothShading
     *  @return {Mesh} */
    buildMesh(smooth=render3D?.smoothShading)
    {
        // flat shading colors each cell from its center, halfway between two samples where rounding could pick
        // either, so it is nudged a thousandth of a cell back to make it the cell's first corner every time
        const p = this.pos3D, size = this.mapSize;
        const nudgeX = smooth ? 0 : size.x / (this.columns - 1) / 1e3;
        const nudgeZ = smooth ? 0 : size.y / (this.rows - 1) / 1e3;
        return buildGrid(size, vec2(this.columns - 1, this.rows - 1),
            this.colors && ((x, z)=> this.getColor(x - nudgeX + p.x, z - nudgeZ + p.z)),
            (x, z)=> this.getHeight(x + p.x, z + p.z) - p.y, smooth);
    }

    /** Make the mesh again from the heights and colors, after changing them or smooth */
    rebuild() { this.setMesh(this.buildMesh(this.smooth)); }

    /** How far along a ray the surface is, for picking, see raycast
     *  @param {Ray3D} ray
     *  @return {number|undefined}
     *  @ignore */
    levelRaycast3D(ray) { return this.raycast(ray); }

    /** Where a short move goes under the surface, for a particle's move in one frame: the part of the move made
     *  before it, 0 to 1, and the surface normal there; undefined when it stays above, starts under, or is off the map
     *  @param {Vector3} from
     *  @param {Vector3} to
     *  @return {{distance: number, normal: Vector3}|undefined}
     *  @ignore */
    levelSegment3D(from, to)
    {
        const m = this.pos3D, size = this.mapSize;
        if (abs(to.x - m.x) > size.x / 2 || abs(to.z - m.z) > size.y / 2) return undefined; // off the map
        const a = from.y - this.getHeight(from.x, from.z), b = to.y - this.getHeight(to.x, to.z);
        if (a < 0 || b >= 0) return undefined; // above all the way, or under from the start
        const distance = a / (a - b);
        return {distance, normal: this.getNormal(from.x + (to.x - from.x) * distance, from.z + (to.z - from.z) * distance)};
    }

    /** Keep an object above the ground, called by the engine for each object with collideLevel
     *  @param {EngineObject3D} o
     *  @param {Vector3} oldPos - Where it was before it moved
     *  @param {boolean} [wasOn] - It stood on this map last frame
     *  @ignore */
    levelCollide3D(o, oldPos, wasOn)
    {
        const p = o.pos3D, m = this.pos3D, size = this.mapSize;
        if (abs(p.x - m.x) > size.x / 2 || abs(p.z - m.z) > size.y / 2) return; // off the map
        const half = o.size3D.y * abs(o.scale3D.y) / 2, ground = this.getHeight(p.x, p.z);
        // one that stood on it and is not rising keeps to it going downhill, as far down as it moved across, so it
        // stays grounded down a slope as steep as 45 degrees instead of falling in small hops
        const follow = wasOn && o.velocity3D.y <= 0 ? hypot(p.x - oldPos.x, p.z - oldPos.z) : 0;
        if (p.y - half > ground + follow) return;
        p.y = ground + half;
        const v = o.velocity3D;
        if (v.y < 0)
            v.y *= -max(o.restitution, this.restitution);
        o.groundObject = this;
    }

    /** Keeps an eye on its placement, called automatically each frame */
    update()
    {
        super.update();
        render3DLevelAssertPlaced(this);
    }

    /** Destroy the map, it leaves the level's collision
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        render3DLevelLeave(this);
        super.destroy(immediate);
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
        /** @property {number} - Speed of a jump in world units a frame, 0 for none; Space or gamepad button 0 jumps
         *  while it stands on something, a height map, a voxel map or a solid, see groundObject */
        this.jumpSpeed = 0;
        /** @property {number} - How far above its position the eye is, in its own space, so with a size3D the eye can
         *  sit toward the top of the body instead of its middle; keep it under half the body's height, or the eye is
         *  outside the body and sees through a ceiling it stands under */
        this.eyeHeight = 0;
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
        // a jump from the ground, level collision sets what it stands on
        if (this.jumpSpeed && !this.fly && this.groundObject && (keyWasPressed('Space') || gamepadWasPressed(0)))
            this.velocity3D.y = this.jumpSpeed;

        // the camera sits at the eye, eyeHeight above where this frame's physics left it, looking the way it does in
        // its parent's space, since a child's velocity3D moves it in that space too
        const rotation = vec3(this.pitch, this.yaw, 0);
        render3D.camera.pos = render3DObjectMatrix(this).transformPoint(vec3(0, this.eyeHeight, 0));
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
// where a particle was and is, for the level collision
const render3DParticleFrom = vec3(), render3DParticleTo = vec3();

// the emitters inside a particle callback now, whose nested calls each get a view of their own
const render3DParticlesCalling = new Set;

// a particle as a ParticleEmitter3D's callbacks see it, set from the particle for each call
/** @param {ParticleEmitter3D} emitter
 *  @return {Particle3D} */
function render3DParticleView(emitter)
{
    return {emitter, pos: vec3(), velocity: vec3(), age: 0, lifeTime: 0, scale: 1, destroyed: false,
        destroy() { this.destroyed = true; }};
}

/**
 * A particle as a ParticleEmitter3D's callbacks see it: one object the emitter reuses, set from the particle for each
 * call and written back after it, so copy what you keep
 * @typedef {Object} Particle3D
 * @property {ParticleEmitter3D} emitter - The emitter it is in
 * @property {Vector3} pos - Where it is, change it to move it
 * @property {Vector3} velocity - How far it moves each frame
 * @property {number} age - Seconds it has lived
 * @property {number} lifeTime - Seconds it lives
 * @property {number} scale - How much the emitter grows its effect, from its scale3D and its parents', as the 2D
 *   particle's scale
 * @property {boolean} destroyed - Set by destroy
 * @property {function(): void} destroy - End it this update, the destroy callback gets it
 * @memberof Render3D
 */

/**
 * @callback Particle3DCallback - A function a ParticleEmitter3D calls with one of its particles
 * @param {Particle3D} particle
 * @memberof Render3D
 */

/**
 * @callback Particle3DCollideCallback - Decides whether a particle stops where it hits the level, a filter as in 2D
 * @param {Particle3D} particle
 * @param {EngineObject3D} level - The HeightMap or VoxelMap it hit
 * @param {Vector3} pos - Where it hit
 * @return {boolean|void} - true to stop it there; a callback that returns nothing lets it pass through
 * @memberof Render3D
 */

/**
 * ParticleEmitter3D - Spawns camera facing particles, the 3D twin of ParticleEmitter
 * - Each particle is a flat square facing the camera, with a soft round dot when no tile is given
 * - Set trailTime to draw each particle as a streak along where it has been, for sparks
 * - Set angleSpeed to tumble them in the camera plane, which the 2D emitter takes as an argument
 * - Particles shoot out along the emitter's own up axis, turned by rotation3D
 * - emitConeAngle spreads them, PI sprays in every direction
 * - Speeds are per frame and sizes are world units, the same as the 2D emitter
 * - scale3D, its own or a parent's, grows the whole effect: the spawn area, the sizes, the speed and the fall
 * - gravity here is its own number added to velocity y each frame, so an effect keeps its own fall wherever it is
 *   used, the same as the 2D emitter's gravity; gravityScale adds a share of render3D.gravity on top, as the 2D
 *   emitter's gravityScale adds the engine's gravity
 * - An emitter with an emitTime destroys itself once its last particle is gone, like the 2D emitter
 * - Callbacks as the 2D emitter's: particleCreateCallback, particleUpdateCallback, particleCollideCallback and
 *   particleDestroyCallback, each given a Particle3D, one object the emitter reuses for every particle and call
 * - collideLevel, off by default, has particles hit the height maps and voxel maps, bouncing by restitution and
 *   sliding by friction
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
     *  @param {number} [gravity] - Per frame change to velocity y, negative pulls down; its own number, and
     *    gravityScale adds a share of render3D.gravity on top
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
        /** @property {boolean} - Flatten the spawn area across the way it emits, its own up: a sphere becomes a disc
         *  and a box a flat rectangle, for rain from a sheet of sky or flames from a patch of ground */
        this.emitFlat = false;
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
        /** @property {number} - Share of render3D.gravity added each frame on top of its own gravity, 0 by default so
         *  an effect keeps its own fall wherever it is used; 1 falls with the world, like debris */
        this.gravityScale = 0;
        /** @property {number} - Fraction of life spent fading, half in and half out */
        this.fadeRate = fadeRate;
        /** @property {number} - Extra randomness applied to speed, size and life */
        this.randomness = randomness;
        /** @property {boolean} - Additive blending */
        this.additive = additive;
        /** @property {number} - Seconds of each particle's path to draw as a ribbon behind it, 0 draws billboards;
         *  with engineVariableStep it keeps trailTime * frameRate updates of path */
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
        /** @property {boolean} - Particles hit the level, the height maps and voxel maps, bouncing by restitution and
         *  sliding along by friction; off by default, it tests each particle's move against the level every frame */
        this.collideLevel = false;
        /** @property {number} - How much a particle grips where it lands, 0 to 1: its speed along the surface is
         *  cut by this much on each hit, on top of the friction, 1 stops it there */
        this.stick = 0;
        /** @property {Particle3DCallback|undefined} - Called with each particle as it is made
         *  @type {Particle3DCallback|undefined} */
        this.particleCreateCallback = undefined;
        /** @property {Particle3DCallback|undefined} - Called with each particle each update, after it moves
         *  @type {Particle3DCallback|undefined} */
        this.particleUpdateCallback = undefined;
        /** @property {Particle3DCollideCallback|undefined} - Decides if a particle stops where it hits the level,
         *  with collideLevel on; a callback that returns nothing lets it through
         *  @type {Particle3DCollideCallback|undefined} */
        this.particleCollideCallback = undefined;
        /** @property {Particle3DCallback|undefined} - Called with each particle as it goes, its life over or destroyed
         *  @type {Particle3DCallback|undefined} */
        this.particleDestroyCallback = undefined;
        /** @property {Particle3D} - The particle the callbacks get, one object for every particle and call
         *  @type {Particle3D} */
        this.particleView = render3DParticleView(this);
        /** @property {Vector3|undefined} - Where the emitter was at its last update, for when its parent is destroyed
         *  @type {Vector3|undefined} */
        this.worldPos3D = undefined;
        this.emitTimeBuffer = 1; // the first particle comes at once, as the 2D emitter's does
    }

    /** Spawn new particles, move the live ones, and go away when done */
    update()
    {
        // one transform for the frame: where the emitter is, and how big the effect it makes is
        const matrix = render3DObjectMatrix(this); // the object's own, read only
        this.worldPos3D = matrix.getTranslation(); // remembered for when the parent is destroyed
        const scale = render3DMaxScale(matrix.m);
        this.particleView.scale = scale; // the callbacks read it from the view instead of working it out each time

        // emit until the emit time is up, then wait for the last particle and go away
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // a rate of zero is an emitter fed by hand, and the global scale only quiets it,
            // neither is a reason to stop counting down the emit time
            const rate = this.emitRate * particleEmitRateScale;
            if (rate > 0 && rate < Infinity)
            {
                this.emitTimeBuffer += rate * timeDelta;
                for (; this.emitTimeBuffer >= 1; --this.emitTimeBuffer)
                    this.emitParticle();
            }
        }
        else if (!this.particleCount)
            this.destroy();

        // the trail storage follows trailTime at the fixed rate, a change starts every trail over, so a varying
        // timeDelta can not; with engineVariableStep a trail keeps that many updates
        const trailMax = this.trailTime ? max(1, round(this.trailTime * frameRate)) : 0;
        if (trailMax !== this.trailMax)
        {
            this.trailMax = trailMax;
            this.trailData = trailMax ? new Float32Array(this.particleData.length / RENDER3D_PARTICLE_FLOATS * trailMax * 3) : undefined;
            for (let k = 20; k < this.particleData.length; k += RENDER3D_PARTICLE_FLOATS)
                this.particleData[k] = 0;
        }

        // move the particles and drop the dead ones, all in the typed array: this runs for every particle every frame
        // a callback can emit, which grows the arrays when they are full, so they are read again after each one
        const F = RENDER3D_PARTICLE_FLOATS;
        let data = this.particleData, trail = this.trailData;
        const reread = ()=> { data = this.particleData, trail = this.trailData; };
        // its own fall and a share of the world's, grown by the scale: a bigger effect has to fall faster to keep the
        // same arc
        const damping = this.damping, angleDamping = this.angleDamping, g = render3D.gravity, share = this.gravityScale;
        const gravityX = g.x * share * scale, gravityY = (this.gravity + g.y * share) * scale;
        const gravityZ = g.z * share * scale;
        const collideLevel = this.collideLevel && render3DLevel.length;
        const updateCallback = this.particleUpdateCallback, destroyCallback = this.particleDestroyCallback;
        for (let i = this.particleCount; i--;)
        {
            // damped first and gravity added after, the order the 2D particle uses, so the same
            // damping and gravity give the same arc in both
            const k = i * F;
            const vx = data[k+3] = data[k+3] * damping + gravityX, vy = data[k+4] = data[k+4] * damping + gravityY;
            const vz = data[k+5] = data[k+5] * damping + gravityZ;
            data[k] += vx, data[k+1] += vy, data[k+2] += vz;
            data[k+18] += data[k+19] *= angleDamping;
            // true when its collide callback destroyed it, it has had its last callback but the destroy one
            const gone = collideLevel && this.particleCollide(k, data[k] - vx, data[k+1] - vy, data[k+2] - vz);
            collideLevel && reread();
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
            updateCallback && !gone && (this.particleCall(updateCallback, k), reread());
            if ((data[k+17] += timeDelta) >= data[k+16])
            {
                // dead: the last particle takes its slot, trail and all, order does not matter
                destroyCallback && (this.particleCall(destroyCallback, k), reread());
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

        // spawn offset: inside a box or a sphere, or flat across the emitter's up, a flat rectangle or a disc
        const size = this.emitSize, box = /** @type {Vector3} */ (size), flat = this.emitFlat;
        let offset;
        if (isVector3(size))
            offset = vec3(rand(-.5, .5) * box.x, flat ? 0 : rand(-.5, .5) * box.y, rand(-.5, .5) * box.z);
        else if (flat)
        {
            const disc = randInCircle(/** @type {number} */ (size) / 2);
            offset = vec3(disc.x, 0, disc.y);
        }
        else
            offset = randInSphere(/** @type {number} */ (size) / 2);

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
        this.particleView.scale = scale; // the scale it was made at, emitted before the first update too
        this.particleCreateCallback && this.particleCall(this.particleCreateCallback, k);
    }

    // call a particle callback with the particle at k: the emitter's one Particle3D is set from its numbers, and
    // what the callback changes is written back; a particle it destroys has lived its life, the update removes it
    /** @private */
    particleCall(callback, k, level, pos)
    {
        // a callback that emits runs the create callback inside itself, which gets a view of its own so this one
        // keeps its particle; what the callback changes is written to the arrays as they are after it, since an
        // emit into a full emitter grows them
        const nested = render3DParticlesCalling.has(this);
        const view = nested ? render3DParticleView(this) : this.particleView, data = this.particleData;
        view.scale = this.particleView.scale; // a nested view's too
        view.pos.set(data[k], data[k+1], data[k+2]);
        view.velocity.set(data[k+3], data[k+4], data[k+5]);
        view.age = data[k+17], view.lifeTime = data[k+16], view.destroyed = false;
        render3DParticlesCalling.add(this);
        let result;
        try { result = callback(view, level, pos); }
        finally { nested || render3DParticlesCalling.delete(this); }
        const out = this.particleData;
        out[k] = view.pos.x, out[k+1] = view.pos.y, out[k+2] = view.pos.z;
        out[k+3] = view.velocity.x, out[k+4] = view.velocity.y, out[k+5] = view.velocity.z;
        if (view.destroyed)
            out[k+17] = max(out[k+17], out[k+16]); // its life lived: a step short of it can round to just under
        return result;
    }

    // stop the particle at k where its last move went into the level, from where it was: back at the surface, a hair
    // off it, its speed into it turned around by restitution and its speed along it kept by friction, unless the
    // collide callback lets it through; one that starts inside is let go, as a 2D one is; true when the callback
    // destroyed it
    /** @private */
    particleCollide(k, x, y, z)
    {
        let data = this.particleData;
        const from = render3DParticleFrom.set(x, y, z);
        const to = render3DParticleTo.set(data[k], data[k+1], data[k+2]);
        let hit, level;
        for (const l of render3DLevel)
        {
            const h = l.destroyed ? undefined : l.levelSegment3D(from, to);
            if (h && (!hit || h.distance < hit.distance))
                hit = h, level = l;
        }
        if (!hit) return false;
        const point = from.lerp(to, hit.distance);
        const callback = this.particleCollideCallback;
        if (callback && (!this.particleCall(callback, k, level, point.copy()) || this.particleView.destroyed))
            return this.particleView.destroyed; // let through, or destroyed by the callback
        data = this.particleData; // as the callback left it, an emit may have grown it

        const n = hit.normal, v = vec3(data[k+3], data[k+4], data[k+5]), into = n.scale(v.dot(n));
        // the larger friction of the two, as objects take it, then the emitter's own grip, which a level can not undo
        const restitution = max(this.restitution, level.restitution);
        const friction = max(this.friction, level.friction) * (1 - clamp(this.stick));
        const out = v.subtract(into).scale(friction).subtract(into.scale(restitution)), p = point.add(n.scale(1e-3));
        data[k] = p.x, data[k+1] = p.y, data[k+2] = p.z;
        data[k+3] = out.x, data[k+4] = out.y, data[k+5] = out.z;
        return false;
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
            render3DMeshUpload(quad);
            textureInfo = render3DTextureOf(texture);
            uv = render3DGetTileUVs(texture);
            lit = r.lighting;
            r.lighting = r.shadowPass && lit; // unlit on screen, in the shadow map the object's flag decides
            r.cullBackFaces = r.mirrored = false;
        }
        const cb = r.cameraBack;
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
                    // the quad's half axes, turned as drawBillboard turns them, doubled for billboardMesh's unit square
                    const a = render3DBillboardAxes(size, angle, false), k = render3DInstanceSlot(quad, textureInfo);
                    data = quad.instanceData;
                    data[k]    = a[0] * 2; data[k+1] = a[1] * 2; data[k+2]  = a[2] * 2; data[k+3]  = 0;
                    data[k+4]  = a[3] * 2; data[k+5] = a[4] * 2; data[k+6]  = a[5] * 2; data[k+7]  = 0;
                    data[k+8]  = cb.x;   data[k+9]  = cb.y;   data[k+10] = cb.z;   data[k+11] = 0;
                    data[k+12] = particles[p]; data[k+13] = particles[p+1]; data[k+14] = particles[p+2]; data[k+15] = 1;
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
// lens flare

// the shapes a flare is made of, white on clear on one smooth texture made the first time it is asked for: a soft
// glow, a flat disc with a brighter rim, a ring, a hexagon like the blades of a lens, a streak across, and a star
// of six rays; undefined headless or without a canvas
const render3DFlareShapes = ['glow', 'disc', 'ring', 'hex', 'streak', 'star'];
let render3DFlareTiles;
function render3DFlareTile(shape)
{
    if (!render3DFlareTiles)
    {
        if (headlessMode || !glContext || !canvasAvailable()) return;
        const cell = 128, shapes = render3DFlareShapes, context = createCanvasContext(cell * shapes.length, cell);
        // each shape is how see-through it is from its middle out
        const alpha =
        {
            glow: (t)=> engineGlowAlpha(t, 1),
            disc: (t)=> t < .8 ? .4 + .1 * t : t < .92 ? .48 + (t - .8) * 3 : (1 - t) / .08 * .84,
            ring: (t)=> max(0, 1 - abs(t - .86) / .12),
            hex: (t)=> t < .8 ? .4 + .1 * t : t < .92 ? .48 + (t - .8) * 3 : (1 - t) / .08 * .84,
            streak: (t)=> (1 - t) ** 1.5,
        };
        // a round gradient from the middle of the cell out, squashed for a ray and cut to a path for the hexagon
        const fill = (shape, r, path)=>
        {
            const steps = 32, gradient = context.createRadialGradient(0, 0, 0, 0, 0, r);
            for (let k = 0; k <= steps; ++k)
                gradient.addColorStop(k / steps, 'rgba(255,255,255,' + clamp(alpha[shape](k / steps)).toFixed(4) + ')');
            context.fillStyle = gradient;
            context.beginPath();
            path ? path() : context.arc(0, 0, r, 0, 2 * PI);
            context.fill();
        };
        const ray = (r, angle)=>
        {
            context.save();
            context.rotate(angle);
            context.scale(1, .07);
            fill('streak', r);
            context.restore();
        };
        shapes.forEach((shape, i)=>
        {
            const r = cell / 2 - 2;
            context.save();
            context.translate(i * cell + cell / 2, cell / 2);
            if (shape == 'hex')
            {
                // a gradient is round, so the hexagon is set pixel by pixel, by how far each is toward a side
                const image = context.createImageData(cell, cell), data = image.data, apothem = r * cos(PI / 6);
                for (let k = 0; k < cell * cell; ++k)
                {
                    const x = abs(k % cell + .5 - cell / 2), y = abs((k / cell | 0) + .5 - cell / 2);
                    const t = max(y, x * cos(PI / 6) + y / 2) / apothem;
                    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = 255;
                    data[k * 4 + 3] = t < 1 ? clamp(alpha.hex(t)) * 255 : 0;
                }
                context.putImageData(image, i * cell, 0);
            }
            else if (shape == 'streak')
                ray(r, 0);
            else if (shape == 'star')
            {
                for (let k = 3; k--;)
                    ray(r, k * PI / 3 + PI / 2);
                context.scale(.3, .3);
                fill('glow', r);
            }
            else
                fill(shape, r);
            context.restore();
        });
        const texture = new TextureInfo(context.canvas, true, false, false); // smooth even in a pixel art game
        render3DFlareTiles = new Map(shapes.map((shape, i)=>
            [shape, new TileInfo(vec2(i * cell, 0), vec2(cell), texture)]));
    }
    return render3DFlareTiles.get(shape) || render3DFlareTiles.get('glow');
}

/**
 * A part of a lens flare
 * @typedef {Object} LensFlareElement
 * @property {number} at - Where along the line: 0 the sun, 1 the middle of the screen, 2 as far past it
 * @property {number|Vector2} size - How big across, as a part of the screen's height, a vector for a part wider
 *  than it is tall
 * @property {Color} color - Its color, the alpha how bright
 * @property {string} [shape] - glow, disc, ring, hex, streak or star, a glow when left out
 * @property {TileInfo} [tileInfo] - A tile of the game's own to draw in place of a shape, best white on clear
 * @property {number} [angle] - How far it is turned, in radians
 * @memberof Render3D
 */

/**
 * LensFlare3D - The sun's lens flare, the old kind: a glow at the sun and a row of discs and rings of different
 * sizes along the line from the sun through the middle of the screen
 * - Make one and it shows, over the 3D scene and under what the game draws after, a HUD; destroy it to take it away
 * - It follows render3D.sunDirection, and fades out as the sun leaves the screen or goes behind something
 * - A Light3D gets one of its own with light.addFlare()
 * - flareSize, count, intensity and saturation set its look, seed picks another arrangement, and its color tints it,
 *   with the sun's own color; shapes says what its ghosts are, glowSize and ghostSize how big its parts are; or
 *   give it elements of your own, which may be tiles of the game's
 * - visible is how much of the sun shows, 0 to 1, eased over fadeTime, there for a game to read; it is 0 while the
 *   sun is too far off the screen for the flare to show, about a seventh of the screen past its edge, where nothing
 *   is tested
 * - What hides the sun is found with a ray from the camera, against the level and every object that is not see
 *   through, each on the triangles of its mesh, see render3D.pick; turn it off with occlusion
 * - It needs WebGL, and it draws nothing in the shadow of renderAfter2D
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * new LensFlare3D;                // the sun flares
 * new LensFlare3D(1.5, 10, .7, 0); // bigger, 10 ghosts, dimmer, all one color
 */
class LensFlare3D extends EngineObject3D
{
    /** Create the sun's lens flare
     *  @param {number} [size] - Scales every part of it, 1 by default
     *  @param {number} [count] - How many ghosts there are along the line, besides the glow at the sun
     *  @param {number} [intensity] - How bright it is
     *  @param {number} [saturation] - How colorful the ghosts are, 0 for all the flare's own color, 1 a rainbow
     *  @param {Color} [color] - Tints the whole flare, with the sun's color */
    constructor(size=1, count=7, intensity=1, saturation=1, color=WHITE)
    {
        super(vec3(), undefined, undefined, color);
        this.size3D = vec3(); // not a thing to pick or collect
        /** @property {number} - Scales every part of the flare */
        this.flareSize = size;
        /** @property {number} - How many ghosts there are along the line, besides the glow at the sun */
        this.count = count;
        /** @property {number} - How bright it is */
        this.intensity = intensity;
        /** @property {number} - How colorful the ghosts are, 0 for all the flare's own color, 1 a rainbow */
        this.saturation = saturation;
        /** @property {number} - Picks the arrangement of the ghosts, another seed is another flare */
        this.seed = 1;
        /** @property {Array<string>|undefined} - The shapes the ghosts are picked from, glow, disc, ring, hex,
         *  streak or star: ['hex'] makes every ghost a hexagon, and a shape listed twice is picked twice as often;
         *  discs, rings and glows when not set
         *  @type {Array<string>|undefined} */
        this.shapes = undefined;
        /** @property {number} - Scales the glow at the sun, 0 for none */
        this.glowSize = 1;
        /** @property {number} - Scales the ghosts */
        this.ghostSize = 1;
        /** @property {Array<LensFlareElement>|undefined} - The parts of the flare, to set your own in place of the
         *  ones made from count, seed, saturation, shapes, glowSize and ghostSize
         *  @type {Array<LensFlareElement>|undefined} */
        this.elements = undefined;
        /** @property {Light3D|undefined} - A light the flare is of in place of the sun, a lamp or a spotlight: the
         *  flare is at the light and in its color, smaller from farther than the light reaches, hidden by what is
         *  in front of the light but its lamp, a mesh around it whose surface is near it, and a spotlight's
         *  shows from inside its beam only; a DirectionalLight3D's is far
         *  away where it shines from, like the sun's; the flare is destroyed when its light is; light.addFlare
         *  sets this
         *  @type {Light3D|undefined} */
        this.light = undefined;
        /** @property {boolean} - Fade out when something is between the camera and the sun */
        this.occlusion = true;
        /** @property {number} - Seconds the flare takes to fade out or in when the sun is hidden or shows again */
        this.fadeTime = .15;
        /** @property {number} - How much of the sun shows, 0 hidden, off the screen or behind the camera to 1 in
         *  plain view, eased */
        this.visible = 1;
        this.renderOrder = 1e9; // over the game's sprites, it is light in the lens
        this.madeKey = '';
        /** @type {Array<LensFlareElement>} */
        this.made = [];
    }

    /** The parts of the flare: the elements set by hand, or the ones made from count, seed, saturation, shapes,
     *  glowSize and ghostSize, a glow and a core at the sun and the ghosts, made again when one of those changes
     *  @return {Array<LensFlareElement>} */
    getElements()
    {
        if (this.elements) return this.elements;
        const shapes = this.shapes?.length ? this.shapes : undefined, glow = this.glowSize, ghost = this.ghostSize;
        const key = [this.count, this.seed, this.saturation, glow, ghost, shapes?.length, shapes].join();
        if (key !== this.madeKey)
        {
            const random = new RandomGenerator(this.seed * 7919 + 1), s = clamp(this.saturation);
            /** @type {Array<LensFlareElement>} */
            const made = this.made = glow > 0 ? [
                {at: 0, size: .7 * glow, color: hsl(0, 0, 1, .5), shape: 'glow'},
                {at: 0, size: .25 * glow, color: hsl(0, 0, 1, .9), shape: 'glow'}] : [];
            for (let i = 0; i < this.count; ++i)
            {
                // spread along the line, each a place of its own, the far ones bigger
                const at = (i + random.float(.2, .8)) / max(this.count, 1) * 1.9 + .2;
                const pick = random.float(), shape = shapes ? shapes[min(pick * shapes.length | 0, shapes.length - 1)] :
                    pick < .5 ? 'disc' : pick < .8 ? 'ring' : 'glow';
                made.push({at, size: random.float(.04, .1) * (1 + at) * ghost, shape,
                    color: hsl(random.float(), s * .9, .6, random.float(.15, .4))});
            }
            this.madeKey = key;
        }
        return this.made;
    }

    /** What the flare is of, seen from the camera: the way to it, how far it is, Infinity for the sun and for a
     *  directional light, which shines from its place toward the origin, and a point to find it on the screen by;
     *  undefined with no direction, or a light that is gone or at the camera
     *  @return {{direction: Vector3, distance: number, pos: Vector3}|undefined}
     *  @ignore */
    flareSource()
    {
        const camera = render3D.camera.pos, light = this.light;
        if (light?.destroyed) return;
        if (!light || light.directional)
        {
            const from = light ? light.getWorldPos3D() : render3D.sunDirection;
            if (!from.lengthSquared()) return;
            const direction = from.normalize();
            return {direction, distance: Infinity, pos: camera.add(direction.scale(100))};
        }
        const pos = light.getWorldPos3D(), offset = pos.subtract(camera), distance = offset.length();
        return distance ? {direction: offset.scale(1 / distance), distance, pos} : undefined;
    }

    /** How the flare would show with nothing in the way: where its source is on the screen, how strong it is there,
     *  fading as it leaves the screen, its tint and the height its sizes are parts of; undefined when it would not
     *  show at all, behind the camera, off the screen, or of a light that is off or seen from outside its cone
     *  @return {{sun: Vector2, center: Vector2, strength: number, tint: Color, height: number}|undefined}
     *  @ignore */
    flareLook()
    {
        const source = this.flareSource(), center = mainCanvasSize.scale(.5);
        const sun = source && render3D.worldToScreen(source.pos);
        if (!sun || !center.x || !center.y) return;
        // it fades as the sun leaves the screen, gone .3 of half the screen past the edge
        const off = max(abs(sun.x - center.x) / center.x, abs(sun.y - center.y) / center.y);
        const strength = clamp((1.3 - off) / .5) * this.intensity;
        if (!(strength > 0)) return;
        let tint = this.color.multiply(render3D.sunColor), height = mainCanvasSize.y * this.flareSize;
        const light = this.light;
        if (light)
        {
            // a light's flare is the light's color, as bright as the light up to 1, and only from inside its cone
            const cone = render3DLightCone(light), d = source.direction;
            const inCone = clamp(-(cone[0] * d.x + cone[1] * d.y + cone[2] * d.z) - cone[3]);
            const c = light.color, bright = c.a * clamp(light.intensity) * inCone;
            if (!(bright > 0)) return;
            tint = this.color.multiply(rgb(c.r, c.g, c.b, bright));
            if (!light.directional)
                height *= min(1, light.radius / source.distance); // smaller from farther than it reaches
        }
        return height > 0 ? {sun, center, strength, tint, height} : undefined;
    }

    /** Where the sun, or the flare's light, is on the screen, in pixels like mousePosScreen, undefined when it is
     *  behind the camera
     *  @return {Vector2|undefined} */
    getScreenPos()
    {
        const source = this.flareSource();
        return source && render3D.worldToScreen(source.pos);
    }

    /** The parts of the flare as they are drawn now: each one's place on the screen, its size in pixels, a vector
     *  when the element's is, and its color, dimmed by how much of the sun shows; empty when there is nothing to draw
     *  @return {Array<{pos: Vector2, size: number|Vector2, color: Color, shape: string|undefined,
     *      tileInfo: TileInfo|undefined, angle: number}>} */
    getScreenElements()
    {
        const look = this.visible > 0 && this.flareLook();
        if (!look) return [];
        const {sun, center, tint, height} = look, strength = look.strength * this.visible;
        return this.getElements().map((e)=>
        {
            const c = e.color.multiply(tint);
            // along the line and past the middle, a lerp would stop there
            const size = typeof e.size == 'number' ? e.size * height : e.size.scale(height);
            return {pos: sun.add(center.subtract(sun).scale(e.at)), size, shape: e.shape, tileInfo: e.tileInfo,
                angle: e.angle || 0, color: rgb(c.r, c.g, c.b, c.a * strength)};
        });
    }

    /** Is something between the camera and the sun, or the flare's light: the level, or an object that is not see
     *  through, hit on its triangles as render3D.pick hits it, so a mesh the camera is inside hides nothing unless
     *  it is doubleSided
     *  @return {boolean} */
    isHidden()
    {
        const source = this.flareSource();
        if (!source) return true;
        const ray = new Ray3D(render3D.camera.pos, source.direction), reach = source.distance;
        const blockers = engineObjects.filter((o)=> o !== this && o instanceof EngineObject3D && !o.destroyed &&
            !o.transparent && !o.additive);
        // a voxel map says block by block what is see through: glass, water and leaves let the sun by, and the
        // ray goes on to the blocks behind them
        const maps = /** @type {Array<VoxelMap>} */ (typeof VoxelMap == 'undefined' ? [] :
            blockers.filter((o)=> o instanceof VoxelMap));
        for (const map of maps)
            if (map.raycast(ray, reach, (type)=> !map.blockType(type).seeThrough))
                return true;
        // a light's lamp, a mesh around the light, does not hide it: one whose box, in its own space, the light is in,
        // hit close to the light, as a shade or a globe is, and small, its thinnest side no more than twice that; a
        // room or a whole level holds its lights too, and its walls do hide them from outside, even one close behind
        const inside = (o)=>
        {
            if (!o.mesh || o instanceof HeightMap) return false;
            const matrix = render3DObjectMatrix(o), b = o.mesh.bounds || o.mesh.getBounds();
            const m = matrix.m, scale = (k)=> hypot(m[k], m[k + 1], m[k + 2]); // each axis's own stretch
            const thinnest = min((b.max.x - b.min.x) * scale(0), (b.max.y - b.min.y) * scale(4), (b.max.z - b.min.z) * scale(8));
            if (!matrix.determinant() || thinnest > near * 2) return false;
            const p = matrix.copy().invert().transformPoint(source.pos);
            return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y &&
                p.z >= b.min.z && p.z <= b.max.z;
        };
        const near = this.light && reach < Infinity ? min(2, this.light.radius * .4) : 0;
        let candidates = blockers.filter((o)=> !maps.some((map)=> map === o));
        for (let tries = 5; tries--;)
        {
            const hit = render3D.pick(ray, candidates);
            if (!hit || hit.distance >= reach) return false;
            if (!(reach - hit.distance <= near && inside(hit.object))) return true;
            candidates = candidates.filter((o)=> o !== hit.object); // its lamp, look past it
        }
        return true; // lamps on lamps, take it as hidden
    }

    /** Ease visible toward whether the sun shows, called automatically each frame; a flare that would not show
     *  wherever the sun is, off the screen or its light off, looks for nothing in the way */
    update()
    {
        super.update();
        if (this.light?.destroyed)
            return this.destroy(); // the flare of a light that is gone
        const shows = !!this.flareLook() && !(this.occlusion && this.isHidden());
        const step = this.fadeTime > 0 ? timeDelta / this.fadeTime : 1;
        this.visible = clamp(this.visible + (shows ? step : -step));
    }

    /** Draw the flare over the 3D scene, added onto it, called automatically in the 2D pass */
    render()
    {
        if (headlessMode || !glEnable) return;
        const elements = this.getScreenElements();
        if (!elements.length) return;
        setAdditiveBlendMode(true);
        for (const e of elements)
        {
            const tileInfo = e.tileInfo || render3DFlareTile(e.shape);
            const size = typeof e.size == 'number' ? vec2(e.size) : e.size;
            tileInfo && drawTile(e.pos, size, tileInfo, e.color, e.angle, false, undefined, true, true);
        }
        setAdditiveBlendMode(false);
    }

    /** A flare has nothing to draw in the 3D pass */
    render3D() {}
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
    // any line end, a line carried on by a backslash at its end, and a comment after what a line holds
    for (const line of text.replace(/\\\r?\n/g, ' ').split(/\r\n?|\n/))
    {
        const parts = line.replace(/#.*/, '').trim().split(/\s+/);
        switch (parts[0])
        {
            case 'v':  positions.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vn': normals.push(vec3(+parts[1], +parts[2], +parts[3])); break;
            case 'vt': uvs.push(vec2(+parts[1], 1 - (+parts[2] || 0))); break; // v runs up and is 0 left out
            case 'f':
            {
                const corners = parts.slice(1).map(c=> c.split('/'));
                if (corners.length < 3) break;
                const facePoints = corners.map(c=> lookup(c[0], positions));
                ASSERT(facePoints.every(isVector3), 'OBJ face uses a vertex index the file does not have', line);
                if (!facePoints.every(isVector3)) break; // a release build leaves the face out
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
    const response = await loadFetch(url, 'loadOBJ');
    if (!response.ok)
        throw new Error(`loadOBJ: could not load ${url}, ${response.status} ${response.statusText}`);
    const text = await response.text(), mesh = parseOBJ(text, smooth);
    // a mesh of nothing draws nothing, so it says why, a web page being what a dev server sends for a mistyped path
    mesh.points.length || console.warn('loadOBJ: ' + url + ' has no faces' +
        (loadIsWebPage(text) ? ', it is a web page, so the path may be wrong' : ''));
    return mesh;
}

///////////////////////////////////////////////////////////////////////////////
// CSG: union, subtract and intersect of closed meshes with BSP trees, after Evan Wallace's csg.js (MIT license);
// the trees are walked with stacks, so a deep one can not overflow the call stack

const RENDER3D_CSG_EPSILON = 1e-5; // closer than this to a plane counts as on it

// a vertex of a CSG polygon, its values lerped where a cut splits an edge
class Render3DCSGVertex
{
    constructor(pos, normal, uv, color) { this.pos = pos; this.normal = normal; this.uv = uv; this.color = color; }
    lerp(v, t)
    { return new Render3DCSGVertex(this.pos.lerp(v.pos, t), this.normal.lerp(v.normal, t), this.uv.lerp(v.uv, t), this.color.lerp(v.color, t)); }
    flipped() { return new Render3DCSGVertex(this.pos, this.normal.scale(-1), this.uv, this.color); }
}

// a convex polygon, its vertices counter clockwise from the front, and the plane it lies on
class Render3DCSGPolygon
{
    constructor(vertices, plane) { this.vertices = vertices; this.plane = plane; }
    flipped()
    {
        const plane = {normal: this.plane.normal.scale(-1), w: -this.plane.w};
        return new Render3DCSGPolygon(this.vertices.map(v=> v.flipped()).reverse(), plane);
    }
}

// a node of a BSP tree: a plane, the polygons that lie on it, and the trees in front of and behind it
class Render3DCSGNode
{
    constructor()
    {
        this.plane = undefined;
        this.front = undefined;
        this.back = undefined;
        this.polygons = [];
    }
}

// the plane through three points, facing the side they run counter clockwise from, undefined when they are in a
// line, or so nearly that the plane would lean any way
function render3DCSGPlane(a, b, c)
{
    const n = b.subtract(a).cross(c.subtract(a));
    if (n.lengthSquared() < 1e-18) return;
    const normal = n.normalize();
    return {normal, w: normal.dot(a)};
}

// sort a polygon against a plane into the lists, cutting it in two when it spans the plane
function render3DCSGSplit(plane, polygon, coplanarFront, coplanarBack, front, back)
{
    const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
    const {normal, w} = plane, vertices = polygon.vertices, types = [];
    let polygonType = COPLANAR;
    for (const v of vertices)
    {
        const t = normal.dot(v.pos) - w;
        const type = t < -RENDER3D_CSG_EPSILON ? BACK : t > RENDER3D_CSG_EPSILON ? FRONT : COPLANAR;
        polygonType |= type;
        types.push(type);
    }
    if (polygonType === COPLANAR)
        (normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
    else if (polygonType === FRONT)
        front.push(polygon);
    else if (polygonType === BACK)
        back.push(polygon);
    else
    {
        const f = [], b = [];
        for (let i = 0; i < vertices.length; ++i)
        {
            const j = (i + 1) % vertices.length, ti = types[i], tj = types[j], vi = vertices[i], vj = vertices[j];
            if (ti !== BACK) f.push(vi);
            if (ti !== FRONT) b.push(vi);
            if ((ti | tj) === SPANNING)
            {
                const v = vi.lerp(vj, (w - normal.dot(vi.pos)) / normal.dot(vj.pos.subtract(vi.pos)));
                f.push(v);
                b.push(v);
            }
        }
        f.length >= 3 && front.push(new Render3DCSGPolygon(f, polygon.plane));
        b.length >= 3 && back.push(new Render3DCSGPolygon(b, polygon.plane));
    }
}

// every node of a tree
function render3DCSGNodes(root)
{
    const nodes = [], stack = [root];
    while (stack.length)
    {
        const node = stack.pop();
        nodes.push(node);
        node.front && stack.push(node.front);
        node.back && stack.push(node.back);
    }
    return nodes;
}

// add polygons to a tree, each node splitting what reaches it by its plane
function render3DCSGBuild(root, polygons)
{
    const stack = [[root, polygons]];
    while (stack.length)
    {
        const [node, list] = stack.pop();
        if (!list.length) continue;
        node.plane ||= list[0].plane;
        const front = [], back = [];
        for (const polygon of list)
            render3DCSGSplit(node.plane, polygon, node.polygons, node.polygons, front, back);
        front.length && stack.push([node.front ||= new Render3DCSGNode, front]);
        back.length && stack.push([node.back ||= new Render3DCSGNode, back]);
    }
}

// turn the solid a tree bounds inside out, its planes facing the other way
function render3DCSGInvert(root)
{
    for (const node of render3DCSGNodes(root))
    {
        node.plane &&= {normal: node.plane.normal.scale(-1), w: -node.plane.w};
        [node.front, node.back] = [node.back, node.front];
    }
}

// the parts of the polygons outside the solid a tree bounds
function render3DCSGClipPolygons(root, polygons)
{
    const result = [], stack = [[root, polygons]];
    while (stack.length)
    {
        const [node, list] = stack.pop();
        if (!node.plane)
        {
            for (const polygon of list) result.push(polygon);
            continue;
        }
        const front = [], back = [];
        for (const polygon of list)
            render3DCSGSplit(node.plane, polygon, front, back, front, back);
        if (node.front)
            stack.push([node.front, front]);
        else
            for (const polygon of front) result.push(polygon);
        node.back && stack.push([node.back, back]); // behind a leaf is inside the solid, and goes
    }
    return result;
}

// the polygons split into the parts inside the box around the other polygons and the parts beyond it, a polygon
// that reaches into the box cut at its faces, so the cuts made inside it stay inside it; a part on a face, within
// the epsilon, counts as inside
function render3DCSGNear(polygons, polygonsOther)
{
    const lo = vec3(Infinity), hi = vec3(-Infinity);
    for (const polygon of polygonsOther)
    for (const {pos} of polygon.vertices)
    {
        lo.x = min(lo.x, pos.x); lo.y = min(lo.y, pos.y); lo.z = min(lo.z, pos.z);
        hi.x = max(hi.x, pos.x); hi.y = max(hi.y, pos.y); hi.z = max(hi.z, pos.z);
    }
    // the box's faces as planes facing out, a part in front of any of them is beyond it
    const near = [], far = [];
    const faces = [[vec3(1, 0, 0), hi.x], [vec3(-1, 0, 0), -lo.x], [vec3(0, 1, 0), hi.y],
        [vec3(0, -1, 0), -lo.y], [vec3(0, 0, 1), hi.z], [vec3(0, 0, -1), -lo.z]];
    const e = RENDER3D_CSG_EPSILON;
    for (const polygon of polygons)
    {
        // wholly beyond a face, as most of a mesh cut many times is, it is far as it is: splitting it at the faces
        // before would only cut it into parts that all end up far too
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (const {pos} of polygon.vertices)
        {
            x0 = min(x0, pos.x); y0 = min(y0, pos.y); z0 = min(z0, pos.z);
            x1 = max(x1, pos.x); y1 = max(y1, pos.y); z1 = max(z1, pos.z);
        }
        if (x0 > hi.x + e || x1 < lo.x - e || y0 > hi.y + e || y1 < lo.y - e || z0 > hi.z + e || z1 < lo.z - e)
        {
            far.push(polygon);
            continue;
        }
        let inside = [polygon];
        for (const [normal, w] of faces)
        {
            const next = [];
            for (const part of inside)
                render3DCSGSplit({normal, w}, part, next, next, far, next);
            inside = next;
        }
        for (const part of inside) near.push(part);
    }
    return [near, far];
}

// a function giving a point the first point it was given within distance of it, or the point itself when there is
// none, through a grid of cells that size, so points closer than distance come out as one
function render3DCSGPlacer(distance)
{
    const cells = new Map, cellKey = (x, y, z)=> x + ',' + y + ',' + z;
    return (p)=>
    {
        const cx = floor(p.x / distance), cy = floor(p.y / distance), cz = floor(p.z / distance);
        for (let x = cx - 1; x <= cx + 1; ++x)
        for (let y = cy - 1; y <= cy + 1; ++y)
        for (let z = cz - 1; z <= cz + 1; ++z)
            for (const q of cells.get(cellKey(x, y, z)) || [])
                if (q.distanceSquared(p) < distance ** 2)
                    return q;
        const k = cellKey(cx, cy, cz);
        cells.has(k) || cells.set(k, []);
        cells.get(k).push(p);
        return p;
    };
}

// whether an indexed mesh is closed around an inside: the areas of a closed surface, each facing out, add up to
// nothing, and an opening or a face turned the wrong way leaves an area over; CSG run on its own results can leave
// gaps a few epsilons wide, which come to next to nothing, so a sliver of the whole is allowed
function render3DMeshIsClosed(mesh)
{
    const points = mesh.points, indices = mesh.indices;
    let x = 0, y = 0, z = 0, total = 0;
    for (let t = 0; t < indices.length; t += 3)
    {
        const a = points[indices[t]], n = points[indices[t + 1]].subtract(a).cross(points[indices[t + 2]].subtract(a));
        x += n.x, y += n.y, z += n.z;
        total += n.length();
    }
    return total > 0 && hypot(x, y, z) <= total * 1e-4;
}

// the triangles of a closed mesh placed by a matrix, as CSG polygons
function render3DCSGPolygons(mesh, matrix)
{
    ASSERT(mesh instanceof Mesh, 'CSG takes a Mesh');
    ASSERT(!mesh.doubleSided, 'CSG needs closed meshes, a doubleSided one like buildGrid has no inside');
    const list = new Mesh().combine(mesh, matrix).toIndexed();
    ASSERT(!list.points.length || render3DMeshIsClosed(list), 'CSG needs closed meshes, every edge shared by two triangles');
    const vertex = (i)=> new Render3DCSGVertex(list.points[i], list.normals[i], list.uvs[i], list.colors[i]);
    const polygons = [];
    for (let t = 0; t < list.indices.length; t += 3)
    {
        const i = list.indices[t], j = list.indices[t + 1], k = list.indices[t + 2];
        const plane = render3DCSGPlane(list.points[i], list.points[j], list.points[k]);
        plane && polygons.push(new Render3DCSGPolygon([vertex(i), vertex(j), vertex(k)], plane)); // no area, no face
    }
    return polygons;
}

// a mesh from CSG polygons: points close together made one, and each edge given the points other polygons have
// along it, so neighbors meet at every point with no crack between them; each polygon then as a fan of triangles
function render3DCSGMesh(polygons)
{
    // points within the epsilon made one, the first found standing for the rest; moving one any farther would take
    // it off its plane by more than the epsilon, and the next cut through it would split it again; a point on an
    // edge, whose ends may each have moved that far, is looked for a few times that far from its line
    const reach = RENDER3D_CSG_EPSILON * 4, placer = render3DCSGPlacer(RENDER3D_CSG_EPSILON), placed = new Set;
    const cellKey = (x, y, z)=> x + ',' + y + ',' + z;
    const place = (p)=>
    {
        const q = placer(p);
        placed.add(q); // polygons share points, so one can be placed more than once
        return q;
    };
    const loops = polygons.map(polygon=>
    {
        const loop = [];
        for (const v of polygon.vertices)
        {
            const pos = place(v.pos);
            if (loop.length && loop[loop.length - 1].pos === pos) continue; // a sliver edge closed up
            loop.push(new Render3DCSGVertex(pos, v.normal, v.uv, v.color));
        }
        loop.length > 1 && loop[0].pos === loop[loop.length - 1].pos && loop.pop();
        return loop;
    });

    // the places in a coarser grid, sized so a cell holds a few, to find the ones lying along each edge
    const places = [...placed];
    let lo = vec3(Infinity), hi = vec3(-Infinity);
    for (const p of places)
    {
        lo = vec3(min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z));
        hi = vec3(max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z));
    }
    const span = places.length ? max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) : 0;
    const size = max(span / Math.cbrt(places.length || 1), reach), grid = new Map;
    const gridKey = (p)=> cellKey(floor((p.x - lo.x) / size), floor((p.y - lo.y) / size), floor((p.z - lo.z) / size));
    for (const p of places)
    {
        const k = gridKey(p);
        grid.has(k) || grid.set(k, []);
        grid.get(k).push(p);
    }
    const onEdge = (a, b)=>
    {
        // the places strictly between a and b, within reach of the line, in order from a
        const found = [], ab = b.subtract(a), length2 = ab.lengthSquared();
        const x0 = floor((min(a.x, b.x) - lo.x - reach) / size), x1 = floor((max(a.x, b.x) - lo.x + reach) / size);
        const y0 = floor((min(a.y, b.y) - lo.y - reach) / size), y1 = floor((max(a.y, b.y) - lo.y + reach) / size);
        const z0 = floor((min(a.z, b.z) - lo.z - reach) / size), z1 = floor((max(a.z, b.z) - lo.z + reach) / size);
        for (let x = x0; x <= x1; ++x)
        for (let y = y0; y <= y1; ++y)
        for (let z = z0; z <= z1; ++z)
            for (const p of grid.get(cellKey(x, y, z)) || [])
            {
                if (p === a || p === b) continue;
                const t = p.subtract(a).dot(ab) / length2;
                if (t <= 0 || t >= 1) continue;
                if (a.add(ab.scale(t)).distanceSquared(p) < reach ** 2)
                    found.push([t, p]);
            }
        return found.sort((f, g)=> f[0] - g[0]);
    };

    // the mesh, each vertex once: vertices at one place that are the same in every value are shared
    const mesh = new Mesh, shared = new Map;
    mesh.indices = [];
    const vertexIndex = (v)=>
    {
        const n = v.normal.lengthSquared() ? v.normal.normalize() : RENDER3D_DEFAULT_NORMAL, c = v.color;
        const key = [n.x, n.y, n.z, v.uv.x, v.uv.y, c.r, c.g, c.b, c.a].map(x=> round(x * 1e6)).join();
        let atPlace = shared.get(v.pos), i;
        atPlace || shared.set(v.pos, atPlace = new Map);
        if ((i = atPlace.get(key)) === undefined)
        {
            atPlace.set(key, i = mesh.points.length);
            mesh.points.push(v.pos.copy());
            mesh.normals.push(n);
            mesh.uvs.push(v.uv.copy());
            mesh.colors.push(c.copy());
        }
        return i;
    };

    // each loop with the points along its edges put in, as a fan
    for (const loop of loops)
    {
        if (loop.length < 3) continue;
        const full = [];
        for (let i = 0; i < loop.length; ++i)
        {
            const a = loop[i], b = loop[(i + 1) % loop.length];
            full.push(a);
            for (const [t, p] of onEdge(a.pos, b.pos))
            {
                const v = a.lerp(b, t);
                full.push(new Render3DCSGVertex(p, v.normal, v.uv, v.color));
            }
        }
        // a polygon with no area, its points in a line, is no surface, and its neighbors have its points along
        // their edges, so it goes
        const n = full.length, pos = (i)=> full[i % n].pos;
        let area = vec3();
        for (let j = 1; j < n - 1; ++j)
            area = area.add(pos(j).subtract(pos(0)).cross(pos(j + 1).subtract(pos(0))));
        if (area.lengthSquared() < 1e-18) continue;

        // cut off one corner at a time, one that makes a triangle with some area with its neighbors and leaves the
        // rest some area too, so the points put in along the sides make no flat triangles; areas add, so what is
        // left is the whole less the corner
        const ring = full.map(v=> ({pos: v.pos, id: vertexIndex(v)}));
        const earArea = (i)=>
        {
            const a = ring[(i + ring.length - 1) % ring.length].pos, b = ring[i].pos, c = ring[(i + 1) % ring.length].pos;
            return b.subtract(a).cross(c.subtract(a));
        };
        while (ring.length > 3)
        {
            let i = ring.findIndex((_, i)=>
            {
                const ear = earArea(i);
                return ear.lengthSquared() >= 1e-18 && area.subtract(ear).lengthSquared() >= 1e-18;
            });
            i < 0 && (i = 0); // no corner leaves area, a sliver, cut off the first
            area = area.subtract(earArea(i));
            mesh.indices.push(ring[(i + ring.length - 1) % ring.length].id, ring[i].id, ring[(i + 1) % ring.length].id);
            ring.splice(i, 1);
        }
        mesh.indices.push(ring[0].id, ring[1].id, ring[2].id);
    }
    mesh.dirty = true;
    return mesh;
}

// a new mesh of a and b placed by matrix: 0 their union, 1 a with b cut out, 2 what is in both
// - csg.js's steps with the polygons kept in lists: the trees only tell inside from outside, and only the polygons
//   that reach into the other mesh's box are cut, one beyond it is all outside and is kept or dropped whole, so a
//   shape cut again and again only splits where each cut is
// - the clip twice through the same tree, with a flip between, drops the one of two coplanar faces that would
//   double up
function render3DMeshCSG(a, b, matrix, operation)
{
    const polygonsA = render3DCSGPolygons(a), polygonsB = render3DCSGPolygons(b, matrix);
    const [nearA, farA] = render3DCSGNear(polygonsA, polygonsB), [nearB, farB] = render3DCSGNear(polygonsB, polygonsA);
    const treeA = new Render3DCSGNode, treeB = new Render3DCSGNode;
    render3DCSGBuild(treeA, polygonsA);
    render3DCSGBuild(treeB, polygonsB);
    const clip = render3DCSGClipPolygons, flip = (list)=> list.map(polygon=> polygon.flipped());
    let polygons;
    if (operation === 0)
    {
        // each outside the other
        polygons = [...farA, ...clip(treeB, nearA), ...farB, ...flip(clip(treeA, flip(clip(treeA, nearB))))];
    }
    else if (operation === 1)
    {
        // a outside b, and b inside a turned to face out
        render3DCSGInvert(treeA);
        polygons = [...farA, ...flip(clip(treeB, flip(nearA))), ...clip(treeA, flip(clip(treeA, nearB)))];
    }
    else
    {
        // each inside the other
        render3DCSGInvert(treeA);
        render3DCSGInvert(treeB);
        polygons = [...flip(clip(treeB, flip(nearA))), ...flip(clip(treeA, flip(clip(treeA, nearB))))];
    }
    return render3DCSGMesh(polygons);
}
