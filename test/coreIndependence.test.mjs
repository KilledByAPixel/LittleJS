import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// the core engine works without its plugins: no core file uses a name a plugin declares, so a game that uses no
// plugin, or a bundler that leaves the unused ones out, still gets a whole engine

// the file lists, read out of the build script so they can not drift from it
const build = fs.readFileSync('src/engineBuild.mjs', 'utf8');
const list = (name)=> [...build.slice(build.indexOf(`const ${name} =`)).split('];')[0]
    .matchAll(/\$\{(SOURCE|PLUGIN)_FOLDER\}\/([\w.]+\.js)/g)].map(m=> (m[1] === 'SOURCE' ? 'src/' : 'plugins/') + m[2]);

test('no core file uses a name that only a plugin declares', () =>
{
    const plugins = list('enginePluginFiles');
    const core = ['src/engine.js', 'src/engineDebug.js', 'src/engineRelease.js', ...list('engineSourceFiles')];
    assert.ok(plugins.length > 10 && core.length > 10, 'read the file lists from the build script');

    // every name a plugin declares at the top level
    const names = new Map;
    for (const file of plugins)
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/^(?:function|class|let|const|var)\s+(\w+)/gm))
            names.set(m[1], file);

    const uses = [];
    for (const file of core)
        fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i)=> // CRLF too, or a comment's \r keeps it
        {
            // comments and strings may name a plugin, or hold shader code with its vec3
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
            line = line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''").replace(/\/\/.*$/, '');
            for (const [name, from] of names)
                if (new RegExp('\\b' + name + '\\b').test(line))
                    uses.push(`${file}:${i + 1} ${name} from ${from}`);
        });
    assert.deepEqual(uses, []);
});
