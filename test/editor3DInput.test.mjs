import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The 3D level editor's mouse and keys, driven the way the engine's input sees them: the mouse position, buttons and
// keys are set, then a step runs. The canvas is 1000 by 1000 and the editor's camera looks down -Z from 10 units
// in front of the first box, so a world unit there is 86.6 pixels and screen center is the box's middle.

async function loadGame()
{
    const engine = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true); var postReads = []');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin; }, ()=> {}, ()=> postReads.push(keyIsDown('KeyW') || mouseIsDown(0)),
            ()=> {}, ()=> {})`);
    engine.run(`
        var level = { littlejs3D: 1, objects: [
            { id: 1, type: 'Box', pos: [.5, .5, .5] },
            { id: 2, type: 'Box', pos: [3.5, .5, .5] },
            { id: 3, type: 'Light', pos: [-2.5, 3.5, .5] }] }; // aside, clear of a view from above
        level3DLoad(level);
        render3D.camera.pos = vec3(.5, .5, 10.5);
        var live = (id)=> editor3DInstances.get(id);
        var list = ()=> level.objects;
        var selected = ()=> [...editor3DSelection];
        var screen = (x, y, z)=> editor3DWithView(()=> render3D.worldToScreen(vec3(x, y, z)));
        engineStep(2); // past the first step, which has no time in it
        levelEditor.open()`);
    return engine;
}

// a step, then the pressed and released states cleared as inputUpdatePost does in a browser
function step(engine, count=1)
{
    for (let i = count; i--;)
        engine.run(`engineStep(); for (const device of inputData) for (const i in device) device[i] &= 1;`);
}

// the mouse: move it, press a button, let one go; and a whole drag of the left button, in a few steps
const moveTo = (engine, x, y)=> engine.run(`mouseDeltaScreen = vec2(${x}, ${y}).subtract(mousePosScreen);
    mousePosScreen = vec2(${x}, ${y})`);
const press = (engine, button=0)=> engine.run(`inputData[0][${button}] = 3`);
const release = (engine, button=0)=> engine.run(`inputData[0][${button}] = 4`);
function click(engine, x, y, button=0)
{
    moveTo(engine, x, y); press(engine, button); step(engine);
    release(engine, button); step(engine);
}
function drag(engine, from, to, steps=4, end=true)
{
    moveTo(engine, from[0], from[1]); press(engine); step(engine);
    for (let i = 1; i <= steps; ++i)
    {
        moveTo(engine, from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
        step(engine);
    }
    if (end)
    {
        release(engine);
        step(engine);
    }
}
const key = (engine, code, held=[])=>
{
    for (const h of held) engine.run(`inputData[0].${h} = 1`);
    engine.run(`inputData[0].${code} = 3`);
    step(engine);
    engine.run(`inputData[0].${code} = 0`);
    for (const h of held) engine.run(`inputData[0].${h} = 0`);
    step(engine);
};
const near = (a, b, message, reach=1e-4)=> assert.ok(Math.abs(a - b) < reach, message ?? `${a} is not ${b}`);
const json = (run, code)=> JSON.parse(run(`JSON.stringify(${code})`));
const unit = 1000 / (20 * Math.tan(Math.PI / 6)); // pixels to a world unit at the first box

test('a click selects the object under the mouse, one on nothing clears, and Shift adds or takes away', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    assert.deepEqual(json(run, 'selected()'), [1]);
    click(engine, 500 + 3 * unit, 500);
    assert.deepEqual(json(run, 'selected()'), [2]);
    run('inputData[0].ShiftLeft = 1');
    click(engine, 500, 500);
    assert.deepEqual(json(run, 'selected()'), [2, 1]);
    click(engine, 500, 500);
    assert.deepEqual(json(run, 'selected()'), [2]);
    run('inputData[0].ShiftLeft = 0');
    click(engine, 500, 900);
    assert.deepEqual(json(run, 'selected()'), []);
    assert.equal(run('editor3DUndoList.length'), 0, 'selecting is not an edit');
});

test('a light has no mesh to click, its marker selects it', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500 - 3 * unit, 500 - 3 * unit);
    assert.deepEqual(json(run, 'selected()'), [3]);
});

test('dragging the X arrow moves along X, snapped by the box\'s corner, as one undo', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    assert.equal(run('editor3DTool'), 'move');
    drag(engine, [600, 500], [600 + unit, 500]);
    assert.deepEqual(json(run, 'list()[0].pos'), [1.5, .5, .5]);
    near(run('live(1).pos3D.x'), 1.5);
    assert.equal(run('editor3DUndoList.length'), 1);
    assert.deepEqual(json(run, 'selected()'), [1], 'still selected');
    run('editor3DUndo()');
    assert.deepEqual(json(run, 'list()[0].pos'), [.5, .5, .5]);
});

test('a drag short of half a step stays, and Ctrl moves freely', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    drag(engine, [600, 500], [600 + .4 * unit, 500]);
    assert.deepEqual(json(run, 'list()[0].pos'), [.5, .5, .5]);
    assert.equal(run('editor3DUndoList.length'), 0);
    run('inputData[0].ControlLeft = 1');
    drag(engine, [600, 500], [600 + .4 * unit, 500]);
    run('inputData[0].ControlLeft = 0');
    near(run('list()[0].pos[0]'), .9);
    assert.deepEqual(json(run, 'list()[0].pos.slice(1)'), [.5, .5]);
});

test('G turns the grid snap off, then Ctrl turns it on for a drag', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    key(engine, 'KeyG');
    assert.equal(run('editor3DGrid'), false);
    drag(engine, [600, 500], [600 + .4 * unit, 500]);
    near(run('list()[0].pos[0]'), .9);
    run('editor3DUndo(); inputData[0].ControlLeft = 1');
    drag(engine, [600, 500], [600 + .6 * unit, 500]);
    assert.deepEqual(json(run, 'list()[0].pos'), [1.5, .5, .5]);
});

// the handles as the editor draws them: the meshes drawn, and which way each points
function drawnHandles(run, tool)
{
    return json(run, `(()=>
    {
        editor3DSelection.add(1); editor3DTool = '${tool}';
        const drawMesh = render3D.drawMesh, drawBox = render3D.drawBox, cones = [];
        let boxes = 0;
        render3D.drawMesh = (mesh, matrix)=> mesh === editor3DConeMesh() && cones.push(matrix.transformDirection(vec3(0, 1, 0)).normalize());
        render3D.drawBox = ()=> ++boxes;
        try { editor3DWithView(editor3DDraw); }
        finally { render3D.drawMesh = drawMesh, render3D.drawBox = drawBox; }
        return {cones: cones.map((d)=> [d.x, d.y, d.z].map((v)=> Math.round(v))), boxes};
    })()`);
}

test('the move arrows end in cones pointing along their axes, the scale handles in boxes', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    const move = drawnHandles(run, 'move');
    assert.deepEqual(move.cones.sort(), [[0, 0, 1], [0, 1, 0], [1, 0, 0]]);
    const scale = drawnHandles(run, 'scale');
    assert.deepEqual(scale.cones, [], 'no cones to scale with');
    assert.ok(scale.boxes >= 4, 'a box on each axis and one in the middle');
});

test('the collision box is drawn for the selected solid object only, turned with it', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    const solids = (select)=> json(run, `(()=>
    {
        editor3DSelection.clear(); ${select}
        editor3DChange((l)=> l[1].rotation = [0, 30, 0]); editor3DStrokeEnd();
        const drawWire = editor3DDrawWire, wires = [];
        editor3DDrawWire = (matrix, color)=> color === EDITOR3D_SOLID_COLOR &&
            wires.push(matrix.getRotation().y * 180 / PI);
        try { editor3DWithView(editor3DDraw); }
        finally { editor3DDrawWire = drawWire; }
        return wires;
    })()`);
    assert.deepEqual(solids(''), [], 'a turned box that is not selected shows none');
    const turned = solids('editor3DSelection.add(2)');
    assert.equal(turned.length, 1);
    assert.ok(Math.abs(turned[0] - 30) < 1e-4, 'turned with the object, ' + turned[0]);
});

test('dragging the Y arrow lifts, and the square between X and Y moves along both', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    drag(engine, [500, 400], [500, 400 - 2 * unit]);
    assert.deepEqual(json(run, 'list()[0].pos'), [.5, 2.5, .5]);
    run('editor3DUndo()');
    const square = json(run, 'editor3DWithView(()=> { const h = editor3DHandles().find((h)=> h.axis === "xy");' +
        ' const at = render3D.worldToScreen(h.points[0]); return [at.x, at.y]; })');
    drag(engine, square, [square[0] + unit, square[1] - unit]);
    assert.deepEqual(json(run, 'list()[0].pos'), [1.5, 1.5, .5]);
});

test('several selected objects move together by a handle at their middle', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSelection.add(1); editor3DSelection.add(2)');
    const center = json(run, '(()=> { const at = screen(2, .5, .5); return [at.x, at.y]; })()');
    drag(engine, [center[0] + 100, center[1]], [center[0] + 100 + 2 * unit, center[1]]);
    assert.deepEqual(json(run, '[list()[0].pos, list()[1].pos]'), [[2.5, .5, .5], [5.5, .5, .5]]);
    assert.equal(run('editor3DUndoList.length'), 1);
});

test('a drag on an object\'s body moves it under the mouse, and with ground snap it lands on what is there', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    key(engine, 'KeyQ'); // the Select tool, no handles in the way
    // from the first box to where the second is, three units along X: it climbs onto it, a step as tall as itself
    drag(engine, [500, 500], [500 + 3 * unit, 500]);
    assert.deepEqual(json(run, 'selected()'), [1]);
    assert.deepEqual(json(run, 'list()[0].pos'), [3.5, 1.5, .5]);
    assert.equal(run('editor3DUndoList.length'), 1);
    // and on past it, back down to the ground
    drag(engine, [500 + 3 * unit, 500 - unit], [500 + 5 * unit, 500 - unit]);
    assert.deepEqual(json(run, 'list()[0].pos'), [5.5, .5, .5]);
});

test('with ground snap off a body drag moves level at the object\'s height', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DGroundSnap = false; editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0)');
    key(engine, 'KeyQ');
    drag(engine, [500, 500], [500 + unit, 500 + 2 * unit]); // looking down: right is +X, down the screen is +Z
    assert.deepEqual(json(run, 'list()[0].pos'), [1.5, .5, 2.5]);
});

test('a press that does not move is a click, not a drag: nothing to undo', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    key(engine, 'KeyQ');
    drag(engine, [500, 500], [502, 501]);
    assert.deepEqual(json(run, 'list()[0].pos'), [.5, .5, .5]);
    assert.equal(run('editor3DUndoList.length'), 0);
    assert.deepEqual(json(run, 'selected()'), [1]);
});

test('E is the Rotate tool: dragging the yaw ring turns the object in steps of 15 degrees', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0)');
    click(engine, 500, 500);
    key(engine, 'KeyE');
    assert.equal(run('editor3DTool'), 'rotate');
    // seen from above, the yaw ring is a circle 150 pixels out; from its +Z side, down the screen, toward +X
    const a = 20 * Math.PI / 180;
    drag(engine, [500, 650], [500 + 150 * Math.sin(a), 500 + 150 * Math.cos(a)]);
    assert.deepEqual(json(run, 'list()[0].rotation'), [0, 15, 0]);
    near(run('live(1).rotation3D.y'), 15 * Math.PI / 180);
    assert.equal(run('editor3DUndoList.length'), 1);
});

test('a ring seen edge on can not be taken, the one facing the view is', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`editor3DSelection.add(1); editor3DTool = 'rotate'`);
    // from the front, the roll ring faces the view and the pitch and yaw rings are lines across it
    const taken = (x, y)=> run(`editor3DWithView(()=> editor3DHandleAt(vec2(${x}, ${y}))?.axis)`);
    assert.equal(taken(650, 500), 'z');
    assert.equal(taken(500, 350), 'z');
    assert.equal(taken(500, 420), undefined, 'on the line the pitch ring is, inside the roll ring');
    run('editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0)');
    assert.equal(taken(500, 650), 'y');
});

test('R is the Scale tool: an axis handle scales along it, the middle box scales all three', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    key(engine, 'KeyR');
    assert.equal(run('editor3DTool'), 'scale');
    drag(engine, [600, 500], [700, 500]); // twice as far along X
    assert.deepEqual(json(run, 'list()[0].scale'), [2, 1, 1]);
    near(run('live(1).scale3D.x'), 2);
    run('editor3DUndo()');
    drag(engine, [500, 500], [500 + 200 * Math.log(2), 500]);
    assert.deepEqual(json(run, 'list()[0].scale'), [2, 2, 2]);
});

test('a type picked up as the brush is placed by a click, on the surface under the mouse, selected', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0);
        editor3DTool = 'select'; editor3DBrush = 'Box'`);
    click(engine, 500 - 3 * unit, 500 + 2 * unit); // on the ground, 3 to the left and 2 toward the viewer
    assert.deepEqual(json(run, 'list()[3]'), { id: 4, type: 'Box', pos: [-2.5, .5, 2.5] });
    assert.deepEqual(json(run, 'selected()'), [4]);
    assert.deepEqual([...run('[editor3DBrush, editor3DTool, editor3DUndoList.length]')], [undefined, 'move', 1]);
    run(`editor3DBrush = 'Box'`);
    click(engine, 500, 500); // on top of the first box
    assert.deepEqual(json(run, 'list()[4].pos'), [.5, 1.5, .5]);
    run(`editor3DBrush = 'Box'; inputData[0].ShiftLeft = 1`);
    click(engine, 500 + 6 * unit, 500);
    assert.equal(run('editor3DBrush'), 'Box', 'Shift keeps the brush');
    assert.equal(run('list().length'), 6);
});

