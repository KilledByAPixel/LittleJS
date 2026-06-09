import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards REFERENCE.md against drift: every symbol exported from
// engineExport.js and pluginExport.js must be mentioned in REFERENCE.md,
// be covered by a convention rule, or be deliberately allowlisted below.

const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const reference = read('REFERENCE.md');

// extract exported identifiers from an export file
function getExports(path)
{
    const text = read(path);
    const names = [];
    const blockRe = /export\s*\{([\s\S]*?)\}/g;
    let block;
    while ((block = blockRe.exec(text)))
    {
        const body = block[1].replace(/\/\/[^\n]*/g, ''); // strip comments
        for (const part of body.split(','))
        {
            const name = part.trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name))
                names.push(name);
        }
    }
    return names;
}

// exported symbols that are intentionally not in the quick reference
// (internals and advanced low-level API)
const allowlist = new Set([
    // internal engine systems
    'engineObjectsCollide', 'engineObjectsUpdate',
    // internal canvases and render stats
    'workCanvas', 'workContext', 'workReadCanvas', 'workReadContext',
    'textureInfos', 'drawCount', 'primitiveCount', 'engineImageFont',
    // low level audio internals
    'audioDefaultSampleRate', 'zzfxG', 'zzfxM',
    // plugin internals
    'tweenUpdate',
]);

function isDocumented(name)
{
    const wordIn = (n, flags='')=> new RegExp('\\b' + n + '\\b', flags).test(reference);
    if (allowlist.has(name)) return true;
    if (wordIn(name)) return true;
    // advanced WebGL layer (glDraw, glSetTexture, ...) is intentionally
    // beyond the scope of the quick reference
    if (/^gl[A-Z]/.test(name)) return true;
    // setters and getters count as documented if their setting is
    // (e.g. setCameraScale is implied by cameraScale, setGLEnable by glEnable)
    const accessor = name.match(/^(?:set|get)([A-Z]\w*)$/);
    if (accessor && wordIn(accessor[1], 'i')) return true;
    return false;
}

test('engine exports are documented in REFERENCE.md', () =>
{
    const missing = getExports('src/engineExport.js').filter(n => !isDocumented(n));
    assert.deepEqual(missing, [],
        `exported but not in REFERENCE.md (document or allowlist):\n  ${missing.join('\n  ')}`);
});

test('plugin exports are documented in REFERENCE.md', () =>
{
    const missing = getExports('plugins/pluginExport.js').filter(n => !isDocumented(n));
    assert.deepEqual(missing, [],
        `exported but not in REFERENCE.md (document or allowlist):\n  ${missing.join('\n  ')}`);
});

test('allowlist does not contain documented symbols', () =>
{
    // keep the allowlist from going stale: a symbol that gets documented
    // later should be removed from the allowlist
    const wordIn = (n)=> new RegExp('\\b' + n + '\\b').test(reference);
    const stale = [...allowlist].filter(wordIn);
    assert.deepEqual(stale, [],
        `allowlisted but also documented (remove from allowlist):\n  ${stale.join('\n  ')}`);
});

test('export parser finds a sane number of symbols', () =>
{
    // guard against the regex silently matching nothing
    assert.ok(getExports('src/engineExport.js').length > 200,
        'engineExport.js parse found too few symbols, parser may be broken');
    assert.ok(getExports('plugins/pluginExport.js').length > 30,
        'pluginExport.js parse found too few symbols, parser may be broken');
});
