import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// a 2D Light's glow: a soft round glow over the light, like the 3D one, added over the lit scene after the lightmap
// darkens it, so it shows in the dark and sits in front of what is there

// a vm engine drawing to a GL stand in, with the glow texture made from a stub canvas and every drawTile recorded
function setup()
{
    const engine = loadEngine();
    engine.run(`
        var events = [];
        glEnable = true;
        glContext = new Proxy({ DST_COLOR: 'DST_COLOR', ZERO: 'ZERO' }, { get: (t, key)=> key in t ? t[key] :
            key == 'blendFunc' ? (a, b)=> events.push('blend ' + a + ' ' + b) :
            key == 'getShaderParameter' || key == 'getProgramParameter' ? ()=> true : ()=> ({}) });
        OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; }
            getContext() { return { createRadialGradient: ()=> ({ addColorStop() {} }), fillRect() {} }; } };
        glRegisterTextureInfo = (info)=> info.glTexture = {};
        var realDrawTile = drawTile;
        drawTile = (pos, size, tileInfo, color, angle, mirror, additive, useWebGL, screenSpace)=>
            events.push(['tile', pos.x, pos.y, size.x, size.y, tileInfo.textureInfo === engineGlowTexture(1) ? 'glow' :
                'other', color.r, color.g, color.b, color.a, !!glAdditive, screenSpace]);
    `);
    return engine;
}

test('a Light has no glow by default, and a falloff of 1', () =>
{
    const { run } = setup();
    assert.deepEqual([...run('const light = new Light(vec2(), 4); [light.glow, light.glowFalloff]')], [0, 1]);
});

test('renderGlow draws the glow texture at the light, glow across, in its color, in world space', () =>
{
    const { run } = setup();
    const drawn = JSON.parse(run(`
        cameraPos = vec2(), cameraScale = 32, mainCanvasSize = vec2(800, 600);
        const light = new Light(vec2(2, 3), 4, rgb(1, .5, 0, .8));
        light.renderGlow(); // no glow
        light.glow = 3;
        light.renderGlow();
        const far = new Light(vec2(500, 0), 4);
        far.glow = 3;
        far.renderGlow(); // off screen
        JSON.stringify(events);
    `));
    assert.deepEqual(drawn, [['tile', 2, 3, 3, 3, 'glow', 1, .5, 0, .8, false, false]]);
});

test('the light pass draws the glows after the lightmap is applied, added on', () =>
{
    const { run } = setup();
    const events = JSON.parse(run(`
        cameraPos = vec2(), cameraScale = 32, mainCanvasSize = vec2(800, 600), mainCanvas = { width: 800, height: 600 };
        glCanvas = { width: 800, height: 600 }, drawContext = {}; // the blend mode sets its composite operation too
        engineInitialized = true, glAdditive = false; // as glPreRender leaves it
        const system = new LightSystemPlugin(vec2(64));
        const light = new Light(vec2(), 4);
        light.glow = 2;
        events = [];
        pluginList.find((p)=> p.render && String(p.render).includes('lightSystem')).render();
        JSON.stringify(events);
    `));
    const composite = events.indexOf('blend DST_COLOR ZERO');
    const glow = events.findIndex((e)=> e[0] == 'tile' && e[5] == 'glow');
    assert.ok(composite >= 0, 'the composite ran');
    assert.ok(glow > composite, 'the glow is drawn after it');
    assert.equal(events[glow][10], true, 'added on');
    assert.equal(run('glAdditive'), false, 'the blend mode is put back');
});
