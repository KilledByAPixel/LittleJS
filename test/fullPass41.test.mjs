import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadEngine } from './vmEngine.mjs';

// Full pass 41 of 2026-11-17: a body a pair callback attached, destroyed or turned off after it stood on a solid; the
// settles past a solid its callback moved; the merge over a class with an accessor, a field over it, a getter alone
// and a setter that refuses; a refused 3D addChild; an editor closed by a game key in 2D and by a close that throws
// in 3D, and a gamepad's press; the module build with a top-level await

async function engine(with3D=false)
{
    const e = loadEngine({ localStorage: { getItem: ()=> null, setItem() {} }, location: { pathname: '/game/' } });
    e.run('setHeadlessMode(true)');
    await e.run(`setEngineManualStep(true); var seen = []; engineInit(()=> { ${with3D ? 'new Render3DPlugin' : ''} },
        ()=> globalThis.onUpdate?.(), ()=> globalThis.onUpdatePost?.(), ()=> {}, ()=> {})`);
    return e;
}

const boxes = `globalThis.makeBox = (pos, size, mass=0)=> { const b = new EngineObject3D(pos, render3D.boxMesh);
    b.size3D = size; b.setCollision(); b.mass = mass; return b; };`;

test('a body a pair callback attaches, destroys or turns off after standing on a solid is not followed down,'
    + ' and one attached in the follow-down is held where it stood (C1, C2, C4)', ()=>
{
    for (const build of ['littlejs.js', 'littlejs.release.js'])
    for (const order of ['crate first', 'floor first'])
    for (const what of ['attach', 'destroy', 'off'])
    {
        const { run } = loadEngine({}, '', build);
        run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
        const r = JSON.parse(run(`(()=>
        {
            const player = makeBox(vec3(3, 1.5, 0), vec3(1, 2, 1), 1);
            player.gravityScale = 0;
            const parts = [()=> makeBox(vec3(1.6, 1, 0), vec3(1), 1), ()=> makeBox(vec3(0, 0, 0), vec3(20, 1, 20))];
            const [crate, floor] = ${order === 'crate first'} ? parts.map((f)=> f()) :
                parts.reverse().map((f)=> f()).reverse();
            for (let f = 0; f < 20; ++f) engineObjectsUpdate();
            const stood = crate.groundObject === floor;
            let calls = 0, error = '', done = false;
            crate.collideWithObject = function(o)
            {
                if (o !== player || done) return true;
                done = true, ++calls;
                '${what}' == 'attach' ? player.attach(this) : '${what}' == 'destroy' ? this.destroy() :
                    (this.collideSolidObjects = false);
                return true;
            };
            const counted = crate.collideWithObject;
            crate.collideWithObject = function(o) { o === player && done && ++calls; return counted.call(this, o); };
            try { for (let f = 0; f < 10 && !done; ++f) { player.velocity3D = vec3(-.1, 0, 0); engineObjectsUpdate(); } }
            catch (e) { error = e.message; }
            const world = crate.parent ? render3DObjectMatrix(crate).getTranslation() : crate.pos3D;
            return JSON.stringify({stood, done, calls, error, y: world.y});
        })()`));
        const name = `${build} ${order} ${what}`;
        assert.ok(r.stood && r.done, name + ': set up');
        assert.equal(r.error, '', name);
        assert.equal(r.calls, 1, name + ': the callbacks are not asked again');
        what === 'attach' && assert.ok(r.y > 1 - .02, name + ': held where it stood, not sunk, ' + r.y);
    }
});

