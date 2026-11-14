import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 13 of 2026-11-14: the 3D slope rule on both colliders (a V, a curb, a cliff a jump can not climb, a small
// groundAngle on a hill), the 2D stuck path (standing up under a ceiling, a tiny box in a wall, a spawn inside tiles,
// a box resting in a one way margin), a stack on a lift, and loadAtlas with trimmed and oversize frames

// a 3D scene: a body and a level, a height map's mesh or the map itself, stepped; returns what the body did
function scene3D({level, body='[1, 2, 1]', start='vec3(0, 8, 0)', frames=240, each='', groundAngle})
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        headlessMode = true; new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
        const heightMap = (profile)=>
        {
            const n = 81, heights = [];
            for (let j = 0; j < n; ++j)
            {
                const row = [];
                for (let i = 0; i < n; ++i) row.push(profile((i / (n - 1) - .5) * 40) / 20);
                heights.push(row);
            }
            return new HeightMap(heights, vec2(40), 20, undefined, vec3(), false);
        };
        const meshOf = (map)=> { const level = new MeshCollider(map.mesh); map.destroy(true); return level; };
        ${level}
        const o = new EngineObject3D(${start}, buildBox());
        o.size3D = vec3(...${body});
        o.setCollision(false, false, true);
        o.mass = 1; o.restitution = 0;
        ${groundAngle === undefined ? '' : `o.groundAngle = ${groundAngle};`}
        let lowest = Infinity, highest = -Infinity, grounded = 0, jumps = 0;
        for (let i = 0; i < ${frames}; ++i)
        {
            ${each}
            engineObjectsUpdate();
            lowest = Math.min(lowest, o.pos3D.y), highest = Math.max(highest, o.pos3D.y);
            o.groundObject && ++grounded;
        }
        return JSON.stringify({lowest, highest, grounded, jumps, x: o.pos3D.x});
    })()`));
}
const gully = (deg, cap=15)=> `const level = meshOf(heightMap((x)=> Math.min(Math.abs(x) * Math.tan(${deg} * PI / 180), ${cap})));`;
const gullyMap = (deg, cap=15)=> `heightMap((x)=> Math.min(Math.abs(x) * Math.tan(${deg} * PI / 180), ${cap}));`;

test('a body in a V between two steep MeshCollider faces stays at its bottom, still or walking across', ()=>
{
    for (const deg of [50, 60, 75])
    for (const each of ['', 'o.velocity3D.x = .1;'])
    {
        const r = scene3D({level: gully(deg), each});
        assert.ok(r.lowest > -1, `${deg} degrees ${each || 'still'}: lowest ${r.lowest}`);
    }
    // two slabs leaning together
    const r = scene3D({level: `const a = 60 * PI / 180, mesh = new Mesh;
        mesh.combine(buildBox(vec3(20, 1, 10)), buildMatrix(vec3(-Math.cos(a) * 10, Math.sin(a) * 10 - .5, 0), vec3(0, 0, -a)));
        mesh.combine(buildBox(vec3(20, 1, 10)), buildMatrix(vec3(Math.cos(a) * 10, Math.sin(a) * 10 - .5, 0), vec3(0, 0, a)));
        new MeshCollider(mesh);`});
    assert.ok(r.lowest > -1, 'the wedge: lowest ' + r.lowest);
});

test('a curb lower than a body\'s step is walked over on both colliders, a long steep slope stops it', ()=>
{
    // a rise of .3 over a quarter cell, 50 degrees, from x 0
    const curb = 'heightMap((x)=> x < 0 ? 0 : Math.min(x / .25, 1) * .3)';
    for (const kind of ['height', 'mesh'])
    {
        const level = kind === 'height' ? curb + ';' : `meshOf(${curb});`;
        const r = scene3D({level, start: 'vec3(-3, 1.01, 0)', each: 'o.velocity3D.x = .1;'});
        assert.ok(r.x > 4 && r.highest > 1.25, `${kind} curb: x ${r.x}, highest ${r.highest}`);
        const cliff = 'heightMap((x)=> x < 0 ? 0 : Math.min(x * Math.tan(60 * PI / 180), 6))';
        const c = scene3D({level: kind === 'height' ? cliff + ';' : `meshOf(${cliff});`, start: 'vec3(-3, 1.01, 0)',
            each: 'o.velocity3D.x = .15;'});
        assert.ok(c.highest < 2, `${kind} 60 degree slope: highest ${c.highest}`);
    }
});

test('steep HeightMap ground is not ground: a jump whenever grounded does not climb a cliff', ()=>
{
    for (const kind of ['height', 'mesh'])
    {
        const cliff = 'heightMap((x)=> x < 0 ? 0 : Math.min(x * Math.tan(60 * PI / 180), 15))';
        const r = scene3D({level: kind === 'height' ? cliff + ';' : `meshOf(${cliff});`, start: 'vec3(-3, 1.01, 0)',
            frames: 360, each: 'o.velocity3D.x = .15; o.groundObject && (o.velocity3D.y = .3);'});
        assert.ok(r.highest < 6, `${kind}: highest ${r.highest}`);
    }
});

test('with a small groundAngle a ball rolls up a gentle HeightMap hill as on a MeshCollider of it', ()=>
{
    const hill = 'heightMap((x)=> x < 0 ? 0 : Math.min(x * Math.tan(10 * PI / 180), 2))';
    for (const kind of ['height', 'mesh'])
    {
        const r = scene3D({level: kind === 'height' ? hill + ';' : `meshOf(${hill});`, body: '[1, 1, 1]',
            start: 'vec3(-3, .51, 0)', groundAngle: .05, each: 'o.velocity3D.x = .15;'});
        assert.ok(r.x > 8, `${kind}: x ${r.x}`);
    }
});

// a 2D scene of tiles: a floor along row 0, cells listed, and an object; returns where it ended
function scene2D(cells, object, frames=120, each='')
{
    const { run } = loadEngine();
    return JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        setGravity(vec2(0, -.02));
        const layer = new TileCollisionLayer(vec2(), vec2(20, 12), tile(), 0, false);
        for (let x = 0; x < 20; ++x) layer.setCollisionData(vec2(x, 0), 1);
        for (const [x, y] of ${JSON.stringify(cells)}) layer.setCollisionData(vec2(x, y), 1);
        ${object}
        o.setCollision();
        for (let i = 0; i < ${frames}; ++i) { ${each} engineObjectsUpdate(); }
        return JSON.stringify({x: o.pos.x, y: o.pos.y, bottom: o.pos.y - o.size.y / 2});
    })()`));
}

