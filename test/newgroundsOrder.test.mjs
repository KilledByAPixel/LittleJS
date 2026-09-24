import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// The plugin made before the medals and before medalsInit, logged in: the session still holds the medals.
// One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const replies =
{
    'App.checkSession': { data: { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false } } },
    'Medal.getList': { data: { medals: [{ id: 1, name: 'Server One', description: '', icon: 'one.png', unlocked: true }] } },
    'ScoreBoard.getBoards': { data: { scoreboards: [{ id: 3, name: 'High Scores' }] } },
};
globalThis.fetch = async (url, options) =>
{
    const { call } = JSON.parse(options.body.get('input'));
    const reply = replies[call.component];
    return { text: async ()=> JSON.stringify({ success: true, result: { component: call.component, success: true, ...reply } }) };
};
globalThis.setInterval = ()=> 0;

test('a plugin made before the medals and medalsInit still holds them on the server', async () =>
{
    const SAVE = 'NG Order';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true }, '2': { name: 'Two', unlocked: true } });
    const plugin = new NewgroundsPlugin('an app');
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    assert.equal(m1.isLocal(), false, 'held from the start');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, false, 'the local save is not read for a held medal');
    assert.equal(m2.unlocked, false);
    assert.deepEqual(JSON.parse(globalThis.localStorage[SAVE])['2'], { name: 'Two', unlocked: true }, 'but its entry is kept');

    await plugin.ready;
    assert.equal(plugin.user.name, 'Frank');
    assert.equal(m1.unlocked, true, 'the server list applies');
    assert.equal(m1.name, 'Server One');
    assert.equal(m2.unlocked, false, 'a medal the server does not list stays locked');
    assert.deepEqual(plugin.scoreboards, [{ id: 3, name: 'High Scores' }]);
});
