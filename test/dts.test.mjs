import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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

test('dist/littlejs.d.ts keeps Map types, built with a library that has them', () =>
{
    // without a target tsc types with ES5's library, where a Map is any, which a dependency declaring Map hid
    const dts = readFileSync('dist/littlejs.d.ts', 'utf8');
    assert.match(dts, /edgeListFixtures: Map<number, Array<Vector2>>;/);
    assert.match(dts, /files\?: Map<string, Blob>\): Promise<GLTFModel>/);
});

test('render3D.drawSky is typed void, so a subclass may override it as void', () =>
{
    assert.match(readFileSync('dist/littlejs.d.ts', 'utf8'), /drawSky\(\): void;/);
});

test('dist/littlejs.d.ts has no more any types than it had, so a new one is typed instead', () =>
{
    // counted in the types, not the doc comments; what is left is user data (save data, JSON, a level object's
    // properties), input checks, and the objects of Box2D, three.js and the platforms' APIs, which have no types here;
    // lower the ceiling when a change takes some away
    const ceiling = 77;
    let count = 0, inComment = false;
    for (const line of readFileSync('dist/littlejs.d.ts', 'utf8').split('\n').map(line => line.trim()))
    {
        if (line.startsWith('/*')) { inComment = !line.includes('*/'); continue; }
        if (inComment) { inComment = !line.includes('*/'); continue; }
        if (line.startsWith('*')) continue;
        count += (line.match(/\bany\b/g) || []).length;
    }
    assert.ok(count <= ceiling, `${count} any types in the d.ts, more than the ${ceiling} allowed; give the new one a type`);
});

test('the ParticleEffectSettings typedef lists every setting the particle effects plugin has', () =>
{
    // the settings are a table made at run time, the typedef is written out for the types, so the two are compared
    const source = readFileSync('plugins/particleEffects.js', 'utf8');
    const made = source.slice(source.indexOf('function particleEffectSettingsMake'), source.indexOf('return settings;'));
    const settings = [...made.matchAll(/\badd\('(\w+)'/g)].map(m => m[1]);
    const typedef = source.slice(source.indexOf('@typedef {Object} ParticleEffectSettings'));
    const listed = [...typedef.slice(0, typedef.indexOf('*/')).matchAll(/@property \{[^}]+\} \[(\w+)\]/g)].map(m => m[1]);
    assert.ok(settings.length > 30, 'the settings are found');
    assert.deepEqual(listed, settings);
});
