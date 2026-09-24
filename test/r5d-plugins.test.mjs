import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Tween, tweenUpdate, tweenStopAll } from '../dist/littlejs.esm.js';

// round 5 decisions for the plugins: a tween's then is its onComplete, called once the last pass ends,
// and Tween is generic in the d.ts

///////////////////////////////////////////////////////////////////////////////
// then sets onComplete, called when the whole tween completes

test('then on a loop is called once, after the last iteration, set before or after loop', () =>
{
    tweenStopAll();
    let after = 0, before = 0;
    const values = [];
    const a = new Tween(v=> values.push(v), 0, 10, 1).loop(3).then(()=> ++after);
    const b = new Tween(()=>{}, 0, 10, 1).then(()=> ++before).loop(3);
    assert.equal(typeof a.onComplete, 'function', 'then sets onComplete');
    tweenUpdate(1);
    tweenUpdate(1);
    assert.deepEqual([after, before], [0, 0], 'still looping');
    assert.equal(a.isActive(), true, 'then did not end the loop');
    tweenUpdate(1);
    assert.deepEqual([after, before], [1, 1]);
    assert.deepEqual(values, [0, 10, 0, 10, 0, 10], 'three passes');
    assert.equal(a.isActive() || b.isActive(), false);
    tweenUpdate(1);
    assert.deepEqual([after, before], [1, 1], 'once');
});

test('then on a pingPong is called once its last pass ends, and never on an endless one', () =>
{
    tweenStopAll();
    let ended = 0, endless = 0;
    const values = [];
    new Tween(v=> values.push(v), 0, 1, 1).pingPong(2).then(()=> ++ended);
    const forever = new Tween(()=>{}, 0, 1, 1).pingPong().then(()=> ++endless);
    tweenUpdate(1);
    assert.equal(ended, 0);
    tweenUpdate(1);
    assert.equal(ended, 1);
    assert.equal(values.at(-1), 0, 'it ended back on the start before then was called');

    // one update that runs through every iteration calls it once too
    const long = new Tween(()=>{}, 0, 1, 1).loop(4).then(()=> ++ended);
    tweenUpdate(9);
    assert.equal(ended, 2);
    assert.equal(long.isActive(), false);

    assert.equal(endless, 0);
    assert.equal(forever.isActive(), true);
    forever.stop();
});

test('then survives restart, and stop ends a tween without calling it', () =>
{
    tweenStopAll();
    let calls = 0;
    const t = new Tween(()=>{}, 0, 1, 1).then(()=> ++calls);
    tweenUpdate(1);
    assert.equal(calls, 1);
    t.restart();
    tweenUpdate(1);
    assert.equal(calls, 2, 'a restarted tween calls it again when it completes');

    t.restart();
    tweenUpdate(.5);
    t.stop();
    tweenUpdate(1);
    assert.equal(calls, 2, 'stop does not call it');
    t.restart();
    tweenUpdate(1);
    assert.equal(calls, 3, 'stop kept it for a restart');

    // a restarted loop that has finished plays one pass, then completes again
    let loopCalls = 0;
    const loop = new Tween(()=>{}, 0, 1, 1).loop(2).then(()=> ++loopCalls);
    tweenUpdate(2);
    assert.equal(loopCalls, 1);
    loop.restart();
    tweenUpdate(1);
    assert.equal(loopCalls, 2);

    // tweenStopAll does not call it either
    let stopAllCalls = 0;
    new Tween(()=>{}, 0, 1, 1).then(()=> ++stopAllCalls);
    tweenStopAll();
    tweenUpdate(1);
    assert.equal(stopAllCalls, 0);
});

