import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// What the 3D level editor's panel does to the level: the numbers and properties of the one selected object, and
// the hint line. The panel itself and the drawing are checked in headless Chrome, the panel is never made here.

async function loadGame()
{
    const engine = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin; }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    engine.run(`
        class Crate extends EngineObject3D { constructor(pos) { super(pos, render3D.boxMesh); } }
        level3DAddType('Crate', Crate, { health: 3, open: false, label: 'crate', tint: hsl(0, 0, 1), spot: vec3(),
            flat: vec2(), list: [1, 2] });
        var level = { littlejs3D: 1, objects: [
            { id: 1, type: 'Crate', pos: [.5, .5, .5] },
            { id: 2, type: 'Box', pos: [3.5, .5, .5] }] };
        level3DLoad(level);
        var live = (id)=> editor3DInstances.get(id);
        var list = ()=> level.objects;
        engineStep(2);
        levelEditor.open()`);
    return engine;
}
function step(engine, count=1)
{
    for (let i = count; i--;)
        engine.run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);
}
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));

test('the position, rotation and scale of the one selected object are set from the panel, each as one undo', async ()=>
{
    const { run } = await loadGame();
    assert.equal(run(`editor3DSetSelectedTransform('pos', vec3(1, 2, 3))`), false, 'nothing selected');
    run('editor3DSelection.add(1)');
    assert.equal(run(`editor3DSetSelectedTransform('pos', vec3(1, 2, 3))`), true);
    assert.equal(run(`editor3DSetSelectedTransform('rotation', vec3(0, 30, 0))`), true);
    assert.equal(run(`editor3DSetSelectedTransform('scale', vec3(2, 2, 2))`), true);
    assert.deepEqual(json(run, 'list()[0]'),
        { id: 1, type: 'Crate', pos: [1, 2, 3], rotation: [0, 30, 0], scale: [2, 2, 2] });
    assert.equal(run('editor3DUndoList.length'), 3);
    assert.deepEqual([...run('[live(1).pos3D.y, live(1).scale3D.x]')], [2, 2]);
    assert.equal(run(`editor3DSetSelectedTransform('pos', 5)`), false, 'not a vector');
    run('editor3DSelection.add(2)');
    assert.equal(run(`editor3DSetSelectedTransform('pos', vec3())`), false, 'more than one selected');
});

test('a property of the one selected object is set from the panel, of the type its default has', async ()=>
{
    const { run } = await loadGame();
    run('editor3DSelection.add(1)');
    assert.equal(run(`editor3DSetSelectedProperty('health', 7)`), true);
    assert.equal(run(`editor3DSetSelectedProperty('open', true)`), true);
    assert.equal(run(`editor3DSetSelectedProperty('label', 'big')`), true);
    assert.equal(run(`editor3DSetSelectedProperty('tint', hsl(0, 1, .5))`), true);
    assert.equal(run(`editor3DSetSelectedProperty('spot', vec3(1, 2, 3))`), true);
    assert.equal(run(`editor3DSetSelectedProperty('flat', vec2(4, 5))`), true);
    assert.deepEqual(json(run, 'list()[0].properties'),
        { health: 7, open: true, label: 'big', tint: '#ff0000', spot: [1, 2, 3], flat: [4, 5] });
    assert.deepEqual([...run('[live(1).health, live(1).open, live(1).spot.z, live(1).flat.y]')], [7, true, 3, 5]);
    assert.equal(run('editor3DUndoList.length'), 6);
    assert.equal(run(`editor3DSetSelectedProperty('health', 'seven')`), false, 'not a number');
    assert.equal(run(`editor3DSetSelectedProperty('spot', vec2(1, 2))`), false, 'not a vec3');
    assert.equal(run(`editor3DSetSelectedProperty('list', [3])`), false, 'a type with no input');
    assert.equal(run(`editor3DSetSelectedProperty('nope', 1)`), false, 'not a property of the type');
    run(`editor3DSetSelectedProperty('health', 3)`);
    assert.equal(run('list()[0].properties.health'), undefined, 'the default is not kept');
});

test('the hint line says what the mouse does now', async ()=>
{
    const { run } = await loadGame();
    assert.match(run('editor3DHint()'), /Click to select/);
    run('editor3DSelection.add(1)');
    assert.match(run('editor3DHint()'), /Drag a handle/);
    run(`editor3DBrush = 'Box'`);
    assert.match(run('editor3DHint()'), /Click to place a Box/);
    run(`editor3DDrag = {kind: 'arrow'}`);
    assert.match(run('editor3DHint()'), /puts it back/);
    run(`editor3DDrag = {kind: 'box'}`);
    assert.match(run('editor3DHint()'), /select what is inside/);
    run('editor3DDrag = undefined; inputData[0][2] = 1');
    assert.match(run('editor3DHint()'), /fly/);
});

test('every key the editor takes is in the help', async ()=>
{
    const { run } = await loadGame();
    const help = run('editor3DHelpLines.join(" ")');
    for (const word of ['Q', 'W', 'E', 'R', 'G', 'End', 'F', 'Delete', 'Ctrl+C', 'Ctrl+D', 'Ctrl+Z', 'Esc', '0', 'Alt',
        'Wheel', 'Shift', 'Right button', 'Space'])
        assert.ok(help.includes(word), word);
});

test('playing in a session, a captured mouse the browser let go of goes back to editing, as Escape does', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSetOpen(false); document.pointerLockElement = mainCanvas');
    step(engine);
    assert.equal(run('editor3DIsOpen'), false, 'captured, still playing');
    run('document.pointerLockElement = undefined');
    step(engine);
    assert.deepEqual([...run('[editor3DIsOpen, editor3DSession]')], [true, true]);
    run('levelEditor.close(); document.pointerLockElement = mainCanvas');
    step(engine);
    run('document.pointerLockElement = undefined');
    step(engine);
    assert.equal(run('editor3DIsOpen'), false, 'no session, the lock is the game\'s own business');
});

test('a captured mouse the game let go of itself does not go back to editing', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSetOpen(false); document.pointerLockElement = mainCanvas');
    step(engine);
    run('pointerLockExit(); document.pointerLockElement = undefined'); // as a player destroyed on a restart does
    step(engine);
    assert.equal(run('editor3DIsOpen'), false);
    step(engine);
    assert.equal(run('editor3DIsOpen'), false);
});
