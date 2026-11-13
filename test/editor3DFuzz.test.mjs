import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A seeded fuzz of the 3D level editor, from full pass 7: place, move, set a property, delete, duplicate, undo, redo,
// make a prefab, unpack, attached, a scene change, entering a prefab two deep and back, blocks and terrain, and a
// cancel. After each operation the live objects must match the level: one live instance per object, none extra, at
// the level's place, a prefab instance with a part for each of its objects, the prefab registry, the block map and the
// terrain in line. At the end, with every prefab closed, a fresh engine on the same storage loads the same file and
// must get the level back from the autosave. The prefab enter, back, undo and autosave paths broke in earlier passes.

const seeds = 24, opsPerRun = 60;

function makeStorage()
{
    const items = {};
    return { items, getItem: (k)=> items[k] ?? null, setItem: (k, v)=> { items[k] = String(v); } };
}
async function loadGame(storage)
{
    const engine = loadEngine({ localStorage: storage, location: { pathname: '/game/' } });
    engine.run('setHeadlessMode(true)');
    await engine.run(`setEngineManualStep(true);
        engineInit(()=> { new Render3DPlugin }, ()=> {}, ()=> {}, ()=> {}, ()=> {})`);
    return engine;
}

const fileText = JSON.stringify({littlejs3D: 1,
    prefabs: {House: {objects: [{id: 1, type: 'Box', pos: [2, .5, 0], scale: [4, 1, 1]}, {id: 2, type: 'Box', pos: [4, 1.5, 0]}]},
        Hut: {attached: true, objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'Sphere', pos: [0, 1.5, 0]}]}},
    objects: [{id: 1, type: 'House', pos: [10, 0, 0]}, {id: 2, type: 'Box', pos: [-20, .5, 0]},
        {id: 3, type: 'Hut', pos: [0, 0, 10], rotation: [0, 90, 0]}, {id: 4, type: 'Sphere', pos: [3, 1, 3]}]});

const loadCode = `var level = JSON.parse(${JSON.stringify(fileText)});
    editorJSONFetched('levels/town.json', level); level3DLoad(level);`;

// in the VM: the problems with the live objects, as a list of strings
const checkCode = `(function()
{
    const problems = [], near = (a, b)=> Math.abs(a - b) < 1e-3;
    const nearV = (a, b)=> near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z);
    const objects = editor3DObjects(), ids = new Set(objects.map((o)=> o.id));
    if (ids.size !== objects.length) problems.push('duplicate ids');
    for (const [id, made] of editor3DInstances)
    {
        if (!ids.has(id)) problems.push('instance with no object ' + id);
        if (made.destroyed) problems.push('destroyed instance kept ' + id);
    }
    let expected = 0;
    const count = (o)=>
    {
        if (!o || o.destroyed) return;
        ++expected;
        for (const c of o.children) count(c);
        if (o instanceof Prefab3D && !o.attached) for (const p of o.parts) count(p);
    };
    for (const object of objects)
    {
        const made = editor3DInstances.get(object.id);
        if (!level3DTypes.has(object.type)) { if (made) problems.push('instance of unknown type ' + object.id); continue; }
        if (!made) { problems.push('no instance for ' + object.id + ' ' + object.type); continue; }
        count(made);
        if (made instanceof Prefab3D)
        {
            const prefab = level3DPrefabs.get(object.type);
            if (made.prefabName !== object.type) problems.push('prefab name ' + made.prefabName + ' for ' + object.type);
            if (prefab && made.parts.length !== prefab.objects.length && !editor3DPrefabStack.length)
                problems.push('parts ' + made.parts.length + ' of ' + prefab.objects.length + ' for ' + object.id);
            if (made.parts.some((p)=> p.destroyed)) problems.push('destroyed part in ' + object.id);
            if (!!prefab?.attached !== made.attached && !made.parent) problems.push('attached mismatch ' + object.id);
            // its origin is where the level says
            const origin = made.attached ? buildMatrix(made.pos3D, made.rotation3D, made.scale3D)
                .transformPoint(made.originOffset.scale(-1)) : made.pos3D;
            if (!made.attached && !nearV(origin, editor3DPos(object))) problems.push('prefab at wrong place ' + object.id);
            if (!made.attached)
                made.parts.forEach((part, i)=>
                {
                    const to = level3DPrefabPartTransform(made, made.partObjects[i]);
                    part instanceof Prefab3D || nearV(part.pos3D, to.pos) || problems.push('part off ' + object.id + '/' + i);
                });
        }
        else if (made instanceof EngineObject3D)
        {
            if (!nearV(made.pos3D, editor3DPos(object))) problems.push('at wrong place ' + object.id);
            const want = editor3DRotation(object).scale(PI / 180);
            if (!nearV(made.rotation3D, want)) problems.push('wrong rotation ' + object.id);
            const props = level3DProperties(level3DTypes.get(object.type), object);
            if (props.color && !made.color.equals?.(props.color) && made.color.toString() !== props.color.toString())
                problems.push('wrong color ' + object.id);
        }
    }
    const live = engineObjects.filter((o)=> !o.destroyed && !(o instanceof LensFlare3D) && o !== level3DVoxelMap && o !== level3DTerrainMap && !(o.parent && (o.parent === level3DVoxelMap || o.parent === level3DTerrainMap))).length;
    if (live !== expected) problems.push('live objects ' + live + ', expected ' + expected);
    if (!editor3DStroke)
    {
        const voxels = editor3DLevelPart('voxels'), vm = level3DVoxelMap && !level3DVoxelMap.destroyed ? level3DVoxelMap : undefined;
        if (!!voxels !== !!vm) problems.push('voxel map ' + !!vm + ' level ' + !!voxels);
        else if (vm && JSON.stringify(level3DVoxelsEncode(vm.data)) !== JSON.stringify(voxels.blocks)) problems.push('voxels differ');
        const terrain = editor3DLevelPart('terrain'), tm = level3DTerrainMap && !level3DTerrainMap.destroyed ? level3DTerrainMap : undefined;
        if (!!terrain !== !!tm) problems.push('terrain map ' + !!tm + ' level ' + !!terrain);
        else if (tm && tm.heights.some((row, r)=> row.some((v, c)=> Math.abs(v - terrain.heights[r][c]) > 1e-3)))
            problems.push('terrain heights differ');
        else if (tm && !!terrain.paint !== !!tm.colors) problems.push('terrain paint ' + !!terrain.paint + ' map colors ' + !!tm.colors);
        else if (tm && tm.colors)
        {
            const paint = level3DTerrainPaint(terrain, tm.rows * tm.columns);
            const palette = [level3DHexColor(terrain.color), ...paint.colors.map(level3DHexColor)];
            tm.colors.forEach((row, r)=> row.forEach((col, c)=> col.toString() === palette[paint.cells[r * tm.columns + c]].toString() || problems.push('terrain color ' + r + ',' + c)));
        }
    }
    if (!editor3DPrefabStack.length)
    {
        const own = editor3DLevelPart('prefabs') ?? {};
        for (const [name, p] of level3DPrefabs)
        {
            if (!p.fromLevel) continue;
            if (!own[name]) problems.push('registry has ' + name + ' the level does not');
            else if (JSON.stringify(p.objects) !== JSON.stringify(own[name].objects.filter((o)=> o && typeof o === 'object')))
                problems.push('registry ' + name + ' differs from the level');
            else if (!!p.attached !== !!own[name].attached) problems.push('registry attached ' + name);
        }
        for (const name in own) level3DPrefabs.get(name) || problems.push('level prefab not registered ' + name);
    }
    return problems;
})()`;

