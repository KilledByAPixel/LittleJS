import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    RandomGenerator, smoothStep, tileLayersLoad, tile, vec2,
} from '../dist/littlejs.esm.js';

// review round 5 decisions: math and tile layers

test('smoothStep clamps its input to 0..1', () =>
{
    assert.equal(smoothStep(1.5), 1);
    assert.equal(smoothStep(2), 1);
    assert.equal(smoothStep(-1), 0);
    assert.equal(smoothStep(.5), .5);
    assert.equal(smoothStep(0), 0);
    assert.equal(smoothStep(1), 1);
});

test('Vector2.round rounds each axis like Vector3.round', () =>
{
    const v = vec2(1.4, -2.6);
    const r = v.round();
    assert.equal(r.x, 1);
    assert.equal(r.y, -3);
    assert.notEqual(r, v, 'a copy');
    assert.equal(v.x, 1.4, 'the original is unchanged');
});

test('a RandomGenerator seed that is 0 as an integer uses the default seed', () =>
{
    const sequence = (r)=> [r.float(), r.float(), r.float()];
    const expected = sequence(new RandomGenerator);
    assert.ok(expected[0] > 0);
    assert.deepEqual(sequence(new RandomGenerator(0)), expected);
    assert.deepEqual(sequence(new RandomGenerator(.37)), expected, 'a fraction');
    assert.deepEqual(sequence(new RandomGenerator(2**32)), expected, 'a multiple of 2**32');

    // reseeding after the constructor
    const r = new RandomGenerator(5);
    r.float();
    r.seed = 0;
    assert.deepEqual(sequence(r), expected);

    // other seeds keep the sequence they had
    const a = new RandomGenerator(1.5), b = new RandomGenerator(1);
    assert.deepEqual(sequence(a), sequence(b));
    assert.notDeepEqual(sequence(new RandomGenerator(7)), expected);
});

test('tileLayersLoad flattens Tiled group layers, and indices count the flat list', () =>
{
    const map = { width: 2, height: 1, layers: [
        { type: 'tilelayer', data: [1, 0] },
        { type: 'group', opacity: .5, layers: [
            { type: 'tilelayer', data: [2, 0] },
            { type: 'group', layers: [
                { type: 'tilelayer', data: [0, 3], opacity: .5 },
            ]},
        ]},
        { type: 'objectgroup', objects: [] },
        { type: 'tilelayer', data: [4, 4] },
    ]};
    const layers = tileLayersLoad(map, tile(), 0, 2, false);
    assert.equal(layers.length, 5);
    assert.equal(layers[0].getData(vec2(0, 0)).tile, 0);
    assert.equal(layers[1].getData(vec2(0, 0)).tile, 1);
    assert.equal(layers[2].getData(vec2(1, 0)).tile, 2);
    assert.equal(layers[3], undefined, 'the object layer keeps its empty slot');
    assert.equal(layers[4].getData(vec2(0, 0)).tile, 3);
    assert.equal(layers[4].renderOrder, 0, 'the top layer has the render order passed in');
    assert.equal(layers[0].renderOrder, -4);

    // collisionLayer counts the flat list, and the groups' opacity carries down
    assert.equal(layers[2].getCollisionData(vec2(1, 0)), 1);
    assert.equal(layers[1].getCollisionData(vec2(0, 0)), 0);
    assert.equal(layers[1].getData(vec2(0, 0)).color.a, .5);
    assert.equal(layers[2].getData(vec2(1, 0)).color.a, .25);
    for (const layer of layers) layer?.destroy();
});

test('tileLayersLoad loads a hidden Tiled layer with its collision', () =>
{
    // not drawn is a no-op render, which headless has on every layer; check that in a browser
    const map = { width: 2, height: 1, layers: [
        { type: 'tilelayer', data: [1, 1], visible: false },
        { type: 'group', visible: false, layers: [
            { type: 'tilelayer', data: [0, 2] },
        ]},
    ]};
    const layers = tileLayersLoad(map, tile(), 0, 1, false);
    assert.equal(layers.length, 2);
    assert.equal(layers[0].getData(vec2(0, 0)).tile, 0, 'a hidden layer keeps its tiles');
    assert.equal(layers[1].getData(vec2(1, 0)).tile, 1, 'the layer in a hidden group is loaded');
    assert.equal(layers[1].getCollisionData(vec2(1, 0)), 1, 'and keeps its collision');
    for (const layer of layers) layer.destroy();
});
