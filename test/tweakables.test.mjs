import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// The tweakables plugin reads and writes globals by name, saves what the panel changed and brings it back
// after a reload while the code value is the same. The panel itself is html and is not made here, the tests
// change values the way its controls do, through each tweak's set and tweakSave.

// a localStorage kept between engines, like the page's across a reload
function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
const location = { pathname: '/game/' };
const saveName = 'LittleJS tweaks /game/';

// load an engine, declare the game's globals and tweak them, as a game's gameInit would
function game(storage, code, file)
{
    const engine = loadEngine({ localStorage: storage, location }, '', file);
    engine.run(code);
    return engine;
}

// change a tweak as its control would
const edit = (engine, name, value)=> engine.run(`{
    const t = tweakList.find(t=> t.name === '${name}');
    t.set(${value}); tweakSave(t); }`);

test('a tweak reads and writes a global, and a field on one by a dotted path', () =>
{
    const { run } = game(makeStorage(), `
        let speed = 5;
        const player = { pos: vec2(1, 2), color: hsl(0, 1, .5) };
        tweak('speed', {min: 0, max: 10});
        tweak('player.pos');
        tweak('player.color');`);
    assert.deepEqual([...run(`tweakList.map(t=> t.type)`)], ['number', 'vector2', 'color']);
    run(`tweakList[0].set(7); tweakList[1].set(vec2(3, 4));`);
    assert.equal(run('speed'), 7);
    assert.deepEqual([...run('[player.pos.x, player.pos.y]')], [3, 4]);
});

test('a path that can not be found or changed asserts', () =>
{
    const { run } = game(makeStorage(), `const fixed = 1; let text = 'a';`);
    assert.throws(()=> run(`tweak('missing')`));
    assert.throws(()=> run(`tweak('fixed')`), 'a const can not be changed');
    assert.throws(()=> run(`tweak('text')`), 'a string is not a type the panel has');
    assert.throws(()=> run(`tweak('speed; alert(1)')`), 'only a name or a dotted path');
});

test('a changed value is saved and comes back after a reload', () =>
{
    const storage = makeStorage();
    const first = game(storage, `let speed = 5; let sky = hsl(.6, 1, .5); tweak('speed'); tweak('sky');`);
    edit(first, 'speed', 7);
    edit(first, 'sky', 'hsl(.1, 1, .5)');
    assert.ok(storage.items[saveName], 'saved under the page name');

    const { run } = game(storage, `let speed = 5; let sky = hsl(.6, 1, .5); tweak('speed'); tweak('sky');`);
    assert.equal(run('speed'), 7);
    assert.ok(run('sky.HSLA()[0]') < .2, 'the saved color came back');
});

test('a saved value is dropped once the value in the code changes', () =>
{
    const storage = makeStorage();
    edit(game(storage, `let speed = 5; tweak('speed');`), 'speed', 7);

    const { run } = game(storage, `let speed = 6; tweak('speed');`);
    assert.equal(run('speed'), 6, 'the code was edited, its new value wins');
    assert.equal(JSON.parse(storage.items[saveName]).speed, undefined, 'and the old saved value is gone');
});

test('a value set back to the code value is no longer saved, and reset forgets them all', () =>
{
    const storage = makeStorage();
    const engine = game(storage, `let speed = 5; let jump = 1; tweak('speed'); tweak('jump');`);
    edit(engine, 'speed', 7);
    edit(engine, 'speed', 5);
    assert.equal(JSON.parse(storage.items[saveName]).speed, undefined);

    edit(engine, 'jump', 2);
    engine.run('tweakReset()');
    assert.equal(engine.run('jump'), 1);
    assert.deepEqual(JSON.parse(storage.items[saveName]), {});
});

test('tweaking the same path again keeps its code value and brings its tweaked value back', () =>
{
    const { run } = game(makeStorage(), `let player = {speed: 5}; tweak('player.speed');`);
    edit({ run }, 'player.speed', 7);
    run(`player = {speed: 5}; tweak('player.speed');`); // the player made again
    assert.equal(run('player.speed'), 7);
    assert.equal(run('tweakList.length'), 1);
    assert.equal(run('tweakList[0].codeValue'), 5);
});

