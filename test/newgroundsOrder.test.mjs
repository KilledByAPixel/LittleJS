import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// The plugin made before the medals and before medalsInit, logged in: the session still holds the medals.
// The list answers after the unlock requests, so a confirm lands first and a failure waits to be resent.
// One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const replies =
{
    'App.checkSession': { data: { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false } } },
    'Medal.getList': { data: { medals: [
        { id: 1, name: 'Server One', description: '', icon: 'one.png', unlocked: true },
        { id: 2, name: 'Server Two', description: '', icon: 'two.png', unlocked: false },
        { id: 4, name: 'Server Four', description: '', icon: 'four.png', unlocked: true },
    ]}},
    'Medal.unlock': id => id == 2 ? { data: { medal: { id: 2, unlocked: true }, medal_score: 5 } } :
        { success: false, error: { message: 'server busy', code: 500 } },
    'ScoreBoard.getBoards': { data: { scoreboards: [{ id: 3, name: 'High Scores' }] } },
};
globalThis.fetch = async (url, options) =>
{
    const { execute: call } = JSON.parse(options.body.get('request'));
    const reply = typeof replies[call.component] == 'function' ?
        replies[call.component](call.parameters.id) : replies[call.component];
    if (call.component == 'Medal.getList')
        await flush(), await flush(), await flush(); // after the unlock confirm
    return { text: async ()=> JSON.stringify({ success: true, result: { component: call.component, success: true, ...reply } }) };
};
globalThis.setInterval = ()=> 0;
const flush = ()=> new Promise(resolve => setImmediate(resolve));

test('a plugin made before the medals and medalsInit still holds them on the server', async () =>
{
    const SAVE = 'NG Order';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true }, '2': { name: 'Two', unlocked: true } });
    const plugin = new NewgroundsPlugin('an app');
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    const m4 = new NewgroundsMedal(4, 'Four');
    assert.equal(m1.isLocal(), false, 'held from the start');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, false, 'the local save is not read for a held medal');
    assert.equal(m2.unlocked, false);
    assert.deepEqual(JSON.parse(globalThis.localStorage[SAVE])['2'], { name: 'Two', unlocked: true }, 'but its entry is kept');

    // the session check has answered, the list has not
    await flush();
    assert.equal(await m2.unlock(), true, 'confirmed before the list');
    assert.equal(await m4.unlock(), false, 'refused before the list');
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m4], 'waiting to be resent');

    await plugin.ready;
    assert.equal(plugin.user.name, 'Frank');
    assert.equal(m1.unlocked, true, 'the server list applies');
    assert.equal(m1.name, 'Server One');
    assert.equal(m2.unlocked, true, 'a list older than the confirm does not relock it');
    assert.equal(plugin.medals.find(m => m.id == 2).unlocked, true, 'and the list says so too');
    assert.equal(m3.unlocked, false, 'a medal the server does not list stays locked');
    assert.equal(m4.unlocked, true, 'the list has it unlocked after all');
    assert.equal(plugin.pendingUnlocks.size, 0, 'so it is not waiting any more');
    assert.deepEqual(plugin.scoreboards, [{ id: 3, name: 'High Scores' }]);
});
