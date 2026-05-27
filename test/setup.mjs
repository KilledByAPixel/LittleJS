// Minimal globalThis stubs so dist/littlejs.esm.js can import under Node.
// The bundle has two top-level side effects that need host objects:
//   1. `const isTouchDevice = !headlessMode && window.ontouchstart !== undefined;`
//   2. `let audioContext = new AudioContext;`
// Anything beyond these is on-demand inside functions we don't invoke from tests.

globalThis.window = {};

globalThis.AudioContext = class AudioContext
{
    constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
    createGain() { return { connect(){}, gain: { value: 0 } }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect(){}, start(){}, stop(){} }; }
    resume() { return Promise.resolve(); }
};

// Minimal in-memory localStorage stub. The bundle reads/writes via
// bracket-notation (e.g. localStorage[key] = value), which proxies through
// to plain own-property assignment on this object — no Storage prototype
// methods required.
globalThis.localStorage = {};

// Minimal Image stub. The Medal constructor does `new Image; img.src = url`
// which only requires a settable `src` property in the headless test path.
globalThis.Image = class Image {};

// Enable headless mode on the shared bundle instance. ES module caching
// means every test file that imports the bundle gets this same instance,
// so tile() / audio paths / input setup all take their headless branches.
const { setHeadlessMode } = await import('../dist/littlejs.esm.js');
setHeadlessMode(true);