test('copy writes a line of code for each changed value', () =>
{
    const { run } = game(makeStorage(), `
        let speed = 5, fly = false, drift = vec2(), sky = hsl(.6, 1, .5), same = 3;
        tweak('speed'); tweak('fly'); tweak('drift'); tweak('sky'); tweak('same');
        tweakEngineDefaults();`);
    edit({ run }, 'speed', .1 + .2); // float noise is not written
    edit({ run }, 'fly', true);
    edit({ run }, 'drift', 'vec2(-.25, 1)');
    edit({ run }, 'sky', 'hsl(.5, .5, .5, .5)');
    edit({ run }, 'gravity', 'vec2(0, -.02)');
    assert.equal(run('tweakChangedCode()'), [
        'speed = .3;',
        'fly = true;',
        'drift = vec2(-.25, 1);',
        'sky = hsl(.5, .5, .5, .5);',
        'setGravity(vec2(0, -.02));',
    ].join('\n'));
});

test('the engine defaults change through their setters, under one divider however often they are added', () =>
{
    const { run } = game(makeStorage(), `tweakEngineDefaults(); tweakEngineDefaults();`);
    assert.deepEqual([...run(`tweakList.map(t=> t.name ?? t.label)`)],
        ['Engine', 'gravity', 'timeScale', 'cameraScale', 'soundVolume']);
    edit({ run }, 'cameraScale', 40);
    assert.equal(run('cameraScale'), 40);
});

test('the object option tweaks a field of an object, as an ES module game needs', () =>
{
    const storage = makeStorage();
    const code = `
        const settings = {speed: 5, player: {size: vec2(1)}};
        tweak('speed', {object: settings});
        tweak('player.size', {object: settings});`;
    const first = game(storage, code);
    edit(first, 'speed', 7);
    edit(first, 'player.size', 'vec2(2, 3)');
    assert.equal(first.run('settings.speed'), 7);
    assert.equal(first.run('tweakChangedCode()'), 'speed: 7,\nplayer.size: vec2(2, 3),', 'as written in the object');
    assert.throws(()=> first.run(`tweak('missing', {object: settings})`));

    const { run } = game(storage, code);
    assert.equal(run('settings.speed'), 7, 'saved and brought back like a global');
    assert.equal(run('settings.player.size.y'), 3);
});

test('two objects with the same field are told apart by their labels', () =>
{
    const { run } = game(makeStorage(), `
        const a = {speed: 1}, b = {speed: 2};
        tweak('speed', {object: a, label: 'A Speed'});
        tweak('speed', {object: b, label: 'B Speed'});`);
    assert.equal(run('tweakList.length'), 2);
    edit({ run }, 'B Speed', 5);
    assert.deepEqual([run('a.speed'), run('b.speed')], [1, 5]);
});

test('a Vector3 is tweaked, saved and copied like a Vector2', () =>
{
    const storage = makeStorage();
    const first = game(storage, `let sun = vec3(1, 2, 3); tweak('sun');`);
    assert.equal(first.run('tweakList[0].type'), 'vector3');
    edit(first, 'sun', 'vec3(1, -.5, 3)');
    assert.equal(first.run('tweakChangedCode()'), 'sun = vec3(1, -.5, 3);');

    const { run } = game(storage, `let sun = vec3(1, 2, 3); tweak('sun');`);
    assert.equal(run('sun.y'), -.5);
});

test('a button calls its function, and adding its label again replaces the function', () =>
{
    const { run } = game(makeStorage(), `
        let calls = '';
        tweakButton('Restart', ()=> calls += 'a');
        tweakButton('Restart', ()=> calls += 'b');`);
    assert.equal(run('tweakList.length'), 1);
    run('tweakList[0].callback()');
    assert.equal(run('calls'), 'b');
    assert.equal(run('tweakChangedCode()'), '', 'a button is not a value to copy');
    run('tweakReset()'); // and reset passes it by
});

test('9 toggles the panel while the debug overlay is open', () =>
{
    const { run } = loadEngine();
    const press = ()=> run(`inputData[0].Digit9 = 3; debugUpdate(); inputData[0].Digit9 = 0;`);
    press();
    assert.equal(run('debugTweakables'), false, 'not while the overlay is closed');
    run('setDebugOverlay(true)');
    press();
    assert.equal(run('debugTweakables'), true);
    run('setDebugTweakables(false)');
    assert.equal(run('debugTweakables'), false);
});

test('the release build adds nothing and never reads the saved values', () =>
{
    const storage = makeStorage();
    storage.items[saveName] = JSON.stringify({ speed: { value: 7, code: 5 } });
    const { run } = game(storage, `let speed = 5; debugTweakables = true; tweak('speed'); tweakEngineDefaults();
        tweakDivider('Divider'); tweakButton('Button', ()=> {}); tweak('speed', {object: {speed: 1}});`,
        'littlejs.release.js');
    assert.equal(run('speed'), 5);
    assert.equal(run('tweakList.length'), 0);
});
