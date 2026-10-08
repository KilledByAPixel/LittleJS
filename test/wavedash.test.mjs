import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The Wavedash plugin, against a stand-in for the SDK Wavedash puts on its page: one that checks its arguments' types
// and throws on a wrong one, as the real one does, and can refuse achievements at first, as the real one does until
// it has loaded the player's. Off Wavedash there is no SDK and every call does nothing.

// a stand-in SDK that logs what it is asked, refusing the first refuse achievements
function mockSDK(log, refuse=0)
{
    const check = (ok)=> { if (!ok) throw new TypeError('argument of the wrong type'); };
    return {
        init() { log.push(['init']); },
        getOrCreateLeaderboard(name, sortOrder, displayType)
        {
            check(typeof name === 'string' && Number.isInteger(sortOrder) && Number.isInteger(displayType));
            log.push(['board', name, sortOrder, displayType]);
            return Promise.resolve({success: true, data: {id: 'id-' + name}});
        },
        uploadLeaderboardScore(id, score, keepBest)
        {
            check(typeof id === 'string' && Number.isInteger(score) && typeof keepBest === 'boolean');
            log.push(['upload', id, score, keepBest]);
            return Promise.resolve({success: true, data: {}});
        },
        listLeaderboardEntries(id, offset, limit, friendsOnly)
        {
            check(typeof id === 'string' && Number.isInteger(offset) && Number.isInteger(limit) && typeof friendsOnly === 'boolean');
            return Promise.resolve({success: true, data: [{score: 5}]});
        },
        setAchievement(identifier, done)
        {
            check(typeof identifier === 'string' && typeof done === 'boolean');
            if (refuse-- > 0) return false;
            log.push(['achievement', identifier]);
            return true;
        },
    };
}

// an engine with a save, timers run by hand, and the SDK given, or none off Wavedash
function game(sdk)
{
    const items = {}, timers = [];
    const extra = { localStorage: { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } },
        setTimeout: (f)=> (timers.push(f), timers.length), clearTimeout: (id)=> { timers[id - 1] = undefined; },
        TextEncoder, TextDecoder };
    if (sdk) extra.Wavedash = sdk;
    const engine = loadEngine(extra);
    engine.run('setHeadlessMode(true)');
    const runTimers = ()=> timers.splice(0).forEach((f)=> f?.());
    return { ...engine, runTimers, items };
}

test('off Wavedash every call does nothing, and a medal unlocks with the engine\'s own popup', async ()=>
{
    const { run } = game();
    run(`var medal = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish'); medalsInit('test medals');
        new WavedashPlugin({LEVEL_1: {lowerWins: true}}); medal.unlock();`);
    assert.equal(run('wavedash.isActive()'), false);
    assert.equal(run('medal.unlocked'), true);
    assert.equal(run('medalsDisplayQueue.length'), 1, 'the engine\'s popup');
    assert.equal(await run(`wavedash.postScore('LEVEL_1', 5)`), false);
    assert.equal(await run(`wavedash.getScores('LEVEL_1')`), undefined);
});

test('on Wavedash it calls init once and makes the leaderboards with how they sort and show', async ()=>
{
    const log = [];
    const { run } = game(mockSDK(log));
    run(`new WavedashPlugin({LEVEL_1: {lowerWins: true, display: 'milliseconds'}, HIGH_SCORE: {}})`);
    await run('Promise.all(Object.values(wavedash.leaderboards))');
    assert.deepEqual(log, [['init'], ['board', 'LEVEL_1', 0, 2], ['board', 'HIGH_SCORE', 1, 0]]);
});

test('a score posts as a whole number keeping the best, to a board in the table or one made then', async ()=>
{
    const log = [];
    const { run } = game(mockSDK(log));
    run(`new WavedashPlugin({LEVEL_1: {lowerWins: true, display: 'milliseconds'}})`);
    assert.equal(await run(`wavedash.postScore('LEVEL_1', 1234.6)`), true);
    assert.equal(await run(`wavedash.postScore('OTHER', 7)`), true);
    assert.deepEqual(log.filter((l)=> l[0] !== 'init'), [['board', 'LEVEL_1', 0, 2], ['upload', 'id-LEVEL_1', 1235, true],
        ['board', 'OTHER', 1, 0], ['upload', 'id-OTHER', 7, true]]);
    assert.deepEqual(JSON.parse(await run(`wavedash.getScores('LEVEL_1', 0, 5, true).then(JSON.stringify)`)), [{score: 5}]);
});

