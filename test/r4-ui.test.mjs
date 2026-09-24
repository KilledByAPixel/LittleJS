import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineInit, engineStep, setEngineManualStep, setHeadlessMode, setSoundEnable,
    UISystemPlugin, UIObject, UIButton, UITextInput, UITile, UILayout, UIVideo, TileInfo,
    TextureSheet, textureSheets, loadSprite, loadAtlas, spritesReady,
    Tween, tweenUpdate, tweenStopAll, vec2 } from '../dist/littlejs.esm.js';

// an Image that loads at once with the given size, or fails to load with no size
const imageStub = (width, height)=> class
{
    set src(value)
    {
        this.width = width;
        this.height = height;
        queueMicrotask(()=> width ? this.onload() : this.onerror());
    }
};
const HeadlessImage = globalThis.Image;

// before engineInit, with rendering on as a game has it: captured here since every test runs after engineInit
const earlyErrors = {};
globalThis.Image = imageStub(0, 0);
setHeadlessMode(false);
try { loadSprite('early.png'); } catch (e) { earlyErrors.sprite = e; }
try { loadAtlas('early.png', {frames: {}}); } catch (e) { earlyErrors.atlas = e; }
setHeadlessMode(true);
globalThis.Image = HeadlessImage;

// engineInit once per file at module scope, the UI updates as a plugin through engineStep
setEngineManualStep(true);
await engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
const ui = new UISystemPlugin;

const near = (a, b, eps=1e-9)=> Math.abs(a - b) <= eps;

test('uiSystem.destroyObjects from a UI callback does not break the update loop', () =>
{
    ui.destroyObjects();
    const title = new UIObject(vec2(), vec2(10));
    const menu = new UIObject(vec2(), vec2(10)); // updated first, the list is walked from the end
    let calls = 0;
    menu.onUpdate = ()=> { ++calls; ui.destroyObjects(); };
    assert.doesNotThrow(()=> engineStep());
    assert.equal(calls, 1);
    assert.ok(title.destroyed && menu.destroyed);
    assert.equal(ui.uiObjects.length, 0);
});

test('a destroyed menu leaves no navigable buttons behind', () =>
{
    ui.destroyObjects();
    const menu = new UIObject(vec2(), vec2(100));
    const button = menu.addChild(new UIButton(vec2(), vec2(20), 'Go'));
    button.navigationIndex = 0;
    assert.ok(ui.getNavigableObjects().includes(button));
    menu.destroy(); // it and its children stay in the list until the next update
    assert.ok(!ui.getNavigableObjects().includes(button));
    ui.destroyObjects();
});

test('a child of a disabled parent draws disabled', () =>
{
    ui.destroyObjects();
    const panel = new UIObject(vec2(), vec2(100));
    const button = panel.addChild(new UIButton(vec2(), vec2(20), 'Go'));
    const colors = [];
    ui.drawRect = (pos, size, color)=> colors.push(color);
    ui.drawText = ()=> {};
    try
    {
        panel.disabled = true;
        button.render();
    }
    finally { delete ui.drawRect; delete ui.drawText; }
    assert.equal(colors[0], button.disabledColor);
    ui.destroyObjects();
});

test('ctrl and cmd shortcuts do not type into a text input, AltGr characters do', () =>
{
    const input = new UITextInput(vec2(), vec2(100, 20), 'ab');
    input.onKeyDown({code: 'KeyV', key: 'v', ctrlKey: true});
    input.onKeyDown({code: 'KeyZ', key: 'z', metaKey: true});
    assert.equal(input.text, 'ab');
    input.onKeyDown({code: 'KeyQ', key: '@', ctrlKey: true, altKey: true,
        getModifierState: (key)=> key === 'AltGraph'});
    input.onKeyDown({code: 'KeyC', key: 'c'});
    assert.equal(input.text, 'ab@c');
    input.destroy();
});

test('a text input leaves the F keys to the browser and ignores a held Enter or Space repeating', () =>
{
    // the field listens on the window, which Node does not have
    globalThis.addEventListener = globalThis.removeEventListener = ()=> {};
    try
    {
        const input = new UITextInput(vec2(), vec2(100, 20), 'ab');
        ui.keyInputObject = input;
        const press = (code, key, extra)=>
        {
            let prevented = false;
            ui._onKeyDown({type: 'keydown', code, key, stopPropagation() {},
                preventDefault() { prevented = true; }, ...extra});
            return prevented;
        };
        assert.equal(press('F5', 'F5'), false);
        assert.equal(press('F12', 'F12'), false);
        assert.equal(press('KeyA', 'a'), true);
        assert.equal(press('Backspace', 'Backspace'), true);
        assert.equal(press('ArrowLeft', 'ArrowLeft'), true);
        assert.equal(input.text, 'ab');
        assert.equal(press('Space', ' ', {repeat: true}), true, 'still no scrolling');
        press('Enter', 'Enter', {repeat: true});
        assert.equal(input.text, 'ab', 'a repeat of the Space that started editing types nothing');
        assert.equal(ui.keyInputObject, input, 'a repeat of the Enter that started editing does not end it');
        press('Enter', 'Enter');
        assert.equal(ui.keyInputObject, undefined);
        input.destroy();
    }
    finally
    {
        ui.keyInputObject = undefined;
        delete globalThis.addEventListener;
        delete globalThis.removeEventListener;
    }
});