test('a left drag from empty space selects what is inside the box, and Shift adds to the selection', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    drag(engine, [400, 700], [900, 300], 4, false);
    assert.deepEqual(json(run, '[editor3DDrag.kind, editor3DDrag.from.x, editor3DDrag.to.x]'), ['box', 400, 900]);
    release(engine); step(engine);
    assert.deepEqual(json(run, 'selected()'), [1, 2]);
    assert.equal(run('editor3DDrag'), undefined);
    run('inputData[0].ShiftLeft = 1');
    drag(engine, [150, 350], [350, 150]);
    assert.deepEqual(json(run, 'selected()'), [1, 2, 3]);
});

test('Q, W, E and R pick the tool, but fly while the right button is held', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    for (const [code, tool] of [['KeyQ', 'select'], ['KeyE', 'rotate'], ['KeyR', 'scale'], ['KeyW', 'move']])
    {
        key(engine, code);
        assert.equal(run('editor3DTool'), tool);
    }
    run(`editor3DBrush = 'Box'`);
    key(engine, 'KeyQ');
    assert.equal(run('editor3DBrush'), undefined, 'Q puts the brush down');
    run('inputData[0][2] = 1; inputData[0].KeyE = 3; var y = editor3DCamera.pos.y');
    step(engine);
    assert.equal(run('editor3DTool'), 'select');
    assert.ok(run('editor3DCamera.pos.y > y'), 'E flew up');
});

