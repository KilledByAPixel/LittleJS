import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineAddPlugin } from '../dist/littlejs.esm.js';

test('engineAddPlugin accepts a preRender callback without throwing', () =>
{
    const preRender = ()=> {};
    assert.doesNotThrow(()=> engineAddPlugin(undefined, undefined, undefined, undefined, preRender));
});

test('engineAddPlugin rejects a duplicate registration', () =>
{
    const update = ()=> {};
    engineAddPlugin(update);
    assert.throws(()=> engineAddPlugin(update));
});