test('a confirm dialog destroyed another way still gives navigation back', () =>
{
    ui.destroyObjects();
    ui.navigationDirection = 1;
    ui.showConfirmDialog('Quit?');
    assert.equal(ui.navigationDirection, 2);
    ui.destroyObjects();
    assert.equal(ui.confirmDialog, undefined);
    assert.equal(ui.navigationDirection, 1);

    const dialog = ui.showConfirmDialog('Quit?'); // asserts if the last one were still up
    dialog.destroy();
    assert.equal(ui.confirmDialog, undefined);
    assert.equal(ui.navigationDirection, 1);
    ui.destroyObjects();
});

test('loadSprite and loadAtlas before engineInit fail with an assert saying what to do', () =>
{
    assert.equal(earlyErrors.sprite?.message, 'Assert failed!');
    assert.equal(earlyErrors.atlas?.message, 'Assert failed!');
});

test('UITile calls onRender', () =>
{
    const tileObject = new UITile(vec2(), vec2(20), new TileInfo(vec2(), vec2(16)));
    let rendered = 0;
    tileObject.onRender = ()=> ++rendered;
    ui.drawTile = ()=> {};
    try { tileObject.render(); }
    finally { delete ui.drawTile; }
    assert.equal(rendered, 1);
    tileObject.destroy();
});

test('an undefined shadowColor draws no shadow', () =>
{
    const shadows = [];
    const context = { set shadowColor(color) { shadows.push(color); },
        beginPath() {}, rect() {}, roundRect() {}, fill() {}, stroke() {} };
    const savedContext = ui.uiContext;
    ui.uiContext = context;
    const o = new UIObject(vec2(), vec2(20));
    o.shadowColor = undefined;
    o.shadowBlur = 5;
    try { o.render(); }
    finally { ui.uiContext = savedContext; }
    assert.deepEqual(shadows, ['#0000'], 'only the reset after the fill');
    o.destroy();
});

test('a held object that is hidden or disabled is released, a destroyed one is not', () =>
{
    ui.destroyObjects();
    const button = new UIButton(vec2(), vec2(20));
    let released = 0;
    button.onRelease = ()=> ++released;
    ui.activeObject = button;
    button.visible = false;
    engineStep();
    assert.equal(ui.activeObject, undefined);
    assert.equal(released, 1);

    const panel = new UIObject(vec2(), vec2(100));
    const key = panel.addChild(new UIButton(vec2(), vec2(20)));
    let keyReleased = 0;
    key.onRelease = ()=> ++keyReleased;
    ui.activeObject = key;
    panel.disabled = true;
    engineStep();
    assert.equal(ui.activeObject, undefined);
    assert.equal(keyReleased, 1);

    const gone = new UIButton(vec2(), vec2(20));
    let goneReleased = 0;
    gone.onRelease = ()=> ++goneReleased;
    ui.activeObject = gone;
    gone.destroy();
    engineStep();
    assert.equal(goneReleased, 0);
    ui.destroyObjects();
});

test('a UILayout with more columns than children stays centered', () =>
{
    const layout = new UILayout(vec2(), 4, 10, 10);
    const a = layout.addChild(new UIObject(vec2(), vec2(20)));
    const b = layout.addChild(new UIObject(vec2(), vec2(20)));
    assert.equal(layout.size.x, 20 + 10 + 20 + 10*2);
    assert.equal(a.localPos.x, -15);
    assert.equal(b.localPos.x, 15);
    layout.destroy();
});

test('UIVideo follows soundEnable after it is made', () =>
{
    const doc = globalThis.document;
    doc.createElement = ()=> ({style: {}, pause() {}, remove() {}});
    doc.body.appendChild = ()=> {};
    try
    {
        setSoundEnable(true);
        const video = new UIVideo(vec2(), vec2(20), 'clip.mp4');
        assert.equal(video.video.muted, false);
        setSoundEnable(false);
        video.update();
        assert.equal(video.video.muted, true);
        setSoundEnable(true);
        video.update();
        assert.equal(video.video.muted, false);
        video.destroy();
    }
    finally
    {
        setSoundEnable(true);
        delete doc.createElement;
        delete doc.body.appendChild;
    }
});

