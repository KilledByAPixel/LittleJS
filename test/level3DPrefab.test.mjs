import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LJS from '../dist/littlejs.esm.js';

// A prefab is a small level: a list of objects about its own origin, added under a name and then placed like any
// type. Its instance is a Prefab3D, a handle, with what its objects made as its parts: separate objects in the
// world where the instance's place, turn and size put them, or, attached, children of the handle.
const { vec3, PI, EngineObject3D, Prefab3D, level3DAddType, level3DAddPrefab, level3DSpawn, level3DLoad } = LJS;
new LJS.Render3DPlugin;
const near = (a, b, message)=> assert.ok(Math.abs(a - b) < 1e-5, message ?? `${a} is not ${b}`);
const nearVec = (v, x, y, z)=> { near(v.x, x); near(v.y, y); near(v.z, z); };

// a wall 4 wide to the right of the origin, and a post on it
const house = ()=> ({littlejs3D: 1, objects: [
    {id: 1, type: 'Box', pos: [2, .5, 0], scale: [4, 1, 1]},
    {id: 2, type: 'Box', pos: [4, 1.5, 0]}]});

// what console.warn and console.error said while a function ran, so an expected message does not print
function said(run)
{
    const {warn, error} = console, list = [];
    console.warn = console.error = (...text)=> list.push(text.join(' '));
    try { run(); }
    finally { console.warn = warn; console.error = error; }
    return list;
}

test('a prefab added by name is spawned as one handle with a part for each of its objects', ()=>
{
    level3DAddPrefab('House', house());
    const made = level3DSpawn('House', vec3(10, 0, 0));
    assert.ok(made instanceof Prefab3D);
    assert.deepEqual([made.prefabName, made.attached, made.parts.length], ['House', false, 2]);
    nearVec(made.parts[0].pos3D, 12, .5, 0);
    nearVec(made.parts[0].scale3D, 4, 1, 1);
    nearVec(made.parts[1].pos3D, 14, 1.5, 0);
    assert.equal(made.parts[0].parent, undefined, 'a thing of the world');
    assert.equal(made.parts[0].collideSolidObjects, true, 'and solid as a Box placed by hand is');
    made.destroy(true);
});

test('the parts go where the instance\'s turn and size put them', ()=>
{
    // a quarter turn about y takes +x to -z, and twice the size doubles each part's place and size
    const made = level3DSpawn('House', vec3(0, 1, 0), vec3(0, PI / 2, 0), vec3(2));
    nearVec(made.parts[0].pos3D, 0, 2, -4);
    nearVec(made.parts[0].scale3D, 8, 2, 2);
    near(made.parts[0].rotation3D.y, PI / 2);
    nearVec(made.parts[1].pos3D, 0, 4, -8);
    made.destroy(true);
});

test('moving the handle moves its parts with its next update, and destroying it takes them', ()=>
{
    const made = level3DSpawn('House', vec3());
    const [wall] = made.parts;
    made.pos3D = vec3(0, 5, 0);
    made.update();
    nearVec(wall.pos3D, 2, 5.5, 0);
    assert.equal(made.parts[0], wall, 'the same object, moved');
    made.destroy();
    assert.deepEqual(made.parts.map((p)=> p.destroyed), [true, true]);
});

test('an attached prefab\'s parts are children of the handle, with no collision of their own', ()=>
{
    level3DAddPrefab('Cart', {...house(), attached: true});
    const made = level3DSpawn('Cart', vec3(10, 0, 0), vec3(0, PI / 2, 0));
    assert.equal(made.attached, true);
    assert.deepEqual(made.parts.map((p)=> p.parent === made), [true, true]);
    assert.deepEqual(made.parts.map((p)=> p.collideSolidObjects), [false, false]);
    nearVec(made.parts[0].getWorldPos3D(), 10, .5, -2);
    nearVec(made.size3D, 4.5, 2, 1); // the box around a wall from 0 to 4 and a post from 3.5 to 4.5, up to 2
    // the handle is the middle of that box, as an object's place is the middle of its body, so it is solid where
    // it is seen; the prefab's origin, where it was spawned, is where its parts are measured from
    nearVec(made.originOffset, 2.25, 1, 0);
    nearVec(made.pos3D, 10, 1, -2.25);
    made.destroy(true);
});