test('onComplete can be set directly, and a tween stopped by its own last callback does not call it', () =>
{
    tweenStopAll();
    let calls = 0;
    const t = new Tween(()=>{}, 0, 1, 1);
    assert.equal(t.onComplete, undefined);
    t.onComplete = ()=> ++calls;
    tweenUpdate(1);
    assert.equal(calls, 1);

    const self = new Tween(v=> v >= 1 && self.stop(), 0, 1, 1).then(()=> ++calls);
    tweenUpdate(1);
    assert.equal(calls, 1);

    // a then that chains a new tween, the most common use, still works
    const order = [];
    new Tween(()=>{}, 0, 1, 1).then(()=> new Tween(v=> order.push(v), 5, 6, 1).then(()=> order.push('done')));
    tweenUpdate(1);
    tweenUpdate(1);
    assert.deepEqual(order, [5, 6, 'done']);
});

///////////////////////////////////////////////////////////////////////////////
// Tween is generic in the d.ts, the type it tweens comes from start and end or the callback

test('Tween is a generic class in the d.ts', () =>
{
    const dts = readFileSync(new URL('../dist/littlejs.d.ts', import.meta.url), 'utf8');
    const body = dts.match(/export class Tween<T = any> \{([\s\S]*?)\n    \}/)[1];
    assert.match(body, /constructor\(callback: \(arg0: NonNullable<T>\) => void, start\?: T, end\?: T,/);
    assert.match(body, /\bcallback: \(arg0: T\) => void;/);
    assert.match(body, /\bstart: T;/);
    assert.match(body, /\bend: T;/);
    assert.match(body, /\bonComplete: undefined \| \(\(\) => void\);/);
    assert.match(body, /then\(callback: \(\) => void\): Tween<T>;/);
    assert.match(body, /loop\(count\?: number\): Tween<T>;/);
    assert.match(body, /getValue\(\): T;/);
    const property = dts.match(/export function tweenProperty<T = any>\(([\s\S]*?)\): Tween<T>;/)[1];
    assert.match(property, /^target: any, propertyPath: string, start: T, end: T,/);
});

test('TypeScript infers a typed Tween from its callback or its ends, under strict', () =>
{
    const dir = mkdtempSync(join(tmpdir(), 'ljs-tween-'));
    const usage = `import { Tween, tweenProperty, vec2, Vector2, Color, rgb, Ease } from 'littlejsengine';
let countdown = 0;
let pos = vec2();
// the case in the report: a typed callback, stored as a typed tween
const typed: Tween<number> = new Tween((v: number) => { countdown = v; }, 10, 0, 5);
const inferred: Tween<number> = new Tween(v => countdown = v, 10, 0, 5);
const onlyCallback: Tween<number> = new Tween((v: number) => { countdown = v; });
class Fader { fade?: Tween<number>; go() { this.fade = new Tween((v: number) => {}, 1, 0, 2); } }
const moved: Tween<Vector2> = new Tween(v => pos = v, vec2(), vec2(1), 2).setEase(Ease.SINE).loop(3).then(() => {});
const value: Vector2 = moved.getValue();
const color = new Tween((v: Color) => {}, rgb(1, 0, 0), rgb(0, 0, 1)).pingPong();
class Lerp { constructor(public n: number) {} lerp(o: Lerp, p: number) { return new Lerp(this.n + (o.n - this.n)*p); } }
const custom = new Tween(v => { const n: number = v.n; }, new Lerp(0), new Lerp(1));
const bare: Tween = new Tween(() => {});
const property: Tween<number> = tweenProperty({x: 0}, 'x', 0, 1);
typed.onComplete = () => {};
typed.onComplete = undefined;
// @ts-expect-error the ends are different types
new Tween((v: number) => {}, 0, vec2(1));
// @ts-expect-error the callback takes a number, the ends are vectors
new Tween((v: number) => {}, vec2(), vec2(1));
// @ts-expect-error a number tween gives a number
const wrong: Vector2 = typed.getValue();
export {};
`;
    writeFileSync(join(dir, 'usage.ts'), usage);
    const config = { compilerOptions: { noEmit: true, strict: true, target: 'es2022', lib: ['es2022', 'dom'],
        types: [] }, files: [resolve('dist/littlejs.d.ts'), join(dir, 'usage.ts')] };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config));
    let output = '';
    try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    assert.equal(output.trim(), '', output);
});