test('a player stood up under a low ceiling, at any place along it, lands and walks out on the floor', ()=>
{
    // a ceiling over x 4 to 7 at row 2, its bottom at 2; the player 1.9 tall stands up from 1 tall
    const ceiling = [[4, 2], [5, 2], [6, 2], [7, 2]];
    for (const x of [5.5, 5.3, 5.1, 5, 4.9, 4.75])
    {
        const r = scene2D(ceiling, `const o = new EngineObject(vec2(${x}, 1.5), vec2(1)); o.size = vec2(1, 1.9);
            o.pos.y = 1 + 1.9 / 2;`, 120, 'o.velocity.x = .1;');
        assert.ok(Math.abs(r.bottom - 1) < 1e-2, `x ${x}: bottom ${r.bottom}`);
    }
});

test('a tiny box with its center in a wall on a row line lands, and a box grown into the floor walks on it', ()=>
{
    const wall = [[10, 1], [10, 2], [10, 3], [10, 4], [10, 5]];
    const tiny = scene2D(wall, 'const o = new EngineObject(vec2(10.02, 3), vec2(.1));');
    assert.ok(tiny.y > 1 && tiny.y < 1.2, 'tiny: y ' + tiny.y);
    for (const depth of [.3, .55, .7])
    {
        const r = scene2D([], `const o = new EngineObject(vec2(3, 1 + .75 - ${depth}), vec2(1, 1.5));`, 120,
            'o.velocity.x = .1;');
        assert.ok(r.bottom > 1 - depth - 1e-3 && r.x > 10, `grown ${depth} into the floor: ${JSON.stringify(r)}`);
    }
});