test('a prefab holds prefabs, each placed inside the one that holds it', ()=>
{
    level3DAddPrefab('Street', {objects: [
        {id: 1, type: 'House', pos: [0, 0, 10]},
        {id: 2, type: 'House', pos: [0, 0, 20], rotation: [0, 90, 0]}]});
    const street = level3DSpawn('Street', vec3(100, 0, 0));
    assert.deepEqual(street.parts.map((p)=> p instanceof Prefab3D), [true, true]);
    nearVec(street.parts[0].parts[0].pos3D, 102, .5, 10);
    nearVec(street.parts[1].parts[0].pos3D, 100, .5, 18);
    street.destroy();
    assert.equal(street.parts[1].parts[0].destroyed, true, 'all the way down');
});

test('a prefab that holds itself stops, with an error, in place of going on for ever', ()=>
{
    level3DAddPrefab('Loop', {objects: [{id: 1, type: 'Box'}, {id: 2, type: 'Loop', pos: [1, 0, 0]}]});
    let made;
    const errors = said(()=> made = level3DSpawn('Loop', vec3()));
    assert.ok(errors.some((text)=> text.includes('Loop')), 'it says which');
    assert.ok(made instanceof Prefab3D);
    made.destroy(true);
});

test('a level\'s own prefabs block is added when it loads, and one the game added keeps its place', ()=>
{
    const level = {littlejs3D: 1, prefabs: {
        Tower: {objects: [{id: 1, type: 'Box', pos: [0, 3, 0]}]},
        House: {objects: []}}, // the game has a House already
        objects: [{id: 1, type: 'Tower', pos: [5, 0, 5]}, {id: 2, type: 'House', pos: [0, 0, 0]}]};
    const [tower, home] = level3DLoad(level);
    nearVec(tower.parts[0].pos3D, 5, 3, 5);
    assert.equal(home.parts.length, 2, 'the game\'s House, not the level\'s empty one');
    tower.destroy(true); home.destroy(true);
});

test('a part of a type nobody added is skipped with a warning, the rest is made', ()=>
{
    level3DAddPrefab('Odd', {objects: [{id: 1, type: 'Nothing'}, {id: 2, type: 'Box'}]});
    let made;
    const warnings = said(()=> made = level3DSpawn('Odd', vec3()));
    assert.equal(made.parts.length, 1);
    assert.ok(warnings.some((text)=> text.includes('Nothing')));
    made.destroy(true);
});

test('a type that is a function is called where the instance puts its object', ()=>
{
    let start;
    level3DAddType('Start', (pos)=> { start = pos; });
    level3DAddPrefab('Room', {objects: [{id: 1, type: 'Start', pos: [1, 0, 0]}]});
    const made = level3DSpawn('Room', vec3(10, 0, 0), vec3(0, PI / 2, 0));
    nearVec(start, 10, 0, -1);
    made.destroy(true);
});

test('level3DSpawn makes a plain type too, turned and sized', ()=>
{
    const box = level3DSpawn('Box', vec3(1, 2, 3), vec3(0, 1, 0), vec3(2, 3, 4), {solid: false});
    assert.ok(box instanceof EngineObject3D && !(box instanceof Prefab3D));
    nearVec(box.pos3D, 1, 2, 3); near(box.rotation3D.y, 1); nearVec(box.scale3D, 2, 3, 4);
    assert.equal(box.collideSolidObjects, false);
    box.destroy(true);
});

test('a prefab inside an attached prefab is attached too, its parts ride along', ()=>
{
    level3DAddPrefab('Train', {attached: true, objects: [{id: 1, type: 'House', pos: [0, 0, 5]}]});
    const train = level3DSpawn('Train', vec3(100, 0, 0));
    const house = train.parts[0];
    assert.deepEqual([house.attached, house.parent === train, house.parts[0].parent === house], [true, true, true]);
    nearVec(house.parts[0].getWorldPos3D(), 102, .5, 5);
    train.destroy(true);
});
