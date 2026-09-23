import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit, medalsReset, setMedalsPreventUnlock } from '../dist/littlejs.esm.js';

// A logged in session: the plugin reads the session id from the page url, and every call is a fetch.
// The fetch is stubbed per component with the gateway's result object, and the keep alive interval is
// captured instead of scheduled so the test can fire it, and so the process can exit.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const replies = {};
const calls = [];
globalThis.fetch = async (url, options) =>
{
    const { call } = JSON.parse(options.body.get('input'));
    calls.push(call.component);
    const reply = replies[call.component];
    if (reply instanceof Error) throw reply;
    return { text: async ()=> JSON.stringify({ success: true, result: { component: call.component, success: true, ...reply } }) };
};
let keepAlive;
globalThis.setInterval = fn => { keepAlive = fn; return 0; };
const flush = ()=> new Promise(resolve => setImmediate(resolve));
const unlockCalls = ()=> calls.filter(c => c == 'Medal.unlock').length;

test('when logged in the server holds the medals and the local save is left alone', async () =>
{
    // a save from whoever played logged out on this browser
    const SAVE = 'NG Game';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, true, 'the local save applies before the plugin exists');
    const savedBefore = globalThis.localStorage[SAVE];

    // the session locks everything until the server answers
    replies['Medal.getList'] = { data: { medals: [
        { id: 1, name: 'Server One', description: 'from the server', icon: 'one.png', unlocked: false, value: 5 },
        { id: 2, name: 'Server Two', description: '', icon: 'two.png', unlocked: true },
    ]}};
    replies['ScoreBoard.getBoards'] = { data: { scoreboards: [] } };
    const plugin = new NewgroundsPlugin('an app');
    assert.equal(plugin.session_id, 'abc123');
    assert.equal(m1.unlocked, false, 'locked as soon as the session is known');
    assert.ok(keepAlive, 'the keep alive is set up before the first server call');
    await plugin.ready;
    assert.equal(m1.unlocked, false);
    assert.equal(m2.unlocked, true, 'the server list is the state');
    assert.equal(m1.description, 'from the server (5)');
    assert.equal(globalThis.localStorage[SAVE], savedBefore, 'the local save is untouched');

    // an unlock only lands once the server confirms it, and asking every frame sends one request
    replies['Medal.unlock'] = { data: { medal: { id: 1, unlocked: true }, medal_score: 5 } };
    let before = unlockCalls();
    m1.unlock();
    m1.unlock();
    m1.unlock();
    assert.equal(m1.unlocked, false, 'not yet');
    assert.deepEqual([...plugin.pendingUnlocks], [m1], 'pending while the request is out');
    await flush();
    assert.equal(m1.unlocked, true, 'confirmed');
    assert.equal(unlockCalls() - before, 1, 'one request');
    assert.equal(plugin.pendingUnlocks.size, 0);
    assert.equal(globalThis.localStorage[SAVE], savedBefore, 'still untouched');

    // a failed call keeps the medal locked and pending, and the keep alive resends it
    replies['Medal.unlock'] = new Error('offline');
    m3.unlock();
    await flush();
    assert.equal(m3.unlocked, false);
    assert.deepEqual([...plugin.pendingUnlocks], [m3]);
    before = calls.length;
    replies['Medal.unlock'] = { data: { medal: { id: 3, unlocked: true }, medal_score: 5 } };
    keepAlive();
    await flush();
    assert.deepEqual(calls.slice(before), ['Gateway.ping', 'Medal.unlock']);
    assert.equal(m3.unlocked, true, 'resent and confirmed');
    assert.equal(plugin.pendingUnlocks.size, 0);

    // a server refusal stays pending too, and is not resent while unlocks are prevented
    replies['Medal.unlock'] = { success: false, error: { message: 'no such medal', code: 1 } };
    const m4 = new NewgroundsMedal(4, 'Four');
    m4.unlock();
    await flush();
    assert.equal(m4.unlocked, false);
    assert.deepEqual([...plugin.pendingUnlocks], [m4]);
    setMedalsPreventUnlock(true);
    before = unlockCalls();
    keepAlive();
    await flush();
    assert.equal(unlockCalls(), before, 'not resent');
    assert.deepEqual([...plugin.pendingUnlocks], [m4], 'still pending');
    setMedalsPreventUnlock(false);
    keepAlive();
    await flush();
    assert.equal(unlockCalls(), before + 1, 'resent once unlocks are allowed');
    assert.deepEqual([...plugin.pendingUnlocks], [m4], 'refused again');

    // a later medalsInit skips the local save as well, and a reset does not write it
    globalThis.localStorage['NG Other'] = JSON.stringify({ '4': { name: 'Four', unlocked: true } });
    medalsInit('NG Other');
    assert.equal(m4.unlocked, false, 'the local save is not read');
    medalsReset();
    assert.equal(globalThis.localStorage['NG Other'], JSON.stringify({ '4': { name: 'Four', unlocked: true } }), 'not written');
    assert.equal(globalThis.localStorage[SAVE], savedBefore);
});
