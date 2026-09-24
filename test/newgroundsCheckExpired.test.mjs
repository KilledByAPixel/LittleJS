import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin, NewgroundsMedal, medalsInit } from '../dist/littlejs.esm.js';

// The minute's session check finds the session expired: the game plays as not logged in, and a request that
// stalls fails after its deadline instead of holding ready. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const replies =
{
    'App.checkSession': { data: { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false } } },
    'Medal.getList': { data: { success: true, medals: [{ id: 1, unlocked: true }] } },
    'Medal.unlock': new Error('offline'),
};
const calls = [];
const signals = [];
let stall = false;
globalThis.fetch = (url, options) =>
{
    const { execute: call } = JSON.parse(options.body.get('request'));
    calls.push(call.component);
    signals.push(options.signal);
    if (stall && call.component == 'ScoreBoard.getBoards') // never answers, until the deadline aborts it
        return new Promise((resolve, reject)=> options.signal.addEventListener('abort', ()=> reject(options.signal.reason)));
    const reply = replies[call.component];
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ text: async ()=> JSON.stringify({ success: true, result: { component: call.component, ...reply } }) });
};
let keepAlive;
globalThis.setInterval = fn => { keepAlive = fn; return 0; };

// a short deadline, so the stalled request fails at once instead of in 15 seconds
let deadline;
AbortSignal.timeout = ms => { deadline = ms; const controller = new AbortController(); setTimeout(()=> controller.abort(new Error('timed out')), 5); return controller.signal; };

test('a stalled request fails at its deadline, and an expired session found by the minute\'s check plays as not logged in', async () =>
{
    const SAVE = 'NG Check Expired';
    globalThis.localStorage[SAVE] = JSON.stringify({ '2': { name: 'Two', unlocked: true } });
    const m1 = new NewgroundsMedal(1, 'One');
    const m2 = new NewgroundsMedal(2, 'Two');
    const m3 = new NewgroundsMedal(3, 'Three');
    medalsInit(SAVE);
    stall = true;
    const plugin = new NewgroundsPlugin('an app');
    assert.equal(await plugin.ready, plugin, 'ready despite the stalled scoreboard list');
    assert.equal(deadline, 15e3, 'every request gets a 15 second deadline');
    assert.ok(signals.length && signals.every(signal => signal instanceof AbortSignal), 'and fetch is given it');
    assert.deepEqual(plugin.scoreboards, [], 'the stalled list is empty');
    assert.equal(plugin.user.name, 'Frank');
    assert.equal(m1.unlocked, true, 'from the server');
    assert.equal(m2.unlocked, false, 'held, not from the save');
    stall = false;

    // an unlock that cannot reach the server waits for the check
    assert.equal(await m3.unlock(), false);
    replies['App.checkSession'] = { data: { success: true, session: { id: 'abc123', user: null, expired: true } } };
    await keepAlive();
    assert.equal(plugin.session_id, null, 'the session is dropped');
    assert.equal(m1.unlocked, true, 'the server unlock is kept for this visit');
    assert.equal(m2.unlocked, true, 'back from the local save');
    assert.equal(m3.unlocked, true, 'the unlock that was waiting is local now');
    assert.equal(calls.filter(c => c == 'Medal.unlock').length, 1, 'not resent to a dead session');
});
