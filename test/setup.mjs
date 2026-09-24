// Minimal globalThis stubs so dist/littlejs.esm.js can import under Node.
// The bundle has three top-level side effects that need host objects:
//   1. `const isTouchDevice = !headlessMode && window.ontouchstart !== undefined;`
//   2. `let audioContext = new AudioContext;`
//   3. `let audioMasterGain = audioContext.createGain();` connected to the destination
// Anything beyond these is on-demand inside functions we don't invoke from tests.

globalThis.window = {};

// gain nodes record their connections so tests can check the audio graph;
// disconnect(node) drops that one connection, disconnect() drops them all,
// and like a real node, disconnecting something not connected throws
globalThis.AudioContext = class AudioContext
{
    constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
    createGain()
    {
        return {
            connections: [],
            connect(node) { this.connections.push(node); return node; },
            disconnect(node)
            {
                if (node === undefined)
                    return void (this.connections.length = 0);
                const i = this.connections.indexOf(node);
                if (i < 0)
                    throw new Error('InvalidAccessError: node is not connected');
                this.connections.splice(i, 1);
            },
            gain: { value: 0 },
        };
    }
    createBuffer() { return {}; }
    createBufferSource() { return { connect(){}, start(){}, stop(){} }; }
    resume() { return Promise.resolve(); }
};

// Silent keep-alive sources the audio effects make during a fade; instances are
// kept so a test can check one was made, where it went, and when it stops
globalThis.ConstantSourceNode = class ConstantSourceNode
{
    static instances = [];
    constructor(context, options) { this.offset = options?.offset; this.target = undefined; this.stopTime = undefined; ConstantSourceNode.instances.push(this); }
    connect(node) { this.target = node; return node; }
    disconnect() { this.target = undefined; }
    start() {}
    stop(time) { this.stopTime = time; }
};

// Minimal in-memory localStorage stub. The bundle reads and writes through getItem
// and setItem, which live on the prototype like Storage's, so the stored items are
// the object's own properties and a test can read, set or clear them directly.
globalThis.localStorage = Object.create({
    getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
});

// Minimal Image stub. The Medal constructor does `new Image; img.src = url`
// which only requires a settable `src` property in the headless test path.
globalThis.Image = class Image {};

// Enable headless mode on the shared bundle instance. ES module caching
// means every test file that imports the bundle gets this same instance,
// so tile() / audio paths / input setup all take their headless branches.
const { setHeadlessMode } = await import('../dist/littlejs.esm.js');
setHeadlessMode(true);

// Minimal document stub. engineInit touches document.body before its
// headless early-return, and resolves rootElement from it. In headless mode
// nothing is ever appended to or styled on that element.
globalThis.document = { body: {} };
