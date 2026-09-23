import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A session id in the url whose first server call fails: the game plays as logged out.
// One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=expired', hostname: 'uploads.ungrounded.net' };
let fetches = 0;
globalThis.fetch = async ()=> { ++fetches; throw new Error('offline'); };
globalThis.setInterval = ()=> 0;

test('when the server does not answer at load the newgrounds medals are local again', async () =>
{
    const SAVE = 'NG Offline';
    globalThis.localStorage[SAVE] = JSON.stringify({ '1': { name: 'One', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, true);

    const plugin = new NewgroundsPlugin('an app');
    assert.equal(plugin.session_id, 'expired');
    assert.equal(m1.unlocked, false, 'locked while the session looks good');
    assert.equal(m1.isLocal(), false);
    assert.equal(await plugin.ready, plugin, 'ready still resolves');
    assert.equal(plugin.session_id, null, 'the session is dropped');
    assert.equal(fetches, 1, 'only the medal list was asked for');
    assert.deepEqual(plugin.medals, []);
    assert.equal(m1.isLocal(), true);
    assert.equal(m1.unlocked, true, 'back from the local save');

    // an unlock is local now, saved and not sent
    assert.equal(await m2.unlock(), true);
    assert.equal(m2.unlocked, true);
    assert.equal(fetches, 1, 'nothing sent');
    assert.equal(JSON.parse(globalThis.localStorage[SAVE])['2'].unlocked, true, 'saved');
    assert.equal(plugin.pendingUnlocks.size, 0);
});
