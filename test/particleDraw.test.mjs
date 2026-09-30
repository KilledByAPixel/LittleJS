import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// particles draw straight into the WebGL batch, not through drawTile, and make exactly the draws drawTile would

// a vm engine drawing to a WebGL stub, with every batch draw and every drawTile call recorded
function setup()
{
    const engine = loadEngine();
    engine.run(`
        glEnable = true; glContext = new Proxy({}, { get: ()=> ()=> {} });
        drawContext = {}; // additive blend sets its composite mode too
        var draws = [], tileCalls = 0;
        // with glDraw's defaults, so a value left out and the default passed record the same
        glDraw = (x, y, sizeX, sizeY, angle=0, u0=0, v0=0, u1=1, v1=1, rgba=-1, additive=0)=>
            draws.push(['draw', x, y, sizeX, sizeY, angle, u0, v0, u1, v1, rgba, additive]);
        glDrawUntextured = (...a)=> draws.push(['untextured', ...a]);
        // a texture recorded when it is bound, as the real one only acts on a change
        glSetTexture = (t)=> t !== glActiveTexture && (glActiveTexture = t, draws.push(['texture', t.name]));
        var realDrawTile = drawTile;
        drawTile = (...a)=> (++tileCalls, realDrawTile(...a));
        var texture = { name: 'tiles', glTexture: { name: 'tiles' }, size: vec2(128), sizeInverse: vec2(1/128) };
        var other = { name: 'other', glTexture: { name: 'other' }, size: vec2(64), sizeInverse: vec2(1/64) };

        // an emitter that emits nothing on its own, its particles placed by hand
        var makeEmitter = (tileInfo, settings={})=>
        {
            const e = new ParticleEmitter(vec2(2, 3), 0, 0, 0, 0, PI, tileInfo);
            Object.assign(e, settings);
            return e;
        };
        var addParticle = (e, pos, angle, mirror, velocity=vec2(.1, .2))=>
        {
            const p = new Particle(e, pos, angle, hsl(.1,1,.5), hsl(.6,.5,.4,.2), 2, .5, 1.5, velocity, .01);
            p.mirror = mirror;
            p.spawnTime = time - .7; // part way through its life, so color, size and fade are all blended
            e.particles.push(p);
            return p;
        };

        // the draws the emitter makes, and the ones drawTile makes for the same particles, worked out here
        var compare = (e)=>
        {
            draws = []; tileCalls = 0; glActiveTexture = undefined; // each run binds from nothing
            e.render();
            const fast = draws, fastTileCalls = tileCalls;
            draws = []; glActiveTexture = undefined;
            e.additive && setAdditiveBlendMode();
            for (const p of e.particles)
            {
                let pos = p.pos.copy(), angle = p.angle;
                const size = p.size.copy(); // kept current by the render
                if (e.localSpace)
                {
                    const a = e.angle, c = cos(-a), s = sin(-a);
                    pos = vec2(e.pos.x + pos.x*c - pos.y*s, e.pos.y + pos.x*s + pos.y*c);
                    angle += a;
                }
                if (e.trailScale)
                {
                    const velocity = e.localSpace ? p.velocity.rotate(e.angle) : p.velocity;
                    const speed = velocity.length();
                    if (speed)
                    {
                        size.y = max(size.x, speed * e.trailScale);
                        angle = atan2(velocity.x, velocity.y);
                    }
                }
                realDrawTile(pos, size, p.tileInfo, p.color, angle, p.mirror, undefined, true, false);
            }
            e.additive && setAdditiveBlendMode(false);
            return { fast, reference: draws, fastTileCalls };
        };
    `);
    return engine;
}

const plain = (result)=> JSON.parse(JSON.stringify(result));

test('a WebGL emitter draws its particles into the batch without drawTile', () =>
{
    const { run } = setup();
    const result = plain(run(`
        const e = makeEmitter(new TileInfo(vec2(16, 32), vec2(16), texture));
        addParticle(e, vec2(1, 2), .3, false);
        addParticle(e, vec2(-1, 4), -1.2, true);
        compare(e);
    `));
    assert.equal(result.fastTileCalls, 0);
    assert.deepEqual(result.fast, result.reference);
});

