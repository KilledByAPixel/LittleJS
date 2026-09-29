import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A 3D level is a plain list of objects by type, position, rotation and scale. level3DLoad makes each from the
// type added for its name. A file written by hand may have mistakes, the loader uses the default and goes on.
const { vec2, vec3, hsl, PI, WHITE, EngineObject3D, Light3D, level3DAddType, level3DAddMesh, level3DLoad } = LJS;
new LJS.Render3DPlugin;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} is not ${b}`);
const nearVec = (v, x, y, z)=> { near(v.x, x); near(v.y, y); near(v.z, z); };

// warnings while a function runs, so an expected one does not print
function warnings(run)
{
    const warn = console.warn, list = [];
    console.warn = (...text)=> list.push(text.join(' '));
    try { run(); }
    finally { console.warn = warn; }
    return list;
}

class Crate extends EngineObject3D
{
    constructor(pos, properties)
    {
        super(pos, LJS.render3D.boxMesh);
        this.scale3D = vec3(2);
        this.madeWith = properties;
    }
}
level3DAddType('Crate', Crate, { health: 3, tint: hsl(0, 1, .5), spot: vec3(1, 2, 3), flat: vec2(4, 5), label: 'crate' });

test('a class is made at its position with the type\'s defaults, and they are set on it', ()=>
{
    const [crate] = level3DLoad({ littlejs3D: 1, objects: [{ id: 1, type: 'Crate', pos: [1, 2, 3] }] });
    assert.ok(crate instanceof Crate);
    nearVec(crate.pos3D, 1, 2, 3);
    assert.equal(crate.health, 3);
    assert.equal(crate.label, 'crate');
    assert.equal(crate.madeWith.health, 3, 'the constructor gets them too');
    assert.ok(LJS.isColor(crate.tint) && crate.tint !== crate.madeWith.tint || crate.tint === crate.madeWith.tint);
    nearVec(crate.spot, 1, 2, 3);
    crate.destroy();
});

test('the object\'s own properties go over the defaults: numbers, strings, colors and vectors', ()=>
{
    const [crate] = level3DLoad({ objects: [{ id: 1, type: 'Crate', pos: [0, 0, 0], properties:
        { health: 5, label: 'big', tint: '#00ff0080', spot: [7, 8, 9], flat: [1, 2] } }] });
    assert.equal(crate.health, 5);
    assert.equal(crate.label, 'big');
    near(crate.tint.g, 1); near(crate.tint.r, 0); near(crate.tint.a, 128 / 255);
    nearVec(crate.spot, 7, 8, 9);
    assert.deepEqual([crate.flat.x, crate.flat.y], [1, 2]);
    assert.equal(crate.madeWith.health, 5);
    crate.destroy();
});

test('rotation is in degrees, and the scale multiplies the scale the object was made with', ()=>
{
    const [crate] = level3DLoad({ objects: [{ id: 1, type: 'Crate', pos: [0, 0, 0], rotation: [90, 45, 0],
        scale: [1, 2, 3] }] });
    nearVec(crate.rotation3D, PI / 2, PI / 4, 0);
    nearVec(crate.scale3D, 2, 4, 6);
    crate.destroy();
    const [plain] = level3DLoad({ objects: [{ id: 1, type: 'Crate', pos: [0, 0, 0] }] });
    nearVec(plain.rotation3D, 0, 0, 0);
    nearVec(plain.scale3D, 2, 2, 2);
    plain.destroy();
});

test('an arrow function is called with the position and properties, and what makes nothing is left out', ()=>
{
    let start, got;
    level3DAddType('Start', (pos, properties)=> { start = pos; got = properties; }, { team: 1 });
    const made = level3DLoad({ objects: [{ id: 1, type: 'Start', pos: [4, 5, 6], properties: { team: 2 } }] });
    assert.deepEqual(made, []);
    nearVec(start, 4, 5, 6);
    assert.equal(got.team, 2);
});

test('an unknown type is skipped with a warning, and the rest are made', ()=>
{
    let made;
    const list = warnings(()=> made = level3DLoad({ objects: [{ id: 1, type: 'Nope', pos: [0, 0, 0] },
        { id: 2, type: 'Crate', pos: [0, 0, 0] }] }));
    assert.equal(made.length, 1);
    assert.equal(list.length, 1);
    assert.match(list[0], /Nope/);
    made[0].destroy();
});

test('mistakes in a file written by hand use the default and do not throw', ()=>
{
    const [crate] = level3DLoad({ objects: [{ id: 1, type: 'Crate', pos: [1, 2], rotation: 'up', scale: [1, 'x', 1],
        properties: { tint: 'red', spot: [1, 2], flat: 5 } }] });
    nearVec(crate.pos3D, 0, 0, 0);
    nearVec(crate.rotation3D, 0, 0, 0);
    nearVec(crate.scale3D, 2, 2, 2);
    near(crate.tint.r, 1); near(crate.tint.g, 0);
    nearVec(crate.spot, 1, 2, 3);
    assert.deepEqual([crate.flat.x, crate.flat.y], [4, 5]);
    crate.destroy();
    assert.deepEqual(level3DLoad({}), []);
    assert.deepEqual(level3DLoad({ objects: 'nope' }), []);
    assert.deepEqual(level3DLoad({ objects: [undefined, 5, 'x'] }), []);
});

test('a level from a newer version is an assert', ()=>
{
    assert.throws(()=> level3DLoad({ littlejs3D: 2, objects: [] }), /Assert failed/);
});

test('Box, Sphere and Cylinder are built in: a color, solid by default, a sphere solid as a sphere', ()=>
{
    const [box, sphere, cylinder, ghost] = level3DLoad({ objects: [
        { id: 1, type: 'Box', pos: [0, .5, 0], scale: [4, 1, 4], properties: { color: '#88aa55' } },
        { id: 2, type: 'Sphere', pos: [0, 2, 0] },
        { id: 3, type: 'Cylinder', pos: [3, 1, 0], scale: [1, 2, 1] },
        { id: 4, type: 'Box', pos: [9, 0, 0], properties: { solid: false } }] });
    assert.equal(box.mesh, LJS.render3D.boxMesh);
    nearVec(box.scale3D, 4, 1, 4);
    near(box.color.g, 0xaa / 255);
    assert.equal(box.collideSolidObjects, true);
    assert.equal(box.mass, 0, 'static');
    assert.equal(box.collideAsSphere3D, false);
    assert.equal(sphere.mesh, LJS.render3D.sphereMesh);
    assert.equal(sphere.collideAsSphere3D, true);
    assert.equal(sphere.collideSolidObjects, true);
    const bounds = cylinder.mesh.getBounds();
    nearVec(bounds.max.subtract(bounds.min), 1, 1, 1);
    assert.equal(cylinder.collideAsSphere3D, false);
    assert.equal(ghost.collideSolidObjects, false);
    [box, sphere, cylinder, ghost].forEach((o)=> o.destroy());
});

test('Light is built in, a point light with a color, radius and intensity', ()=>
{
    const [light, dim] = level3DLoad({ objects: [{ id: 1, type: 'Light', pos: [0, 3, 0] },
        { id: 2, type: 'Light', pos: [0, 3, 0], properties: { color: '#ff0000', radius: 9, intensity: 2 } }] });
    assert.ok(light instanceof Light3D);
    assert.deepEqual([light.radius, light.intensity], [5, 1]);
    assert.deepEqual([dim.radius, dim.intensity, dim.color.r, dim.color.g], [9, 2, 1, 0]);
    light.destroy(); dim.destroy();
});

test('level3DAddMesh makes a static prop of a mesh, not solid unless the object says so', ()=>
{
    const mesh = LJS.buildBox(2);
    level3DAddMesh('Rock', mesh, undefined, hsl(.1, .5, .5));
    const [rock, wall] = level3DLoad({ objects: [{ id: 1, type: 'Rock', pos: [1, 0, 0] },
        { id: 2, type: 'Rock', pos: [5, 0, 0], properties: { solid: true, color: '#0000ff' } }] });
    assert.equal(rock.mesh, mesh);
    assert.equal(rock.collideSolidObjects, false);
    near(rock.color.r, hsl(.1, .5, .5).r);
    assert.equal(wall.collideSolidObjects, true);
    near(wall.color.b, 1);
    rock.destroy(); wall.destroy();
});

test('adding a name again replaces it, a built-in one too', ()=>
{
    class MyBox extends EngineObject3D { constructor(pos) { super(pos); } }
    level3DAddType('Box', MyBox);
    const [box] = level3DLoad({ objects: [{ id: 1, type: 'Box', pos: [0, 0, 0] }] });
    assert.ok(box instanceof MyBox);
    box.destroy();
});

// errors while a function runs, so an expected one does not print
function errors(run)
{
    const error = console.error, list = [];
    console.error = (...text)=> list.push(text.join(' '));
    try { run(); }
    finally { console.error = error; }
    return list;
}

test('a number, boolean or string of the wrong type in a file uses the default', ()=>
{
    const [crate, box, light] = level3DLoad({ objects: [
        { id: 1, type: 'Crate', pos: [0, 0, 0], properties: { health: '5', label: 7 } },
        { id: 2, type: 'Cylinder', pos: [0, 0, 0], properties: { tile: '3', solid: 'no' } },
        { id: 3, type: 'Light', pos: [0, 0, 0], properties: { radius: 'big', intensity: null } }] });
    assert.deepEqual([crate.health, crate.label], [3, 'crate']);
    assert.equal(box.collideSolidObjects, true);
    assert.equal(box.tileInfo, undefined);
    assert.deepEqual([light.radius, light.intensity], [5, 1]);
    [crate, box, light].forEach((o)=> o.destroy());
});

test('a property the type does not have goes to the constructor and is not set on the object', ()=>
{
    const [crate] = level3DLoad({ objects: [{ id: 1, type: 'Crate', pos: [1, 2, 3],
        properties: { pos3D: 'here', mass: 'heavy', note: 'mine' } }] });
    nearVec(crate.pos3D, 1, 2, 3);
    assert.equal(crate.mass, 0);
    assert.equal(crate.note, undefined);
    assert.equal(crate.madeWith.note, 'mine');
    crate.destroy();
});

test('an object its type can not make is skipped with an error, and the rest are made', ()=>
{
    class Picky extends EngineObject3D
    {
        constructor(pos, properties)
        {
            super(pos);
            if (properties.size < 0) throw new Error('no such size');
        }
    }
    level3DAddType('Picky', Picky, { size: 1 });
    let made;
    const list = errors(()=> made = level3DLoad({ objects: [
        { id: 1, type: 'Picky', pos: [0, 0, 0], properties: { size: -1 } },
        { id: 2, type: 'Light', pos: [0, 0, 0], properties: { radius: -1 } },
        { id: 3, type: 'Picky', pos: [0, 0, 0] }] }));
    assert.equal(made.length, 1);
    assert.ok(made[0] instanceof Picky);
    assert.equal(list.length, 2);
    assert.match(list[0], /Picky/);
    assert.match(list[1], /Light/);
    made[0].destroy();
});
