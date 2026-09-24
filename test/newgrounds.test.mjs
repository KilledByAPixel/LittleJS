import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, Medal, newgrounds, medalsInit } from '../dist/littlejs.esm.js';

// A guest: no session in the url (none headless), so the lists come in but nothing is unlocked on the server.
// The fetch is stubbed per component with the gateway's result object.
const replies =
{
    'Medal.getList': { data: { medals: [
        { id: 7, name: 'Server Seven', description: 'from the server', icon: 'seven.png', value: 10, difficulty: 2 },
        { id: 8, name: 'Server Eight', description: '', icon: 'eight.png' },
    ]}},
    'ScoreBoard.getBoards': { data: { scoreboards: [{ id: 3, name: 'High Scores' }] } },
};
const calls = [];
let input;
globalThis.fetch = async (url, options) =>
{
    input = JSON.parse(options.body.get('input'));
    calls.push(input.call.component);
    const reply = replies[input.call.component];
    if (reply instanceof Error) throw reply;
    return { text: async ()=> JSON.stringify({ success: true, result: { component: input.call.component, success: true, ...reply } }) };
};
let intervals = 0;
globalThis.setInterval = ()=> ++intervals;

// a 128 bit key as the Newgrounds app settings give it, base64
const keyBytes = Uint8Array.from({ length: 16 }, (_, i)=> i * 17 & 255);
const cipher = Buffer.from(keyBytes).toString('base64');

test('a guest gets the medal and scoreboard lists, keeps the local unlocks and starts no keep alive', async () =>
{
    globalThis.localStorage['NG Guest'] = JSON.stringify({ '7': { name: 'Seven', unlocked: true } });
    const m7 = new NewgroundsMedal(7, 'Seven');
    const m8 = new NewgroundsMedal(8, 'Eight');
    const plain = new Medal(9, 'Plain');
    medalsInit('NG Guest');
    assert.equal(m7.unlocked, true, 'from the local save');

    const plugin = new NewgroundsPlugin('an app', cipher);
    assert.equal(newgrounds, plugin);
    assert.equal(plugin.session_id, null, 'no session headless');
    assert.equal(m7.isLocal(), true);
    assert.equal(m7.unlocked, true, 'a guest medal is not locked');
    assert.equal(await plugin.ready, plugin);
    assert.deepEqual(calls, ['Medal.getList', 'ScoreBoard.getBoards'], 'no session check without a session');
    assert.equal(plugin.user, null);
    assert.equal(intervals, 0, 'no keep alive');
    assert.equal(plugin.medals.length, 2);
    assert.deepEqual(plugin.scoreboards, [{ id: 3, name: 'High Scores' }]);
    assert.equal(m7.name, 'Server Seven', 'the server names and icons apply');
    assert.equal(m7.description, 'from the server (10)');
    assert.equal(m7.value, 10);
    assert.equal(m7.image.src, 'seven.png');
    assert.equal(m7.unlocked, true, 'the local unlock stays');
    assert.equal(m8.unlocked, false);
    assert.equal(plain.name, 'Plain');
});

test('NewgroundsPlugin encrypts a call with WebCrypto as AES-128 CBC, the iv first, all as base64', async () =>
{
    const secure = await newgrounds.encrypt('{"component":"Medal.unlock"}');
    const bytes = Buffer.from(secure, 'base64');
    assert.equal(bytes.length % 16, 0, 'blocks');
    assert.ok(bytes.length >= 32, 'an iv and at least one block');
    // decrypt it the way the gateway does: the first 16 bytes are the iv, the rest the padded message
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bytes.subarray(0, 16) }, key, bytes.subarray(16));
    assert.equal(new TextDecoder().decode(plain), '{"component":"Medal.unlock"}');
    const again = await newgrounds.encrypt('{"component":"Medal.unlock"}');
    assert.notEqual(again, secure, 'a fresh iv every time');
});

test('a NewgroundsMedal unlocks locally and posts nothing when not logged in', async () =>
{
    const medal = new NewgroundsMedal(10, 'Ten');
    const before = calls.length;
    const unlocked = medal.unlock();
    assert.equal(medal.unlocked, true, 'right away');
    assert.equal(await unlocked, true, 'and the promise says so');
    assert.equal(calls.length, before, 'the gateway is not asked without a session');
    assert.equal(JSON.parse(globalThis.localStorage['NG Guest'])['10'].unlocked, true, 'saved locally');
});

test('a call with a cipher posts the encrypted call in place of the plain one', async () =>
{
    replies['Gateway.ping'] = { data: {} };
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
