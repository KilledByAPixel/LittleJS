import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, EngineObject3D, engineObjects, TextureInfo, Mesh, normalMapFromHeight, vec2, vec3,
    rgb, WHITE } from '../dist/littlejs.esm.js';

// materials: a normal map, shininess, sky reflections and an emissive map, set on an object and carried to the
// draws as draw state, so draws that differ in any of them batch apart

new Render3DPlugin;
const map = new TextureInfo(undefined, false), otherMap = new TextureInfo(undefined, false);

test('the material fields have their defaults on the plugin and on an object', ()=>
{
    const o = new EngineObject3D;
    for (const x of [render3D, o])
    {
        assert.equal(x.normalMap, undefined);
        assert.equal(x.normalScale, 1);
        assert.equal(x.shininess, 16);
        assert.equal(x.reflectivity, 0);
        assert.equal(x.emissiveMap, undefined);
        assert.ok(x.emissiveMapColor.r === 1 && x.emissiveMapColor.g === 1 && x.emissiveMapColor.b === 1);
    }
    o.destroy();
});

test('the stage loop sets the material from each object and resets it for the callbacks', ()=>
{
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
    const seen = {};
    class Probe extends EngineObject3D
    {
        render3D() { const r = render3D; seen[this.name] = [r.normalMap, r.normalScale, r.shininess,
            r.reflectivity, r.emissiveMap, r.emissiveMapColor]; }
    }
    const plain = new Probe, shiny = new Probe;
    plain.name = 'plain', shiny.name = 'shiny';
    const glow = rgb(1, .5, 0);
    shiny.normalMap = map, shiny.normalScale = .5, shiny.shininess = 100, shiny.reflectivity = .3;
    shiny.emissiveMap = otherMap, shiny.emissiveMapColor = glow;
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    render3D.shininess = 3; // a stray setting must not reach the objects
    render3D.renderStages(engineObjects.filter(o=> o instanceof EngineObject3D && !o.destroyed));
    assert.deepEqual(seen.plain.slice(0, 5), [undefined, 1, 16, 0, undefined]);
    assert.equal(seen.plain[5], WHITE);
    assert.deepEqual(seen.shiny, [map, .5, 100, .3, otherMap, glow]);
    assert.deepEqual([render3D.normalMap, render3D.normalScale, render3D.shininess, render3D.reflectivity,
        render3D.emissiveMap, render3D.emissiveMapColor], [undefined, 1, 16, 0, undefined, WHITE]);
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

// draw a strip, change one field, draw again: count the flushes the change caused
function flushesAfter(change)
{
    render3D.isRendering = true;
    render3D.program = {}; // a stand in so drawStrip writes to the stream, flush does nothing without gl
    const flush = render3D.flush;
    let flushes = 0;
    render3D.flush = ()=> { ++flushes; render3D.streamCount = 0; };
    try
    {
        const tri = [vec3(), vec3(1), vec3(2)];
        render3D.drawStrip(tri);
        change();
        render3D.drawStrip(tri);
        return flushes;
    }
    finally
    {
        render3D.flush = flush;
        render3D.program = undefined;
        render3D.isRendering = false;
        render3D.streamCount = 0;
        render3D.normalMap = render3D.emissiveMap = undefined;
        render3D.normalScale = 1, render3D.shininess = 16, render3D.reflectivity = 0;
        render3D.emissiveMapColor = WHITE;
    }
}

test('a change to any material field splits the batch, equal values do not', ()=>
{
    assert.equal(flushesAfter(()=> render3D.normalMap = map), 1);
    assert.equal(flushesAfter(()=> render3D.normalScale = 2), 1);
    assert.equal(flushesAfter(()=> render3D.shininess = 64), 1);
    assert.equal(flushesAfter(()=> render3D.reflectivity = .5), 1);
    assert.equal(flushesAfter(()=> render3D.emissiveMap = map), 1);
    assert.equal(flushesAfter(()=> render3D.emissiveMapColor = rgb(1, 0, 0)), 1);
    assert.equal(flushesAfter(()=> render3D.shininess = 16), 0, 'the same value');
});

test('a Color changed in place between draws still splits the batch', ()=>
{
    const glow = rgb(1, 0, 0);
    render3D.emissiveMapColor = glow;
    assert.equal(flushesAfter(()=> { glow.r = 0; render3D.emissiveMapColor = glow; }), 1);
});

test('the sky draws with no emissive map, whatever a callback left set', ()=>
{
    let seen;
    const drawMesh = render3D.drawMesh;
    render3D.drawMesh = ()=> seen = render3D.emissiveMap;
    render3D.sky = new Mesh;
    render3D.emissiveMap = map;
    try
    {
        render3D.drawSky();
        assert.equal(seen, undefined);
        assert.equal(render3D.emissiveMap, map, 'put back after');
    }
    finally
    {
        render3D.drawMesh = drawMesh;
        render3D.sky = undefined;
        render3D.emissiveMap = undefined;
    }
});

test('emissiveMapColor batches by its values, not by which Color it is', ()=>
{
    // the first draw is red, the change sets another red
    render3D.emissiveMapColor = rgb(1, 0, 0);
    assert.equal(flushesAfter(()=> render3D.emissiveMapColor = rgb(1, 0, 0)), 0);
});

test('normalMapFromHeight makes a wrapping TextureInfo of the size, with no canvas headless', ()=>
{
    const t = normalMapFromHeight(vec2(8, 4), ()=> 0);
    assert.ok(t instanceof TextureInfo);
    assert.equal(t.wrap, true);
    assert.deepEqual([t.size.x, t.size.y], [8, 4]);
});

test('the renderer keeps its sky colors and map bindings to itself, no public fields for them', ()=>
{
    assert.ok(!('skyColors' in render3D), 'a reflection reads them from the sky being drawn');
    assert.ok(!('boundMaps' in render3D));
});

test('an emissiveMapColor set to undefined draws as white and does not throw', ()=>
{
    assert.equal(flushesAfter(()=> render3D.emissiveMapColor = undefined), 0, 'the same as the white before it');
    render3D.emissiveMapColor = undefined;
    assert.equal(flushesAfter(()=> render3D.emissiveMapColor = rgb(1, 0, 0)), 1, 'and splits from red');
});
