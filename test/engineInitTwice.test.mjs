import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// engineInit called a second time, a mistake a debug build asserts on: a release build, with no assert, does nothing
// more, prints the version once, and hands back the first call's promise, done when the game is set up

test('a second engineInit in a release build prints no second banner and is done only when the first is', async () =>
{
    const logs = [];
    const console = {log: (...args)=> logs.push(args.join(' ')), warn() {}, error() {}};
    const { run } = loadEngine({console, requestAnimationFrame() {}}, '', 'littlejs.release.js');
    run(`setHeadlessMode(true); var gameReady, ready = false, secondDone = false, readyWhenDone;
        var first = engineInit(()=> new Promise((resolve)=> gameReady = ()=> { ready = true; resolve(); }));
        var second = engineInit().then(()=> { secondDone = true; readyWhenDone = ready; });`);
    assert.equal(logs.filter((line)=> line.includes('Engine v')).length, 1, logs.join(' | '));

    // the game is still setting up: the second call is not done
    for (let i = 0; i < 20 && !run('typeof gameReady == "function"'); ++i)
        await new Promise((resolve)=> setImmediate(resolve));
    assert.equal(run('typeof gameReady'), 'function', 'gameInit ran');
    assert.equal(run('secondDone'), false);

    run('gameReady()');
    await run('second');
    assert.equal(run('readyWhenDone'), true, 'the second call was done once the game was set up');
});
