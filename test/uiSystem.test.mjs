import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineInit, engineStep, setEngineManualStep, UISystemPlugin, UIObject, UICheckbox, vec2 } from '../dist/littlejs.esm.js';

// engineInit once per file at module scope, the UI updates as a plugin through engineStep
setEngineManualStep(true);
await engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {});
new UISystemPlugin;

test('a UI child that destroys an earlier sibling in its update does not update twice', () =>
{
    const parent = new UIObject(vec2(), vec2(100));
    const [a, b, c] = [0, 1, 2].map(()=> parent.addChild(new UIObject(vec2(), vec2(10))));
    const counts = new Map([[a, 0], [b, 0], [c, 0]]);
    for (const o of [a, b, c])
        o.onUpdate = ()=> counts.set(o, counts.get(o) + 1);
    c.onUpdate = ()=> { counts.set(c, counts.get(c) + 1); a.destroy(); }; // the last child is updated first
    engineStep();
    assert.equal(counts.get(c), 1, 'updated once');
    assert.equal(counts.get(b), 1);
    parent.destroy();
    engineStep();
});

test('a checkbox click plays its click sound, as every UI object does', () =>
{
    const box = new UICheckbox(vec2(), vec2(40));
    let plays = 0;
    box.soundClick = { play: ()=> ++plays };
    box.click();
    assert.equal(box.checked, true);
    assert.equal(plays, 1);
    box.click(false); // the caller that already played a press sound asks for none
    assert.equal(plays, 1);
    box.destroy();
});
