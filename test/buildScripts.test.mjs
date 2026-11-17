import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The starter and module build scripts say which tool to install, and at which version, when one is missing or is a
// version they can not run. Their error path broke twice (full passes 36 and 37), so it is run here: each script's
// own toolPath, taken from its text, with nothing else of the script run and no file of the repository written.

const scripts = ['starter', 'module'];

test('the build scripts set what toolPath reads before the build runs', ()=>
{
    for (const name of scripts)
    {
        const text = fs.readFileSync(`examples/${name}/build.mjs`, 'utf8').replace(/\r\n/g, '\n');
        const build = text.indexOf('\nBuild\n'), versions = text.indexOf('const toolVersions');
        assert.ok(build > 0 && versions > 0, name);
        assert.ok(versions < build, name + ': toolVersions is set before the top level Build call');
    }
});

test('the build scripts name a missing tool and one installed at a version they can not run', async ()=>
{
    // a folder of its own with a stand-in bestzip 4, which hides its cli behind exports
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'littlejs-build-'));
    try
    {
        const bestzip = path.join(folder, 'node_modules', 'bestzip');
        fs.mkdirSync(path.join(bestzip, 'lib'), {recursive: true});
        fs.mkdirSync(path.join(bestzip, 'bin'));
        fs.writeFileSync(path.join(bestzip, 'package.json'),
            '{"name": "bestzip", "version": "4.0.3", "exports": "./lib/bestzip.js"}');
        fs.writeFileSync(path.join(bestzip, 'lib', 'bestzip.js'), '');
        fs.writeFileSync(path.join(bestzip, 'bin', 'cli.js'), '');
        for (const name of scripts)
        {
            const text = fs.readFileSync(`examples/${name}/build.mjs`, 'utf8').replace(/\r\n/g, '\n');
            const versions = text.slice(text.indexOf('const toolVersions'));
            const source = "import { createRequire } from 'node:module';\n" +
                `const require = createRequire(${JSON.stringify(path.join(folder, 'build.mjs'))});\n` +
                versions.slice(0, versions.indexOf('\n') + 1) +
                text.slice(text.indexOf('function toolPath')) +
                '\nexport const said = ["uglify-js/bin/uglifyjs", "bestzip/bin/cli.js"].map((tool)=>' +
                ' { try { toolPath(tool); return "found"; } catch (e) { return e.message; } });\n';
            const file = path.join(folder, name + '.mjs');
            fs.writeFileSync(file, source);
            const { said } = await import('file:///' + file.replace(/\\/g, '/'));
            assert.deepEqual(said, ['uglify-js is not installed, run "npm install --save-dev uglify-js@3.17" first',
                'the bestzip installed is a version this build can not run, run "npm install --save-dev bestzip@2"'],
                name);
        }
    }
    finally { fs.rmSync(folder, {recursive: true, force: true}); }
});
