import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// drawScreenSpace is what the screenSpace parameter of the draw and debug functions defaults to; the engine's own
// drawing says its space itself, so a game that turns it on still sees its objects, layers and overlays in world space

// the top level arguments of a call, from just after its open paren to its close paren
function callArgs(s, start)
{
    const list = [];
    let depth = 0, cur = '', quote = '';
    for (let i = start; i < s.length; ++i)
    {
        const ch = s[i];
        if (quote)
        {
            cur += ch;
            if (ch === '\\') cur += s[++i];
            else if (ch === quote) quote = '';
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
        if (ch === '/' && s[i+1] === '/') { while (s[i] !== '\n') ++i; continue; }
        if ('([{'.includes(ch)) ++depth;
        if (')]}'.includes(ch) && !depth--) { cur.trim() && list.push(cur.trim()); list.close = i; return list; }
        if (ch === ',' && !depth) { list.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    return list;
}

test('no engine or plugin call leaves screenSpace to the default, so the setting only moves what a game draws', () =>
{
    const files = ['src', 'plugins'].flatMap(dir=> fs.readdirSync(dir).filter(f=> f.endsWith('.js'))
        .map(f=> dir + '/' + f));
    const text = Object.fromEntries(files.map(f=> [f, fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')]));

    // every function with a screenSpace parameter, and where it is in the list
    const functions = {};
    for (const s of Object.values(text))
        for (const m of s.matchAll(/^function (\w+)\(/gm))
        {
            const index = callArgs(s, m.index + m[0].length).map(p=> p.split('=')[0].trim()).indexOf('screenSpace');
            if (index >= 0) functions[m[1]] = index;
        }
    assert.ok(Object.keys(functions).length > 20, 'found the draw and debug functions');

    const missing = [];
    for (const [file, s] of Object.entries(text))
    for (const [name, index] of Object.entries(functions))
    for (const m of s.matchAll(new RegExp('(?<![\\w.])' + name + '\\(', 'g')))
    {
        // skip comments and definitions, a method of the same name is followed by its body
        const before = s.slice(s.lastIndexOf('\n', m.index) + 1, m.index), list = callArgs(s, m.index + m[0].length);
        if (/function\s*$/.test(before) || /^\s*(\*|\/\/)/.test(before) || /^\s*\{/.test(s.slice(list.close + 1)))
            continue;
        if (list.length <= index)
            missing.push(`${file}:${s.slice(0, m.index).split('\n').length} ${name}`);
    }
    assert.deepEqual(missing, [], 'these calls should pass screenSpace, false for world space');
});

test('drawScreenSpace moves a game\'s draws to screen space, while objects and canvas layers stay in world space', () =>
{
    const OffscreenCanvas = class { constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { canvas: this }; } };
    const { run } = loadEngine({ OffscreenCanvas });
    const result = run(`(()=>
    {
        // what space each draw of a tile asked for, the engine's own renders should say world space themselves
        const seen = [], draw = drawTile;
        drawTile = (...a)=> { seen.push(a[8]); };
        setDrawScreenSpace(true);
        debugRect(vec2(), vec2(1)); // a game's draw, which the setting moves
        const game = debugPrimitives.at(-1).screenSpace;
        new EngineObject(vec2(), vec2(1)).render();
        new CanvasLayer(vec2(), vec2(1)).render();
        setDrawScreenSpace(false);
        drawTile = draw;
        return JSON.stringify({game, seen});
    })()`);
    assert.deepEqual(JSON.parse(result), {game: true, seen: [false, false]});
});
