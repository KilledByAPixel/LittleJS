// what a TypeScript user writes against the published types, checked strict by test/dts.test.mjs
// it is only type checked, never run, so nothing here needs an engine, a canvas or Box2D
import { vec2, vec3, hsl, Vector2, EngineObject, engineObjectsCallback, engineObjectsCallback3D,
    Tween, Ease, buildGrid, Mesh, Box2dObject, Box2dWheelJoint, Box2dRevoluteJoint, Box2dWeldJoint,
    Box2dDistanceJoint, AudioFilter, AudioReverb, AudioDelay, Sound, VoxelMap, Ray3D } from 'littlejsengine';

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
export { countdown, slidePos }; // read by nothing, kept so the callbacks' writes are used

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

// a sound's load callback returns nothing
let soundLoaded = false;
const loadedSound = new Sound('a.mp3', 0, 30, .7, () => { soundLoaded = true; });
loadedSound.onloadCallback = () => { soundLoaded = !soundLoaded; };

// Box2D objects destroy like any object, immediate included
new Box2dObject().destroy(true);

// a voxel raycast that misses is undefined, so its hit is checked before it is read
const voxels = new VoxelMap(vec3(), vec3(8));
const voxelHit = voxels.raycast(new Ray3D(vec3(), vec3(1, 0, 0)));
voxelHit?.cell.add(voxelHit.normal);
// @ts-expect-error
voxels.raycast(new Ray3D(vec3(), vec3(0, 1, 0))).distance;

// particle effect options take any effect setting beside scale, hue and the rest
import { particleEffect, particleEffect3D } from 'littlejsengine';
particleEffect('fire', vec2(), {scale: 2, hue: .3, emitTime: .5, speed: .1});
particleEffect3D('fire', vec3(), {flatten: true, emitRate: 30});

// a level editor of the game's own: a class with the hooks as methods, and keys, buttons and tools added to it
import { LevelEditor, levelEditor, setLevelEditor } from 'littlejsengine';
class GameEditor extends LevelEditor
{
    constructor()
    {
        super();
        this.addKey('k', (shift)=> shift, 'K: mine');
        this.addButton('Clear', ()=> {}, 'Clear the level');
        this.addTool('Zone', {key: 'z', hint: 'Zone', onPress(at) { at.pos; }});
    }
    onRestart() {}
    onDraw() {}
    onSave(text: string, fileName: string) { return text.length > 0 && fileName.length > 0; }
}
setLevelEditor(new GameEditor);
levelEditor.onRestart = ()=> {};
levelEditor.onPlayFrom = (pos)=> pos;
levelEditor.edit3D?.strokeEnd();
levelEditor.edit2D.paint(vec2(), 5);
const editing: boolean = levelEditor.isOpen && levelEditor.is3D;
// @ts-expect-error
levelEditor.addKey('k');
