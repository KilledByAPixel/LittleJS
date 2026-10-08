import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewgroundsPlugin } from '../dist/littlejs.esm.js';

// Cloud saves and events for a logged in player: a stand-in server keeps each slot's text, and loading a slot gives
// a url the saved text is fetched from, as Newgrounds does. One plugin per process, so this lives in its own file.
globalThis.location = { href: 'https://uploads.ungrounded.net/game/?ngio_session_id=abc123', hostname: 'uploads.ungrounded.net' };
const inputs = [], slots = new Map;
globalThis.fetch = async (url, options) =>
{
    if (!options?.body) // a slot's saved text
        return { text: async ()=> slots.get(url) };
    const input = JSON.parse(options.body.get('request'));
    inputs.push(input);
    const { component, parameters } = input.execute;
    const data = { success: true, session: { id: 'abc123', user: { id: 5, name: 'Frank' }, expired: false }, medals: [], scoreboards: [] };
    if (component == 'CloudSave.setData')
    {
        if (typeof parameters.data != 'string') throw new TypeError('the data is text');
        slots.set('https://saves.example/' + parameters.id, parameters.data);
    }
    if (component == 'CloudSave.loadSlot')
    {
        const url = 'https://saves.example/' + parameters.id;
        data.slot = { id: parameters.id, url: slots.has(url) ? url : null };
    }
    if (component == 'Event.logEvent')
        data.event_name = parameters.event_name;
    return { text: async ()=> JSON.stringify({ success: true, result: { component, data } }) };
};
globalThis.setInterval = ()=> 0;

const plugin = new NewgroundsPlugin('an app');

test('a value saved to a slot loads back, and an empty slot loads as undefined', async () =>
{
    await plugin.ready;
    assert.equal(await plugin.cloudSave(1, { level: 3, coins: [1, 2] }), true);
    assert.deepEqual(await plugin.cloudLoad(1), { level: 3, coins: [1, 2] });
    assert.equal(await plugin.cloudLoad(2), undefined, 'nothing saved there');
    const save = inputs.find(i => i.execute.component == 'CloudSave.setData');
    assert.equal(save.session_id, 'abc123', 'sent with the session');
});

test('logEvent counts an event by name, with the host', async () =>
{
    await plugin.ready;
    const response = await plugin.logEvent('Level Finished');
    assert.equal(response.result.data.event_name, 'Level Finished');
    assert.deepEqual(inputs.at(-1).execute.parameters, { event_name: 'Level Finished', host: 'uploads.ungrounded.net' });
});

test('not logged in, a cloud save or load does nothing', async () =>
{
    await plugin.ready;
    plugin.session_id = null;
    const count = inputs.length;
    assert.equal(await plugin.cloudSave(1, 5), false);
    assert.equal(await plugin.cloudLoad(1), undefined);
    assert.equal(inputs.length, count, 'nothing was sent');
});