test('Delete removes, Ctrl+Z and Ctrl+Y undo and redo, Ctrl+D duplicates', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    key(engine, 'Delete');
    assert.deepEqual(json(run, 'list().map((o)=> o.id)'), [2, 3]);
    key(engine, 'KeyZ', ['ControlLeft']);
    assert.deepEqual(json(run, 'list().map((o)=> o.id)'), [1, 2, 3]);
    key(engine, 'KeyY', ['ControlLeft']);
    assert.deepEqual(json(run, 'list().map((o)=> o.id)'), [2, 3]);
    key(engine, 'KeyZ', ['ControlLeft', 'ShiftLeft']);
    assert.deepEqual(json(run, 'list().map((o)=> o.id)'), [2, 3], 'Ctrl+Shift+Z redoes, and there is none');
    key(engine, 'KeyZ', ['ControlLeft']);
    run('editor3DSelection.add(1)');
    key(engine, 'KeyD', ['ControlLeft']);
    assert.deepEqual(json(run, 'list().map((o)=> [o.id, o.pos[0]])'), [[1, .5], [2, 3.5], [3, -2.5], [4, .5]]);
    assert.deepEqual(json(run, 'selected()'), [4]);
});

test('Ctrl+C and Ctrl+V paste under the mouse, standing on what is there, and Ctrl+X cuts', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0)');
    click(engine, 500, 500);
    key(engine, 'KeyC', ['ControlLeft']);
    moveTo(engine, 500 - 4 * unit, 500);
    key(engine, 'KeyV', ['ControlLeft']);
    assert.deepEqual(json(run, 'list()[3]'), { id: 4, type: 'Box', pos: [-3.5, .5, .5] });
    assert.deepEqual(json(run, 'selected()'), [4]);
    moveTo(engine, 500 + 3 * unit, 500); // over the second box, the copy stands on it
    key(engine, 'KeyV', ['ControlLeft']);
    assert.deepEqual(json(run, 'list()[4].pos'), [3.5, 1.5, .5]);
    key(engine, 'KeyX', ['ControlLeft']);
    assert.equal(run('list().length'), 4);
});

