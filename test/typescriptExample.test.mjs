import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The TypeScript example compiles in strict mode against the shipped dist/littlejs.d.ts, importing 'littlejsengine'
// as an npm game does, and its game.js, which runs without a build, is what tsc makes of game.ts now.

test('the TypeScript example compiles strict against littlejs.d.ts, and game.js is game.ts compiled', () =>
{
    const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
    const out = mkdtempSync(join(tmpdir(), 'littlejs-ts-'));
    try
    {
        const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
        try { execFileSync(process.execPath, [tsc, '-p', join(root, 'examples', 'typescript'), '--outDir', out]); }
        catch (e) { assert.fail('tsc found errors:\n' + e.stdout); }
        const built = readFileSync(join(out, 'game.js'), 'utf8').replace(/\r\n/g, '\n');
        const kept = readFileSync(join(root, 'examples', 'typescript', 'game.js'), 'utf8').replace(/\r\n/g, '\n');
        assert.equal(kept, built, 'game.js is out of date, run node examples/typescript/build.mjs');
        assert.match(kept, /from 'littlejsengine'/);
    }
    finally { rmSync(out, { recursive: true, force: true }); }
});
