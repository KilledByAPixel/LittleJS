import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('dist/littlejs.d.ts is valid TypeScript under strict checking', () =>
{
    // a JSDoc slip, like a required parameter after optional ones, reaches the d.ts as an error for every TS user;
    // no @types are read, only the definitions and the DOM they build on
    const dir = mkdtempSync(join(tmpdir(), 'ljs-dts-'));
    const config = { compilerOptions: { noEmit: true, strict: true, skipLibCheck: false, target: 'es2022',
        lib: ['es2022', 'dom'], types: [] }, files: [resolve('dist/littlejs.d.ts')] };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config));
    let output = '';
    try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    assert.equal(output.trim(), '', output);
});