test('End drops the selection onto what is under it', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`editor3DChange((l)=> editor3DSetTransform(l[0], vec3(3.5, 6, .5))); editor3DStrokeEnd();
        editor3DSelection.add(1)`);
    key(engine, 'End');
    assert.deepEqual(json(run, 'list()[0].pos'), [3.5, 1.5, .5], 'onto the second box');
    assert.equal(run('editor3DUndoList.length'), 2);
    run('editor3DSelection.clear(); editor3DSelection.add(3)');
    key(engine, 'End');
    assert.deepEqual(json(run, 'list()[2].pos'), [-2.5, .5, .5], 'a marker is a unit box, onto the ground');
});

test('F frames the selection: it is in the middle of the view, ahead of the camera', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DSelection.add(2); editor3DCamera.rotation = vec3(-.4, .6, 0)');
    key(engine, 'KeyF');
    const at = json(run, '(()=> { const at = screen(3.5, .5, .5); return [at.x, at.y]; })()');
    near(at[0], 500, undefined, .01);
    near(at[1], 500, undefined, .01);
    const distance = run('editor3DCamera.pos.distance(vec3(3.5, .5, .5))');
    assert.ok(distance > 2 && distance < 10, 'a fit distance, ' + distance);
    near(run('editor3DCamera.rotation.y'), .6, 'the view does not turn');
});