test('on Wavedash an unlock is its achievement with no engine popup, sent again until Wavedash takes it', ()=>
{
    const log = [];
    const { run, runTimers } = game(mockSDK(log, 2)); // refuses twice, as before it has loaded the player's
    run(`var medal = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish'); medalsInit('test medals');
        new WavedashPlugin(); medal.unlock();`);
    assert.equal(run('medal.unlocked'), true, 'unlocked and saved at once');
    assert.equal(run('medalsDisplayQueue.length'), 0, 'Wavedash shows its own toast');
    assert.deepEqual(log.filter((l)=> l[0] === 'achievement'), [], 'refused at first');
    runTimers();
    runTimers();
    assert.deepEqual(log.filter((l)=> l[0] === 'achievement'), [['achievement', 'ACH_01_FINISH']], 'taken in the end, once');
    runTimers();
    assert.equal(log.filter((l)=> l[0] === 'achievement').length, 1, 'not sent again');
});

test('medals the save already has are sent, whether medalsInit comes before the plugin or after', ()=>
{
    for (const initFirst of [true, false])
    {
        const log = [];
        const { run, items } = game(mockSDK(log));
        items['test medals'] = JSON.stringify({0: {unlocked: true}});
        run(`var medal = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish');
            ${initFirst ? `medalsInit('test medals'); new WavedashPlugin();` : `new WavedashPlugin(); medalsInit('test medals');`}`);
        assert.deepEqual(log.filter((l)=> l[0] === 'achievement'), [['achievement', 'ACH_01_FINISH']],
            initFirst ? 'medalsInit first' : 'medalsInit after');
    }
});

test('an SDK call that throws is caught, and says so', ()=>
{
    const warnings = [];
    const sdk = mockSDK([]);
    sdk.init = ()=> { throw new Error('init broke'); };
    const { run } = game(sdk);
    run('console.warn = (...a)=> globalThis.warned = a.join(" ")');
    assert.doesNotThrow(()=> run('new WavedashPlugin()'));
    assert.match(run('globalThis.warned'), /Wavedash init failed/);
});

// collect the warnings an engine prints, and the promises nobody caught
function watch(run)
{
    run('globalThis.warnings = []; console.warn = (...a)=> warnings.push(a.join(" "));');
    const rejected = [];
    const onRejection = (reason)=> rejected.push(String(reason));
    process.on('unhandledRejection', onRejection);
    return { warnings: ()=> run('warnings'), rejected, done: ()=> process.off('unhandledRejection', onRejection) };
}
const settle = ()=> new Promise((resolve)=> setTimeout(resolve, 20));

test('an achievement Wavedash never takes is tried for a minute, then a warning names it once', ()=>
{
    const log = [];
    const sdk = mockSDK(log, Infinity);
    let tries = 0;
    const setAchievement = sdk.setAchievement;
    sdk.setAchievement = (...a)=> (++tries, setAchievement(...a));
    const { run, runTimers } = game(sdk);
    const w = watch(run);
    run(`var medal = new WavedashMedal(0, 'ACH_01_TYPO', 'Finish'); medalsInit('test medals');
        new WavedashPlugin(); medal.unlock();`);
    for (let i = 60; i--;) runTimers();
    w.done();
    assert.ok(tries > 20 && tries <= 32, 'about a minute of tries: ' + tries);
    const named = w.warnings().filter((m)=> m.includes('ACH_01_TYPO'));
    assert.equal(named.length, 1, 'one warning naming it: ' + w.warnings());
});

test('setAchievement answering with a result of success counts as taken', ()=>
{
    const log = [];
    const sdk = mockSDK(log);
    sdk.setAchievement = (id)=> (log.push(['achievement', id]), {success: true});
    const { run, runTimers } = game(sdk);
    run(`var medal = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish'); medalsInit('test medals');
        new WavedashPlugin(); medal.unlock();`);
    runTimers(); runTimers();
    assert.equal(log.filter((l)=> l[0] === 'achievement').length, 1);
});

