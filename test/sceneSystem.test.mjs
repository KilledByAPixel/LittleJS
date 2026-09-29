import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

// One engineInit for the file, stepped by hand. gameUpdate writes to the log so a scene's update shows
// against it, and gameUpdatePost counts every tick, frozen ones too, so a test that sees no update knows
// the tick ran
const log = [];
let ticks = 0;
LJS.setEngineManualStep(true);
await LJS.engineInit(()=>{}, ()=> log.push('gameUpdate'), ()=> ++ticks, ()=>{}, ()=>{});

// a scene that logs each hook it gets, under its name
function logScene(name)
{
    return {
        enter()  { log.push(name + ' enter'); },
        leave()  { log.push(name + ' leave'); },
        update() { log.push(name + ' update'); },
    };
}
const clearLog = ()=> { log.length = 0; };

test('getScene is undefined before the first setScene', ()=>
{
    assert.equal(LJS.getScene(), undefined);
});

test('setScene leaves the old scene, clears the objects, then enters the new one', ()=>
{
    const a = logScene('a'), b = logScene('b');
    LJS.setScene(a);
    const o = new LJS.EngineObject(LJS.vec2());
    a.leave = ()=> log.push('leave, destroyed ' + o.destroyed);
    b.enter = ()=> log.push('enter, destroyed ' + o.destroyed);
    clearLog();
    LJS.setScene(b);
    assert.deepEqual(log, ['leave, destroyed false', 'enter, destroyed true']);
    assert.equal(LJS.getScene(), b);
    assert(!LJS.engineObjects.includes(o));
});

test('persistent objects outlive a switch', ()=>
{
    const kept = new LJS.EngineObject(LJS.vec2());
    kept.persistent = true;
    const lost = new LJS.EngineObject(LJS.vec2());
    LJS.setScene(logScene('c'));
    assert.equal(kept.destroyed, false);
    assert.equal(lost.destroyed, true);
    assert(LJS.engineObjects.includes(kept));
    kept.destroy();
});

test('a scene updates each tick after gameUpdate', ()=>
{
    LJS.setScene(logScene('d'));
    clearLog();
    LJS.engineStep(2);
    assert.deepEqual(log, ['gameUpdate', 'd update', 'gameUpdate', 'd update']);
});

test('a scene does not update while paused or at time scale 0', ()=>
{
    LJS.setScene(logScene('e'));
    clearLog();
    const ticks0 = ticks;
    LJS.setPaused(true);
    LJS.engineStep();
    LJS.setPaused(false);
    LJS.setTimeScale(0);
    LJS.engineStep();
    LJS.setTimeScale(1);
    assert.equal(ticks, ticks0 + 2); // both frozen ticks ran
    assert.deepEqual(log, []);
    LJS.engineStep();
    assert.deepEqual(log, ['gameUpdate', 'e update']);
});

test('a switch while paused enters at once and updates after the unpause', ()=>
{
    LJS.setScene(logScene('e2'));
    LJS.setPaused(true);
    clearLog();
    LJS.setScene(logScene('f'));
    assert.deepEqual(log, ['e2 leave', 'f enter']);
    clearLog();
    LJS.engineStep();
    assert.deepEqual(log, []);
    LJS.setPaused(false);
    LJS.engineStep();
    assert.deepEqual(log, ['gameUpdate', 'f update']);
});

test('setting the current scene again restarts it', ()=>
{
    const g = logScene('g');
    LJS.setScene(g);
    clearLog();
    LJS.setScene(LJS.getScene());
    assert.deepEqual(log, ['g leave', 'g enter']);
    assert.equal(LJS.getScene(), g);
});

test('setScene with no scene leaves the current one and clears the objects', ()=>
{
    LJS.setScene(logScene('h'));
    const o = new LJS.EngineObject(LJS.vec2());
    clearLog();
    LJS.setScene();
    assert.deepEqual(log, ['h leave']);
    assert.equal(LJS.getScene(), undefined);
    assert.equal(o.destroyed, true);
    clearLog();
    LJS.engineStep();
    assert.deepEqual(log, ['gameUpdate']);
});

test('setScene from inside enter ends with the newer scene current', ()=>
{
    LJS.setScene();
    const i = logScene('i'), j = logScene('j');
    i.enter = ()=> { log.push('i enter'); LJS.setScene(j); };
    clearLog();
    LJS.setScene(i);
    assert.deepEqual(log, ['i enter', 'i leave', 'j enter']);
    assert.equal(LJS.getScene(), j);
});

test('setScene from an object update switches, and the new scene keeps its objects', ()=>
{
    let made;
    const k = logScene('k');
    k.enter = ()=> { made = new LJS.EngineObject(LJS.vec2()); };
    class Switcher extends LJS.EngineObject
    {
        update() { LJS.setScene(k); }
    }
    LJS.setScene(logScene('l'));
    const switcher = new Switcher(LJS.vec2());
    LJS.engineStep();
    assert.equal(LJS.getScene(), k);
    assert.equal(switcher.destroyed, true);
    assert(!LJS.engineObjects.includes(switcher));
    assert(LJS.engineObjects.includes(made));
});

test('a scene with no hooks switches cleanly', ()=>
{
    LJS.setScene({});
    LJS.engineStep();
    assert.doesNotThrow(()=> LJS.setScene({}));
});

test('the render hooks run from the plugin preRender and render slots, paused too', ()=>
{
    // headless mode never renders, so the vm engine calls the plugin's hooks the way the render does;
    // it never runs engineInit, so this also shows setScene works before it
    const { run } = loadEngine();
    const result = run(`
        const drawn = [];
        setScene({
            update()     { drawn.push('update'); },
            render()     { drawn.push('render'); },
            renderPost() { drawn.push('renderPost'); },
        });
        const plugin = pluginList[pluginList.length - 1];
        paused = true;
        plugin.update(); plugin.preRender(); plugin.render();
        paused = false;
        plugin.update();
        drawn.join();`);
    assert.equal(result, 'render,renderPost,update');
});

// last, since the assert stops the switch halfway, as it would stop a game
test('setScene from inside leave asserts', ()=>
{
    LJS.setScene({ leave() { LJS.setScene(); } });
    assert.throws(()=> LJS.setScene(), /Assert failed/);
});
