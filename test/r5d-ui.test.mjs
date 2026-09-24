import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineInit, setEngineManualStep, uiSystem, UISystemPlugin, UIObject, UIButton, UIText,
    mousePosScreen, vec2 } from '../dist/littlejs.esm.js';

// Review 5 decisions for the UI plugin. Headless skips input, so what needs a real key or
// gamepad press (a navigation press being used up, gamepad B closing the confirm dialog)
// is checked in a browser instead.

// engineInit once per file at module scope
setEngineManualStep(true);
await engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
const ui = uiSystem || new UISystemPlugin;

test('isMouseOverUI is true over a visible hoverable object, and anywhere while the confirm dialog is open', () =>
{
    ui.destroyObjects();
    assert.equal(typeof ui.isMouseOverUI, 'function');
    const under = (o)=> { o.nativePos = mousePosScreen.copy(); return o; };
    const away = new UIButton(vec2(), vec2(20));
    away.nativePos = vec2(1e4);
    assert.equal(ui.isMouseOverUI(), false);

    // positions are the ones the last UI update set, placed straight here
    const panel = under(new UIObject(vec2(), vec2(100)));
    assert.equal(ui.isMouseOverUI(), true);
    panel.disabled = true; // a disabled object still takes the click
    assert.equal(ui.isMouseOverUI(), true);
    panel.visible = false;
    assert.equal(ui.isMouseOverUI(), false);

    // an object that can not be hovered lets the click through, a hoverable child under it does not
    panel.visible = true;
    panel.canBeHover = false;
    assert.equal(ui.isMouseOverUI(), false);
    const button = panel.addChild(under(new UIButton(vec2(), vec2(20))));
    assert.equal(ui.isMouseOverUI(), true);
    panel.visible = false; // a hidden parent hides it
    assert.equal(ui.isMouseOverUI(), false);
    button.destroy();
    panel.destroy();

    const text = under(new UIText(vec2(), vec2(100), 'hi'));
    assert.equal(ui.isMouseOverUI(), false, 'text is not hoverable');
    text.destroy();

    const dialog = ui.showConfirmDialog();
    assert.equal(ui.isMouseOverUI(), true, 'the dialog blocks everywhere');
    dialog.destroy();
    assert.equal(ui.isMouseOverUI(), false);
    ui.destroyObjects();
});

test('the confirm dialog places its title and buttons by its size, the same as before at the default size', () =>
{
    ui.destroyObjects();
    const dialog = ui.showConfirmDialog('Quit?', undefined, undefined, vec2(400, 150));
    const [title, yes, no] = dialog.children;
    assert.equal(title.localPos.y, -30);
    assert.equal(yes.localPos.y, 30);
    assert.equal(no.localPos.y, 30);
    dialog.destroy();

    const standard = ui.showConfirmDialog();
    assert.deepEqual(standard.children.map(o=> o.localPos.y), [-50, 50, 50]);
    assert.deepEqual(standard.children.map(o=> o.localPos.x), [0, -80, 80]);
    standard.destroy();
    ui.destroyObjects();
});