test('odd answers and failed calls give false or undefined, with a warning and nothing uncaught', async ()=>
{
    const sdk = mockSDK([]);
    sdk.init = ()=> Promise.reject(new Error('init refused'));
    sdk.getOrCreateLeaderboard = (name)=> Promise.resolve(name == 'NULL' ? {success: true, data: null} : {success: true, data: {id: 'id-' + name}});
    sdk.uploadLeaderboardScore = ()=> Promise.reject(new Error('upload refused'));
    sdk.listLeaderboardEntries = undefined; // a method this SDK does not have
    const { run } = game(sdk);
    const w = watch(run);
    run('new WavedashPlugin({NULL: {}})');
    assert.equal(await run(`wavedash.postScore('NULL', 5)`), false, 'a board with no data');
    assert.equal(await run(`wavedash.postScore('LEVEL_1', 5)`), false, 'an upload refused');
    assert.equal(await run(`wavedash.getScores('LEVEL_1')`), undefined, 'a missing method');
    await settle();
    w.done();
    assert.deepEqual(w.rejected, [], 'nothing uncaught');
    assert.ok(w.warnings().some((m)=> m.includes('init')), 'init refused says so: ' + w.warnings());
});

test('a board that could not be made is asked for again on the next post', async ()=>
{
    const log = [];
    const sdk = mockSDK(log);
    let refuse = 1;
    const make = sdk.getOrCreateLeaderboard;
    sdk.getOrCreateLeaderboard = (...a)=> refuse-- > 0 ? Promise.resolve({success: false}) : make(...a);
    const { run } = game(sdk);
    run('new WavedashPlugin()');
    assert.equal(await run(`wavedash.postScore('LEVEL_1', 5)`), false);
    assert.equal(await run(`wavedash.postScore('LEVEL_1', 6)`), true);
    assert.deepEqual(log.filter((l)=> l[0] === 'upload'), [['upload', 'id-LEVEL_1', 6, true]]);
});

test('a leaderboard call that never answers gives up, so postScore and getScores finish', async ()=>
{
    const sdk = mockSDK([]);
    sdk.uploadLeaderboardScore = ()=> new Promise(()=> {});
    sdk.listLeaderboardEntries = ()=> new Promise(()=> {});
    const { run, runTimers } = game(sdk);
    run('new WavedashPlugin()');
    const posted = run(`wavedash.postScore('LEVEL_1', 5)`), read = run(`wavedash.getScores('LEVEL_1')`);
    await settle();
    runTimers(); // the time limit runs out
    assert.equal(await posted, false);
    assert.equal(await read, undefined);
});

test('a medal unlocked on Wavedash before the plugin is made shows no engine popup, and is sent once it is', ()=>
{
    const log = [];
    const { run } = game(mockSDK(log));
    run(`var medal = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish'); medalsInit('test medals'); medal.unlock();`);
    assert.equal(run('medalsDisplayQueue.length'), 0, 'Wavedash shows its own toast');
    run('new WavedashPlugin()');
    assert.deepEqual(log.filter((l)=> l[0] === 'achievement'), [['achievement', 'ACH_01_FINISH']]);
});

test('with debugMedals set nothing is sent to Wavedash, and the engine shows the popup', ()=>
{
    const log = [];
    const { run } = game(mockSDK(log));
    run(`debugMedals = true; var medal = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish'); medalsInit('test medals');
        new WavedashPlugin(); medal.unlock();`);
    assert.equal(run('medalsDisplayQueue.length'), 1);
    assert.deepEqual(log.filter((l)=> l[0] === 'achievement'), []);
});

test('a board or an achievement named like an object\'s own built-in, as constructor or toString, is one like any', async ()=>
{
    const log = [];
    const { run, runTimers } = game(mockSDK(log, 1)); // refuses the first achievement once
    run(`var medal = new WavedashMedal(0, 'toString', 'Odd'); medalsInit('test medals');
        new WavedashPlugin({}); medal.unlock();`);
    assert.equal(await run(`wavedash.postScore('constructor', 5)`), true);
    assert.deepEqual(log.filter((l)=> l[0] !== 'init' && l[0] !== 'achievement'),
        [['board', 'constructor', 1, 0], ['upload', 'id-constructor', 5, true]], 'made and posted to, higher wins');
    runTimers();
    assert.deepEqual(log.filter((l)=> l[0] === 'achievement'), [['achievement', 'toString']], 'sent again, not given up');
});

