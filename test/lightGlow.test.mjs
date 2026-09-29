import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render3D, Render3DPlugin, Light3D, DirectionalLight3D, engineObjects, EngineObject3D, vec3, hsl }
    from '../dist/littlejs.esm.js';

// a light's glow: one soft quad facing the camera, a glow texture on it, as big as the glow, a little in front of the light so a lamp there
// does not cut into it, added onto what is behind, in the transparent stage so what is in front hides it

new Render3DPlugin;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);

// draw the lights through the stages as the pass does, and what they drew
function drawnGlows(lights)
{
    const drawn = [], drawBillboard = render3D.drawBillboard, drawSoftDisc = render3D.drawSoftDisc;
    render3D.drawBillboard = (pos, size, tileInfo, color)=> drawn.push({pos, size: size.x, square: size.x === size.y,
        color, additive: render3D.additive, blend: render3D.blend, depthTest: render3D.depthTest});
    render3D.drawSoftDisc = ()=> drawn.push('disc');
    render3D.camera.pos = vec3(0, 0, 10);
    render3D.camera.rotation = vec3();
    render3D.updateMatrices(1);
    try { render3D.renderStages(lights); }
    finally { render3D.drawBillboard = drawBillboard, render3D.drawSoftDisc = drawSoftDisc; }
    for (const light of lights) light.destroy();
    engineObjects.length = 0;
    return drawn;
}

test('a light has no glow by default, and draws nothing', ()=>
{
    const light = new Light3D(vec3(), 5, hsl(.1, 1, .5));
    assert.equal(light.glow, 0);
    assert.deepEqual(drawnGlows([light]), []);
});

test('a glow is a soft disc of its size, toward the camera from the light, added on in the transparent stage', ()=>
{
    const color = hsl(.1, 1, .5), light = new Light3D(vec3(1, 2, 0), 5, color);
    light.glow = 2;
    const [glow, ...rest] = drawnGlows([light]);
    assert.equal(rest.length, 0, 'one quad, its falloff is in the texture');
    assert.equal(glow.size, 2);
    assert.equal(glow.square, true);
    near(glow.pos.x, 1 + 1 * -1 / Math.hypot(1, 2, 10) , 'moved half its size toward the camera');
    near(glow.pos.subtract(vec3(1, 2, 0)).length(), 1);
    assert.deepEqual([glow.additive, glow.blend, glow.depthTest], [true, true, true], 'additive, behind what is in front');
    assert.deepEqual([glow.color.r, glow.color.g, glow.color.b], [color.r, color.g, color.b]);
});

test('a dim or faded light glows less, and a glow bigger than the distance to the camera stops short of it', ()=>
{
    const light = new Light3D(vec3(0, 0, 9), 5, hsl(0, 0, 1, .5), .5);
    light.glow = 6;
    const [glow] = drawnGlows([light]);
    near(glow.color.a, .25, 'its alpha times its intensity');
    assert.ok(glow.pos.z < 10, 'still in front of the camera');
});

test('a directional light has no place to glow from, and a child light glows where it is in the world', ()=>
{
    const sun = new DirectionalLight3D(vec3(0, 1, 0));
    sun.glow = 2;
    assert.deepEqual(drawnGlows([sun]), []);

    const lamp = new EngineObject3D(vec3(3, 0, 0)), bulb = new Light3D(vec3(0, 1, 0));
    lamp.addChild(bulb);
    bulb.glow = 1;
    const [glow] = drawnGlows([bulb]);
    near(glow.pos.subtract(vec3(3, 1, 0)).length(), .5);
    lamp.destroy();
});
