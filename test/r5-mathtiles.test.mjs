import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    EngineObject, ParticleEmitter, Particle, CanvasLayer, TileLayer, TileCollisionLayer, Vector2,
    engineObjectsUpdate, tileLayersLoad, tileCollisionGetData, setGLEnable,
    tile, vec2, rgb, WHITE,
} from '../dist/littlejs.esm.js';

// review round 5 regressions: math, particles and tile layers

const root = fileURLToPath(new URL('..', import.meta.url));

test('rgbaInt rounds each channel like toString, so WebGL and Canvas2D colors match', () =>
{
    const color = rgb(.5, .999, 0, .5);
    const c = color.rgbaInt();
    const bytes = [c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24];
    assert.deepEqual(bytes, [128, 255, 0, 128]);
    assert.equal(color.toString(), '#80ff0080');
    assert.equal(rgb(1, 1, 1, 1).rgbaInt(), -1, 'white is still every bit set');
    assert.equal(rgb(0, 0, 0, 0).rgbaInt(), 0);
});

test('Vector2.setDirection has a required direction in the d.ts', () =>
{
    const dts = readFileSync(root + 'dist/littlejs.d.ts', 'utf8');
    assert.match(dts, /setDirection\(direction: number, length\?: number\)/);
});

test('a child emitter with velocityInheritance does not fire from the world origin on its first update', () =>
{
    const ship = new EngineObject(vec2(50, 20));
    const emitter = new ParticleEmitter(vec2());
    emitter.velocityInheritance = .5;
    emitter.randomness = 0;
    ship.addChild(emitter, vec2(0, -1));
    emitter.update(); // the first particle comes out at once
    assert.ok(emitter.velocity.length() < 1e-9, 'emitter velocity ' + emitter.velocity);
    assert.ok(emitter.particles.length > 0);
    for (const p of emitter.particles)
        assert.ok(p.velocity.length() <= emitter.speed + 1e-9, 'particle velocity ' + p.velocity);
    ship.destroy(true);
    engineObjectsUpdate();
});

test('turning velocityInheritance on after the emitter moved does not jump', () =>
{
    const ship = new EngineObject(vec2(0, 0));
    const emitter = new ParticleEmitter(vec2());
    ship.addChild(emitter);
    emitter.update();
    ship.pos.x = 30;
    ship.updateTransforms();
    emitter.update(); // moved with velocityInheritance off
    emitter.velocityInheritance = .5;
    emitter.update(); // standing still now
    assert.ok(emitter.velocity.length() < 1e-9, 'emitter velocity ' + emitter.velocity);
    ship.destroy(true);
    engineObjectsUpdate();
});

test('a TileLayer with a fractional size floors it instead of running out of memory', () =>
{
    // run in its own process, since the bug grows an array until the heap is gone
    const script = "await import('./test/setup.mjs'); const LJS = await import('./dist/littlejs.esm.js');" +
        "const layer = new LJS.TileLayer(LJS.vec2(), LJS.vec2(2.5, 1.5));" +
        "console.log('cells ' + layer.data.length + ' size ' + layer.size.x + ',' + layer.size.y);";
    const out = execFileSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '--no-warnings', '-e', script],
        { cwd: root, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(out, /cells 2 size 2,1/);
});

test('turning WebGL back on redraws a tile layer that was redrawn for Canvas2D', () =>
{
    const layer = new TileLayer(vec2(), vec2(2), tile(0, 8));
    let redraws = 0;
    layer.redraw = ()=> ++redraws; // headless stubs it, count the calls instead
    layer.isUsingWebGL = true; // as if it had been drawn into its WebGL texture
    try
    {
        setGLEnable(false);
        layer.update();
        assert.equal(redraws, 1, 'redrawn for Canvas2D');
        setGLEnable(true);
        layer.update();
        assert.equal(redraws, 2, 'redrawn again when WebGL comes back');
        layer.update();
        assert.equal(redraws, 2, 'only once');
    }
    finally
    {
        setGLEnable(true);
        layer.destroy();
    }
});

test('tileCollisionGetData returns a solid tile from a later layer over a negative marker', () =>
{
    const a = new TileCollisionLayer(vec2(), vec2(4), tile(), 0, false);
    const b = new TileCollisionLayer(vec2(), vec2(4), tile(), 0, false);
    a.setCollisionData(vec2(1, 1), -1);
    b.setCollisionData(vec2(1, 1), 1);
    assert.equal(tileCollisionGetData(vec2(1.5, 1.5)), 1);
    b.setCollisionData(vec2(1, 1), 0);
    assert.equal(tileCollisionGetData(vec2(1.5, 1.5)), -1, 'a marker alone is still returned');
    a.destroy(); b.destroy();
});

