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
        TextEncoder, TextDecoder, console: {...console} }; // a console of its own, so a test can replace its warn
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
        remoteFileExists(path) { check(typeof path === 'string'); return Promise.resolve({success: true, data: remote.has(path)}); },
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
    assert.equal(await run(`wavedash.cloudLoad(2)`), null, 'a slot never saved is empty');
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

test('a local write that fails or is refused uploads nothing, never an older file at that path', async ()=>
{
    for (const failure of ['reject', 'throw', 'refuse'])
    {
        const log = [], sdk = filesSDK(log);
        const { run } = game(sdk);
        run('new WavedashPlugin()');
        await run(`wavedash.cloudSave(1, {level: 1})`); // an older file at the path, saved
        let uploads = 0;
        const upload = sdk.uploadRemoteFile;
        sdk.uploadRemoteFile = (path)=> (++uploads, upload(path));
        sdk.writeLocalFile = failure == 'reject' ? ()=> Promise.reject(Error('disk full')) :
            failure == 'throw' ? ()=> { throw Error('disk full'); } : ()=> Promise.resolve({success: false});
        assert.equal(await run(`wavedash.cloudSave(1, {level: 9})`), false, failure);
        assert.equal(uploads, 0, failure + ': nothing uploaded');
        assert.equal(await run(`wavedash.cloudLoad(1).then((save)=> save.level)`), 1, failure + ': the cloud keeps its save');
    }
});

test('a save and a load of one slot at once go one after the other, other slots do not wait', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const { run } = game(sdk);
    run('new WavedashPlugin()');
    await run(`wavedash.cloudSave(1, {level: 1})`);
    assert.equal(await run(`Promise.all([wavedash.cloudSave(1, {level: 9}), wavedash.cloudLoad(1)])
        .then(([saved, loaded])=> JSON.stringify([saved, loaded]))`), '[true,{"level":9}]', 'the load reads the save');
    assert.equal(await run(`wavedash.cloudLoad(1).then((save)=> save.level)`), 9);

    // a save that fails does not hold up the next
    const write = sdk.writeLocalFile;
    sdk.writeLocalFile = ()=> (sdk.writeLocalFile = write, Promise.reject(Error('once')));
    const failed = run(`wavedash.cloudSave(1, {level: 10})`);
    assert.equal(await failed, false);
    assert.equal(await run(`wavedash.cloudSave(1, {level: 11})`), true);
    assert.equal(await run(`wavedash.cloudLoad(1).then((save)=> save.level)`), 11);
    assert.equal(await run(`wavedash.slotQueues.size`), 0, 'nothing left waiting');
});

test('a load that timed out holds its slot until Wavedash answers it, and a save after it saves its own value', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const { run, runTimers } = game(sdk);
    run('new WavedashPlugin()');
    await run(`wavedash.cloudSave(1, {level: 1})`);

    // a download Wavedash answers late, after the plugin stopped waiting for it
    const download = sdk.downloadRemoteFile;
    let finish;
    sdk.downloadRemoteFile = (path)=> new Promise((resolve)=> finish = ()=> resolve(download(path)));
    const loading = run(`wavedash.cloudLoad(1)`);
    await new Promise((r)=> setImmediate(r));
    runTimers(); // the timeout
    assert.equal(await loading, undefined, 'the load gave up');
    sdk.downloadRemoteFile = download;

    // a save waits for that download before it writes, so the late download can not overwrite it
    const saving = run(`wavedash.cloudSave(1, {level: 9})`);
    await new Promise((r)=> setImmediate(r));
    finish();
    assert.equal(await saving, true);
    assert.equal(await run(`wavedash.cloudLoad(1).then((save)=> save.level)`), 9);
});