test('in a session Escape switches between playing and editing, and the debug overlay stays closed', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    key(engine, 'Escape');
    assert.deepEqual([...run('[editor3DIsOpen, editor3DSession, paused, debugOverlay, inputCaptureOn]')],
        [false, true, false, false, false]);
    key(engine, 'Escape');
    assert.deepEqual([...run('[editor3DIsOpen, paused, debugOverlay]')], [true, true, false]);
});

test('Escape hands the game the point under the mouse with Play from mouse on', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`var from; levelEditor.onPlayFrom = (pos)=> from = pos; editor3DPlayFromMouse = true;
        editor3DCamera.pos = vec3(.5, 10, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0)`);
    moveTo(engine, 500 - 2 * unit, 500 + unit);
    key(engine, 'Escape');
    near(run('from.x'), -1.5);
    near(run('from.y'), 0);
    near(run('from.z'), 1.5);
});

test('Escape or a right click during a drag puts things back and stays in the editor', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    drag(engine, [600, 500], [600 + 2 * unit, 500], 4, false);
    near(run('live(1).pos3D.x'), 2.5);
    run('inputData[0].Escape = 3');
    step(engine);
    assert.deepEqual([...run('[live(1).pos3D.x, editor3DIsOpen, editor3DDrag, editor3DUndoList.length]')],
        [.5, true, undefined, 0]);
    release(engine); run('inputData[0].Escape = 0'); step(engine);
    drag(engine, [600, 500], [600 + 2 * unit, 500], 4, false);
    press(engine, 2); step(engine);
    assert.deepEqual([...run('[live(1).pos3D.x, editor3DDrag, editor3DUndoList.length]')], [.5, undefined, 0]);
});

test('0 exits the editor and ends the session', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    key(engine, 'Digit0');
    assert.deepEqual([...run('[editor3DIsOpen, editor3DSession, levelEditor.isOpen, paused]')], [false, false, false, false]);
});

