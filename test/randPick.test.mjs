import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randPick, randWeighted, RandomGenerator } from '../dist/littlejs.esm.js';

// picking an element at random, evenly or by weight, from an array or a Set, and the seeded twins on RandomGenerator

// how many times each item comes up in many picks
const tally = (pick, count=4000)=>
{
    const seen = new Map;
    for (let i = count; i--;)
    {
        const item = pick();
        seen.set(item, (seen.get(item) || 0) + 1);
    }
    return seen;
};

test('randPick picks every element of an array, about evenly, and nothing else', () =>
{
    const seen = tally(()=> randPick(['a', 'b', 'c', 'd']));
    assert.deepEqual([...seen.keys()].sort(), ['a', 'b', 'c', 'd']);
    for (const n of seen.values())
        assert.ok(n > 700 && n < 1300, `each about 1000, ${n}`);
});

test('randPick picks from a Set too, and gives undefined for an empty one', () =>
{
    const seen = tally(()=> randPick(new Set([1, 2, 3])));
    assert.deepEqual([...seen.keys()].sort(), [1, 2, 3]);
    assert.equal(randPick([]), undefined);
    assert.equal(randPick(new Set), undefined);
});

test('randWeighted picks in proportion to the weights, never a zero weight', () =>
{
    const seen = tally(()=> randWeighted(['common', 'rare', 'never'], [3, 1, 0]));
    assert.equal(seen.get('never'), undefined);
    const common = seen.get('common'), rare = seen.get('rare');
    assert.ok(common > 2700 && common < 3300 && rare > 700 && rare < 1300, `3000 and 1000, ${common} ${rare}`);
});

test('randWeighted takes a Set, and gives undefined when nothing has weight', () =>
{
    assert.equal(randWeighted(new Set(['x', 'y']), [0, 1]), 'y');
    assert.equal(randWeighted(['x', 'y'], [0, 0]), undefined);
    assert.equal(randWeighted([], []), undefined);
});

test('a RandomGenerator picks the same way, the same picks from the same seed', () =>
{
    const picks = (seed)=>
    {
        const r = new RandomGenerator(seed), out = [];
        for (let i = 20; i--;)
            out.push(r.pick(['a', 'b', 'c']), r.weighted(['x', 'y'], [1, 3]));
        return out;
    };
    assert.deepEqual(picks(7), picks(7));
    assert.notDeepEqual(picks(7), picks(8));
    const r = new RandomGenerator(3);
    const seen = tally(()=> r.weighted(['x', 'y', 'z'], [1, 3, 0]));
    assert.equal(seen.get('z'), undefined);
    assert.ok(seen.get('y') > seen.get('x') * 2, 'y about three times x');
    assert.equal(r.pick(new Set), undefined);
});
