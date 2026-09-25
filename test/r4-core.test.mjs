import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    EngineObject, ParticleEmitter, TileCollisionLayer, TileLayer, TileInfo, RandomGenerator, SpriteAnimation,
    engineObjectsCollect, engineObjectsUpdate, readSaveData, writeSaveData, tileLayersLoad, tileCollisionGetData,
    tile, vec2, rgb, isPowerOfTwo, drawText, drawTextScreen, setCameraScale, cameraScale, WHITE,
} from '../dist/littlejs.esm.js';

// review round 4 regressions: core, math, particles, tile layers and the text draws

test('two solid objects on the same spot push apart gently, not at a unit a frame', () =>
{
    const a = new EngineObject(vec2(5, 5), vec2(1)), b = new EngineObject(vec2(5, 5), vec2(1));
    a.setCollision(); b.setCollision();
    a.damping = b.damping = 1;
    engineObjectsUpdate();
    assert.ok(a.velocity.length() < .01, 'a pushed at ' + a.velocity.length());
    assert.ok(b.velocity.length() < .01, 'b pushed at ' + b.velocity.length());
    a.destroy(); b.destroy();
    engineObjectsUpdate();
});

test('removeChild of an object that is not a child leaves the real children alone', () =>
{
    const parent = new EngineObject, child = new EngineObject, stranger = new EngineObject;
    parent.addChild(child, vec2(1, 0));
    assert.throws(()=> parent.removeChild(stranger), /Assert/); // debug asserts, release returns
    assert.deepEqual(parent.children, [child]);
    assert.equal(child.parent, parent);
    parent.removeChild(child);
    assert.equal(child.localPos, undefined, 'localPos only while attached');
    for (const o of [parent, child, stranger]) o.destroy();
    engineObjectsUpdate();
});

test('an object cannot become a child of its own child, or of itself through a chain', () =>
{
    const a = new EngineObject, b = new EngineObject, c = new EngineObject;
    a.addChild(b);
    b.addChild(c);
    assert.throws(()=> c.addChild(a), /Assert/);
    assert.throws(()=> c.attach(a), /Assert/);
    a.destroy();
    const gone = new EngineObject;
    gone.destroy();
    const d = new EngineObject;
    assert.throws(()=> d.addChild(gone), /Assert/, 'a destroyed child');
    d.destroy();
    engineObjectsUpdate();
});

test('engineObjectsCollect with a position and no size finds the objects over that point', () =>
{
    const o = new EngineObject(vec2(10, 10), vec2(2)), other = new EngineObject(vec2(20, 20), vec2(2));
    const objects = [o, other];
    assert.deepEqual(engineObjectsCollect(vec2(10.5, 10.5), undefined, objects), [o]);
    assert.deepEqual(engineObjectsCollect(vec2(15, 15), undefined, objects), []);
    o.destroy(); other.destroy();
    engineObjectsUpdate();
});

test('save data under a name that is also a Storage member reads back what was written', () =>
{
    writeSaveData('key', { level: 3 });
    assert.equal(readSaveData('key', { level: 1 }).level, 3);
    writeSaveData('length', { level: 4 });
    assert.equal(readSaveData('length', { level: 1 }).level, 4);
});

test('isPowerOfTwo is false for fractions', () =>
{
    assert.equal(isPowerOfTwo(1.5), false);
    assert.equal(isPowerOfTwo(2.5), false);
    assert.equal(isPowerOfTwo(4), true);
});

test('a RandomGenerator seed that xorshift turns into 0 uses the default seed instead of sticking', () =>
{
    const first = new RandomGenerator(.37).float();
    assert.ok(first > 0, 'not stuck at 0');
    assert.equal(new RandomGenerator(2**32).float(), first, 'every seed that is 0 as an int is the same default');
    assert.ok(new RandomGenerator(1.5).float() > 0, 'a fraction above 1 still has bits');
});

test('a color prints its channels rounded, so half is 80', () =>
{
    assert.equal(rgb(.5, .5, .5).toString(), '#808080ff');
    assert.equal(rgb(1, 0, .999).toString(false), '#ff00ff'); // .999 is 254.7, nearer ff
});

test('a particle with no lifetime is gone on its first update, not kept forever', () =>
{
    const emitter = new ParticleEmitter(vec2(), 0, 0, 0, 60, 0, undefined, WHITE, WHITE, WHITE, WHITE, 0);
    emitter.update(); // emits one
    emitter.update(); // updates it
    emitter.update();
    assert.ok(emitter.particles.length <= 1, 'particles piled up: ' + emitter.particles.length);
    emitter.destroy(true);
    engineObjectsUpdate();
});

test('a new emit rate applies at once, not after the old interval is paid back', () =>
{
    const emitter = new ParticleEmitter(vec2(), 0, 0, 0, .5);
    emitter.update(); // at .5 a second, one particle then a long wait
    const before = emitter.particles.length;
    emitter.emitRate = 600; // 10 a frame
    emitter.update();
    assert.ok(emitter.particles.length - before >= 9, 'emitted ' + (emitter.particles.length - before));
    emitter.destroy(true);
    engineObjectsUpdate();
});

test('a tile collision test with a box touching the layer from outside is not a hit', () =>
{
    const layer = new TileCollisionLayer(vec2(), vec2(4), tile(), 0, false);
    layer.setCollisionData(vec2(0, 1), 1);
    assert.equal(layer.collisionTest(vec2(-.5, 1.5), vec2(1)), false, 'right edge at the layer\'s left edge');
    assert.equal(layer.collisionTest(vec2(.5, -.5), vec2(1)), false, 'top edge at the layer\'s bottom');
    layer.setCollisionData(vec2(0, 0), 1);
    assert.equal(layer.collisionTest(vec2(.5, -.5), vec2(1)), false);
    assert.equal(layer.collisionTest(vec2(-.4, .5), vec2(1)), true, 'overlapping by a tenth');
    assert.equal(layer.collisionTest(vec2(.5, .5)), true, 'a point test');
    layer.destroy();
});

