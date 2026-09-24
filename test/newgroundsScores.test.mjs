import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin } from '../dist/littlejs.esm.js';

// Scores for a logged in player: the whole board goes without the session, which the server would narrow down
// to that player; a user or social goes with it. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const inputs = [];
globalThis.fetch = async (url, options) =>
{
    const input = JSON.parse(options.body.get('input'));
    inputs.push(input);
    const data = { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false }, medals: [], scores: [] };
    return { text: async ()=> JSON.stringify({ success: true, result: { component: input.call.component, data } }) };
};
globalThis.setInterval = ()=> 0;

test('getScores asks for the whole board without the session, and for a user or social with it', async () =>
{
    const plugin = new NewgroundsPlugin('an app');
    await plugin.ready;
    assert.equal(plugin.user.name, 'Frank', 'logged in');

    const sent = async (...args)=> { await plugin.getScores(...args); return inputs.at(-1); };
    const board = await sent(3, undefined, false, 0, 10, 'A');
    assert.equal(board.session_id, null, 'the whole board');
    assert.deepEqual(board.call.parameters, { id: 3, social: false, skip: 0, limit: 10, period: 'A' });
    assert.equal((await sent(3, 'Tom')).session_id, 'abc123', 'a user');
    assert.equal((await sent(3, undefined, true)).session_id, 'abc123', 'social, the player and their friends');
    assert.equal(inputs.find(i => i.call.component == 'Medal.getList').session_id, 'abc123', 'other calls keep the session');
});
