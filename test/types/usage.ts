// what a TypeScript user writes against the published types, checked strict by test/dts.test.mjs
// it is only type checked, never run, so nothing here needs an engine, a canvas or Box2D
import { vec2, vec3, hsl, Vector2, EngineObject, engineObjectsCallback, engineObjectsCallback3D,
    Tween, Ease, buildGrid, Mesh, Box2dObject, Box2dWheelJoint, Box2dRevoluteJoint, Box2dWeldJoint,
    Box2dDistanceJoint, AudioFilter, AudioReverb, AudioDelay } from 'littlejsengine';

// Box2D joints default their anchors to the objects' positions
const box2dA = new Box2dObject(vec2(), vec2(1));
const box2dB = new Box2dObject(vec2(2, 0), vec2(1));
new Box2dWheelJoint(box2dA, box2dB);
new Box2dRevoluteJoint(box2dA, box2dB);
new Box2dWeldJoint(box2dA, box2dB);
new Box2dDistanceJoint(box2dA, box2dB);

// a tween passes its callback the type it tweens, written out or inferred from start and end
let countdown = 0;
new Tween((v: number) => { countdown = v; }, 10, 0, 5);
new Tween(v => { countdown = v; }, 10, 0, 5).then(() => { countdown = 0; });
let slidePos: Vector2 = vec2();
new Tween((p: Vector2) => { slidePos = p; }, vec2(), vec2(5, 2), 2, { ease: Ease.OUT(Ease.SINE) });
new Tween(p => { slidePos = p.scale(2); }, vec2(), vec2(5, 2));

// buildGrid calls its color and height functions with the grid position
const grid: Mesh = buildGrid(vec2(9), 9, (x, z) => hsl(x/9, 1, .5), (x, z) => x*z*.1);

// object callbacks get the object, typed
engineObjectsCallback(vec2(), 4, (o: EngineObject) => o.destroy());
engineObjectsCallback(vec2(), vec2(4, 2), o => o.destroy());
engineObjectsCallback3D(vec3(), 4, o => o.destroy());

// connect returns its target, so effects chain left to right
const filter = new AudioFilter('lowpass', 800);
const reverb: AudioReverb = filter.connect(new AudioReverb);
reverb.connect(new AudioDelay).connect(new AudioFilter);
