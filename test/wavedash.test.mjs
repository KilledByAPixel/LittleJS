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
        setTimeout: (f)=> (timers.push(f), timers.length), clearTimeout: (id)=> { timers[id - 1] = undefined; } };
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
