import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, Medal, medalsInit, medalsReset, setMedalsPreventUnlock } from '../dist/littlejs.esm.js';

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
const SAVE = 'NG Game';
const stored = ()=> JSON.parse(globalThis.localStorage[SAVE]);
const storedNewgrounds = ()=> [1, 2, 3].map(id => stored()[id]);

test('when logged in the server holds the newgrounds medals, the local save keeps their old entries and plain medals go on as before', async () =>
{
    // a save from whoever played logged out on this browser
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    const plain = new Medal(9, 'Plain');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, true, 'the local save applies before the plugin exists');
    assert.equal(m1.isLocal(), true);
    const savedBefore = storedNewgrounds();
    assert.equal(savedBefore[0].unlocked, true);

    // the session locks the newgrounds medals until the server answers, a plain medal is not touched
    replies['Medal.getList'] = { data: { medals: [
        { id: 1, name: 'Server One', description: 'from the server', icon: 'one.png', unlocked: false, value: 5 },
        { id: 2, name: 'Server Two', description: '', icon: 'two.png', unlocked: true },
        { id: 9, name: 'Server Nine', description: '', icon: 'nine.png', unlocked: true },
    ]}};
    replies['ScoreBoard.getBoards'] = { data: { scoreboards: [] } };
    const plugin = new NewgroundsPlugin('an app');
    assert.equal(plugin.session_id, 'abc123');
    assert.equal(m1.unlocked, false, 'locked as soon as the session is known');
    assert.equal(m1.isLocal(), false);
    assert.equal(plain.isLocal(), true);
    assert.ok(keepAlive, 'the keep alive is set up before the first server call');
    await plugin.ready;
    assert.equal(m1.unlocked, false);
    assert.equal(m2.unlocked, true, 'the server list is the state');
    assert.equal(m1.description, 'from the server (5)');
    assert.equal(plain.name, 'Plain', 'a plain medal with a server id is left alone');
    assert.equal(plain.unlocked, false);
    assert.deepEqual(storedNewgrounds(), savedBefore, 'the local save is untouched');
    assert.equal(await m2.unlock(), true, 'an unlocked medal answers right away');

    // a plain medal still unlocks and saves locally, and the newgrounds entries in the save stay as they were
    assert.equal(await plain.unlock(), true);
    assert.equal(stored()[9].unlocked, true, 'saved');
    assert.deepEqual(storedNewgrounds(), savedBefore, 'offline progress on newgrounds medals is kept for logged out play');

    // an unlock only lands once the server confirms it, and asking every frame sends one request
    replies['Medal.unlock'] = { data: { medal: { id: 1, unlocked: true }, medal_score: 5 } };
    let before = unlockCalls();
    const first = m1.unlock();
    assert.equal(m1.unlock(), first, 'the same promise while the request is out');
    assert.equal(m1.unlock(), first);
    assert.equal(m1.unlocked, false, 'not yet');
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m1], 'pending while the request is out');
    assert.equal(plugin.pendingUnlocks.get(m1), first);
    assert.equal(await first, true, 'confirmed');
    assert.equal(m1.unlocked, true);
    assert.equal(plugin.medals.find(m => m.id == 1).unlocked, true, 'the fetched list is kept in step');
    assert.equal(unlockCalls() - before, 1, 'one request');
    assert.equal(plugin.pendingUnlocks.size, 0);
    assert.deepEqual(storedNewgrounds(), savedBefore, 'still untouched');

    // a failed call keeps the medal locked and pending, and the keep alive resends it
    replies['Medal.unlock'] = new Error('offline');
    const failed = m3.unlock();
    assert.equal(await failed, false, 'the outcome of the failed request');
    assert.equal(m3.unlocked, false);
    assert.equal(m3.unlock(), failed, 'the failed request stands until the keep alive resends');
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m3]);
    before = calls.length;
    replies['Medal.unlock'] = { data: { medal: { id: 3, unlocked: true }, medal_score: 5 } };
    keepAlive();
    const resent = plugin.pendingUnlocks.get(m3);
    assert.notEqual(resent, failed, 'a fresh request');
    assert.equal(await resent, true, 'resent and confirmed');
    assert.deepEqual(calls.slice(before), ['Gateway.ping', 'Medal.unlock']);
    assert.equal(m3.unlocked, true);
    assert.equal(plugin.pendingUnlocks.size, 0);

    // a confirm that lands after unlocks were prevented waits too, and is resent once they are allowed
    replies['Medal.unlock'] = { data: { medal: { id: 2, unlocked: true }, medal_score: 5 } };
    m2.unlocked = false; // as if the server had it locked at load
    const late = m2.unlock();
    setMedalsPreventUnlock(true);
    assert.equal(await late, false, 'not unlocked while prevented');
    assert.equal(m2.unlocked, false);
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m2], 'still pending');
    setMedalsPreventUnlock(false);
    keepAlive();
    assert.equal(await plugin.pendingUnlocks.get(m2), true, 'resent and confirmed');
    assert.equal(m2.unlocked, true);
    assert.equal(plugin.pendingUnlocks.size, 0);

    // a server refusal stays pending too, and is not resent while unlocks are prevented
    replies['Medal.unlock'] = { success: false, error: { message: 'no such medal', code: 1 } };
    const m4 = new NewgroundsMedal(4, 'Four');
    assert.equal(await m4.unlock(), false, 'refused');
    assert.equal(m4.unlocked, false);
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m4]);
    setMedalsPreventUnlock(true);
    assert.equal(await m4.unlock(), false, 'prevented');
    before = unlockCalls();
    keepAlive();
    await flush();
    assert.equal(unlockCalls(), before, 'not resent');
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m4], 'still pending');
    setMedalsPreventUnlock(false);
    keepAlive();
    await flush();
    assert.equal(unlockCalls(), before + 1, 'resent once unlocks are allowed');
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m4], 'refused again');

    // a later medalsInit skips the newgrounds medals in the local save, and a reset keeps their entries
    globalThis.localStorage['NG Other'] = JSON.stringify({ '4': { name: 'Four', unlocked: true }, '9': { name: 'Plain', unlocked: true } });
    medalsInit('NG Other');
    assert.equal(m4.unlocked, false, 'the local save is not read for a newgrounds medal');
    assert.equal(plain.unlocked, true, 'but it is for a plain one');
    medalsReset();
    const other = JSON.parse(globalThis.localStorage['NG Other']);
    assert.deepEqual(other['4'], { name: 'Four', unlocked: true }, 'kept as it was');
    assert.equal(other['9'].unlocked, false, 'the plain medal is reset');
    assert.deepEqual(storedNewgrounds(), savedBefore);
});