test('a looping tween carries the time it ran over into the next iteration', () =>
{
    tweenStopAll();
    let value;
    const looped = new Tween((v)=> value = v, 0, 1, .1).loop();
    tweenUpdate(.06);
    tweenUpdate(.06); // runs .02 over
    assert.ok(near(looped.life, .08), 'life ' + looped.life);
    assert.ok(near(value, .2), 'the new iteration starts .02 in, ' + value);
    tweenUpdate(.03);
    assert.ok(near(looped.getPercent(), .5));
    looped.stop();

    const bounced = new Tween((v)=> value = v, 0, 1, .1).pingPong();
    tweenUpdate(.13);
    assert.ok(near(value, .7), 'on its way back, .03 in, ' + value);
    bounced.stop();

    // running over by more than a whole iteration drops the rest, rather than owe it forever
    const skipped = new Tween(()=> {}, 0, 1, .1).loop();
    tweenUpdate(1);
    assert.ok(skipped.life > 0 && skipped.life <= .1, 'life ' + skipped.life);
    skipped.stop();
    tweenStopAll();
});

test('the tween system keeps its helper names out of the script build globals', () =>
{
    const source = readFileSync(new URL('../dist/littlejs.js', import.meta.url), 'utf8');
    for (const name of ['lastTime', 'lastTimeReal', 'isLerpable', 'loopContinuation', 'pingPongContinuation'])
        assert.ok(!new RegExp(`^(let|const|function) ${name}\\b`, 'm').test(source), name);
});

test('drawImage copies only whole frames, so an image that is not a whole number of them ends', () =>
{
    const sheet = new TextureSheet(256);
    let draws = 0;
    sheet.context = { drawImage() { if (++draws > 100) throw new Error('drawImage never stops'); } };
    const tile = new TileInfo(vec2(1), vec2(16), sheet.textureInfo, 1, 0, 6);
    sheet.drawImage({width: 100, height: 20}, tile, false); // 6.25 by 1.25 frames
    assert.equal(draws, 6);
});

test('in release, tryAdd packs only the whole frames of an image', async () =>
{
    // the debug build asserts on a size that is not a whole number of frames, the release build packs it
    const release = await import('../dist/littlejs.esm.min.js');
    release.setHeadlessMode(true);
    const sheet = new release.TextureSheet(256);
    const tile = sheet.tryAdd(release.vec2(100, 20), release.vec2(16), 1);
    assert.equal(tile.columns, 6);
    assert.equal(sheet.cursor.x, 6*18);
    assert.equal(sheet.tryAdd(release.vec2(10), release.vec2(16), 1), undefined, 'smaller than a frame');
    assert.equal(sheet.cursor.x, 6*18, 'and the sheet is left as it was');
});

test('an image too big for any sheet is skipped with a log, and no sheet is made for it', async () =>
{
    const sheet = new TextureSheet(); // made headless, so it has no canvas
    textureSheets.push(sheet);
    const sheetCount = textureSheets.length;
    const errors = [];
    const consoleError = console.error;
    console.error = (...args)=> errors.push(args);
    globalThis.Image = imageStub(16, 4096); // taller than the 2048 sheet
    setHeadlessMode(false);
    let tile, atlas;
    try
    {
        tile = loadSprite('tall.png');
        atlas = loadAtlas('tall.png', {frames: {tall: {frame: {x: 0, y: 0, w: 16, h: 4096}}}});
        await spritesReady();
    }
    finally
    {
        setHeadlessMode(true);
        globalThis.Image = HeadlessImage;
        console.error = consoleError;
        textureSheets.splice(textureSheets.indexOf(sheet), 1);
    }
    assert.deepEqual(errors, []);
    assert.equal(textureSheets.length, sheetCount - 1);
    assert.equal(tile.size.x, 0, 'the tile is left empty');
    assert.equal(atlas.tall, undefined);
});

test('UI and tween types come out typed in the d.ts', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const body = (name)=> dts.match(new RegExp(`export class ${name} [^{]*\\{([\\s\\S]*?)\\n    \\}`))[1];
    const system = body('UISystemPlugin'), object = body('UIObject'), text = body('UIText');
    assert.doesNotMatch(system, /uiObjects: any/);
    assert.doesNotMatch(system, /_dragListeners: any/);
    assert.doesNotMatch(object, /children: any/);
    assert.match(object, /destroyed: boolean;/);
    assert.match(object, /update\(\): void;/);
    assert.match(object, /align: ['"]left['"] \| ['"]center['"] \| ['"]right['"];/);
    assert.doesNotMatch(text, /gradientColor: any/);
    assert.match(body('Tween'), /start: [^;]*Vector3[^;]*;/);
});
