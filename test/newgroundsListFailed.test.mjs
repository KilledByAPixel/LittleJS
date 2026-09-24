import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A good session whose medal list then fails: the game plays as logged out, keeping a medal the server
// confirmed in between. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const flush = ()=> new Promise(resolve => setImmediate(resolve));
const replies =
{
    'App.checkSession': ()=> ({ data: { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false } } }),
    'Medal.unlock': ()=> ({ data: { medal: { id: 2, unlocked: true }, medal_score: 5 } }),
    'Medal.getList': async ()=> { await flush(); await flush(); throw new Error('server error'); }, // after the unlock lands
};
const calls = [];
globalThis.fetch = async (url, options) =>
{
    const { call } = JSON.parse(options.body.get('input'));
    calls.push(call.component);
    const reply = await replies[call.component]();
    return { text: async ()=> JSON.stringify({ success: true, result: { component: call.component, success: true, ...reply } }) };
};
let intervals = 0;
globalThis.setInterval = ()=> ++intervals;

test('a failed medal list after a good session plays as logged out and keeps a confirmed unlock', async () =>
{
    const SAVE = 'NG List Failed';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    medalsInit(SAVE);
    const plugin = new NewgroundsPlugin('an app');
    assert.equal(m1.unlocked, false, 'held');

    // the server confirms an early unlock before the list call fails
    assert.equal(await m2.unlock(), true, 'confirmed by the server');
    assert.equal(m2.unlocked, true);
    assert.equal(plugin.session_id, 'abc123', 'still logged in at this point');

    await plugin.ready;
    assert.deepEqual(calls, ['App.logView', 'App.checkSession', 'Medal.unlock', 'Medal.getList', 'Medal.getList', 'ScoreBoard.getBoards'],
        'the list is asked for again as a guest');
    assert.equal(plugin.session_id, null, 'dropped');
    assert.equal(plugin.user, null);
    assert.equal(intervals, 0, 'no keep alive');
    assert.equal(m1.unlocked, true, 'back from the local save');
    assert.equal(m2.unlocked, true, 'the confirmed unlock is kept');
    assert.equal(JSON.parse(globalThis.localStorage[SAVE])['2'].unlocked, true, 'and saved');
    assert.equal(plugin.pendingUnlocks.size, 0);
});
