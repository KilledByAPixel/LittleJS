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
// audio nodes that only record how they are wired, so the audio graph can be
// checked without a browser
class FakeNode
{
    constructor() { this.gain = { value: 1 }; this.playbackRate = { value: 1 }; }
    connect(node) { this.output = node; return node; }
    start() { }
}
class AudioContext
{
    constructor() { this.destination = new FakeNode; this.state = 'running'; }
    createGain() { return new FakeNode; }
    createBufferSource() { return new FakeNode; }
    createBuffer() { return { getChannelData: ()=> ({ set() { } }) }; }
}
class StereoPannerNode extends FakeNode
{
    constructor(context, options) { super(); this.pan = options.pan; }
}
// capture the loop instead of dropping it, so the pause check below can
// drive the engine by hand at a chosen refresh rate
let rafCallback;
const requestAnimationFrame = cb => rafCallback = cb;
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

    // a particle that cannot collide must not copy its old position each frame
    // - particles have mass for gravity, so a mass-only check would still copy,
    //   which is what main's version does and why this branch tests the flags
    let copies = 0;
    const realCopy = Vector2.prototype.copy;
    Vector2.prototype.copy = function() { ++copies; return realCopy.call(this); };
    for (let i = 10; i--;) particle.update();
    Vector2.prototype.copy = realCopy;
    if (copies) throw 'a non-colliding particle copied its position ' + copies + ' times in 10 updates';
    emitter.destroy();
    if (!emitter.destroyed) throw 'emitter destroy failed';

    // image font matches main's constructor, with a js13k-only default font
    const font = new ImageFont;
    if (font.tileInfo !== undefined) throw 'default ImageFont should have no tileInfo';
    const font2 = new ImageFont(ti);
    if (font2.tileInfo !== ti) throw 'ImageFont tileInfo not stored';

    // blend mode uses main's name
    if (typeof setAdditiveBlendMode != 'function') throw 'setAdditiveBlendMode missing';

    // physics through update(): a falling object lands on a tile floor
    // - collision response reads oldPos, which is only copied when the solver runs
    initTileCollision(vec2(10, 10));
    for (let x = 0; x < 10; x++) setTileCollisionData(vec2(x, 2));
    setGravity(vec2(0, -.02));
    const faller = new EngineObject(vec2(5, 6), vec2(1));
    faller.setCollision();
    faller.mass = 1;
    for (let i = 0; i < 200; i++) faller.update();
    setGravity(vec2());
    if (!(faller.pos.y > 3 && faller.pos.y < 3.6)) throw 'faller should land on the floor, y ' + faller.pos.y;

    // localPos only exists on a child, and a child follows a rotating parent
    const parent = new EngineObject(vec2(10, 10));
    const child = new EngineObject;
    if (child.localPos !== undefined) throw 'localPos should start undefined';
    parent.addChild(child, vec2(2, 0));
    parent.angle = PI/2;
    parent.updateTransforms();
    if (abs(child.pos.x - 10) > 1e-9 || abs(child.pos.y - 8) > 1e-9) throw 'child should follow its parent, got ' + child.pos;

    console.log('ENGINE CHECKS PASSED');
}

// the paused update rate is fixed, not the display refresh rate
// - a pause screen must not animate twice as fast on a 144Hz monitor, and
//   this is invisible on a 60Hz machine, so it only shows up in a test
let updates = 0, postUpdates = 0;
await engineInit(gameInit, ()=> ++updates, ()=> ++postUpdates, ()=>{}, ()=>{}, []);

let t = 0;
const stepDisplay = (hz, frames)=> { for (let i = frames; i--;) rafCallback(t += 1e3/hz); };

// one second of a 144Hz display while running
updates = postUpdates = 0;
stepDisplay(144, 144);
if (updates != frameRate) throw 'running updated ' + updates + ' times, expected ' + frameRate;

// one second paused, at the same refresh rate
setPaused(true);
const timeAtPause = time, frameAtPause = frame;
updates = postUpdates = 0;
stepDisplay(144, 144);
if (updates) throw 'gameUpdate ran ' + updates + ' times while paused';
if (time != timeAtPause) throw 'time advanced while paused';
if (frame != frameAtPause) throw 'frame advanced while paused';
if (abs(postUpdates - frameRate) > frameRate/5)
    throw 'paused ticked ' + postUpdates + ' times, expected near ' + frameRate;
setPaused(false);

// audio graph: no panner and no master gain unless a game turns them on
// - soundVolume is then applied to each sound as it starts instead
setHeadlessMode(false);
const sound = new Sound([1, 0]);
let source = sound.play();
if (source.output !== sound.gainNode) throw 'default sound should go straight to its gain';
if (sound.gainNode.output !== audioContext.destination) throw 'default gain should go straight to the speakers';
if (sound.gainNode.gain.value != soundVolume) throw 'soundVolume not applied to the sound';
sound.setVolume(.5);
if (sound.gainNode.gain.value != .5*soundVolume) throw 'setVolume should include soundVolume';
if (zzfx(1, 0).output.output !== audioContext.destination) throw 'zzfx should play without a master gain';

setSoundPanEnable(true);
source = sound.play();
if (!(source.output instanceof StereoPannerNode) || source.output.output !== sound.gainNode)
    throw 'soundPanEnable should put a panner between source and gain';
setSoundPanEnable(false);

setSoundMasterGainEnable(true);
audioInit(); // the master gain is made at startup
source = sound.play();
if (sound.gainNode.output !== audioMasterGain || audioMasterGain.output !== audioContext.destination)
    throw 'soundMasterGainEnable should route sound through the master gain';
if (sound.gainNode.gain.value != 1 || audioMasterGain.gain.value != soundVolume)
    throw 'with a master gain, soundVolume belongs on the master only';
setSoundVolume(.2);
if (audioMasterGain.gain.value != .2) throw 'setSoundVolume should update the master gain';
setSoundMasterGainEnable(false);
setHeadlessMode(true);

console.log('SMOKE TEST PASSED');
`;

let code = stubs;
for (const f of files)
    code += readFileSync(join(root, f), 'utf8') + '\n';
code += test;

// engineInit is async, so the body runs as an async function
await new Function('return (async()=>{' + code + '})()')();