test('a slot whose timed out call never comes back is not used, other slots are', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const { run, runTimers } = game(sdk);
    run('new WavedashPlugin()');
    const download = sdk.downloadRemoteFile;
    sdk.downloadRemoteFile = ()=> new Promise(()=> {}); // never answered
    const loading = run(`wavedash.cloudLoad(1)`);
    await new Promise((r)=> setImmediate(r));
    runTimers();
    await loading;
    sdk.downloadRemoteFile = download;

    const saving = run(`wavedash.cloudSave(1, {level: 9})`);
    assert.equal(await run(`wavedash.cloudSave(2, {level: 5})`), true, 'another slot goes on');
    await new Promise((r)=> setImmediate(r));
    runTimers(); // the save's wait for the busy slot runs out
    assert.equal(await saving, false, 'the busy slot is not written');
});

test('a slot let go of keeps nothing for it, its calls all answered', async ()=>
{
    const log = [];
    const { run } = game(filesSDK(log));
    run('new WavedashPlugin()');
    for (let slot = 1; slot <= 20; ++slot)
        await run(`wavedash.cloudSave(${slot}, ${slot})`);
    await new Promise((r)=> setImmediate(r));
    assert.equal(run('wavedash.slotQueues.size + wavedash.slotCalls.size'), 0);
});

test('a load that fails is undefined with a warning, told apart from an empty slot, which is null', async ()=>
{
    const log = [], sdk = filesSDK(log), warnings = [];
    const { run, runTimers } = game(sdk);
    run('new WavedashPlugin()');
    run('console.warn = (...a)=> warnings.push(a.join(" "))');
    const warned = ()=> run('warnings.length');
    run('var warnings = []');
    await run(`wavedash.cloudSave(1, {level: 3})`);

    // the download refused, and the file is there: a load that failed, not an empty slot
    const download = sdk.downloadRemoteFile;
    sdk.downloadRemoteFile = ()=> Promise.resolve({success: false});
    assert.equal(await run(`wavedash.cloudLoad(1)`), undefined);
    assert.equal(warned(), 1, 'said so');
    sdk.downloadRemoteFile = download;

    // the read never answered after the download: the time limit, said too
    const read = sdk.readLocalFile;
    sdk.readLocalFile = ()=> new Promise(()=> {});
    const loading = run(`wavedash.cloudLoad(1)`);
    for (let i = 3; i--;) await new Promise((r)=> setImmediate(r));
    runTimers();
    assert.equal(await loading, undefined);
    assert.ok(warned() >= 3, 'the time limit and the read were both said');
    sdk.readLocalFile = read;
});

test('a slot given as text and as a number is one slot, one after the other', async ()=>
{
    const log = [];
    const { run } = game(filesSDK(log));
    run('new WavedashPlugin(); ASSERT = ()=> {}'); // as a release build, where the number check is gone
    await run(`wavedash.cloudSave(1, {level: 1})`);
    assert.equal(await run(`Promise.all([wavedash.cloudSave('1', {level: 9}), wavedash.cloudLoad(1)])
        .then(([saved, loaded])=> JSON.stringify([saved, loaded]))`), '[true,{"level":9}]');
});

test('a value JSON can not hold is not saved, false with a warning', async ()=>
{
    const log = [];
    const { run } = game(filesSDK(log));
    run('new WavedashPlugin(); var warnings = []; console.warn = (...a)=> warnings.push(a.join(" "))');
    assert.equal(await run(`(()=> { const o = {}; o.self = o; return wavedash.cloudSave(1, o); })()`), false);
    assert.equal(await run(`wavedash.cloudSave(1, 10n)`), false);
    assert.equal(await run(`wavedash.cloudSave(1, undefined)`), false);
    assert.equal(run('warnings.length'), 3);
    assert.equal(await run(`wavedash.cloudLoad(1)`), null, 'nothing was saved');
});

