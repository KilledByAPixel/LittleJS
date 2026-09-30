import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// the particle designer's code export: a one-line call as the preview plays it, or the whole emitter by hand

const { run } = loadEngine();
run(readFileSync(new URL('../examples/particles/particleEffects.js', import.meta.url), 'utf8'));
const plain = {scale: 1, hue: 0, saturation: 1, flatten: false};
const code = (effect, options=plain, expand=false, is3D=false)=>
    run(`effectToCode(${effect}, ${JSON.stringify(options)}, ${expand}, ${is3D})`);

test('a built-in as it is plays by name, options only when not default', ()=>
{
    const fire = `particleEffectsGet('fire')`;
    assert.equal(code(fire), `particleEffect('fire', vec2());`);
    assert.equal(code(fire, {...plain, scale: 2, hue: .3}), `particleEffect('fire', vec2(), {scale: 2, hue: 0.3});`);
    assert.equal(code(fire, {...plain, saturation: .5, flatten: true}, false, true),
        `particleEffect3D('fire', vec3(), {saturation: 0.5, flatten: true});`);
    assert.equal(code(fire, {...plain, flatten: true}), `particleEffect('fire', vec2());`, 'flatten is 3D only');
});

test('a designed effect says it comes from the library, an edited built-in that it replaces one', ()=>
{
    assert.match(code(`particleEffectSanitize({name: 'My Fire'})`),
        /^particleEffect\('My Fire', vec2\(\)\); \/\/ .*library/);
    const edited = `{...particleEffectsGet('fire'), settings: {...particleEffectsGet('fire').settings, emitRate: 1}}`;
    assert.match(code(edited), /^particleEffect\('fire', vec2\(\)\); \/\/ .*replaces the built-in/);
});

test('a name with quotes and a backslash gives a line that parses', ()=>
{
    const line = code(`particleEffectSanitize({name: 'it\\'s "x"\\\\'})`);
    assert.doesNotThrow(()=> new Function(line.replace(/\/\/.*/, '')));
    assert.ok(line.includes(`'it\\'s "x"\\\\'`));
});

test('the expanded code builds the emitter particleEffect plays, options and behaviors included', ()=>
{
    const names = run('particleEffectsBuiltIn');
    const options = {scale: 1.5, hue: .2, saturation: .7, flatten: false};
    for (const name of names)
    for (const o of [plain, options])
    {
        const text = code(`particleEffectsGet('${name}')`, o, true);
        const same = run(`(()=>
        {
            const a = particleEffect('${name}', vec2(), ${JSON.stringify(o)});
            const b = (()=> { ${text}; return emitter; })();
            const near = (x, y)=> Math.abs(x - y) < .01;
            const color = (c, d)=> near(c.r, d.r) && near(c.g, d.g) && near(c.b, d.b) && near(c.a, d.a);
            const bad = [];
            for (const s of particleEffectSettings)
            {
                const x = a[s.name], y = b[s.name];
                if (s.name == 'emitSize' || x === undefined && y === undefined) continue; // emitSize below
                const ok = s.kind == 'color' ? color(x, y) : typeof x == 'number' ? near(x, y) : x === y;
                ok || bad.push(s.name);
            }
            a.emitCircle === b.emitCircle || bad.push('emitCircle');
            near(a.emitSize.x, b.emitSize.x) && near(a.emitSize.y, b.emitSize.y) || bad.push('emitSize');
            a.scale === b.scale || bad.push('scale');
            a.renderOrder === b.renderOrder || bad.push('renderOrder');
            a.tileInfo === b.tileInfo || String(a.tileInfo?.pos) == String(b.tileInfo?.pos) || bad.push('tileInfo');
            !!a.particleUpdateCallback === !!b.particleUpdateCallback || bad.push('callback');
            a.destroy(), b.destroy();
            return bad.join();
        })()`);
        assert.equal(same, '', name + ' ' + JSON.stringify(o));
    }
});

test('a tile instead of a shape exports as tile(), a rectangle as vec2()', ()=>
{
    const text = code(`particleEffectSanitize({settings: {shape: '', tileIndex: 3, tilePadding: 1,
        emitRect: true, emitSize: 2, emitHeight: .5}})`, plain, true);
    assert.match(text, /tile\(3, 16, 0, 1\)/);
    assert.match(text, /vec2\(2, 0\.5\)/);
});

test('effectTileFits: shapes always fit, a tile must be on texture 0', ()=>
{
    assert.equal(run(`effectTileFits({shape: 'soft', tileIndex: 1e4, tileSize: 16, tilePadding: 0})`), true);
    assert.equal(run(`effectTileFits({shape: '', tileIndex: -1, tileSize: 16, tilePadding: 0})`), true);
});