test('tileLayersLoad leaves Tiled\'s hexagonal bit 28 out of the tile index', () =>
{
    const map = { width: 2, height: 1, layers: [{ data: [1 | 0x10000000, 2 | 0x80000000] }] };
    const [layer] = tileLayersLoad(map, tile(), 0, undefined, false);
    assert.equal(layer.getData(vec2(0, 0)).tile, 0);
    const flipped = layer.getData(vec2(1, 0));
    assert.equal(flipped.tile, 1);
    assert.equal(flipped.mirror, true, 'the flip bits are still read');
    layer.destroy();
});

test('a CanvasLayer drawn in Canvas2D uses its canvas size after the canvas is resized', () =>
{
    const layer = new CanvasLayer(vec2(), vec2(1), 0, 0, vec2(8), false);
    layer.canvas = { width: 64, height: 32 }; // headless has no canvas, stand one in
    let source;
    const context = new Proxy({}, {
        get: (target, key)=> key === 'drawImage' ? (...args)=> source = args : ()=> {},
        set: ()=> true,
    });
    layer.draw(vec2(), vec2(1), WHITE, 0, false, undefined, true, context);
    assert.deepEqual(source.slice(3, 5), [64, 32], 'source width and height');
    assert.equal(layer.textureInfo.size.x, 64);
    assert.equal(layer.textureInfo.sizeInverse.y, 1/32);
    layer.destroy();
});

test('Particle.size follows the drawn size while the particle lives', () =>
{
    const emitter = new ParticleEmitter(vec2());
    emitter.randomness = 0;
    emitter.trailScale = 1; // with no speed a trail particle draws nothing, which headless needs
    const particle = new Particle(emitter, vec2(), 0, WHITE, WHITE, 1, 1, 3, vec2());
    particle.spawnTime -= .5; // half way through its life
    particle.render();
    assert.ok(Math.abs(particle.size.x - 2) < 1e-9 && Math.abs(particle.size.y - 2) < 1e-9, 'size ' + particle.size);
    emitter.destroy(true);
    engineObjectsUpdate();
});

test('a colliding particle does not copy its position every frame', () =>
{
    const layer = new TileCollisionLayer(vec2(), vec2(4), tile(), 0, false);
    const emitter = new ParticleEmitter(vec2());
    emitter.collideTiles = true;
    const particles = [];
    for (let i = 0; i < 10; ++i)
        particles.push(new Particle(emitter, vec2(.5 + i*.3, 2), 0, WHITE, WHITE, 1, 1, 1, vec2(.01, 0)));

    const copy = Vector2.prototype.copy;
    let copies = 0;
    Vector2.prototype.copy = function() { ++copies; return copy.call(this); };
    try { for (const p of particles) p.update(); }
    finally { Vector2.prototype.copy = copy; }
    assert.equal(copies, 0);
    layer.destroy();
    emitter.destroy(true);
    engineObjectsUpdate();
});

test('a particle still bounces off a solid tile and its collide callback still gets vectors', () =>
{
    // guards the collision rewrite, passes before and after it
    const layer = new TileCollisionLayer(vec2(), vec2(4), tile(), 0, false);
    layer.setCollisionData(vec2(1, 1), 1);
    const emitter = new ParticleEmitter(vec2());
    emitter.collideTiles = true;
    emitter.restitution = .5;
    const falling = new Particle(emitter, vec2(1.5, 2.2), 0, WHITE, WHITE, 1, 1, 1, vec2(0, -.5));
    falling.update();
    assert.equal(falling.pos.y, 2.2, 'moved back to where it was');
    assert.equal(falling.velocity.y, .25, 'bounced up');

    const seen = [];
    emitter.particleCollideCallback = (p, data, pos)=> (seen.push([data, pos]), true);
    const other = new Particle(emitter, vec2(1.5, 2.2), 0, WHITE, WHITE, 1, 1, 1, vec2(0, -.5));
    other.update();
    assert.ok(seen.length > 0);
    for (const [data, pos] of seen)
    {
        assert.equal(data, 1);
        assert.ok(pos instanceof Vector2);
    }
    assert.equal(other.pos.y, 2.2);
    layer.destroy();
    emitter.destroy(true);
    engineObjectsUpdate();
});
