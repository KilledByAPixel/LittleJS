import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 16 of 2026-11-14: HeightMap stairs climbed and a coasting body reaching the cliff; the editors on touch
// with the touch gamepad on, a pinch leaving no tile, the game not reading the editor's wheel; an undo waiting for an
// async Restart; a grown body kept on one way tiles; the animator's onEnd flag; the 3D editor's own close; a malformed
// atlas entry, split layers with none listed and a bracket in a title; engineIsFrozen

async function engine2D(extra={})
{
    const e = loadEngine({ location: { pathname: '/game/' }, ...extra });
    e.run('setHeadlessMode(true)');
    await e.run('setEngineManualStep(true); engineInit(()=> {}, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    return e;
}

// a 1 by 2 by 1 body walking or coasting along x over a .125 grid HeightMap whose heights are f(x)
const walkCode = (f, speed, frames, coast=false)=> `(()=>
{
    setHeadlessMode(true); render3D || new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);
    const S = 20, n = 161, cell = S / (n - 1), f = ${f}, heights = [];
    for (let j = 0; j < n; ++j)
    {
        const row = [];
        for (let i = 0; i < n; ++i) row.push(f(-S / 2 + i * cell));
        heights.push(row);
    }
    const map = new HeightMap(heights, vec2(S), 1, undefined, vec3(), false);
    const o = new EngineObject3D(vec3(-4, 1.01, .1), buildBox());
    o.size3D = vec3(1, 2, 1); o.setCollision(false, false, true); o.mass = 1; o.restitution = 0;
    o.velocity3D.x = ${speed}; ${coast ? 'o.friction = o.damping = 1;' : ''}
    for (let i = 0; i < ${frames}; ++i) { ${coast ? '' : `o.velocity3D.x = ${speed};`} engineObjectsUpdate(); }
    const result = {x: o.pos3D.x, foot: o.pos3D.y - 1};
    o.destroy(); map.destroy(); engineObjectsUpdate();
    return JSON.stringify(result);
})()`;

test('a HeightMap\'s stairs, each riser under the step, are climbed at any speed, and a cliff still stops a walk', ()=>
{
    const run = (code)=> loadEngine().run(code);
    // rise .2 every .3, ten steps up to 2, the step a quarter of the body's height, .5
    const stairs = '(x)=> x < -2 ? 0 : Math.min(10, Math.floor((x + 2) / .3) + 1) * .2';
    for (const speed of [.03, .1, .35])
    {
        // from x -4 to the top step at 1 and on along it, not off the map's edge at 10
        const {foot} = JSON.parse(run(walkCode(stairs, speed, Math.ceil(9 / speed))));
        assert.ok(foot > 1.9, 'up the stairs at ' + speed + ': foot ' + foot);
    }
    const cliff = '(x)=> x < 0 ? 0 : 2';
    for (const speed of [.03, .2, .5])
    {
        const {x, foot} = JSON.parse(run(walkCode(cliff, speed, 120)));
        assert.ok(foot < .1 && x < 0, 'stopped at the cliff at ' + speed + ': ' + x + ', ' + foot);
    }
});

test('a body coasting toward a HeightMap cliff keeps its speed till its side is at the face', ()=>
{
    const run = (code)=> loadEngine().run(code);
    const {x} = JSON.parse(run(walkCode('(x)=> x < 0 ? 0 : 2', .05, 200, true)));
    // the face is the steep cell from x -.125 to 0, the body half a unit wide: its side stops at the face's foot;
    // before pass 16 it stopped about .4 short in mid air, before pass 17 its side went into the face
    assert.ok(x > -.7 && x < -.55, 'side at the face: ' + x);
});

// a finger at a screen place, and a touch event of the touches down and those it changes
const finger = (identifier, x, y)=> ({ identifier, clientX: x, clientY: y, target: {} });
const touchFire = (handlers, type, touches, changed=touches)=> handlers[type]({ type, touches, changedTouches: changed,
    target: {}, cancelable: true, preventDefault() {} });

test('with the touch gamepad on, the 2D editor takes a tap, and a pinch paints no tile with its first finger',
    async ()=>
{
    for (const gamepad of [false, true])
    {
        const { run, handlers } = await engine2D({ window: { ontouchstart: null } });
        run(`setTouchGamepadEnable(${gamepad});
            tileLayersLoad({width: 8, height: 8, layers: [{type: 'tilelayer', name: 'a', width: 8, height: 8,
                data: new Array(64).fill(0)}]}, undefined, 0, 0);
            levelEditor.open(); editorSelectLayer(editorLayers()[0]); editorMouseOnPanel = false;`);
        const step = ()=> run(`engineStep(); for (const i in inputData[0]) inputData[0][i] &= 1;
            mouseWheel = touchPinch = inputWheelPinch = 0; inputPinchReleased = false;`);
        const fire = (...a)=> touchFire(handlers, ...a);
        const scale = run('editorCameraScale');
        fire('touchstart', [finger(1, 580, 420)]); step();
        fire('touchend', [], [finger(1, 580, 420)]); step();
        assert.equal(run('editorUndoList.length'), 1, 'the tap painted, gamepad ' + gamepad);
        fire('touchstart', [finger(3, 620, 380)]); step();
        fire('touchstart', [finger(3, 620, 380), finger(4, 820, 380)], [finger(4, 820, 380)]); step();
        fire('touchmove', [finger(3, 520, 380), finger(4, 920, 380)]); step();
        fire('touchend', [], [finger(3, 520, 380), finger(4, 920, 380)]); step();
        assert.equal(run('editorUndoList.length'), 1, 'the pinch left no tile, gamepad ' + gamepad);
        assert.equal(run("editorLayer.source.data.filter(Boolean).length"), 1);
        const zoom = run('editorCameraScale') / scale;
        // the fingers went from 200 to 400 apart: zoomed in, not seven times over
        assert.ok(zoom > 1 && zoom < 2.5, 'zoom ' + zoom);
        run('levelEditor.close()');
    }
});

test('the game\'s gameUpdatePost does not read the 2D editor\'s wheel, and engineIsFrozen is true under it', async ()=>
{
    const { run } = loadEngine({ location: { pathname: '/game/' } });
    run('setHeadlessMode(true); var seen = [], frozen = []');
    await run(`setEngineManualStep(true); engineInit(()=> {}, ()=> {},
        ()=> { seen.push(mouseWheel); frozen.push(engineIsFrozen()); }, ()=> {}, ()=> {})`);
    run(`tileLayersLoad({width: 2, height: 1, layers: [{type: 'tilelayer', name: 'a', width: 2, height: 1,
        data: [0, 1]}]}, undefined, 0, 0);
        mouseWheel = 1; engineStep();
        levelEditor.open(); mouseWheel = 1; engineStep(); levelEditor.close();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify([seen, frozen])')), [[1, 0], [false, true]]);
});

test('an undo while an async onRestart makes a resized map\'s layers waits on its list', async ()=>
{
    const { run } = await engine2D();
    run(`var map = {width: 4, height: 3, tilewidth: 16, tileheight: 16,
            layers: [{type: 'tilelayer', name: 'front', width: 4, height: 3, data: new Array(12).fill(0)}]};
        var layers = tileLayersLoad(map, undefined, 0, 0), front = editorLayerRecord(layers[0]), waits = [];
        // a restart that lands without making the layers again, so the live layer stays the old size
        levelEditor.onRestart = async ()=> { await new Promise((resolve)=> waits.push(resolve)); };
        levelEditor.open(); editorLayer = front;
        levelEditor.edit2D.paint(vec2(0, 0), 4); editorStrokeEnd();
        editorResize(front.record, 5, 3);
        editorRedoList.length = 0;
        var resized = editorUndoList.length;
        editorUndo(); // the resize waits while its restart runs
        var whileRunning = [editorUndoList.length, editorRedoList.length];`);
    run('waits.shift()()'); await new Promise((resolve)=> setTimeout(resolve, 10));
    // once it has settled the resize is undone, which is how a Restart that made nothing is ended; the undo restarts
    run('editorUndo(); var afterResizeUndo = [editorUndoList.length, editorRedoList.length]; waits.shift()();');
    await new Promise((resolve)=> setTimeout(resolve, 10));
    const result = JSON.parse(run(`(()=>
    {
        editorResize(front.record, 6, 3); // resizing again, the live layer still the first one
        const before = JSON.stringify(map.layers[0].data);
        editorUndoList.splice(editorUndoList.length - 1, 1); // the paint is the last entry
        editorUndo();
        return JSON.stringify({resized, whileRunning, afterResizeUndo, kept: editorUndoList.length,
            same: JSON.stringify(map.layers[0].data) === before});
    })()`));
    run('waits.forEach((resolve)=> resolve())');
    assert.equal(result.resized, 2);
    assert.deepEqual(result.whileRunning, [2, 0]);
    assert.deepEqual(result.afterResizeUndo, [1, 1]);
    assert.equal(result.kept, 1, 'the paint stroke stays to undo');
    assert.equal(result.same, true);
});

test('SpriteAnimator.set each update with a flag its onEnd clears does not show the attack again', async ()=>
{
    const { run } = await engine2D();
    const log = JSON.parse(run(`(()=>
    {
        const hero = new SpriteAnimator({idle: new SpriteAnimation(tile(0, 16), 2, .4),
            attack: new SpriteAnimation(tile(6, 16), 3, .05).play()});
        let attacking = true;
        const log = [];
        for (let i = 0; i < 14; ++i)
        {
            hero.set(attacking ? 'attack' : 'idle', ()=> attacking = false);
            log.push(hero.name + hero.frame);
            engineStep();
        }
        return JSON.stringify(log);
    })()`));
    const end = log.indexOf('idle0');
    assert.ok(end > 0, log.join());
    assert.equal(log[end - 1], 'attack2', 'the last frame shows up to idle, not the first again: ' + log.join());
});

test('a game\'s own levelEditor.close() in the 3D editor closes at once, inside a key\'s action too', async ()=>
{
    const { run } = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    run('setHeadlessMode(true)');
    await run('setEngineManualStep(true); engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})');
    const result = JSON.parse(run(`(()=>
    {
        level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2);
        let after;
        levelEditor.addKey('k', ()=> { levelEditor.close(); after = levelEditor.isOpen; });
        levelEditor.open();
        inputData[0].KeyK = 3; engineStep(); inputData[0].KeyK = 0;
        const closed = [after, levelEditor.isOpen];
        levelEditor.open(); levelEditor.close(); levelEditor.open();
        const reopened = levelEditor.isOpen;
        levelEditor.close();
        return JSON.stringify({closed, reopened});
    })()`));
    assert.deepEqual(result, {closed: [false, false], reopened: true});
});
