import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Loads its own copy of the script build, dist/littlejs.js, into a node vm, with a document stub that keeps the
// listeners the engine adds, so a test can fire real key, mouse and touch events at it and reach engine internals
// like inputData. Each call is a fresh engine, the release build when file is 'littlejs.release.js'.
const sources = {};
export function loadEngine(extra={}, setup='', file='littlejs.js') // setup runs before inputInit, as a game's settings would
{
    const source = sources[file] ??= readFileSync(new URL('../dist/' + file, import.meta.url), 'utf8');
    const handlers = {};
    const context = {
        console, performance, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Map, Set, WeakMap,
        Float32Array, Uint8Array, Math, JSON, URL, queueMicrotask,
        window: {},
        document: { addEventListener(type, f) { handlers[type] = f; }, hasFocus: ()=> true, body: {}, hidden: false },
        navigator: {},
        addEventListener() {}, removeEventListener() {},
        localStorage: { getItem: ()=> null, setItem() {} },
        Image: class {},
        AudioContext: class
        {
            constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
            createGain() { return { connect(n) { return n; }, disconnect() {}, gain: { value: 0 } }; }
            createBuffer() { return {}; }
            createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
            resume() { return Promise.resolve(); }
        },
        ...extra,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'littlejs.js' });
    const run = (code)=> vm.runInContext(code, context);
    run(setup);
    run(`inputInit(); mainCanvasSize = vec2(1000);
        mainCanvas = { getBoundingClientRect: ()=> ({ left: 0, top: 0, right: 1000, bottom: 1000 }) };`);
    return { context, run, handlers };
}
export const keyEvent = (code)=> ({ code, key: code, repeat: false, cancelable: false, target: {} });
