import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A session id in the url but no server: the game plays as logged out.
// One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
let fetches = 0;
globalThis.fetch = async ()=> { ++fetches; throw new Error('offline'); };
let intervals = 0;
globalThis.setInterval = ()=> ++intervals;

test('when the server does not answer at load the newgrounds medals are local again', async () =>
{
    const SAVE = 'NG Offline';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, true);

    const plugin = new NewgroundsPlugin('an app');
    assert.equal(plugin.session_id, 'abc123');
    assert.equal(m1.unlocked, false, 'locked while the session looks good');
    assert.equal(m1.isLocal(), false);

    // an unlock earned before the server answers is sent, and fails with it
    const early = m2.unlock();
    assert.deepEqual([...plugin.pendingUnlocks.keys()], [m2]);

    assert.equal(await plugin.ready, plugin, 'ready still resolves');
    assert.equal(plugin.session_id, null, 'the session is dropped');
    assert.equal(fetches, 5, 'the view, the session check, the early unlock, and the two lists as a guest');
    assert.equal(intervals, 0, 'no keep alive without a session');
    assert.deepEqual(plugin.medals, []);
    assert.equal(m1.isLocal(), true);
    assert.equal(m1.unlocked, true, 'back from the local save');
    assert.equal(m2.unlocked, true, 'the medal is local now and unlocked with it');
    assert.equal(await early, true, 'which the early request reports');
    assert.equal(plugin.pendingUnlocks.size, 0);
    assert.equal(JSON.parse(globalThis.localStorage[SAVE])['2'].unlocked, true, 'saved');

    // a later unlock is local, saved and not sent
    assert.equal(await m3.unlock(), true);
    assert.equal(fetches, 5, 'nothing sent');
    assert.equal(JSON.parse(globalThis.localStorage[SAVE])['3'].unlocked, true, 'saved');
});