function rng(seed)
{
    let s = seed >>> 0 || 1;
    return ()=> ((s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) + 0x6d2b79f5 >>> 0) / 2 ** 32);
}

test('random edits keep the objects of the 3D editor in line with the level, and an autosave brings it all back', async ()=>
{
const failures = [];
const report = (text)=> failures.push(text);
for (let seed = 1; seed <= seeds; ++seed)
{
    const random = rng(seed * 7919), pick = (list)=> list[random() * list.length | 0];
    const storage = makeStorage();
    let { run } = await loadGame(storage);
    run(loadCode);
    const log = [];
    let failed = false;
    for (let step = 0; step < opsPerRun && !failed; ++step)
    {
        const ids = run('JSON.stringify(editor3DObjects().map((o)=> o.id))');
        const idList = JSON.parse(ids), id = pick(idList) ?? 0;
        const x = (random() * 20 - 10).toFixed(1), z = (random() * 20 - 10).toFixed(1);
        const depth = run('editor3DPrefabStack.length');
        const ops =
        {
            place: `editor3DPlace(${JSON.stringify(pick(['Box', 'Sphere', 'Cylinder']))}, vec3(${x}, 0, ${z}))`,
            placePrefab: `(()=>{ const names = editor3DPlaceNames().filter((n)=> level3DPrefabs.has(n));
                return names.length && editor3DPlace(names[${random() * 5 | 0} % names.length], vec3(${x}, 0, ${z})); })()`,
            move: `editor3DChange((list)=> { const o = list.find((o)=> o.id === ${id}); o &&
                editor3DSetTransform(o, vec3(${x}, ${(random() * 3).toFixed(1)}, ${z}), vec3(0, ${pick([0, 45, 90])}, 0),
                vec3(${pick([1, 2, .5])})); }); editor3DStrokeEnd()`,
            moveNoEnd: `editor3DChange((list)=> { const o = list.find((o)=> o.id === ${id}); o &&
                editor3DSetTransform(o, vec3(${x}, 1, ${z})); })`,
            cancel: `editor3DStrokeCancel()`,
            color: `editor3DChange((list)=> { const o = list.find((o)=> o.id === ${id}); o && !level3DPrefabs.has(o.type) &&
                editor3DSetProperty(o, 'color', hsl(${random().toFixed(2)}, 1, .5), level3DTypes.get(o.type)?.defaults.color); });
                editor3DStrokeEnd()`,
            remove: `editor3DSelection.clear(); editor3DSelection.add(${id}); editor3DDelete()`,
            duplicate: `editor3DSelection.clear(); editor3DSelection.add(${id}); editor3DDuplicate()`,
            undo: `editor3DUndo()`,
            redo: `editor3DUndo(true)`,
            makePrefab: `editor3DSelection.clear(); ${JSON.stringify(idList.filter(()=> random() < .4))}.forEach((i)=>
                editor3DSelection.add(i)); editor3DMakePrefab(${JSON.stringify(pick(['', '', 'House', 'Tower']))})`,
            unpack: `editor3DSelection.clear(); editor3DSelection.add(${id}); editor3DUnpack()`,
            attached: `(()=>{ const names = Object.keys(editor3DLevelPart('prefabs') ?? {});
                names.length && editor3DPrefabSetAttached(names[${random() * 5 | 0} % names.length], ${random() < .5}); })()`,
            scene: `editor3DChangeScene((s={})=> ({...s, fogColor: ${JSON.stringify(pick(['#ff0000', '#00ff00']))}})); editor3DStrokeEnd()`,
            enter: depth < 2 ? `editor3DPrefabEnter(${id})` : 'false',
            back: `editor3DPrefabBack()`,
            voxelAdd: `editor3DVoxelAdd(vec3(${pick([4, 5])}, 3, 4))`,
            voxelRemove: `editor3DVoxelRemove()`,
            voxelSet: `editor3DVoxelSet(vec3(${random() * 5 | 0}, ${random() * 3 | 0}, ${random() * 4 | 0}), ${pick([0, 1, 2, 7])}); ${random() < .8 ? 'editor3DStrokeEnd()' : ''}`,
            terrainAdd: `editor3DTerrainAdd(vec2(16), ${pick([4, 8])}, 4)`,
            terrainRemove: `editor3DTerrainRemove()`,
            sculpt: `editor3DTerrainSculpt(vec3(${x}, 0, ${z}), ${JSON.stringify(pick(['raise', 'lower', 'smooth', 'flatten']))}, .1, .5); ${random() < .8 ? 'editor3DStrokeEnd()' : ''}`,
            paint: `editor3DTerrainBrush.color = ${JSON.stringify(pick(['#ff0000', '#0000ff', '#00ff00']))}; editor3DTerrainPaintAt(vec3(${x}, 0, ${z}), ${random() < .3}); ${random() < .8 ? 'editor3DStrokeEnd()' : ''}`,
        };
        const names = Object.keys(ops), weights = {back: depth ? 3 : 0, enter: 2};
        const bag = names.flatMap((n)=> Array(weights[n] ?? 2).fill(n));
        const op = pick(bag);
        log.push(op + (op === 'move' || op === 'remove' || op === 'enter' || op === 'unpack' ? ' ' + id : ''));
        try { run(ops[op]); }
        catch (error) { report(`seed ${seed} step ${step} ${op} THREW ${error.message}`); failed = true; break; }
        const problems = run(`JSON.stringify(${checkCode})`);
        if (problems !== '[]')
        {
            report(`seed ${seed} step ${step} after ${op}: ${problems}\n  log: ${log.slice(-12).join(', ')}`);
            failed = true;
        }
    }
    if (!failed)
    {
        // close everything and reload from storage
        run('editor3DStrokeEnd(); while (editor3DPrefabBack()); editor3DAutosaveFlush()');
        const finalObjects = run('JSON.stringify(level.objects)'), finalPrefabs = run('JSON.stringify(level.prefabs ?? {})');
        const finalScene = run('JSON.stringify([level.scene, level.voxels, level.terrain])');
        ({ run } = await loadGame(storage));
        run(loadCode);
        const reObjects = run('JSON.stringify(level.objects)'), rePrefabs = run('JSON.stringify(level.prefabs ?? {})');
        const reScene = run('JSON.stringify([level.scene, level.voxels, level.terrain])');
        if (reObjects !== finalObjects || rePrefabs !== finalPrefabs || reScene !== finalScene)
        {
            report(`seed ${seed} reload differs\n  objects ${finalObjects}\n  reload  ${reObjects}` +
                `\n  prefabs ${finalPrefabs}\n  reload  ${rePrefabs}\n  scene ${finalScene} / ${reScene}\n  log: ${log.slice(-12).join(', ')}`);
            failed = true;
        }
        else
        {
            const problems = run(`JSON.stringify(${checkCode})`);
            if (problems !== '[]') { report(`seed ${seed} after reload: ${problems}`); failed = true; }
        }
    }
}
assert.deepEqual(failures, []);
});
