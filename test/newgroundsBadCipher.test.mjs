import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// A cipher that is not a key fails before the request is sent: that is a refusal, not a request that did not
// reach the server, so the unlock is not sent again every minute. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const calls = [];
globalThis.fetch = async (url, options) =>
{
    const { execute } = JSON.parse(options.body.get('request'));
    calls.push(execute.component || 'secure');
    const data = { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false }, medals: [], scoreboards: [] };
    return { text: async ()=> JSON.stringify({ success: true, result: { component: execute.component, data } }) };
};
let keepAlive;
globalThis.setInterval = fn => { keepAlive = fn; return 0; };

test('a cipher that is not a key is asserted, and an unlock it cannot encrypt is refused once, not retried', async () =>
{
    assert.throws(()=> new NewgroundsPlugin('an app', 'not base64!'), 'asserted when made');
    globalThis.localStorage['NG Bad Cipher'] = '{}';
    const medal = new NewgroundsMedal(1, 'One');
    medalsInit('NG Bad Cipher');
    const plugin = new NewgroundsPlugin('an app', Buffer.alloc(16).toString('base64'));
    await plugin.ready;
    plugin.cipher = 'not base64!'; // as a release build would take it, where the assert is stripped
    plugin.cryptoKey = undefined;
    let encrypts = 0;
    const encrypt = plugin.encrypt.bind(plugin);
    plugin.encrypt = text=> (++encrypts, encrypt(text));

    assert.equal(await medal.unlock(), false, 'refused');
    assert.equal(medal.unlocked, false);
    await keepAlive();
    await keepAlive();
    assert.equal(encrypts, 1, 'tried once, not again on each check');
    assert.equal(calls.includes('secure'), false, 'nothing encrypted was ever sent');
    assert.equal(calls.filter(c => c == 'App.checkSession').length, 3, 'the load and two checks');
    assert.equal(await medal.unlock(), false, 'the refusal stands');
    assert.equal(encrypts, 1, 'and nothing is tried again');
    assert.equal(plugin.session_id, 'abc123', 'and the session is kept');
});
