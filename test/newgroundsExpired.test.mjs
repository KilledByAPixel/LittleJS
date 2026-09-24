import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A session id the server knows but nobody has signed in to yet, the passport case: the game plays as logged out.
// One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=old', hostname: 'uploads.ungrounded.net' };
const calls = [];
globalThis.fetch = async (url, options) =>
{
    const { execute: call } = JSON.parse(options.body.get('request'));
    calls.push(call.component);
    const data = { success: true, session: { id: 'old', user: null, expired: false, passport_url: 'https://www.newgrounds.com/passport/' } };
    return { text: async ()=> JSON.stringify({ success: true, result: { component: call.component, success: true, data } }) };
};
let intervals = 0;
globalThis.setInterval = ()=> ++intervals;

test('a session with no user signed in plays as logged out', async () =>
{
    const SAVE = 'NG Expired';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    medalsInit(SAVE);
    const plugin = new NewgroundsPlugin('an app');
    assert.equal(m1.unlocked, false, 'held until the server answers');
    await plugin.ready;
    assert.deepEqual(calls, ['App.logView', 'App.checkSession', 'Medal.getList', 'ScoreBoard.getBoards'], 'the lists as a guest');
    assert.equal(plugin.session_id, null);
    assert.equal(plugin.user, null);
    assert.equal(intervals, 0, 'no keep alive for a session that is gone');
    assert.equal(m1.isLocal(), true);
    assert.equal(m1.unlocked, true, 'back from the local save');
});
