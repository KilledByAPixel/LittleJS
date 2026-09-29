import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// normalMapFromHeight's pixels: the slope at each pixel from its neighbors' heights, around the edges so the map
// tiles, as a normal leaning away from the uphill side, green up the image
const { run } = loadEngine();
const pixels = (w, h, f, s=1)=> [...run(`render3DNormalMapPixels(${w}, ${h}, ${f}, ${s})`)]; // out of the vm
const at = (p, w, x, y)=> p.slice((y*w + x)*4, (y*w + x)*4 + 4);

test('a flat height is (128, 128, 255) everywhere', ()=>
{
    const p = pixels(4, 3, '()=> .5');
    for (let i = 0; i < 12; ++i)
        assert.deepEqual(p.slice(i*4, i*4 + 4), [128, 128, 255, 255]);
});

test('a height rising to the right leans the normal left, by the slope', ()=>
{
    // h = x/8 over 16 pixels, a slope of 1/8 a pixel, strength 4: the normal is (-.5, 0, 1) normalized
    const p = pixels(16, 4, '(x)=> x/8', 4), n = [-.5, 0, 1].map((v)=> v/Math.hypot(.5, 1));
    assert.deepEqual(at(p, 16, 5, 1), [...n.map((v)=> Math.round((v*.5 + .5)*255)), 255]);
});

test('a height rising toward the image top leans the normal down the image, green below 128', ()=>
{
    // y runs down the image, so a height that falls with y rises toward the top
    const p = pixels(4, 16, '(x, y)=> -y/8', 4);
    assert.ok(at(p, 4, 1, 5)[1] < 128, 'the normal leans away from the uphill side, down the image');
    const q = pixels(4, 16, '(x, y)=> y/8', 4);
    assert.ok(at(q, 4, 1, 5)[1] > 128, 'uphill down the image leans it up the image');
});

test('the edges take their neighbors from the other side, so the map tiles', ()=>
{
    // a bump in column 0 is seen by column 15 as its right neighbor
    const p = pixels(16, 2, '(x)=> x ? 0 : 1');
    assert.ok(at(p, 16, 15, 0)[0] < 128, 'column 15 has the bump on its right, it leans left');
    assert.ok(at(p, 16, 1, 0)[0] > 128, 'column 1 has it on its left, it leans right');
});
