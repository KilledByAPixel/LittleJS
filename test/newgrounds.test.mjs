import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, newgrounds } from '../dist/littlejs.esm.js';

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
