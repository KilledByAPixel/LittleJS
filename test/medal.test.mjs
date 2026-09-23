import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Medal, medals, medalsInit, medalsReset, setMedalsPreventUnlock } from '../dist/littlejs.esm.js';

// Use a unique id range per test to avoid the global `medals` registry
// colliding with tests in smoke.test.mjs (which uses ids 100, 101).
// Clear localStorage and registered medals between tests.
beforeEach(() =>
{
    // wipe any keys the stub accumulated
    for (const k of Object.keys(globalThis.localStorage)) delete globalThis.localStorage[k];
    // wipe the medals registry (it's a const but its keys are mutable)
    for (const k of Object.keys(medals)) delete medals[k];
});

const SAVE = 'TestGame';

test('medalsInit with empty storage writes full catalog with all locked', () =>
{
    new Medal(1, 'One', 'desc one', '🥇');
    new Medal(2, 'Two', 'desc two', '🥈');
    medalsInit(SAVE);

    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal(stored['1'].name, 'One');
    assert.equal(stored['1'].description, 'desc one');
    assert.equal(stored['1'].icon, '🥇');
    assert.equal(stored['1'].unlocked, false);
    assert.equal(stored['2'].unlocked, false);
    // src is omitted when not provided
    assert.equal('src' in stored['1'], false);
});

test('medalsInit restores unlocked flags from prior save', () =>
{
    globalThis.localStorage[SAVE] = JSON.stringify({
        '1': { name: 'Old', description: '', icon: '🏆', unlocked: true },
        '2': { name: 'Two', description: '', icon: '🏆', unlocked: false },
    });
    const m1 = new Medal(1, 'One', '', '🏆');
    const m2 = new Medal(2, 'Two', '', '🏆');
    medalsInit(SAVE);
    assert.equal(m1.unlocked, true);
    assert.equal(m2.unlocked, false);
});

test('medalsInit refreshes metadata when code changes a medal name/icon', () =>
{
    globalThis.localStorage[SAVE] = JSON.stringify({
        '1': { name: 'OldName', description: 'old desc', icon: '🥇', unlocked: true },
    });
    new Medal(1, 'NewName', 'new desc', '🏆');
    medalsInit(SAVE);

    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal(stored['1'].name, 'NewName');
    assert.equal(stored['1'].description, 'new desc');
    assert.equal(stored['1'].icon, '🏆');
    // unlocked flag carried over from storage
    assert.equal(stored['1'].unlocked, true);
});

test('medalsInit prunes medals that no longer exist in code', () =>
{
    globalThis.localStorage[SAVE] = JSON.stringify({
        '1': { name: 'Keep', description: '', icon: '🏆', unlocked: true },
        '2': { name: 'Drop', description: '', icon: '🏆', unlocked: true },
    });
    new Medal(1, 'Keep', '', '🏆');
    medalsInit(SAVE);

    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal('1' in stored, true);
    assert.equal('2' in stored, false);
});

test('medalsInit recovers from corrupt JSON without throwing', () =>
{
    globalThis.localStorage[SAVE] = '{not valid json';
    new Medal(1, 'One', '', '🏆');
    assert.doesNotThrow(() => medalsInit(SAVE));
    // catalog written from in-memory state, all locked
    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal(stored['1'].unlocked, false);
});

test('unlock sets the flag and writes the full object', () =>
{
    new Medal(1, 'One', '', '🏆');
    const m2 = new Medal(2, 'Two', '', '🥈');
    medalsInit(SAVE);
    m2.unlock();

    assert.equal(m2.unlocked, true);
    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal(stored['2'].unlocked, true);
    // other medals still present and locked
    assert.equal(stored['1'].unlocked, false);
});

test('unlock is a no-op when already unlocked', async () =>
{
    const m = new Medal(1, 'One', '', '🏆');
    medalsInit(SAVE);
    assert.equal(await m.unlock(), true, 'the optional promise resolves right away');
    // hand-corrupt storage so we can detect a second write
    globalThis.localStorage[SAVE] = 'SENTINEL';
    assert.equal(await m.unlock(), true, 'still unlocked');
    assert.equal(globalThis.localStorage[SAVE], 'SENTINEL');
});

test('unlock resolves false when unlocks are prevented', async () =>
{
    const m = new Medal(1, 'One', '', '🏆');
    medalsInit(SAVE);
    setMedalsPreventUnlock(true);
    try
    {
        assert.equal(await m.unlock(), false);
        assert.equal(m.unlocked, false);
    }
    finally { setMedalsPreventUnlock(false); }
});

test('medalsReset clears unlocked flags and persists the catalog', () =>
{
    const m1 = new Medal(1, 'One', '', '🏆');
    const m2 = new Medal(2, 'Two', '', '🥈');
    medalsInit(SAVE);
    m1.unlock();
    m2.unlock();

    medalsReset();

    assert.equal(m1.unlocked, false);
    assert.equal(m2.unlocked, false);
    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal(stored['1'].unlocked, false);
    assert.equal(stored['2'].unlocked, false);
    assert.equal(stored['1'].name, 'One');                // catalog preserved
});

test('medal constructed with src includes src in stored object', () =>
{
    new Medal(1, 'WithSrc', '', '🏆', 'medals/foo.png');
    medalsInit(SAVE);
    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.equal(stored['1'].src, 'medals/foo.png');
});

test('a medal a service holds is neither loaded nor written, its stored entry stays for when it is local again', () =>
{
    globalThis.localStorage[SAVE] = JSON.stringify({
        '1': { name: 'Held', description: 'old', icon: '🏆', unlocked: true },
        '2': { name: 'Two', description: '', icon: '🏆', unlocked: true },
    });
    const held = new Medal(1, 'One', 'new');
    held.isLocal = ()=> false;
    const m2 = new Medal(2, 'Two');
    const m3 = new Medal(3, 'Three');
    m3.isLocal = ()=> false;
    medalsInit(SAVE);
    assert.equal(held.unlocked, false, 'not loaded');
    assert.equal(m2.unlocked, true);

    held.unlock();
    m2.unlock();
    const stored = JSON.parse(globalThis.localStorage[SAVE]);
    assert.deepEqual(stored['1'], { name: 'Held', description: 'old', icon: '🏆', unlocked: true }, 'kept as it was');
    assert.equal(stored['2'].unlocked, true);
    assert.equal('3' in stored, false, 'a held medal with no entry gets none');
});

test('medalsInit can run again for another save without adding the render plugin twice', () =>
{
    const m = new Medal(1, 'One');
    medalsInit(SAVE);
    m.unlock();
    // a second registration of the same render function would fail the engine's uniqueness assert
    assert.doesNotThrow(() => medalsInit('Other Save'));
    assert.equal(m.unlocked, false, 'the other save has it locked');
});

test('a medal id must be a number', () =>
{
    assert.throws(() => new Medal('1', 'One'));
    assert.throws(() => new Medal(-1, 'One'));
});