test('the right button looks and flies, the wheel zooms toward the mouse, the middle button pans', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('inputData[0][2] = 1; inputData[0].KeyW = 1; mouseDeltaScreen = vec2(100, 0)');
    step(engine);
    near(run('editor3DCamera.rotation.y'), -.3);
    assert.ok(run('editor3DCamera.pos.distance(vec3(.5, .5, 10.5))') > .1, 'it flew');
    run(`inputData[0][2] = 0; inputData[0].KeyW = 0; editor3DCamera.pos = vec3(.5, .5, 10.5);
        editor3DCamera.rotation = vec3()`);
    moveTo(engine, 500, 500);
    run('mouseDeltaScreen = vec2(); mouseWheel = -1');
    step(engine);
    const z = run('editor3DCamera.pos.z');
    assert.ok(z < 10.5 && z > 1, 'closer to the box, not through it: ' + z);
    near(run('editor3DCamera.pos.x'), .5);
    run('mouseWheel = 1');
    step(engine);
    assert.ok(run('editor3DCamera.pos.z') > z, 'and back out');

    run('editor3DCamera.pos = vec3(.5, .5, 10.5); inputData[0][1] = 1; mouseDeltaScreen = vec2(86.6, 0)');
    step(engine);
    // the box's front is 9.5 from the camera, where a pixel is .95 of what it is at 10
    near(run('editor3DCamera.pos.x'), .5 - 86.6 / unit * .95, 'the scene follows the mouse', .01);
    near(run('editor3DCamera.rotation.y'), 0);
});

test('Alt and a left drag orbits the selection, keeping its distance', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    run('inputData[0].AltLeft = 1');
    drag(engine, [500, 500], [700, 450]);
    run('inputData[0].AltLeft = 0');
    near(run('editor3DCamera.pos.distance(vec3(.5, .5, .5))'), 10);
    assert.ok(Math.abs(run('editor3DCamera.rotation.y')) > .1, 'it turned');
    const at = json(run, '(()=> { const at = screen(.5, .5, .5); return [at.x, at.y]; })()');
    near(at[0], 500, undefined, .01);
    near(at[1], 500, undefined, .01);
    assert.deepEqual(json(run, '[list()[0].pos, selected()]'), [[.5, .5, .5], [1]], 'nothing moved or was selected');
});

test('the game reads no keys or mouse from gameUpdatePost while the editor is open', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('postReads.length = 0; inputData[0].KeyW = 1');
    press(engine);
    step(engine);
    assert.deepEqual(json(run, 'postReads'), [false]);
    release(engine); step(engine); // Escape with a drag held would put the drag back
    key(engine, 'Escape');
    run('postReads.length = 0; inputData[0].KeyW = 1');
    step(engine);
    assert.deepEqual(json(run, 'postReads'), [true], 'playing, it reads them again');
});

test('a press over the panel is the panel\'s', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DMouseOnPanel = true');
    click(engine, 500, 500);
    assert.deepEqual(json(run, 'selected()'), []);
});

test('an object with parts of its own is picked by a part, and does not land on them when dragged', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`class Turret extends EngineObject3D
        {
            constructor(pos)
            {
                super(pos, render3D.boxMesh);
                this.barrel = new EngineObject3D(vec3(0, 1, 0), render3D.boxMesh);
                this.addChild(this.barrel);
            }
        }
        level3DAddType('Turret', Turret);
        editor3DPlace('Turret', vec3(.5, .5, 4.5)); editor3DStrokeEnd(); editor3DSelection.clear();
        editor3DUndoList.length = 0; editor3DTool = 'select';
        editor3DCamera.pos = vec3(.5, 1.5, 14.5)`); // level with the barrel, 10 in front of the turret
    click(engine, 500, 500);
    assert.deepEqual(json(run, 'selected()'), [4], 'a click on the barrel');
    drag(engine, [500, 500 + unit], [500 + 2 * unit, 500 + unit]); // by the body, two units along X
    const pos = json(run, 'list()[3].pos');
    assert.deepEqual([pos[0], pos[1]], [2.5, .5], 'it stayed on the ground');
});

test('an arrow seen end on is not taken, the object under it can be dragged', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run('editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0)');
    click(engine, 500, 500);
    assert.deepEqual([...run('[selected()[0], editor3DTool]')], [1, 'move']);
    assert.equal(run('editor3DWithView(()=> editor3DHandleAt(vec2(500, 500)))'), undefined);
    run('editor3DGroundSnap = false');
    drag(engine, [500, 500], [500 + unit, 500 + 2 * unit]);
    assert.deepEqual(json(run, 'list()[0].pos'), [1.5, .5, 2.5]);
});

