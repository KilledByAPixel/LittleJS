import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// A seeded fuzz of every loader, from full pass 8: each target's file, a Tiled map, an LDtk level, a 3D level, glTF
// and GLB, OBJ, atlases, a particle effect library and the editors' autosaves, mutated a few hundred ways, through
// both builds. A broken file may throw or assert, as it should; what fails is a load that gives no answer, one that
// takes a lot of memory, as the small files that took most of a GB did, and one after which
// engineObjectsDestroy throws, as a tile layer that failed in its constructor did. The mutations and the targets are
// in test/fixtures/loaderFuzz.

const fixture = (name)=> readFileSync(new URL('./fixtures/loaderFuzz/' + name, import.meta.url), 'utf8');
const sources = {};

// an engine in a vm with no builtins of this realm handed in, so what it parses and makes is of its own, as in a
// browser; the web APIs a loader needs are given
async function loadEngine(file)
{
    const source = sources[file] ??= readFileSync(new URL('../dist/' + file, import.meta.url), 'utf8');
    const quiet = { log() {}, warn() {}, error() {}, info() {}, debug() {}, assert() {}, group() {}, groupEnd() {},
        groupCollapsed() {}, table() {}, time() {}, timeEnd() {} };
    const items = {};
    const context = {
        console: quiet, performance, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
        TextDecoder, TextEncoder, atob, btoa, Response, Blob, URL, structuredClone,
        window: {},
        document: { addEventListener() {}, removeEventListener() {}, hasFocus: ()=> true, body: {}, hidden: false },
        navigator: {}, addEventListener() {}, removeEventListener() {},
        localStorage: { getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); },
            removeItem: (k)=> { delete items[k]; } },
        location: { pathname: '/game/', href: 'http://localhost/game/' },
        // an image that loads at once, 128 square, and a canvas that draws nothing, for loadAtlas
        Image: class { set src(v) { this.width = this.height = 128; queueMicrotask(()=> this.onload?.()); } },
        OffscreenCanvas: class
        {
            constructor(w, h) { this.width = w; this.height = h; }
            getContext() { return new Proxy({canvas: this}, {get: (t, k)=> k in t ? t[k] : ()=> ({}), set: ()=> true}); }
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: file });
    const run = (code)=> vm.runInContext(code, context);
    run('setHeadlessMode(true); setEngineManualStep(true);');
    await run(`engineInit(()=> { new Render3DPlugin; }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    run(fixture('mutate.js'));
    run(fixture('targets.js'));
    return run;
}

const timeout = (ms)=> new Promise((resolve)=> setTimeout(()=> resolve('no answer'), ms));
const cases = 60;

for (const file of ['littlejs.js', 'littlejs.release.js'])
test(`every loader, given ${cases} mutated files each, answers, in little memory, and leaves the engine ` +
    `able to clear its objects (${file})`, async ()=>
{
    const failures = [];
    const run = await loadEngine(file);
    const targets = JSON.parse(run('JSON.stringify(Object.keys(targets).filter((name)=> targets[name].base))'));
    // no prototype of the engine's realm gains a key, from pass 11
    const protoKeys = ()=> run(`[Object.prototype, Array.prototype, Function.prototype, String.prototype,
        Number.prototype, EngineObject.prototype, Vector2.prototype, Color.prototype, TileInfo.prototype]
        .map((p)=> Object.getOwnPropertyNames(p).length).join()`);
    const protoBefore = protoKeys();
    assert.ok(targets.length >= 8, 'the targets: ' + targets);
    for (const target of targets)
    for (let i = -1; i < cases; ++i)
    {
        const memory = process.memoryUsage().rss;
        let log = 'base';
        try
        {
            if (i < 0) run(`var __case = {value: fuzz.clone(targets.${target}.base), log: 'base'}`);
            else if (run(`!!targets.${target}.bytes`)) run(`var __case = fuzz.mutateBytes(targets.${target}.base, ${i})`);
            else run(`var __case = fuzz.mutate(targets.${target}.base, ${i})`);
            log = run('__case.log');
            const result = await Promise.race([Promise.resolve(run(`targets.${target}.run(__case.value)`))
                .catch(()=> 'threw'), timeout(10000)]); // long, a loaded machine is slow, only a load that hangs fails
            result === 'no answer' && failures.push(`${target} ${i} ${log}: no answer in 10 s`);
            // a load's sheets stay within the budget of 8 sheets' area, one more for rounding
            result?.sheets > 9 && failures.push(`${target} ${i} ${log}: made ${result.sheets} sheets`);
        }
        catch {} // a broken file may throw or assert
        // a step after it, where a half-made object, as a glTF node of bad numbers was, would throw
        try { run('engineStep(2)'); }
        catch (error) { failures.push(`${target} ${i} ${log}: a step after it threw ${error.message}`); }
        try { run('engineObjectsDestroy()'); }
        catch (error) { failures.push(`${target} ${i} ${log}: engineObjectsDestroy then threw ${error.message}`); }
        // memory and not time, which a busy machine makes flaky
        const grew = process.memoryUsage().rss - memory;
        grew > 300e6 && failures.push(`${target} ${i} ${log}: took ${grew / 1e6 | 0} MB`);
    }
    assert.equal(protoKeys(), protoBefore, 'no prototype gained a key');
    assert.deepEqual(failures, []);
});