test('an SDK that answers plain booleans: an empty slot is still null, and a download of true loads', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const download = sdk.downloadRemoteFile, exists = sdk.remoteFileExists;
    sdk.downloadRemoteFile = async (path)=> (await download(path)).success;
    sdk.remoteFileExists = async (path)=> (await exists(path)).data;
    const { run } = game(sdk);
    run('new WavedashPlugin()');
    assert.equal(await run(`wavedash.cloudLoad(1)`), null);
    await run(`wavedash.cloudSave(1, {level: 2})`);
    assert.equal(await run(`wavedash.cloudLoad(1).then((save)=> save.level)`), 2);

    // with no remoteFileExists, a slot it can not download is a load that failed, never taken for empty
    delete sdk.remoteFileExists;
    run('var warnings = []; console.warn = (...a)=> warnings.push(a.join(" "))');
    assert.equal(await run(`wavedash.cloudLoad(5)`), undefined);
});

test('a slot holding a file that is not a save loads as undefined, said in the console', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const { run } = game(sdk);
    run('new WavedashPlugin(); var warnings = []; console.warn = (...a)=> warnings.push(a.join(" "))');
    await sdk.writeLocalFile('saves/slot1.json', new TextEncoder().encode('{"level": 3'));
    await sdk.uploadRemoteFile('saves/slot1.json');
    assert.equal(await run(`wavedash.cloudLoad(1)`), undefined);
    assert.ok(run('warnings.join()').includes('not a save'));
});

test('loadFailure says why a slot loaded undefined: notSave for a file that is not a save, failed otherwise', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const { run } = game(sdk);
    run('new WavedashPlugin(); console.warn = ()=> {}');
    assert.equal(await run(`wavedash.cloudLoad(1)`), null);
    assert.equal(run('wavedash.loadFailure(1)'), undefined, 'an empty slot is no failure');
    await sdk.writeLocalFile('saves/slot1.json', new TextEncoder().encode('not json'));
    await sdk.uploadRemoteFile('saves/slot1.json');
    assert.equal(await run(`wavedash.cloudLoad(1)`), undefined);
    assert.equal(run('wavedash.loadFailure(1)'), 'notSave');
    await sdk.writeLocalFile('saves/slot2.json', new Uint8Array(0)); // empty, a read that failed, not a bad save
    await sdk.uploadRemoteFile('saves/slot2.json');
    assert.equal(await run(`wavedash.cloudLoad(2)`), undefined);
    assert.equal(run('wavedash.loadFailure(2)'), 'failed');
    sdk.downloadRemoteFile = ()=> Promise.resolve({success: false});
    assert.equal(await run(`wavedash.cloudLoad(1)`), undefined);
    assert.equal(run('wavedash.loadFailure(1)'), 'failed');
});

test('loads of several slots at once each keep their own reason', async ()=>
{
    const log = [], sdk = filesSDK(log);
    const { run } = game(sdk);
    run('new WavedashPlugin(); console.warn = ()=> {}');
    await sdk.writeLocalFile('saves/slot2.json', new TextEncoder().encode('not json'));
    await sdk.uploadRemoteFile('saves/slot2.json');
    await run(`wavedash.cloudSave(3, {level: 3})`);

    // slot 1's download fails, and slot 2, not a save, answers last
    const download = sdk.downloadRemoteFile;
    sdk.downloadRemoteFile = async (path)=> path.includes('slot1') ? {success: false} :
        (await new Promise((r)=> setImmediate(r)), download(path));
    const exists = sdk.remoteFileExists;
    sdk.remoteFileExists = async (path)=> path.includes('slot1') ? {success: false} : exists(path);
    const loaded = await run(`Promise.all([1, 2, 3].map((slot)=> wavedash.cloudLoad(slot)))
        .then((saves)=> JSON.stringify(saves))`);
    assert.equal(loaded, '[null,null,{"level":3}]', 'two failed, undefined in JSON as null, and a save');
    assert.deepEqual([1, 2, 3].map((slot)=> run(`wavedash.loadFailure(${slot})`)), ['failed', 'notSave', undefined]);
});