test('a type picked to place is placed, with the Blocks or the Terrain tool on too', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`editor3DCamera.pos = vec3(.5, 10.5, .5); editor3DCamera.rotation = vec3(-PI / 2, 0, 0);
        editor3DVoxelAdd(vec3(16, 4, 16)); editor3DTerrainAdd(vec2(32), 8, 4);
        var blocks = ()=> editor3DVoxelMap().data.reduce((n, v)=> n + (v ? 1 : 0), 0);`);
    for (const tool of ['blocks', 'terrain'])
    {
        const count = run('list().length');
        run(`editor3DTool = '${tool}'; editor3DBrush = 'Box'`);
        click(engine, 500 - 3 * unit, 500 + 2 * unit);
        assert.equal(run('list().length'), count + 1, tool + ': the Box is placed');
        assert.equal(run('blocks()'), 0, tool + ': and no block is painted');
    }
});

test('with own axes on, L, the Move arrows follow the object\'s turn and a drag moves along its own axis', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    click(engine, 500, 500);
    run('editor3DChange((list)=> { list[0].rotation = [0, 0, 90]; }); editor3DStrokeEnd();');
    const arrow = ()=> json(run, `editor3DHandles().find((h)=> h.kind === 'arrow' && h.axis === 'x').direction`);
    assert.deepEqual([arrow().x, arrow().y], [1, 0], 'along the world\'s x');
    run('editor3DKeys.KeyL()');
    assert.equal(run('editor3DLocalAxes'), true);
    const d = arrow();
    near(d.x, 0); near(Math.abs(d.y), 1, 'the box\'s own x, which its turn made the world\'s y');
    // from on the arrow, a unit along it; the screen's y goes down
    drag(engine, [500, 500 - d.y * 100], [500, 500 - d.y * (100 + unit)]);
    const pos = json(run, 'list()[0].pos');
    near(pos[0], .5); near(pos[1], .5 + Math.sign(d.y)); near(pos[2], .5);
    assert.equal(run('editor3DHandles().filter((h)=> h.kind === \'plane\').length'), 3);
});

test('a scale drag keeps a mirrored axis mirrored', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    run(`editor3DChange((l)=> editor3DSetTransform(l[0], undefined, undefined, vec3(1, -1, 1))); editor3DStrokeEnd()`);
    click(engine, 500, 500);
    key(engine, 'KeyR');
    drag(engine, [600, 500], [700, 500]); // twice as far along X
    assert.deepEqual(json(run, 'list()[0].scale'), [2, -1, 1]);
});

test('End lands a turned object by the box around it as turned', async ()=>
{
    // three tall, turned a quarter about Z it lies down one tall
    const engine = await loadGame(), { run } = engine;
    run(`editor3DChange((l)=> editor3DSetTransform(l[0], vec3(-6, 6, .5), vec3(0, 0, 90), vec3(1, 3, 1)));
        editor3DStrokeEnd(); editor3DSelection.add(1)`);
    key(engine, 'End');
    assert.deepEqual(json(run, 'list()[0].pos'), [-6, .5, .5]);
});

test('a frame that throws between the editor\'s camera swap and its end gives the game its camera back', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    assert.equal(run(`
        const game = render3D.camera;
        editor3DCameraBegin(); // the frame throws here, before its End
        editor3DCameraBegin();
        editor3DCameraEnd();
        render3D.camera === game`), true);
});

test('opening the editor lets go of a mouse the game captured', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    key(engine, 'Digit0'); // out of the editor
    run(`var exits = 0; pointerLockIsActive = ()=> true; pointerLockExit = ()=> ++exits; levelEditor.open()`);
    assert.equal(run('exits'), 1);
});

test('the editor\'s camera keeps its own near from an orthographic game camera', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    assert.equal(run(`render3D.camera.orthographic = 10; render3D.camera.near = -50; editor3DCameraStart();
        editor3DCamera.near === new Camera3D().near`), true);
});

test('the box being dragged out to select is drawn on the main canvas, over a 3D pass drawn after the 2D', async ()=>
{
    const engine = await loadGame(), { run } = engine;
    assert.equal(run(`
        const onWebGL = [];
        drawLine = (a, b, thickness, color, pos, angle, useWebGL)=> onWebGL.push(useWebGL);
        editor3DDrag = {kind: 'box', from: vec2(100), to: vec2(300)};
        editor3DDrawLabels();
        editor3DDrag = undefined;
        onWebGL.join()`), 'false,false,false,false');
});
