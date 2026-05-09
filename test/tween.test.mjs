import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tween, tweenProperty, Ease } from '../dist/littlejs.esm.js';

test('Tween, tweenProperty, Ease are exported from the bundle', () =>
{
    assert.equal(typeof Tween, 'function');
    assert.equal(typeof tweenProperty, 'function');
    assert.equal(typeof Ease, 'function');
});
