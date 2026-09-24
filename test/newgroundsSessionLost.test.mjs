import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A session that is lost after startup: an unlock the server answers with Expired Session (104) makes the game
// play as not logged in, the way a session refused at load does. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const good = { data: { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false } } };
const replies =
{
    'App.checkSession': good,
    'Medal.getList': { data: { success: true, medals: [{ id: 1, unlocked: false }, { id: 2, unlocked: false }] } },
    'ScoreBoard.getBoards': { data: { success: true, scoreboards: [] } },
    'Medal.unlock': { data: { success: true, medal: { id: 1, unlocked: true }, medal_score: 5 } },
};
const calls = [];
globalThis.fetch = async (url, options) =>
{
    const { call } = JSON.parse(options.body.get('input'));
    calls.push(call.component);
    const reply = replies[call.component];
    if (reply instanceof Error) throw reply;
    return { text: async ()=> JSON.stringify({ success: true, result: { component: call.component, ...reply } }) };
};
let keepAlive, cleared;
globalThis.setInterval = fn => { keepAlive = fn; return 7; };
globalThis.clearInterval = id => cleared = id;

test('a session lost after startup plays as not logged in, and a failed request does not count as lost', async () =>
{
    const SAVE = 'NG Lost';
    globalThis.localStorage[SAVE] = JSON.stringify({ '3': { name: 'Three', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    medalsInit(SAVE);
    const plugin = new NewgroundsPlugin('an app');
    await plugin.ready;
    assert.equal(plugin.user.name, 'Frank');
    assert.equal(await m1.unlock(), true, 'confirmed while logged in');

    // a request that fails on the way, or a server that is busy, keeps the session and resends
    replies['Medal.unlock'] = new Error('offline');
    assert.equal(await m2.unlock(), false);
    replies['App.checkSession'] = { data: { success: false, error: { message: 'Server Unavailable', code: 504 } } };
    await keepAlive();
    assert.equal(plugin.session_id, 'abc123', 'still logged in');
    assert.equal(m2.unlocked, false);
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m2], 'resent and still out');

    // the answer to it says the session expired: the game plays as not logged in
    replies['App.checkSession'] = good;
    replies['Medal.unlock'] = { data: { success: false, error: { message: 'Expired Session', code: 104 } } };
    await keepAlive();
    const resent = plugin.pendingUnlocks.get(m2);
    assert.equal(await resent, true, 'the medal unlocks locally');
    assert.equal(plugin.session_id, null, 'the session is dropped');
    assert.equal(plugin.user, null);
    assert.equal(m2.unlocked, true);
    assert.equal(m1.unlocked, true, 'the confirmed unlock is kept');
    assert.equal(m3.unlocked, true, 'back from the local save');
    assert.equal(plugin.pendingUnlocks.size, 0);
    const saved = JSON.parse(globalThis.localStorage[SAVE]);
    assert.deepEqual([saved[1].unlocked, saved[2].unlocked, saved[3].unlocked], [true, true, true], 'all saved');

    // the next tick stops the keep alive, and nothing more is sent
    const sent = calls.length;
    await keepAlive();
    assert.equal(cleared, 7, 'the keep alive stops');
    assert.equal(calls.length, sent);
});
