import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A session lost while the plugin is still loading: an unlock sent before ready is answered with Expired Session
// while the medal list is still out. The game plays as not logged in, with no player left set, and the list that
// was asked for with the lost session does not unlock anything. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const flush = ()=> new Promise(resolve => setImmediate(resolve));
const calls = [];
globalThis.fetch = async (url, options) =>
{
    const input = JSON.parse(options.body.get('request'));
    const component = input.execute.component;
    calls.push(component);
    let data = { success: true };
    if (component == 'App.checkSession')
        data.session = { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false };
    if (component == 'Medal.unlock')
        data = { success: false, error: { message: 'Expired Session', code: 104 } };
    if (component == 'Medal.getList')
    {
        await flush(); await flush(); await flush(); // after the unlock is answered
        data.medals = [{ id: 1, name: 'Server One', unlocked: input.session_id ? true : undefined }]; // unlocks only with a session
    }
    return { text: async ()=> JSON.stringify({ success: true, result: { component, data } }) };
};
let intervals = 0;
globalThis.setInterval = ()=> ++intervals;

test('a session lost while loading leaves no player set and takes no unlocks from the lost session', async () =>
{
    const SAVE = 'NG Lost At Load';
    globalThis.localStorage[SAVE] = JSON.stringify({ '3': { name: 'Three', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    medalsInit(SAVE);
    const plugin = new NewgroundsPlugin('an app');
    await flush(); // the session check has answered and the list is out
    const early = m2.unlock();

    await plugin.ready;
    assert.equal(await early, true, 'the early unlock is local now');
    assert.equal(plugin.session_id, null, 'the session is dropped');
    assert.equal(plugin.user, null, 'and no player is left set');
    assert.equal(intervals, 0, 'no keep alive');
    assert.equal(calls.filter(c => c == 'Medal.getList').length, 2, 'the list is asked for again, as not logged in');
    assert.equal(m1.name, 'Server One', 'the server names still apply');
    assert.equal(m1.unlocked, false, 'but not the lost session\'s unlocks');
    assert.equal(m2.unlocked, true);
    assert.equal(m3.unlocked, true, 'back from the local save');
    const saved = JSON.parse(globalThis.localStorage[SAVE]);
    assert.deepEqual([saved[1].unlocked, saved[2].unlocked, saved[3].unlocked], [false, true, true]);
});
