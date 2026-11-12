import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A game bundled with Vite or another bundler keeps only what it uses of the ES module build, so a small 2D game
// leaves out the 3D plugins and the rest. A statement a plugin runs as it loads, like a call that registers its
// built-in types, is kept whatever the game uses, and keeps all it touches: the 3D level's built-in types and the
// particle effect tables did, and a 2D game bundled to twice its size. A plugin's tables are made by functions whose
// calls are marked pure instead, which a bundler leaves out with the table when nothing reads it, and the ES module
// build keeps the marks.

const read = (path)=> readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const build = read('src/engineBuild.mjs');
const list = (name)=> [...build.slice(build.indexOf(`const ${name} =`)).split('];')[0]
    .matchAll(/\$\{PLUGIN_FOLDER\}\/([\w.]+\.js)/g)].map((m)=> 'plugins/' + m[1]);

// the statements a plugin may run on load: the tween system's hook, added on load so its place among the plugins
// stays the same
const allowed = ['plugins/tweenSystem.js: engineAddPlugin(tweenUpdate);'];

// each line of a file with what it starts with: its code with strings and comments taken out, and how deep in
// brackets the line begins
function codeLines(source)
{
    const lines = [];
    let depth = 0, inString = '', inComment = false, code = '', startDepth = 0;
    for (let i = 0; i < source.length; ++i)
    {
        const c = source[i], next = source[i + 1];
        if (c === '\n')
        {
            lines.push({code, depth: startDepth});
            code = '', startDepth = depth;
            if (inString && inString !== '`') inString = ''; // a quote does not cross lines
            continue;
        }
        if (inComment) { c === '*' && next === '/' && (inComment = false, ++i); continue; }
        if (inString)
        {
            c === '\\' ? ++i : c === inString && (inString = '');
            continue;
        }
        if (c === '/' && next === '/') { while (i + 1 < source.length && source[i + 1] !== '\n') ++i; continue; }
        if (c === '/' && next === '*') { inComment = true, ++i; continue; }
        if (c === "'" || c === '"' || c === '`') { inString = c, code += c + c; continue; }
        code += c;
        if ('([{'.includes(c)) ++depth;
        if (')]}'.includes(c)) --depth;
    }
    lines.push({code, depth: startDepth});
    return lines;
}

test('no plugin in the release build runs a statement as it loads, so a bundler can leave the unused ones out', ()=>
{
    const files = list('enginePluginFiles');
    assert.ok(files.length > 20, 'read the plugin list from the build script');
    const found = [];
    for (const file of files)
    {
        let last = ';'; // the end of the last line of code at the top level
        for (const {code, depth} of codeLines(read(file)))
        {
            const text = code.trim();
            if (!text) continue;
            if (depth === 0)
            {
                // a line that starts a statement: what follows a finished one, other than a declaration; a { after
                // a function's or class's head is its body
                const starts = /[;}]$/.test(last) || last === "''";
                if (starts && !/^(?:async function|function\*?\s|class |let |const |var |''|\}|\)|\])/.test(text))
                    found.push(file + ': ' + text.slice(0, 100));
            }
            last = text;
        }
    }
    assert.deepEqual(found.filter((f)=> !allowed.includes(f)), []);
});

test('the tables plugins make on load are made by calls marked pure, and the ES module build keeps the marks', ()=>
{
    for (const [file, name] of [['plugins/render3dLevel.js', 'level3DTypes'],
        ['plugins/particleEffects.js', 'particleEffectSettings'], ['plugins/particleEffects.js', 'particleEffectBehaviors'],
        ['plugins/particleEffects.js', 'particleEffectsByName']])
        assert.match(read(file), new RegExp(`^const ${name} = /\\* @__PURE__ \\*/ \\w+\\(\\);`, 'm'), name);
    assert.match(build, /'--module', '--annotations'/, 'uglify keeps the pure marks in the minified ES module build');
});
