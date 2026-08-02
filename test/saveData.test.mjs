import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaveData, writeSaveData } from '../dist/littlejs.esm.js';

// test/setup.mjs installs a plain-object localStorage stub. The bundle uses
// bracket notation on it, so own-property assignment is all that's needed.
function clearStorage()
{
    for (const k of Object.keys(globalThis.localStorage))
        delete globalThis.localStorage[k];
}

// ASSERT throws Error('Assert failed!') in the debug bundle. Release builds
// strip it entirely, which is intended — this is a development-time guard.

test('readSaveData throws on a scalar default', () =>
{
    clearStorage();
    assert.throws(()=> readSaveData('best', 0), /Assert failed/);
    assert.throws(()=> readSaveData('best', 'x'), /Assert failed/);
    assert.throws(()=> readSaveData('best', true), /Assert failed/);
});

test('readSaveData throws on a null default', () =>
{
    // typeof null === 'object', so null slips past a naive typeof check
    // while producing the same silently-empty result the assert exists for.
    clearStorage();
    assert.throws(()=> readSaveData('best', null), /Assert failed/);
});

test('readSaveData with no default still works and returns an object', () =>
{
    clearStorage();
    assert.deepEqual(readSaveData('missing'), {});
});

test('readSaveData merges stored data over the default', () =>
{
    clearStorage();
    globalThis.localStorage['game'] = JSON.stringify({best: 42});
    assert.deepEqual(readSaveData('game', {best: 0, level: 1}),
        {best: 42, level: 1});
});

test('writeSaveData then readSaveData round trips', () =>
{
    clearStorage();
    writeSaveData('game', {best: 7, name: 'a'});
    assert.deepEqual(readSaveData('game', {best: 0}), {best: 7, name: 'a'});
});

test('readSaveData falls back to the default on corrupt JSON', () =>
{
    clearStorage();
    globalThis.localStorage['game'] = '{not valid json';
    assert.deepEqual(readSaveData('game', {best: 3}), {best: 3});
});
