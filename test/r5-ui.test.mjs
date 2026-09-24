import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineInit, engineStep, setEngineManualStep, setHeadlessMode, uiSystem,
    UISystemPlugin, UIObject, UIButton, UIText, UITextInput, UITile, UILayout, UIVideo,
    TileInfo, CLEAR_BLACK, BLACK, vec2 } from '../dist/littlejs.esm.js';

// Review 5 regressions for the UI plugin. Headless skips input, so what needs a real
// mouse or gamepad press (dragActivate taps, the pad press that stops an edit) is
// checked in a browser instead.

// before engineInit, as a game might do at the top of its script: captured here since
// every test runs after engineInit, and the plugin is only checked with rendering on
const earlyErrors = {};
try { new UIObject(vec2(), vec2(10)); } catch (e) { earlyErrors.object = e; }
setHeadlessMode(false);
try { new UISystemPlugin; } catch (e) { earlyErrors.plugin = e; }
setHeadlessMode(true);

// engineInit once per file at module scope, the UI updates as a plugin through engineStep
setEngineManualStep(true);
await engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
const ui = uiSystem || new UISystemPlugin; // an old build let the early one through

// the text field listens on the window, which Node does not have
const withListeners = (f)=>
{
    globalThis.addEventListener = globalThis.removeEventListener = ()=> {};
    try { f(); }
    finally
    {
        ui.keyInputObject = undefined;
        delete globalThis.addEventListener;
        delete globalThis.removeEventListener;
    }
};

// a video element stub, since Node has no document to make one
const withVideoElement = (f)=>
{
    const doc = globalThis.document;
    doc.createElement = ()=> ({style: {}, duration: NaN, currentTime: 0, pause() {}, remove() {}});
    doc.body.appendChild = ()=> {};
    try { f(); }
    finally
    {
        delete doc.createElement;
        delete doc.body.appendChild;
    }
};

test('a UI object made before the plugin, or the plugin before engineInit, fails with an assert', () =>
{
    assert.equal(earlyErrors.object?.message, 'Assert failed!', 'not a TypeError on uiSystem');
    assert.equal(earlyErrors.plugin?.message, 'Assert failed!', 'not a plugin with no context');
});

test('any UI object can be the keyInputObject without the keys throwing', () =>
{
    ui.destroyObjects();
    assert.equal(typeof UIObject.prototype.onKeyDown, 'function');
    withListeners(()=>
    {
        const button = new UIButton(vec2(1e3), vec2(20), 'Go');
        ui.keyInputObject = button;
        assert.doesNotThrow(()=> ui._onKeyDown({type: 'keydown', code: 'KeyA', key: 'a',
            stopPropagation() {}, preventDefault() {}}));
    });
    ui.destroyObjects();
});

test('a transparent UILayout leaves clicks in its gaps to the game, an opaque one still takes them', () =>
{
    const clear = new UILayout(vec2(), 1, 10, 10, true);
    const panel = new UILayout(vec2(), 1, 10, 10);
    assert.equal(clear.canBeHover, false);
    assert.equal(panel.canBeHover, true);
    clear.destroy();
    panel.destroy();
});

test('onLeave fires when the hovered object, or a parent, is hidden', () =>
{
    ui.destroyObjects();
    const panel = new UIObject(vec2(1e3), vec2(100)); // away from the mouse, so nothing takes hover
    const button = panel.addChild(new UIButton(vec2(), vec2(20)));
    let left = 0;
    button.onLeave = ()=> ++left;

    ui.hoverObject = button; // hovered last frame
    panel.visible = false;
    engineStep();
    assert.equal(left, 1);
    assert.equal(ui.lastHoverObject, undefined);
    panel.visible = true;
    engineStep();
    assert.equal(left, 1, 'once');

    ui.hoverObject = button;
    button.visible = false;
    engineStep();
    assert.equal(left, 2);
    ui.destroyObjects();
});

test('numpad Enter finishes editing a text field, a held one repeating does not', () =>
{
    withListeners(()=>
    {
        const input = new UITextInput(vec2(1e3), vec2(100, 20), 'ab');
        ui.keyInputObject = input;
        input.onKeyDown({code: 'NumpadEnter', key: 'Enter', repeat: true});
        assert.equal(ui.keyInputObject, input);
        input.onKeyDown({code: 'NumpadEnter', key: 'Enter'});
        assert.equal(ui.keyInputObject, undefined);
        assert.equal(input.text, 'ab');
        input.destroy();
    });
});

test('keyboard and gamepad navigation keeps its place while a text field is edited', () =>
{
    ui.destroyObjects();
    withListeners(()=>
    {
        const input = new UITextInput(vec2(1e3), vec2(100, 20));
        const button = new UIButton(vec2(1e3, 1100), vec2(20));
        input.navigationIndex = 0;
        button.navigationIndex = 1;
        ui.navigationMode = true;
        ui.navigationObject = input;
        input.click(); // as a navigation press does
        engineStep();
        assert.equal(ui.keyInputObject, input);
        assert.equal(ui.navigationObject, input, 'kept while editing');
        input.stopEditing();
        engineStep();
        assert.equal(ui.navigationObject, input, 'and after, so the next press moves on from it');
        assert.equal(ui.navigationMode, true);
    });
    ui.navigationMode = false;
    ui.navigationObject = undefined;
    ui.destroyObjects();
});