test('negative collision data is not solid for a collision test, as for raycasts and particles', () =>
{
    const layer = new TileCollisionLayer(vec2(), vec2(4), tile(), 0, false);
    layer.setCollisionData(vec2(1, 1), -1);
    assert.equal(layer.collisionTest(vec2(1.5, 1.5), vec2(.5)), false);
    assert.equal(layer.collisionRaycast(vec2(0, 1.5), vec2(3, 1.5)), undefined);
    layer.destroy();
});

test('tileCollisionGetData reads a moved layer\'s cells', () =>
{
    const layer = new TileCollisionLayer(vec2(10, 20), vec2(4), tile(), 0, false);
    layer.setCollisionData(vec2(1, 2), 7);
    assert.equal(tileCollisionGetData(vec2(11.5, 22.5)), 7);
    assert.equal(tileCollisionGetData(vec2(9.5, 22.5)), 0);
    assert.equal(tileCollisionGetData(vec2(14.5, 22.5)), 0);
    layer.destroy();
});

test('initCollision on a fractional size of the same layer does not throw, and cannot resize', () =>
{
    const layer = new TileCollisionLayer(vec2(), vec2(3), tile(), 0, false);
    layer.setCollisionData(vec2(1, 1), 1);
    layer.initCollision(vec2(3.5, 3.5));
    assert.equal(layer.collisionData.length, 9);
    assert.equal(layer.getCollisionData(vec2(1, 1)), 0, 'cleared');
    assert.throws(()=> layer.initCollision(vec2(6)), /Assert/);
    layer.destroy();
});

test('a headless tile layer keeps its tile data and tile info', () =>
{
    const layer = new TileLayer(vec2(), vec2(4), tile(0, 8));
    assert.equal(layer.getData(vec2(1, 1)).tile, undefined, 'an empty cell, not a throw');
    assert.equal(layer.tileInfo.size.x, 8);
    layer.destroy();
});

test('tileLayersLoad reads a Tiled #AARRGGBB tint and the layer opacity, and skips an object layer', () =>
{
    const map = { width: 2, height: 1, layers: [
        { data: [1, 0], tintcolor: '#80ff0000', opacity: .5 },
        { type: 'objectgroup', objects: [] },
        { type: 'tilelayer', data: [0, 2] },
    ]};
    const layers = tileLayersLoad(map, tile(), 0, undefined, false);
    const color = layers[0].getData(vec2(0, 0)).color;
    assert.ok(Math.abs(color.r - 1) < 1e-6 && color.g === 0 && color.b === 0, 'red');
    assert.ok(Math.abs(color.a - 128/255 * .5) < 1e-6, 'half alpha, halved again, got ' + color.a);
    assert.equal(layers[1], undefined, 'no tile layer for the object layer');
    assert.equal(layers[2].getData(vec2(1, 0)).tile, 1);
    for (const layer of layers) layer?.destroy();
});

test('headless tile() keeps the size it was given, and frame() works on it', () =>
{
    const info = tile(3, 8);
    assert.equal(info.size.x, 8);
    assert.doesNotThrow(()=> tile(0, 16).frame(1));
});

test('a SpriteAnimation played backward stays in range', () =>
{
    const sheet = { size: vec2(64, 16) };
    const first = new TileInfo(vec2(), vec2(16), undefined);
    for (const mode of ['loop', 'once', 'pingPong'])
    {
        const animation = new SpriteAnimation(first, 4, .1).restart(mode);
        animation.speed = -1;
        animation.startTime -= 1.05; // 10.5 frames back, so frame -11
        const frame = animation.frame;
        assert.ok(frame >= 0 && frame < 4, mode + ' frame ' + frame);
    }
});

// a stand-in 2D context that records the text calls
const textContext = ()=>
{
    const calls = [];
    return { calls, save(){}, restore(){}, rotate(a){ calls.push(['rotate', a]); },
        translate(x, y){ calls.push(['translate', x, y]); },
        fillText(t, x, y, w){ calls.push(['fillText', t, x, y, w]); }, strokeText(){} };
};

test('turned multi-line text is centered on its position', () =>
{
    const context = textContext();
    drawTextScreen('a\nb', vec2(100, 100), 20, WHITE, 0, WHITE, 'center', 'arial', '', undefined, Math.PI/2, context);
    // a screen position is the center of a pixel, as for every other screen space draw
    assert.deepEqual(context.calls.find(c=> c[0] === 'translate'), ['translate', 100.5, 100.5]);
    const ys = context.calls.filter(c=> c[0] === 'fillText').map(c=> c[3]);
    assert.deepEqual(ys, [-10, 10]);
});

test('drawText scales maxWidth from world units to pixels like the size', () =>
{
    const context = textContext(), scale = cameraScale;
    setCameraScale(10);
    drawText('hi', vec2(), 1, WHITE, 0, WHITE, 'center', 'arial', '', 4, 0, context);
    setCameraScale(scale);
    assert.equal(context.calls.find(c=> c[0] === 'fillText')[4], 40);
});

test('the engine runs headless in plain Node, with no document or requestAnimationFrame', () =>
{
    const script = "const LJS = await import('./dist/littlejs.esm.js'); LJS.setHeadlessMode(true); let n = 0;" +
        "await LJS.engineInit(()=>{}, ()=> ++n); setTimeout(()=> { console.log('updates ' + n); process.exit(0); }, 300);";
    const out = execFileSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const updates = +out.match(/updates ([0-9]+)/)[1];
    assert.ok(updates > 3, out);
});
