import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin } from '../dist/littlejs.esm.js';

// A score goes to Newgrounds as a whole number, rounded as Wavedash's is. One plugin per process, so this lives in its
// own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const inputs = [];
globalThis.fetch = async (url, options) =>
{
    const input = JSON.parse(options.body.get('request'));
    inputs.push(input);
    const data = { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false }, medals: [], scores: [] };
    return { text: async ()=> JSON.stringify({ success: true, result: { component: input.execute.component, data } }) };
};
globalThis.setInterval = ()=> 0;

test('postScore sends the score rounded to a whole number', async () =>
{
    const plugin = new NewgroundsPlugin('an app');
    await plugin.ready;
    await plugin.postScore(3, 12.6);
    assert.deepEqual(inputs.at(-1).execute.parameters, { id: 3, value: 13 });
});
