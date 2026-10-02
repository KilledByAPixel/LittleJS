import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A sprite in 3D, a billboard, is one more instance of the shared quad when it is opaque, as a mesh's uses are:
// every sprite of a sheet is one instanced draw with nothing written per corner. One that blends still goes
// through the stream, in its sorted place. Neither moves the draw state, so the batch check stays one number.
const { vec2, vec3, hsl, TileInfo, EngineObject3D } = LJS;
new LJS.Render3DPlugin;
const render3D = LJS.render3D;
const near = (a, b)=> assert.ok(Math.abs(a - b) < 1e-5, `${a} is not ${b}`);

// a tile of a sheet, enough of a texture to place it, headless has no real one
const sheet = { sizeInverse: vec2(1 / 64) };
const tile = (x)=> { const t = new TileInfo(vec2(x * 16, 0), vec2(16)); t.textureInfo = sheet; return t; };

// inside a pass with a stand in for the program, headless nothing uploads or draws
function pass(draw)
{
    const quad = render3D.billboardMesh;
    render3D.updateMatrices(1);
    render3D.isRendering = true;
    render3D.program = {};
    try { draw(quad); }
    finally
    {
        render3D.program = undefined;
        render3D.isRendering = false;
        render3D.streamCount = 0;
        quad.instanceCount = 0;
        render3D.instanceMeshes.length = 0;
        render3D.blend = false;
        render3D.instancing = true;
        render3D.shadowPass = false;
        render3D.lighting = true;
    }
}

test('opaque billboards are instances of the shared quad, one batch for a sheet, with the draw state left alone', ()=>
{
    pass((quad)=>
    {
        const version = render3D.stateVersion;
        for (let i = 0; i < 3; ++i)
            render3D.drawBillboard(vec3(i, 5, 0), vec2(2, 4), tile(i), hsl(0, 1, .5));
        assert.deepEqual([quad.instanceCount, render3D.streamCount], [3, 0]);
        assert.equal(render3D.stateVersion, version, 'no draw state was set and set back');
        assert.equal(quad.instanceUnlit, true, 'a sprite is unlit on screen');
        const data = quad.instanceData;
        for (let i = 0; i < 3; ++i)
        {
            const k = i * 24;
            near(data[k+12], i); near(data[k+13], 5);                  // its place
            near(Math.hypot(data[k], data[k+1], data[k+2]), 2);        // its right axis, its width long
            near(Math.hypot(data[k+4], data[k+5], data[k+6]), 4);      // its up axis, its height long
            near(data[k+16], 1); near(data[k+17], 0);                  // its color
            near(data[k+20], i * 16 / 64);                             // its own tile of the sheet
        }
    });
});

test('a sprite object with no mesh draws as an instance too', ()=>
{
    pass((quad)=>
    {
        const sprite = new EngineObject3D(vec3(1, 2, 3), undefined, tile(1));
        sprite.render3D();
        assert.deepEqual([quad.instanceCount, render3D.streamCount], [1, 0]);
        near(quad.instanceData[12], 1);
        sprite.destroy(true);
    });
});

test('a billboard that blends, or with instancing off, goes through the stream, the draw state left alone', ()=>
{
    pass((quad)=>
    {
        render3D.blend = true;
        const version = render3D.stateVersion;
        render3D.drawBillboard(vec3(), vec2(1), tile(0));
        render3D.drawBillboard(vec3(1), vec2(1), tile(1));
        assert.deepEqual([quad.instanceCount, render3D.streamCount, render3D.streamUnlit], [0, 12, true]);
        assert.equal(render3D.stateVersion, version);
        render3D.blend = false;
        render3D.streamCount = 0;
        render3D.instancing = false;
        render3D.drawBillboard(vec3(), vec2(1), tile(0));
        assert.deepEqual([quad.instanceCount, render3D.streamCount], [0, 6]);
    });
});

test('in the shadow map a lit sprite casts as it is, and an unlit one casts nothing', ()=>
{
    pass((quad)=>
    {
        render3D.shadowPass = true;
        render3D.drawBillboard(vec3(), vec2(1), tile(0));
        assert.deepEqual([quad.instanceCount, quad.instanceUnlit], [1, false]);
        render3D.lighting = false;
        render3D.drawBillboard(vec3(1), vec2(1), tile(0));
        assert.equal(quad.instanceCount, 1, 'nothing more');
    });
});

test('a lit strip after an unlit billboard is a batch of its own', ()=>
{
    pass(()=>
    {
        let flushes = 0;
        const flush = render3D.flush;
        render3D.flush = ()=> { ++flushes; render3D.streamCount = 0; };
        try
        {
            render3D.blend = true;
            render3D.drawBillboard(vec3(), vec2(1));
            render3D.drawStrip([vec3(), vec3(1), vec3(2)]);
            assert.equal(flushes, 1, 'the billboard is unlit, the strip is not');
            assert.equal(render3D.streamUnlit, false);
        }
        finally { render3D.flush = flush; }
    });
});
