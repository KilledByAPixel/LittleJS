import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNumber, isStringLike, isArray, isVector2, isColor, vec2, rgb, Vector2, Color, formatTime } from '../dist/littlejs.esm.js';

test('isNumber', () =>
{
    assert.equal(isNumber(0), true);
    assert.equal(isNumber(-1.5), true);
    assert.equal(isNumber(Infinity), true);
    assert.equal(isNumber(NaN), false);
    assert.equal(isNumber('1'), false);
    assert.equal(isNumber(null), false);
    assert.equal(isNumber(undefined), false);
    assert.equal(isNumber({}), false);
});

test('isStringLike', () =>
{
    // isStringLike accepts anything with a toString that returns a string —
    // strings, numbers, arrays, plain objects — and rejects null/undefined.
    // Use `typeof x === 'string'` inline if you want strict-string semantics.
    assert.equal(isStringLike(''), true);
    assert.equal(isStringLike('abc'), true);
    assert.equal(isStringLike(42), true);
    assert.equal(isStringLike([]), true);
    assert.equal(isStringLike({}), true);
    assert.equal(isStringLike(null), false);
    assert.equal(isStringLike(undefined), false);
});

test('isArray', () =>
{
    assert.equal(isArray([]), true);
    assert.equal(isArray([1, 2, 3]), true);
    assert.equal(isArray({}), false);
    assert.equal(isArray('abc'), false);
    assert.equal(isArray(null), false);
});

test('isVector2', () =>
{
    // Contract: instanceof Vector2 AND isValid() (no NaN components).
    assert.equal(isVector2(vec2()), true);
    assert.equal(isVector2(new Vector2(1, 2)), true);
    assert.equal(isVector2({ x: 1, y: 2 }), false);
    assert.equal(isVector2(null), false);
    assert.equal(isVector2(undefined), false);
    assert.equal(isVector2([1, 2]), false);
    // post-hoc NaN mutation: still a Vector2 instance but no longer valid
    const bad = vec2(1, 2); bad.x = NaN;
    assert.equal(isVector2(bad), false);
});

test('isColor', () =>
{
    // Contract: instanceof Color AND isValid() (no NaN components).
    assert.equal(isColor(rgb()), true);
    assert.equal(isColor(new Color(1, 0, 0)), true);
    assert.equal(isColor({ r: 1, g: 1, b: 1, a: 1 }), false);
    assert.equal(isColor(null), false);
    assert.equal(isColor(undefined), false);
    const bad = rgb(1, 0, 0); bad.g = NaN;
    assert.equal(isColor(bad), false);
});

test('formatTime', () =>
{
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(5), '0:05');
    assert.equal(formatTime(59), '0:59');
    assert.equal(formatTime(60), '1:00');
    assert.equal(formatTime(125), '2:05');
    assert.equal(formatTime(3599), '59:59');
    // fractional seconds are truncated (floor)
    assert.equal(formatTime(1.9), '0:01');
    // negative times get a leading minus
    assert.equal(formatTime(-30), '-0:30');
    assert.equal(formatTime(-125), '-2:05');
});