// a stand-in for Wavedash's files: local ones written and read, remote ones uploaded and downloaded, its stats and
// presence, each checking its arguments' types as the real one does
function filesSDK(log)
{
    const check = (ok)=> { if (!ok) throw new TypeError('argument of the wrong type'); };
    const local = new Map, remote = new Map, stats = {};
    let statsLoaded = false;
    return { ...mockSDK(log),
        writeLocalFile(path, bytes) { check(typeof path === 'string' && bytes instanceof Uint8Array); local.set(path, bytes); return Promise.resolve({success: true}); },
        uploadRemoteFile(path) { check(typeof path === 'string'); remote.set(path, local.get(path)); return Promise.resolve({success: true, data: path}); },
        downloadRemoteFile(path) { check(typeof path === 'string'); if (!remote.has(path)) return Promise.resolve({success: false}); local.set(path, remote.get(path)); return Promise.resolve({success: true}); },
        readLocalFile(path) { check(typeof path === 'string'); return Promise.resolve(local.get(path)); },
        requestStats() { log.push(['requestStats']); statsLoaded = true; return Promise.resolve({success: true}); },
        setStat(id, value, storeNow) { check(typeof id === 'string' && typeof value === 'number' && typeof storeNow === 'boolean'); if (!statsLoaded) return false; stats[id] = value; log.push(['setStat', id, value, storeNow]); return true; },
        getStat(id) { check(typeof id === 'string'); return statsLoaded ? stats[id] ?? 0 : 0; },
        updateUserPresence(presence) { check(typeof presence === 'object'); log.push(['presence', presence]); return Promise.resolve({success: true}); },
    };
}

test('a cloud save writes the value as a file and uploads it, and loads back from a download', async ()=>
{
    const log = [];
    const { run } = game(filesSDK(log));
    run('new WavedashPlugin()');
    assert.equal(await run(`wavedash.cloudSave(1, {level: 3, coins: [1, 2]})`), true);
    assert.equal(await run(`wavedash.cloudLoad(1).then((save)=> JSON.stringify(save))`), '{"level":3,"coins":[1,2]}');
    assert.equal(await run(`wavedash.cloudLoad(2)`), undefined, 'a slot never saved');
});

test('a read given as a response loads too, and an upload Wavedash refuses is false', async ()=>
{
    const log = [], sdk = filesSDK(log), read = sdk.readLocalFile;
    sdk.readLocalFile = async (path)=> ({success: true, data: await read(path)});
    const { run } = game(sdk);
    run('new WavedashPlugin()');
    await run(`wavedash.cloudSave(1, 7)`);
    assert.equal(await run(`wavedash.cloudLoad(1)`), 7);
    sdk.uploadRemoteFile = ()=> Promise.resolve({success: false, message: 'rate limited, wait 20 seconds'});
    assert.equal(await run(`wavedash.cloudSave(1, 8)`), false);
});

test('stats load the first time one is used, then set and read; presence is set and cleared', async ()=>
{
    const log = [];
    const { run } = game(filesSDK(log));
    run('new WavedashPlugin()');
    assert.ok(!log.some((l)=> l[0] == 'requestStats'), 'not asked for until a stat is');
    assert.equal(await run(`wavedash.setStat('total_kills', 12)`), true);
    assert.equal(await run(`wavedash.getStat('total_kills')`), 12);
    assert.equal(await run(`wavedash.setStat('total_kills', 13, true)`), true);
    assert.deepEqual(log.filter((l)=> l[0] != 'init'), [['requestStats'], ['setStat', 'total_kills', 12, false],
        ['setStat', 'total_kills', 13, true]], 'loaded once, storeNow a real boolean');
    assert.equal(await run(`wavedash.setPresence('In a race', 'Lap 2')`), true);
    assert.equal(await run(`wavedash.setPresence()`), true);
    assert.equal(JSON.stringify(log.filter((l)=> l[0] == 'presence').map((l)=> l[1])),
        '[{"status":"In a race","details":"Lap 2"},{}]');
});

test('off Wavedash cloud saves, stats and presence do nothing', async ()=>
{
    const { run } = game();
    run('new WavedashPlugin()');
    assert.equal(await run(`wavedash.cloudSave(1, 5)`), false);
    assert.equal(await run(`wavedash.cloudLoad(1)`), undefined);
    assert.equal(await run(`wavedash.setStat('x', 1)`), false);
    assert.equal(await run(`wavedash.getStat('x')`), 0);
    assert.equal(await run(`wavedash.setPresence('x')`), false);
});
