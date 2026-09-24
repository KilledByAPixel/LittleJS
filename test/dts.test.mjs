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

test('the engine source type checks with no errors, as the editor checks it with src/jsconfig.json', () =>
{
    // the JSDoc is the only type information, so a param type narrower than what is passed to it shows in the
    // editor as an error on every call, where the generated d.ts check above never sees it
    let output = '';
    try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'src/jsconfig.json', '--noEmit'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); }
    assert.equal(output.trim(), '', output);
});

test('the plugins type check with no errors, as the editor checks them with plugins/jsconfig.json', () =>
{
    // the same editor check over the plugins, which read the engine source as their globals
    let output = '';
    try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'plugins/jsconfig.json', '--noEmit'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); }
    assert.equal(output.trim(), '', output);
});

test('what a TypeScript user writes type checks strict against dist/littlejs.d.ts', () =>
{
    // the d.ts compiling on its own says nothing about calls into it: a required parameter the code defaults, or a
    // callback typed too wide to take a typed function, only fails where a user calls it, so test/types/usage.ts does
    const dir = mkdtempSync(join(tmpdir(), 'ljs-usage-'));
    const config = { compilerOptions: { noEmit: true, strict: true, target: 'es2022', module: 'esnext',
        moduleResolution: 'bundler', lib: ['es2022', 'dom'], types: [] },
        files: [resolve('dist/littlejs.d.ts'), resolve('test/types/usage.ts')] };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config));
    let output = '';
    try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    assert.equal(output.trim(), '', output);
});
