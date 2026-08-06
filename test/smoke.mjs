// Headless smoke test for the js13k engine, run with: npm test
// Concatenates the engine sources (debug build, so ASSERTs are active) with
// minimal DOM stubs and exercises the API surface that has no visual output:
// tile collision, TileInfo, particles, ZzFX generation, and the audio classes.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [
    'engineDebug.js',
    'engineMath.js',
    'engineUtilities.js',
    'engineSettings.js',
    'engineObject.js',
    'engineDraw.js',
    'engineInput.js',
    'engineAudio.js',
    'engineTileLayer.js',
    'engineParticles.js',
    'engineMedals.js',
    'engineWebGL.js',
    'engine.js',
];

const stubs = `
const window = { ontouchstart: undefined };
const document = { createElement: () => ({ getContext: () => ({}), style: {} }) };
class Image { }
class AudioContext { }
const requestAnimationFrame = () => {};
`;

const test = `
setHeadlessMode(true);

function gameInit()
{
    // global tile collision grid
    initTileCollision(vec2(10, 8));
    if (tileCollisionSize.x != 10 || tileCollisionSize.y != 8) throw 'grid size wrong';

    setTileCollisionData(vec2(3, 3));
    if (getTileCollisionData(vec2(3, 3)) != 1) throw 'getTileCollisionData failed';
    if (getTileCollisionData(vec2(50, 50)) != 0) throw 'out of bounds should be 0';

    if (tileCollisionTest(vec2(3.5, 3.5), vec2(1)) !== true) throw 'tileCollisionTest should return true';
    if (tileCollisionTest(vec2(8, 6), vec2(1)) !== false) throw 'tileCollisionTest false positive';

    // raycast returns the exact boundary point and surface normal like main
    const normal = vec2();
    const hit = tileCollisionRaycast(vec2(.5, 3.5), vec2(9, 3.5), undefined, normal);
    if (!hit || hit.x != 3 || hit.y != 3.5) throw 'raycast failed: ' + hit;
    if (normal.x != -1 || normal.y != 0) throw 'raycast normal failed: ' + normal;
    if (tileCollisionRaycast(vec2(.5, 6.5), vec2(9, 6.5))) throw 'raycast false positive';

    setTileCollisionData(vec2(3, 3), 0);
    if (getTileCollisionData(vec2(3, 3)) != 0) throw 'clearing collision failed';

    // engine object should collide with the grid
    setTileCollisionData(vec2(5, 2));
    const o = new EngineObject(vec2(5.5, 2.5), vec2(.6));
    o.setCollision();
    if (!tileCollisionTest(o.pos, o.size, o)) throw 'object tile collision failed';

    // TileLayer takes explicit size like main
    const layer = new TileLayer(vec2(), vec2(10, 8));
    if (layer.size.x != 10 || layer.size.y != 8) throw 'TileLayer size failed';
    layer.setData(vec2(1, 1), new TileLayerData(2));
    if (layer.getData(vec2(1, 1)).tile != 2) throw 'TileLayer setData/getData failed';

    // TileInfo stores a TextureInfo object like main
    textureInfos[0] = { size: vec2(128), image: { width: 128, height: 128 } };
    const ti = tile(0, 16);
    if (ti.textureInfo !== textureInfos[0]) throw 'tile() textureInfo failed';
    const ti2 = tile(0, 16, textureInfos[0]); // texture info object also accepted
    if (ti2.textureInfo !== textureInfos[0]) throw 'tile() with TextureInfo failed';
    const ti3 = new TileInfo(vec2(), vec2(16), textureInfos[0]);
    if (ti3.textureInfo !== textureInfos[0]) throw 'TileInfo constructor failed';
    if (ti.frame(1).textureInfo !== textureInfos[0]) throw 'TileInfo.frame failed';

    // audio names match main, zzfxG attack is attack*sampleRate || 9 like main
    const music = new ZzFXMusic([[[,0,400]], [[[0, -1, 1, 0, 9, 1]]], [0], 90]);
    if (!(music instanceof Sound)) throw 'ZzFXMusic not a Sound';
    if (audioDefaultSampleRate != 44100) throw 'audioDefaultSampleRate wrong';
    const samples = zzfxG(1, 0, 220, 0, 0, .1);
    if (samples.length != (9 + .1*44100 | 0)) throw 'zzfxG attack length wrong: ' + samples.length;
    const samples2 = zzfxG(1, 0, 220, .01, 0, .1);
    if (samples2.length != (.01*44100 + .1*44100 | 0)) throw 'zzfxG nonzero attack wrong: ' + samples2.length;

    // shape 5 square duty exists and skips the shape curve like main
    const square = zzfxG(1, 0, 220, 0, .1, 0, 5, .5);
    if (!square.length) throw 'zzfxG shape 5 failed';
    if (!square.some(s => s > .9) || !square.some(s => s < -.9)) throw 'shape 5 not a square wave';

    // particle system: particles are EngineObjects updated by the engine
    const emitter = new ParticleEmitter(vec2(5, 5), 0, 1, 0, 100, PI, ti);
    const particle = emitter.emitParticle();
    if (!(particle instanceof EngineObject)) throw 'Particle should be an EngineObject';
    const px = particle.pos.x;
    particle.velocity = vec2(.1, 0);
    particle.update();
    if (particle.pos.x <= px) throw 'particle physics not applied';
    emitter.destroy();
    if (!emitter.destroyed) throw 'emitter destroy failed';

    // blend mode uses main's name
    if (typeof setAdditiveBlendMode != 'function') throw 'setAdditiveBlendMode missing';

    console.log('SMOKE TEST PASSED');
}
engineInit(gameInit, ()=>{}, ()=>{}, ()=>{}, ()=>{}, []);
`;

let code = stubs;
for (const f of files)
    code += readFileSync(join(root, f), 'utf8') + '\n';
code += test;

const run = new Function(code);
run();