test('particle draws match drawTile for bleed, local space, trails, additive and untextured', () =>
{
    const { run } = setup();
    const results = plain(run(`
        const out = {};
        const bled = new TileInfo(vec2(16, 32), vec2(16), texture, 0, .5);
        let e = makeEmitter(bled);
        addParticle(e, vec2(1, 2), .3, true);
        out.bleed = compare(e);

        e = makeEmitter(new TileInfo(vec2(), vec2(16), texture), {localSpace: true, angle: .7});
        addParticle(e, vec2(1, 2), .3, false);
        addParticle(e, vec2(-2, .5), 2, true);
        out.localSpace = compare(e);

        e = makeEmitter(new TileInfo(vec2(), vec2(16), texture), {trailScale: 4});
        addParticle(e, vec2(1, 2), .3, false);
        addParticle(e, vec2(1, 2), .3, false, vec2()); // at rest, drawn as it is
        out.trail = compare(e);

        e = makeEmitter(new TileInfo(vec2(), vec2(16), texture), {trailScale: 3, localSpace: true, angle: -.4});
        addParticle(e, vec2(1, 2), .3, true);
        out.trailLocal = compare(e);

        e = makeEmitter(new TileInfo(vec2(), vec2(16), texture), {additive: true});
        addParticle(e, vec2(1, 2), .3, false);
        out.additive = compare(e);

        e = makeEmitter(undefined);
        addParticle(e, vec2(1, 2), .3, true);
        out.untextured = compare(e);
        out;
    `));
    for (const [name, result] of Object.entries(results))
    {
        assert.equal(result.fastTileCalls, 0, name);
        assert.ok(result.fast.length > 0, name);
        assert.deepEqual(result.fast, result.reference, name);
    }
});

test('a particle given a tile of its own draws with it, and a tile changed in place draws changed next frame', () =>
{
    const { run } = setup();
    const result = plain(run(`
        const tileInfo = new TileInfo(vec2(), vec2(16), texture);
        const e = makeEmitter(tileInfo);
        addParticle(e, vec2(1, 2), .3, false);
        addParticle(e, vec2(3, 2), .3, false).tileInfo = new TileInfo(vec2(8), vec2(8), other);
        addParticle(e, vec2(5, 2), .3, false);
        const first = compare(e);
        tileInfo.pos.set(32, 48);
        const second = compare(e);
        [first, second];
    `));
    for (const r of result)
        assert.deepEqual(r.fast, r.reference);
    assert.notDeepEqual(result[0].fast, result[1].fast, 'the moved tile draws from its new place');
});

test('a tile with no area draws nothing, as drawTile does for a sprite still loading', () =>
{
    const { run } = setup();
    const result = plain(run(`
        const e = makeEmitter(new TileInfo(vec2(), vec2(0), texture));
        addParticle(e, vec2(1, 2), .3, false);
        compare(e);
    `));
    assert.deepEqual(result.fast.filter(d=> d[0] !== 'texture'), []);
    assert.deepEqual(result.reference, []);
});

test('a particle rendered on its own draws the same, switching additive blend itself', () =>
{
    const { run } = setup();
    const result = plain(run(`
        const e = makeEmitter(new TileInfo(vec2(16), vec2(16), texture), {additive: true});
        const p = addParticle(e, vec2(1, 2), .3, true);
        draws = []; tileCalls = 0; glActiveTexture = undefined;
        const blend = [];
        const realBlend = setAdditiveBlendMode;
        setAdditiveBlendMode = (on=true)=> (blend.push(on), realBlend(on));
        p.render();
        setAdditiveBlendMode = realBlend;
        const single = draws, singleTileCalls = tileCalls;
        [single, singleTileCalls, blend, compare(e).reference];
    `));
    const [single, tileCalls, blend, reference] = result;
    assert.equal(tileCalls, 0);
    assert.deepEqual(blend, [true, false]);
    assert.deepEqual(single, reference);
});

test('without WebGL particles still draw through drawTile', () =>
{
    const { run } = setup();
    const calls = run(`
        glEnable = false;
        const e = makeEmitter(new TileInfo(vec2(), vec2(16), texture));
        addParticle(e, vec2(1, 2), .3, false);
        addParticle(e, vec2(3, 2), .3, false);
        tileCalls = 0;
        realDrawTile = ()=> {}; // the canvas is not there to draw on, only the calls are counted
        e.render();
        tileCalls;
    `);
    assert.equal(calls, 2);
});