test('a body its callback attaches as the follow-down asks it is held where its move left it, not at the lowered'
    + ' test place (C4)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.01, 0);' + boxes);
    const r = JSON.parse(run(`(()=>
    {
        // a ramp turned .3 about z, the body walking down it, so it touches the ramp only through the follow-down
        const ramp = new EngineObject3D(vec3(), render3D.boxMesh);
        ramp.size3D = vec3(20, 1, 3); ramp.rotation3D = vec3(0, 0, .3); ramp.setCollision(); ramp.mass = 0;
        const body = makeBox(vec3(5 * Math.cos(.3), 5 * Math.sin(.3) + 1.2, 0), vec3(1), 1);
        const holder = new EngineObject3D(vec3(30, 0, 0));
        holder.rotation3D = vec3(0, 1, 0); // turned, so the lift goes by its axes
        for (let f = 0; f < 30; ++f) engineObjectsUpdate();
        let armed = false, before, after;
        body.collideWithObject = function(o) { armed && !this.parent && holder.attach(this); return true; };
        for (let f = 0; f < 20 && !body.parent; ++f)
        {
            body.velocity3D.x = -.08;
            armed = f == 10, before = body.pos3D.copy();
            engineObjectsUpdate();
        }
        after = render3DObjectMatrix(body).getTranslation();
        return JSON.stringify({attached: !!body.parent, before: before.y, after: after.y, x: after.x - before.x});
    })()`));
    assert.ok(r.attached);
    // its move this frame drops it by gravity, .01, and the test place would be the ramp's fall over .08 lower still
    assert.ok(r.after > r.before - .015, `held at ${r.after}, was at ${r.before}`);
    assert.ok(Math.abs(r.x + .08) < 1e-6, 'and where its move across left it');
});

test('a settle makes no push from a fixed solid whose own callback moved it (C3)', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, 0, 0);' + boxes);
    const r = JSON.parse(run(`(()=>
    {
        // a door moving right pushes the body, which is just under a ceiling that moves itself away when met
        const door = makeBox(vec3(-1, 0, 0), vec3(1, 3, 3));
        const body = makeBox(vec3(.05, 0, 0), vec3(1), 1);
        const ceiling = makeBox(vec3(.5, .95, 0), vec3(4, 1, 3));
        let moved = 0;
        ceiling.collideWithObject = function(o) { o === body && !moved++ && (this.pos3D = vec3(.5, 50, 0)); return true; };
        door.velocity3D = vec3(.1, 0, 0);
        engineObjectsUpdate();
        return JSON.stringify({moved, x: body.pos3D.x, y: body.pos3D.y});
    })()`));
    assert.equal(r.moved, 1, 'the ceiling moved itself');
    assert.ok(r.x > .05, 'the door pushed it');
    assert.ok(Math.abs(r.y) < 1e-9, 'not pushed down from where the ceiling was, ' + r.y);
});

test('the merge over a class with no copy method writes a field over an accessor, leaves out a member that can only be'
    + ' read and one its setter refuses, and the file, the live object and a reload agree (O1, O2, O3)', async ()=>
{
    const { run } = await engine(true);
    const r = JSON.parse(run(`(()=>
    {
        class Base { constructor() { this._s = 1; } get speed() { return this._s; } set speed(v) { this._s = v; } }
        class Sub extends Base { constructor() { super(); Object.defineProperty(this, 'speed', {value: 4,
            enumerable: true, writable: true, configurable: true}); } }
        class Ro { constructor() { this.x = 1; this.y = 2; } get total() { return (this.x + this.y) * 10; } }
        class Hp { constructor() { this._hp = 5; } get hp() { return this._hp; }
            set hp(v) { if (v < 0) throw Error('hp < 0'); this._hp = v; } }
        class Private { #v = 1; get v() { return this.#v; } set v(x) { this.#v = x; } }
        level3DAddType('M', class extends EngineObject3D { constructor(pos, p) { super(pos); this.p = p; } },
            {sub: new Sub, ro: new Ro, hp: new Hp, priv: new Private});
        const warns = [], warn = console.warn;
        console.warn = (...a)=> warns.push(a.join(' '));
        const loaded = level3DLoad({littlejs3D: 1, objects: [{id: 1, type: 'M', pos: [0, 0, 0],
            properties: {ro: {x: 2, total: 50}, hp: {hp: -3}, priv: {v: 7}}}]}).find((o)=> o.p).p;
        console.warn = warn;
        const level = {littlejs3D: 1, objects: [{id: 1, type: 'M', pos: [0, 0, 0]}]};
        level3DLoad(level); engineStep(2); levelEditor.open();
        const edit = levelEditor.edit3D, said = [];
        const tryIt = (name, value)=>
        {
            try { return edit.change((list)=> edit.setProperty(list[0], name, value)); }
            catch (e) { said.push(e.message.replace(/^Assert failed: setProperty: /, '')); }
        };
        tryIt('sub', {speed: 9});
        tryIt('ro', {x: 2, y: 2, total: 50});
        tryIt('hp', {hp: -3});
        edit.strokeEnd();
        const live = editor3DInstances.get(1).p;
        levelEditor.close();
        const file = JSON.stringify(level.objects[0].properties);
        const made = level3DLoad(JSON.parse(JSON.stringify(level))).find((o)=> o.p).p;
        return JSON.stringify({warns, loaded: [loaded.ro.total, Object.hasOwn(loaded.ro, 'total'), loaded.hp.hp,
            Object.hasOwn(loaded.hp, 'hp'), loaded.priv.v], said, file, live: live.sub.speed, reload: made.sub.speed});
    })()`));
    assert.deepEqual(r.loaded, [40, false, 5, false, 7], 'the getter reads, the refused value is left out, a ' +
        'setter that reads a private field gets the member as its own');
    assert.ok(r.warns.some((w)=> w.includes('total can only be read, left out')), r.warns.join('; '));
    assert.ok(r.warns.some((w)=> w.includes('hp was refused by its setter, hp < 0, left out')), r.warns.join('; '));
    assert.equal(r.said.length, 2, r.said.join('; '));
    assert.ok(r.said[0].includes('total can only be read') && r.said[1].includes('refused by its setter'),
        r.said.join('; '));
    assert.equal(r.file, '{"sub":{"speed":9}}');
    assert.equal(r.live, 9, 'the field over the accessor took the value');
    assert.equal(r.reload, 9);
});

