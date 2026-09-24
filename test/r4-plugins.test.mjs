import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import
{
    vec2, TileInfo, drawNineSlice, ImageFont, EngineObject, CanvasLayer, TileLayer,
    TileCollisionLayer, TileLayerData, TextureInfo, drawRectGradient, drawTextScreen,
    gamepadIsDown, gamepadWasPressed, gamepadWasReleased, gamepadStick, gamepadDpad,
    gamepadStickCount, gamepadConnected, gamepadVibrate, gamepadVibrateStop,
    tileCollisionRaycast, saveDataURL, Box2dPlugin, Box2dObject, Box2dTileLayer,
    Box2dTargetJoint, Box2dRopeJoint, Box2dGearJoint,
} from '../dist/littlejs.esm.js';

const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const reference = read('REFERENCE.md');

///////////////////////////////////////////////////////////////////////////////
// drawNineSlice steps over tile padding

// where each drawTile of a nine slice samples from, as 'x,y' in texture pixels
function nineSliceSources(startTile)
{
    const sources = new Set;
    const context =
    {
        save(){}, restore(){}, translate(){}, rotate(){}, scale(){},
        set globalAlpha(v){},
        drawImage(image, sx, sy) { sources.add(sx + ',' + sy); },
    };
    // useWebGL=false, screenSpace=false, the mock context
    drawNineSlice(vec2(), vec2(4), startTile, undefined, 1, undefined, 0, 0, false, false, context);
    return sources;
}

// every combination of the given tile corners along x and y
const grid = (steps)=> new Set(steps.flatMap(y=> steps.map(x=> x + ',' + y)));

test('drawNineSlice samples the 3x3 block on the padded grid tile() lays out', () =>
{
    // with 1 pixel of padding, 16 pixel tiles sit every 18 pixels, starting 1 in
    const textureInfo = { image: {}, size: vec2(64) };
    const padded = new TileInfo(vec2(1, 1), vec2(16), textureInfo, 1, 0);
    assert.deepEqual(nineSliceSources(padded), grid([1, 19, 37]));

    // without padding the grid is the tile size
    const tight = new TileInfo(vec2(0, 0), vec2(16), textureInfo, 0, 0);
    assert.deepEqual(nineSliceSources(tight), grid([0, 16, 32]));
});

///////////////////////////////////////////////////////////////////////////////
// ZzFXMusic takes a song with or without BPM and with the tracker's metadata

test('ZzFXMusic takes a song of three or more parts in the typings', () =>
{
    const typings = read('dist/littlejs.d.ts');
    const start = typings.indexOf('class ZzFXMusic');
    assert.ok(start >= 0, 'ZzFXMusic is in the typings');
    const constructor = typings.slice(start).match(/constructor\(zzfxMusic: ([^)]*)\)/);
    assert.ok(constructor, 'ZzFXMusic has a constructor taking zzfxMusic');
    assert.equal(constructor[1].replace(/\s/g, ''), '[any[],any[],any[],number?,...any[]]');
});

///////////////////////////////////////////////////////////////////////////////
// REFERENCE.md signatures match the code

