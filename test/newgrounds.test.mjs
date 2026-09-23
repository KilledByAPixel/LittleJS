import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, newgrounds, medalsInit } from '../dist/littlejs.esm.js';

// a 128 bit key as the Newgrounds app settings give it, base64
const keyBytes = Uint8Array.from({ length: 16 }, (_, i)=> i * 17 & 255);
const cipher = Buffer.from(keyBytes).toString('base64');

test('NewgroundsPlugin encrypts a call with WebCrypto as AES-128 CBC, the iv first, all as base64', async () =>
{
    const plugin = new NewgroundsPlugin('an app', cipher);
    assert.equal(newgrounds, plugin);
    assert.equal(plugin.session_id, null, 'no session headless');
    assert.equal(await plugin.ready, plugin, 'ready right away when not logged in');
    assert.deepEqual(plugin.medals, []);

    const secure = await plugin.encrypt('{"component":"Medal.unlock"}');
    const bytes = Buffer.from(secure, 'base64');
    assert.equal(bytes.length % 16, 0, 'blocks');
    assert.ok(bytes.length >= 32, 'an iv and at least one block');
    // decrypt it the way the gateway does: the first 16 bytes are the iv, the rest the padded message
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bytes.subarray(0, 16) }, key, bytes.subarray(16));
    assert.equal(new TextDecoder().decode(plain), '{"component":"Medal.unlock"}');
    const again = await plugin.encrypt('{"component":"Medal.unlock"}');
    assert.notEqual(again, secure, 'a fresh iv every time');
});

test('a NewgroundsMedal unlocks locally and posts nothing when not logged in', async () =>
{
    let fetches = 0;
    globalThis.fetch = async ()=> { ++fetches; return { text: async ()=> '' }; };
    const medal = new NewgroundsMedal(7, 'Seven');
    medalsInit('NG Logged Out');
    const unlocked = medal.unlock();
    assert.equal(medal.unlocked, true, 'right away');
    assert.equal(await unlocked, true, 'and the promise says so');
    assert.equal(fetches, 0, 'the gateway is not asked without a session');
    assert.equal(JSON.parse(globalThis.localStorage['NG Logged Out'])['7'].unlocked, true, 'saved locally');
});

test('a call with a cipher posts the encrypted call in place of the plain one', async () =>
{
    let input;
    globalThis.fetch = async (url, options)=>
    {
        input = JSON.parse(options.body.get('input'));
        return { text: async ()=> '{"success":true,"result":{"component":"Gateway.ping","success":true,"data":{}}}' };
    };
    const response = await newgrounds.call('Gateway.ping', 0);
    assert.equal(response.success, true);
    assert.equal(input.app_id, 'an app');
    assert.equal(input.session_id, null);
    assert.equal(input.call.component, 'Gateway.ping');
    assert.equal(input.call.parameters, 0);
    assert.equal(typeof input.call.secure, 'string', 'the call is encrypted in place');
    assert.equal(Buffer.from(input.call.secure, 'base64').length % 16, 0);
});

test('a call whose body is not JSON, or whose cipher is bad, gives undefined instead of throwing', async () =>
{
    globalThis.fetch = async ()=> ({ text: async ()=> '<html>gateway down</html>' });
    assert.equal(await newgrounds.call('Gateway.ping', 0), undefined);

    newgrounds.cipher = 'not base64!';
    newgrounds.cryptoKey = undefined;
    assert.equal(await newgrounds.call('Gateway.ping', 0), undefined, 'a bad cipher is a failed call');
    newgrounds.cipher = cipher;
});