test('objects with the same navigationIndex navigate in creation and child order', () =>
{
    ui.destroyObjects();
    const a = new UIButton(vec2(1e3), vec2(20));
    const b = new UIButton(vec2(1e3), vec2(20));
    const panel = new UIObject(vec2(1e3), vec2(100));
    const c = panel.addChild(new UIButton(vec2(), vec2(20)));
    const d = panel.addChild(new UIButton(vec2(), vec2(20)));
    for (const o of [a, b, c, d])
        o.navigationIndex = 0;
    assert.deepEqual(ui.getNavigableObjects(), [a, b, c, d]);
    ui.destroyObjects();
});

test('widgets that start clear or black own their colors, so editing them leaves the constants alone', () =>
{
    const text = new UIText(vec2(), vec2(20), 'hi');
    const tileObject = new UITile(vec2(), vec2(20), new TileInfo(vec2(), vec2(16)));
    const layout = new UILayout(vec2(), 1, 10, 10, true);
    let video;
    withVideoElement(()=> video = new UIVideo(vec2(), vec2(20), 'clip.mp4'));
    const clearColors = [text.color, text.shadowColor, tileObject.shadowColor, layout.color, layout.shadowColor];
    for (const color of clearColors)
    {
        assert.notEqual(color, CLEAR_BLACK);
        assert.doesNotThrow(()=> color.a = .5);
    }
    assert.notEqual(video.color, BLACK);
    assert.doesNotThrow(()=> video.color.r = .5);
    assert.equal(CLEAR_BLACK.a, 0);
    assert.equal(BLACK.r, 0);
    for (const o of [text, tileObject, layout, video])
        o.destroy();
});

test('isInteractive is false inside a disabled or hidden parent', () =>
{
    const panel = new UIObject(vec2(1e3), vec2(100));
    const button = panel.addChild(new UIButton(vec2(), vec2(20)));
    assert.equal(button.isInteractive(), true);
    panel.disabled = true;
    assert.equal(button.isInteractive(), false);
    panel.disabled = false;
    panel.visible = false;
    assert.equal(button.isInteractive(), false);
    panel.destroy();
});

test('a text input plays its click sound, and none when the caller asks for none', () =>
{
    withListeners(()=>
    {
        const input = new UITextInput(vec2(1e3), vec2(100, 20));
        let plays = 0;
        input.soundClick = { play: ()=> ++plays };
        input.click();
        assert.equal(plays, 1);
        ui.keyInputObject = undefined;
        input.click(false); // the activateOnPress path that already played a press sound
        assert.equal(plays, 1);
        input.destroy();
    });
});

test('UIVideo plays inline, and setTime before its metadata loads keeps the time', () =>
{
    withVideoElement(()=>
    {
        const video = new UIVideo(vec2(), vec2(20), 'clip.mp4');
        assert.equal(video.video.playsInline, true, 'an iPhone would play it fullscreen');
        video.setTime(30);
        assert.equal(video.video.currentTime, 30, 'where the load starts, not 0');
        video.setTime(-5);
        assert.equal(video.video.currentTime, 0);
        video.video.duration = 10;
        video.setTime(30);
        assert.equal(video.video.currentTime, 10, 'clamped once the duration is known');
        video.destroy();
    });
});

test('UILayout takes a fractional or zero column count, and a nested layout resizes the one it is in', () =>
{
    const grid = new UILayout(vec2(), 2.5, 10, 0);
    assert.doesNotThrow(()=> { for (let i = 3; i--;) grid.addChild(new UIObject(vec2(), vec2(20))); });
    assert.equal(grid.size.x, 20 + 10 + 20, 'two columns');
    grid.columns = 0;
    assert.doesNotThrow(()=> grid.relayout());
    assert.equal(grid.size.x, 20, 'one column');
    grid.destroy();

    const outer = new UILayout(vec2(), 1, 10, 0);
    const inner = outer.addChild(new UILayout(vec2(), 1, 10, 0));
    assert.equal(outer.size.y, 0);
    const child = inner.addChild(new UIObject(vec2(), vec2(30)));
    assert.equal(inner.size.y, 30);
    assert.equal(outer.size.y, 30, 'the outer layout takes the inner one\'s new size');
    child.destroy(); // the inner layout empties
    assert.equal(outer.size.y, 0);
    outer.destroy();
});

test('UI types come out as the code takes them in the d.ts', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const body = (name)=> dts.match(new RegExp(`export class ${name} [^{]*\\{([\\s\\S]*?)\\n    \\}`))[1];
    const system = body('UISystemPlugin'), object = body('UIObject');
    assert.match(system, /constructor\(context\?: CanvasRenderingContext2D \| OffscreenCanvasRenderingContext2D\);/);
    // tsc leaves undefined off accessor types, so the accessor only needs the object type
    assert.match(system, /get keyInputObject\(\): UIObject;/);
    for (const sound of ['soundPress', 'soundRelease', 'soundClick'])
        assert.match(object, new RegExp(`${sound}: Sound \\| undefined;`), sound);
    assert.match(object, /align: ['"]left['"] \| ['"]center['"] \| ['"]right['"];/);
    assert.match(object, /onKeyDown\(e: KeyboardEvent\): void;/);
    assert.doesNotMatch(body('UIVideo'), /^\s*soundEnabled/m, 'internal, not public');
    assert.match(body('UITile'), /constructor\(pos: Vector2, size: Vector2, tileInfo: TileInfo,/);
});