// split a parameter list on its top level commas, defaults may hold calls
function splitParams(text)
{
    const params = [];
    let depth = 0, current = '';
    for (const c of text)
    {
        if (c === ',' && !depth)
        {
            params.push(current.trim());
            current = '';
            continue;
        }
        if ('([{'.includes(c)) ++depth;
        if (')]}'.includes(c)) --depth;
        current += c;
    }
    current.trim() && params.push(current.trim());
    return params.map(p=>
    {
        const i = p.indexOf('=');
        return i < 0 ? { name: p, value: undefined } :
            { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    });
}

// the text between the parenthesis that open at index start
function parenthesized(text, start)
{
    let depth = 0;
    for (let i = start; i < text.length; ++i)
    {
        if (text[i] === '(') ++depth;
        if (text[i] === ')' && !--depth) return text.slice(start + 1, i);
    }
    assert.fail('unbalanced parenthesis');
}

// the parameters of a function, method or a class's constructor, from its source
function codeParams(fn)
{
    const source = fn.toString();
    const at = source.startsWith('class') ? source.indexOf('constructor(') : 0;
    return splitParams(parenthesized(source, source.indexOf('(', at)));
}

// the parameters REFERENCE.md lists on the line that starts with key(
function referenceParams(key)
{
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp('^' + escaped + '\\(', 'm').exec(reference);
    assert.ok(match, `REFERENCE.md has a line for ${key}(`);
    return splitParams(parenthesized(reference, match.index + match[0].length - 1));
}

// names: the names match the code's, defaults: a default written in the
// reference is the code's, all: the reference lists every parameter
function checkSignature(key, fn, {names=true, defaults=true, all=false}={})
{
    const code = codeParams(fn), ref = referenceParams(key);
    if (all)
        assert.equal(ref.length, code.length, `${key} lists all ${code.length} parameters`);
    else
        assert.ok(ref.length <= code.length, `${key} lists no more parameters than it has`);
    ref.forEach((p, i)=>
    {
        if (names)
            assert.equal(p.name, code[i].name, `${key} parameter ${i}`);
        if (defaults && p.value !== undefined)
            assert.equal(p.value, code[i].value, `${key} default of ${code[i].name}`);
    });
}

test('REFERENCE.md draw and ImageFont signatures match the code', () =>
{
    checkSignature('drawRectGradient', drawRectGradient);
    checkSignature('drawTextScreen', drawTextScreen);
    checkSignature('ImageFont.drawText', ImageFont.prototype.drawText, {defaults:false, all:true});
    checkSignature('ImageFont.drawTextScreen', ImageFont.prototype.drawTextScreen, {all:true});
});

test('REFERENCE.md gamepad signatures match the code, defaulting to gamepadPrimary', () =>
{
    checkSignature('gamepadIsDown', gamepadIsDown, {all:true});
    checkSignature('gamepadWasPressed', gamepadWasPressed, {all:true});
    checkSignature('gamepadWasReleased', gamepadWasReleased, {all:true});
    checkSignature('gamepadStick', gamepadStick, {all:true});
    checkSignature('gamepadDpad', gamepadDpad, {all:true});
    checkSignature('gamepadStickCount', gamepadStickCount, {all:true});
    checkSignature('gamepadConnected', gamepadConnected, {all:true});
    checkSignature('gamepadVibrate', gamepadVibrate, {all:true});
    checkSignature('gamepadVibrateStop', gamepadVibrateStop, {all:true});
});

test('REFERENCE.md object, layer and utility signatures match the code', () =>
{
    checkSignature('EngineObject.setCollision', EngineObject.prototype.setCollision, {names:false, all:true});
    checkSignature('CanvasLayer', CanvasLayer, {defaults:false, all:true});
    checkSignature('CanvasLayer.draw', CanvasLayer.prototype.draw, {all:true});
    checkSignature('tileCollisionRaycast', tileCollisionRaycast, {names:false, all:true});
    checkSignature('saveDataURL', saveDataURL, {all:true});
});

test('REFERENCE.md Box2D signatures match the code', () =>
{
    checkSignature('obj.addPoly', Box2dObject.prototype.addPoly, {all:true});
    checkSignature('obj.addEdgeList', Box2dObject.prototype.addEdgeList, {all:true});
    checkSignature('obj.setFilterData', Box2dObject.prototype.setFilterData, {all:true});
    checkSignature('obj.setMassData', Box2dObject.prototype.setMassData, {all:true});
    checkSignature('box2d.raycast', Box2dPlugin.prototype.raycast, {all:true});
    checkSignature('new Box2dTileLayer', Box2dTileLayer, {all:true});
    checkSignature('new Box2dTargetJoint', Box2dTargetJoint, {all:true});
    checkSignature('new Box2dRopeJoint', Box2dRopeJoint);
    checkSignature('new Box2dGearJoint', Box2dGearJoint, {all:true});
});

test('REFERENCE.md lists only methods that exist', () =>
{
    // Class.method( at the start of a line is a method of that class
    const classes = { EngineObject, CanvasLayer, TileLayer, TileCollisionLayer, TileLayerData, ImageFont,
        TileInfo, TextureInfo };
    for (const [name, type] of Object.entries(classes))
    for (const [, method] of reference.matchAll(new RegExp('^' + name + '\\.(\\w+)\\(', 'gm')))
        assert.equal(typeof type.prototype[method], 'function', `${name}.${method} exists`);

    // in the Box2D section, obj. is a Box2dObject and box2d. the plugin
    const box2dSection = reference.slice(reference.indexOf('## LittleJS Box2D'),
        reference.indexOf('\n## ', reference.indexOf('## LittleJS Box2D') + 1));
    for (const [, prefix, method] of box2dSection.matchAll(/^(obj|box2d)\.(\w+)\(/gm))
    {
        const type = prefix === 'obj' ? Box2dObject : Box2dPlugin;
        assert.equal(typeof type.prototype[method], 'function', `${prefix}.${method} exists`);
    }
});
