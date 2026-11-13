import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Full pass 8 of 2026-11-13: a level's scene block puts back only what it set and the game has not changed since, a
// Tiled property goes through a setter of the game's class, the page pause is listened for with sound off, CSG cuts
// do not grow the mesh, and tweens check their ease and options

test('a level puts back only the scene settings its block set and the game has not changed since', ()=>
{
    for (const file of ['littlejs.js', 'littlejs.release.js'])
    {
        const { run } = loadEngine({}, '', file);
        const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
            render3D.fogEnd = 20;
            level3DLoad({scene: {fog: [1, 2], sky: ['#ff0000', '#00ff00', '#0000ff'], shadows: true}, objects: []});
            // the game changes the sky and the fog end in code while the level runs, a day and night say
            render3D.setSky(hsl(.6, .5, .5), hsl(.6, .5, .8));
            const gameSky = render3D.sky;
            render3D.fogEnd = 50;
            level3DLoad({objects: []});
            const kept = [render3D.sky === gameSky, render3D.fogEnd, render3D.fogStart, render3D.shadows];
            // a second load with no block leaves it all as it is
            level3DLoad({objects: []});
            const again = [render3D.sky === gameSky, render3D.fogEnd];
            JSON.stringify({kept, again, fogStartBefore: 0})`));
        assert.deepEqual(result.kept.slice(0, 2), [true, 50], file + ': what the game set since stays');
        assert.equal(result.kept[3], false, file + ': what the block set and nobody changed goes back');
        assert.deepEqual(result.again, [true, 50], file);
    }
});

test('a Tiled property goes through a setter of the game\'s class, and the setter keeps working after', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`
        const calls = [];
        class Door extends EngineObject
        {
            set locked(value) { calls.push(value); this._locked = value; }
            get locked() { return this._locked; }
        }
        let door;
        objectLayersAddType('Door', (pos)=> door = new Door(pos), {locked: false});
        objectLayersLoad({width: 4, height: 4, tilewidth: 16, tileheight: 16, layers: [{type: 'objectgroup',
            objects: [{id: 1, type: 'Door', x: 0, y: 0, properties: [{name: 'locked', type: 'bool', value: true}]}]}]});
        door.locked = false;
        JSON.stringify({calls, own: Object.getOwnPropertyDescriptor(door, 'locked') !== undefined})`));
    assert.deepEqual(result.calls, [true, false]);
    assert.equal(result.own, false, 'no own property hides the accessor');
});

test('the page pause is listened for when sound starts off, so turning it on later pauses on a hidden page', ()=>
{
    const listened = [];
    const document = { hidden: false, addEventListener: (name)=> listened.push(name), hasFocus: ()=> true };
    const { run } = loadEngine({ document, addEventListener: (name)=> listened.push(name) });
    run('setSoundEnable(false); audioInit()');
    assert.ok(['visibilitychange', 'blur', 'focus'].every((name)=> listened.includes(name)), listened.join());
});

test('a chain of CSG cuts does not grow the mesh past what the cuts make, and a cut that misses it adds nothing', ()=>
{
    const { run } = loadEngine();
    const result = JSON.parse(run(`setHeadlessMode(true); new Render3DPlugin;
        let seed = 9;
        const rnd = (a=0, b=1)=> { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return a + (b - a) * seed / 0x7fffffff; };
        const tris = (m)=> m.indices.length / 3, farSphere = buildSphere(.5, 10, 5, false);
        let drilled = buildBox(vec3(2)), far = [];
        for (let k = 0; k < 14; ++k)
        {
            drilled = drilled.subtract(buildSphere(rnd(.3, .8), 10, 5, false),
                buildMatrix(vec3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))));
            far.push(tris(drilled.subtract(farSphere, buildMatrix(vec3(10)))) - tris(drilled));
        }
        JSON.stringify({triangles: tris(drilled), far, closed: render3DMeshIsClosed(drilled)})`));
    assert.ok(result.triangles < 30000, 'triangles ' + result.triangles);
    assert.deepEqual(result.far, Array(14).fill(0), 'a far cut gives the mesh back as it was');
    assert.equal(result.closed, true);
});

test('a tween asserts on an ease that is not a curve and on an option it does not have', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true)');
    for (const code of [`new Tween(()=> {}, 0, 1, 1, {ease: Ease.OUT})`, `new Tween(()=> {}, 0, 1, 1).setEase(Ease.IN_OUT)`,
        `new Tween(()=> {}, 0, 1, 1).setEase(Ease.POWER)`, `new Tween(()=> {}, 0, 1, 1).setEase('SINE')`])
        assert.throws(()=> run(code), /the ease must be/, code);
    assert.throws(()=> run(`new Tween(()=> {}, 0, 1, 1, {easing: Ease.SINE})`), /did you mean ease/);
    assert.throws(()=> run(`new Tween(()=> {}, 0, 1, 1, {loop: true})`), /loop\(\) is a method/);
    run(`new Tween(()=> {}, 0, 1, 1, {ease: Ease.OUT(Ease.SINE), useRealTime: true}).setEase(Ease.POWER(3))`);
});