test('a refused 3D addChild leaves the child as it was (O4)', ()=>
{
    for (const build of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', build);
        const r = run(`(()=>
        {
            setHeadlessMode(true); new Render3DPlugin;
            const child = new EngineObject3D(vec3()), dead = new EngineObject3D(vec3());
            dead.destroy();
            render3DGroundLast.set(child, dead);
            const pass = child.movePass;
            try { dead.addChild(child); } catch { }
            return String(!child.parent && render3DGroundLast.has(child) && child.movePass === pass);
        })()`);
        assert.equal(r, 'true', build);
    }
});

test('a game key that closes the 2D editor, and a 3D close that throws, give the game none of that press; a pad\'s'
    + ' press is cleared too (E1, D3, E2)', async ()=>
{
    const clearPressed = `for (const device of inputData) for (const i in device) device[i] &= 1;`;
    {
        const e = await engine();
        const { run, handlers } = e;
        run(`onUpdate = ()=> keyWasPressed('KeyP') && seen.push('update');
            onUpdatePost = ()=> keyWasPressed('KeyP') && seen.push('post');
            tileLayersLoad({ width: 3, height: 2, tilewidth: 16, tileheight: 16, layers: [
                { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 0, 0, 0, 0, 2] }] });
            levelEditor.open(); levelEditor.addKey('p', ()=> levelEditor.close()); engineStep(); ${clearPressed}`);
        handlers.keydown({ code: 'KeyP', key: 'p', repeat: false, target: {}, ctrlKey: false, metaKey: false,
            altKey: false, shiftKey: false, preventDefault() {} });
        run(`engineStep(); ${clearPressed}`);
        assert.equal(run('JSON.stringify([levelEditor.isOpen, seen])'), '[false,[]]', '2D game key');
    }
    {
        const { run } = await engine(true);
        run(`onUpdate = ()=> keyWasPressed('KeyK') && seen.push('update');
            onUpdatePost = ()=> { keyWasPressed('KeyK') && seen.push('post');
                gamepadWasPressed(9) && seen.push('pad'); };
            level3DLoad({objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}]}); engineStep(2); levelEditor.open();
            levelEditor.addKey('KeyK', ()=> { levelEditor.close(); throw Error('oops'); });
            engineStep(); inputData[0].KeyK = 3; inputData[1] = []; inputData[1][9] = 3;
            try { engineStep(); } catch (e) { seen.push(e.message); }
            engineStep();`);
        assert.equal(run('JSON.stringify([levelEditor.isOpen, seen])'), '[false,["oops"]]', '3D close that throws');
    }
});

test('the module example build parses a top-level await (B1)', ()=>
{
    const text = fs.readFileSync('examples/module/build.mjs', 'utf8');
    assert.match(text, /'uglify-js\/bin\/uglifyjs', \[filename, '--module'/);
    const uglify = createRequire(import.meta.url)('uglify-js');
    const code = "import * as LJS from './littlejs.esm.min.js'; await LJS.box2dInit?.(); LJS.engineInit();";
    const result = uglify.minify(code, {module: true});
    assert.equal(result.error, undefined);
});