test('a box resting in a one way tile\'s margin, or placed a hair under a platform\'s top, does not pass it', ()=>
{
    const { run } = loadEngine();
    const bottoms = JSON.parse(run(`(()=>
    {
        setHeadlessMode(true);
        setGravity(vec2(0, -.02));
        const bottoms = [];
        for (const under of [0, 1e-6, 1e-4, 9e-4])
        {
            engineObjectsDestroy();
            const layer = new TileCollisionLayer(vec2(), vec2(10, 10), tile(), 0, false);
            for (let x = 0; x < 10; ++x) layer.setCollisionData(vec2(x, 0), 1);
            layer.setData(vec2(4, 4), new TileLayerData(3));
            layer.setCollisionData(vec2(4, 4), 1);
            layer.setOneWay(3, vec2(0, 1));
            const o = new EngineObject(vec2(4.5, 5 - under + .4), vec2(.8));
            o.setCollision();
            for (let i = 0; i < 60; ++i) engineObjectsUpdate();
            bottoms.push(o.pos.y - .4);
        }
        return JSON.stringify(bottoms);
    })()`));
    for (const bottom of bottoms)
        assert.ok(bottom > 4.99, 'stays on the platform: ' + bottoms);
});

test('a stack of three crates on a rising massless lift stays stacked, each on the one below', ()=>
{
    const { run } = loadEngine();
    for (const speed of [.01, .05])
    {
        const result = JSON.parse(run(`(()=>
        {
            setHeadlessMode(true);
            setGravity(vec2(0, -.02));
            engineObjectsDestroy();
            const lift = new EngineObject(vec2(0, 0), vec2(4, 1));
            lift.setCollision(true, true, false);
            lift.mass = 0;
            lift.velocity = vec2(0, ${speed});
            const crates = [];
            for (let i = 0; i < 3; ++i)
            {
                const c = new EngineObject(vec2(0, 1.001 + i * 1.001), vec2(1));
                c.setCollision(true, true, false);
                crates.push(c);
            }
            for (let i = 0; i < 60; ++i) engineObjectsUpdate();
            return JSON.stringify(crates.map((c, i)=> [+(c.pos.y - lift.pos.y).toFixed(2),
                c.groundObject === (i ? crates[i - 1] : lift)]));
        })()`));
        assert.deepEqual(result, [[1, true], [2, true], [3, true]], 'speed ' + speed);
    }
});

// an engine with a stub image and canvas, so loadAtlas runs in node; the image is size by size pixels
function atlasEngine(size)
{
    const warnings = [];
    const context = new Proxy({}, { get: (t, k)=> k === 'canvas' ? canvas : typeof k === 'string' ? ()=> ({}) : undefined,
        set: ()=> true });
    const canvas = { width: 0, height: 0, getContext: ()=> context };
    const e = loadEngine({
        console: { ...console, warn: (...a)=> warnings.push(a.join(' ')) },
        Image: class { set src(v) { this.width = this.height = size; Promise.resolve().then(()=> this.onload()); } },
        OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return context; } },
    });
    e.run('glEnable = false; engineInitialized = true;');
    return {...e, warnings};
}
const frame = (x, y, w, h, source)=> ({frame: {x, y, w, h}, rotated: false, trimmed: true,
    spriteSourceSize: {x: 0, y: 0, w, h}, sourceSize: {w: source, h: source}});

test('loadAtlas keeps 100 trimmed glow sprites, a group too big for a sheet leaves the rest, a bad size is left out',
    async ()=>
{
    const { run, warnings } = atlasEngine(1024);
    const frames = {};
    for (let i = 0; i < 100; ++i) frames['glow' + i + 'x'] = frame(i % 10 * 100, (i / 10 | 0) * 100, 96, 96, 256);
    frames.huge = frame(0, 0, 10, 10, 5000);       // too big for any sheet
    frames.bad = frame(0, 0, 10, 10, -1);           // no size
    frames.after = frame(0, 0, 10, 10, 10);         // a group after them still loads
    run(`var a = loadAtlas('a.png', ${JSON.stringify({frames})})`);
    await run('spritesReady()');
    const keys = JSON.parse(run('JSON.stringify(Object.keys(a))'));
    assert.equal(keys.filter((k)=> k.startsWith('glow')).length, 100);
    assert.ok(keys.includes('after') && !keys.includes('huge') && !keys.includes('bad'), keys.join());
    assert.ok(warnings.some((w)=> w.includes('no size')));
});
