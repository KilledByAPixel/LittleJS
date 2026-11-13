import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A seeded fuzz of the 3D level editor, from full passes 7 and 8: place, move, set a property, delete, duplicate, undo,
// redo, make a prefab, unpack, attached, entering a prefab two deep and back, block maps with box fill and resize,
// terrain sculpt, flatten, paint and erase, own-axes drags, body drags and landing, Place by ray, Drop, copy, cut and
// paste, Load prefab file, scene edits, and a reload of the page. After each operation the live objects must match
// the level: one live instance per object, none extra, at the level's place, a prefab instance with a part for each
// of its objects, the prefab registry, the block map and the terrain in line, and the renderer showing the level's
// scene, or the game's own inside a prefab or with no block. At the end, with every prefab closed, a fresh engine on
// the same storage loads the same file and must get the level back from the autosave. The prefab, autosave and scene
// paths broke in earlier passes; the game sets a scene of its own, and one run changes it while the editor works.




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
    // the game's own scene, set before the level loads
    engine.run(`render3D.setFog(5, 500, hsl(0, 0, .5)); render3D.sunDirection = vec3(0, 1, 0);
        var gameFog = render3D.fogColor.toString(), gameSun = render3D.sunDirection.copy();`);
    return engine;
}

const fileText = JSON.stringify({littlejs3D: 1,
    prefabs: {House: {objects: [{id: 1, type: 'Box', pos: [2, .5, 0], scale: [4, 1, 1]}, {id: 2, type: 'Box', pos: [4, 1.5, 0]}]},
        Hut: {attached: true, objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'Sphere', pos: [0, 1.5, 0]}]}},
    scene: {fogColor: '#00ff00', fog: [1, 99]},
    objects: [{id: 1, type: 'House', pos: [10, 0, 0]}, {id: 2, type: 'Box', pos: [-20, .5, 0]},
        {id: 3, type: 'Hut', pos: [0, 0, 10], rotation: [0, 90, 0]}, {id: 4, type: 'Sphere', pos: [3, 1, 3]},
        {id: 5, type: 'Box', pos: [0, .5, 0], rotation: [0, 30, 0]}]});

const loadCode = `var level = JSON.parse(${JSON.stringify(fileText)});
    editorJSONFetched('levels/town.json', level); level3DLoad(level);`;

// the checks of test/editor3DFuzz.test.mjs, plus the renderer's scene
const checkCode = `(function()
{
    const problems = [], near = (a, b)=> Math.abs(a - b) < 1e-3;
    const nearV = (a, b)=> near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z);
    const objects = editor3DObjects(), ids = new Set(objects.map((o)=> o.id));
    if (ids.size !== objects.length) problems.push('duplicate ids');
    if (objects.some((o)=> !level3DFinite(o.id))) problems.push('bad id');
    for (const o of objects)
        for (const k of ['pos', 'rotation', 'scale'])
            if (o[k] && !(o[k].length === 3 && o[k].every(level3DFinite))) problems.push('bad ' + k + ' ' + o.id);
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
            if (prefab && made.parts.length !== prefab.objects.filter((o)=> level3DTypes.has(o.type)).length && !editor3DPrefabStack.length)
                problems.push('parts ' + made.parts.length + ' of ' + prefab.objects.length + ' for ' + object.id);
            if (made.parts.some((p)=> p.destroyed)) problems.push('destroyed part in ' + object.id);
            if (!!prefab?.attached !== made.attached && !made.parent) problems.push('attached mismatch ' + object.id);
            if (!made.attached && !nearV(made.pos3D, editor3DPos(object))) problems.push('prefab at wrong place ' + object.id);
            if (made.attached)
            {
                const origin = buildMatrix(made.pos3D, made.rotation3D, made.scale3D).transformPoint(made.originOffset.scale(-1));
                if (!nearV(origin, editor3DPos(object))) problems.push('attached prefab origin off ' + object.id);
            }
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
            const base = level3DBaseScale.get(made) ?? vec3(1);
            if (!nearV(made.scale3D, base.multiply(editor3DScale(object)))) problems.push('wrong scale ' + object.id);
            const props = level3DProperties(level3DTypes.get(object.type), object);
            if (props.color && made.color.toString() !== props.color.toString())
                problems.push('wrong color ' + object.id);
        }
    }
    const live = engineObjects.filter((o)=> !o.destroyed && !(o instanceof LensFlare3D) && o !== level3DVoxelMap && o !== level3DTerrainMap && !(o.parent && (o.parent === level3DVoxelMap || o.parent === level3DTerrainMap))).length;
    if (live !== expected) problems.push('live objects ' + live + ', expected ' + expected);
    const maps = engineObjects.filter((o)=> !o.destroyed && (o instanceof VoxelMap || o instanceof HeightMap) && !o.parent);
    if (maps.length > 2) problems.push('maps leaked ' + maps.length);
    if (!editor3DStroke)
    {
        const voxels = editor3DLevelPart('voxels'), vm = level3DVoxelMap && !level3DVoxelMap.destroyed ? level3DVoxelMap : undefined;
        if (!!voxels !== !!vm) problems.push('voxel map ' + !!vm + ' level ' + !!voxels);
        else if (vm && JSON.stringify(level3DVoxelsEncode(vm.data)) !== JSON.stringify(voxels.blocks)) problems.push('voxels differ');
        else if (vm && (vm.mapSize.x !== voxels.size[0] || vm.mapSize.y !== voxels.size[1] || vm.mapSize.z !== voxels.size[2] ||
            vm.pos3D.x !== voxels.pos[0] || vm.pos3D.z !== voxels.pos[2])) problems.push('voxel shape differs');
        const terrain = editor3DLevelPart('terrain'), tm = level3DTerrainMap && !level3DTerrainMap.destroyed ? level3DTerrainMap : undefined;
        if (!!terrain !== !!tm) problems.push('terrain map ' + !!tm + ' level ' + !!terrain);
        else if (tm && tm.heights.some((row, r)=> row.some((v, c)=> Math.abs(v - terrain.heights[r][c]) > 1e-3)))
            problems.push('terrain heights differ');
        else if (tm && !!terrain.paint !== !!tm.colors) problems.push('terrain paint ' + !!terrain.paint + ' map colors ' + !!tm.colors);
        else if (tm && tm.colors)
        {
            const paint = level3DTerrainPaint(terrain, tm.rows * tm.columns);
            if (!paint) problems.push('terrain paint unreadable');
            else
            {
                const palette = [level3DHexColor(terrain.color), ...paint.colors.map(level3DHexColor)];
                if (paint.colors.length && !paint.colors.every((c, i)=> paint.cells.includes(i + 1))) problems.push('unused paint color kept');
                tm.colors.forEach((row, r)=> row.forEach((col, c)=> col.toString() === palette[paint.cells[r * tm.columns + c]].toString() || problems.push('terrain color ' + r + ',' + c)));
            }
        }
        // the renderer shows the level's scene, the game's own where the block says nothing, and inside a prefab
        const scene = editor3DPrefabStack.length ? undefined : editor3DLevelPart('scene');
        const sky = scene?.sky && scene.sky.map(level3DHexColor);
        const fogWant = scene?.fogColor ? level3DHexColor(scene.fogColor).toString() :
            sky && sky.every((c)=> c) ? sky[1].toString() : gameFog;
        if (render3D.fogColor.toString() !== fogWant) problems.push('fog color ' + render3D.fogColor + ' want ' + fogWant);
        const fogRange = scene?.fog ?? [5, 500];
        if (render3D.fogStart !== fogRange[0] || render3D.fogEnd !== fogRange[1]) problems.push('fog range ' + render3D.fogStart + ',' + render3D.fogEnd);
        const sun = scene?.sunDirection ? vec3(...scene.sunDirection) : gameSun;
        if (!nearV(render3D.sunDirection, sun)) problems.push('sun ' + render3D.sunDirection);
        if (!!sky !== !!render3D.sky) problems.push('sky ' + !!render3D.sky + ' level ' + !!sky);
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

async function fuzz(gameScene, seeds, opsPerRun, firstSeed=1)
{
const failures = [];
const counts = {};
for (let seed = firstSeed; seed < firstSeed + seeds; ++seed)
{
    const random = rng(seed * 104729), pick = (list)=> list[random() * list.length | 0];
    const num = (lo, hi, digits=1)=> (lo + random() * (hi - lo)).toFixed(digits);
    const storage = makeStorage();
    let { run } = await loadGame(storage);
    run(loadCode);
    const log = [];
    let failed = false;
    for (let step = 0; step < opsPerRun && !failed; ++step)
    {
        const idList = JSON.parse(run('JSON.stringify(editor3DObjects().map((o)=> o.id))'));
        const id = pick(idList) ?? 0;
        const x = num(-10, 10), z = num(-10, 10);
        const depth = run('editor3DPrefabStack.length');
        const select = `editor3DSelection.clear(); ${JSON.stringify(idList.filter(()=> random() < .35).concat(id))}.forEach((i)=> editor3DObject(i) && editor3DSelection.add(i));`;
        const end = random() < .8 ? 'editor3DStrokeEnd()' : random() < .5 ? 'editor3DStrokeCancel()' : '';
        const ops =
        {
            place: `editor3DPlace(${JSON.stringify(pick(['Box', 'Sphere', 'Cylinder']))}, vec3(${x}, 0, ${z}))`,
            placeLand: `editor3DPlaceAt(${JSON.stringify(pick(['Box', 'Sphere', 'Cylinder', 'House', 'Hut']))},
                new Ray3D(vec3(${x}, 30, ${z}), vec3(0, -1, 0)))`,
            move: `editor3DChange((list)=> { const o = list.find((o)=> o.id === ${id}); o &&
                editor3DSetTransform(o, vec3(${x}, ${num(0, 3)}, ${z}), vec3(${pick([0, 20])}, ${pick([0, 45, 90])}, 0),
                vec3(${pick([1, 2, .5])})); }); editor3DStrokeEnd()`,
            undo: `editor3DUndo()`,
            redo: `editor3DUndo(true)`,
            remove: `${select} editor3DDelete()`,
            duplicate: `${select} editor3DDuplicate()`,
            copyPaste: `${select} editor3DCopySelection(); editor3DPaste(vec3(${num(-3, 3)}, ${pick([0, 1])}, ${num(-3, 3)}))`,
            cutPaste: `${select} editor3DCut(); ${random() < .7 ? `editor3DPaste(vec3(${num(-3, 3)}, 0, 0))` : ''}`,
            paste: `editor3DPaste(vec3(${num(-5, 5)}, 0, ${num(-5, 5)}))`,
            drop: `${select} editor3DDropSelection()`,
            ownAxesArrow: `(()=>{ ${select} editor3DLocalAxes = ${random() < .7};
                const first = editor3DSelected()[0]; if (!first) return;
                const rotation = editor3DRotation(first).scale(PI / 180), frame = buildMatrix(vec3(), rotation);
                const axis = ${JSON.stringify(pick(['x', 'y', 'z']))};
                const direction = editor3DLocalAxes ? frame.transformDirection(EDITOR3D_AXES[axis]) : EDITOR3D_AXES[axis];
                const center = editor3DSelectionCenter();
                const handle = {kind: 'arrow', axis, center, length: 1, direction, turn: editor3DLocalAxes ? rotation : undefined};
                const eye = center.add(vec3(7, 9, 11));
                const ray = (p)=> new Ray3D(eye, p.subtract(eye).normalize());
                const grab = editor3DAxisDistance(ray(center), center, direction);
                const drag = {kind: 'arrow', handle, from: vec2(), grab, start: editor3DDragStart()};
                editor3DDragTo(drag, vec2(), ray(center.add(direction.scale(${num(-4, 4)}))), ${random() < .5});
                ${end}; })()`,
            ownAxesPlane: `(()=>{ ${select} editor3DLocalAxes = ${random() < .7};
                const first = editor3DSelected()[0]; if (!first) return;
                const rotation = editor3DRotation(first).scale(PI / 180), frame = buildMatrix(vec3(), rotation);
                const way = (k)=> editor3DLocalAxes ? frame.transformDirection(EDITOR3D_AXES[k]) : EDITOR3D_AXES[k];
                const center = editor3DSelectionCenter(), direction = way('y');
                const handle = {kind: 'plane', axis: 'xz', center, length: 1, direction, turn: editor3DLocalAxes ? rotation : undefined,
                    across: 'y', ways: [way('x'), way('z')]};
                const eye = center.add(vec3(3, 12, 5));
                const ray = (p)=> new Ray3D(eye, p.subtract(eye).normalize());
                const grab = editor3DPlanePoint(ray(center), center, direction);
                const drag = {kind: 'plane', handle, from: vec2(), grab, start: editor3DDragStart()};
                editor3DDragTo(drag, vec2(), ray(center.add(way('x').scale(${num(-3, 3)})).add(way('z').scale(${num(-3, 3)}))), ${random() < .5});
                ${end}; })()`,
            bodyDrag: `(()=>{ editor3DSelection.clear(); editor3DSelection.add(${id}); const o = editor3DObject(${id}); if (!o) return;
                editor3DGroundSnap = ${random() < .8};
                const pos = editor3DPos(o), eye = pos.add(vec3(0, 15, 6));
                const ray = (p)=> new Ray3D(eye, p.subtract(eye).normalize());
                const drag = {kind: 'body', id: ${id}, from: vec2(), moving: true, ignore: editor3DSelectedInstances(), normal: EDITOR3D_UP,
                    start: editor3DDragStart(), level: pos};
                editor3DDragTo(drag, vec2(9), ray(pos.add(vec3(${num(-6, 6)}, 0, ${num(-6, 6)}))), ${random() < .5});
                ${end}; })()`,
            rotateScale: `(()=>{ ${select} const s = editor3DDragStart(); editor3DChange((list)=> { for (const o of list) { const w = s.get(o.id); w &&
                editor3DSetTransform(o, undefined, w.rotation.add(vec3(0, ${pick([15, 90, -45])}, ${pick([0, 30])})), w.scale.multiply(vec3(${pick([1, 2, -1])}, 1, ${pick([1, .5])}))); } }); ${end}; })()`,
            color: `editor3DChange((list)=> { const o = list.find((o)=> o.id === ${id}); o && !level3DPrefabs.has(o.type) &&
                editor3DSetProperty(o, 'color', hsl(${num(0, 1, 2)}, 1, .5), level3DTypes.get(o.type)?.defaults.color); });
                editor3DStrokeEnd()`,
            makePrefab: `${select} editor3DMakePrefab(${JSON.stringify(pick(['', '', 'House', 'Tower']))})`,
            unpack: `${select} editor3DUnpack()`,
            attached: `(()=>{ const names = Object.keys(editor3DLevelPart('prefabs') ?? {});
                names.length && editor3DPrefabSetAttached(names[${random() * 5 | 0} % names.length], ${random() < .5}); })()`,
            loadPrefab: `editor3DPrefabLoad(${JSON.stringify(pick(['Shed', 'House', 'Hut', 'Box', 'Tower', 'Loop']))},
                ${JSON.stringify(pick([
                    JSON.stringify({objects: [{type: 'Box', pos: [0, .5, 0]}, {type: 'Cylinder', pos: [1, 1, 0], rotation: [0, 45, 0]}]}),
                    JSON.stringify({attached: true, objects: [{id: 3, type: 'Sphere', pos: [0, 1, 0]}, {id: 3, type: 'Box', pos: [2, .5, 0]}]}),
                    JSON.stringify({objects: [{type: 'House', pos: [0, 0, 0]}, {type: 'Loop'}]}),
                    'not json', JSON.stringify({objects: 5})]))}); editor3DBrush = undefined`,
            scene: `editor3DChangeScene((s={})=> (${pick([
                `{...s, fogColor: '#ff0000'}`, `{...s, fog: [${num(0, 5)}, ${num(20, 90)}]}`,
                `{...s, sunDirection: [${num(-1, 1)}, 1, ${num(-1, 1)}]}`, `{...s, sky: ['#3366ff', '#aaccff', '#446644']}`,
                `{...s, fogColor: undefined, sky: undefined}`, `undefined`])})); editor3DStrokeEnd()`,
            enter: depth < 2 ? `(()=>{ const ids = editor3DObjects().filter((o)=> level3DPrefabs.has(o.type)).map((o)=> o.id);
                return ids.length && editor3DPrefabEnter(ids[${random() * 9 | 0} % ids.length]); })()` : 'false',
            back: `editor3DPrefabBack()`,
            voxelAdd: `editor3DVoxelAdd(vec3(${pick([4, 5, 6])}, 3, ${pick([4, 5])}))`,
            voxelRemove: `editor3DVoxelRemove()`,
            voxelSet: `editor3DVoxelSet(vec3(${random() * 6 | 0}, ${random() * 3 | 0}, ${random() * 5 | 0}), ${pick([0, 1, 2, 7])}); ${end}`,
            voxelBox: `(()=>{ const map = editor3DVoxelMap(); if (!map) return;
                editor3DBlockType = ${pick([1, 3])};
                const start = vec3(${random() * 6 | 0}, ${random() * 3 | 0}, ${random() * 5 | 0});
                const drag = {kind: 'blocks', mode: ${JSON.stringify(pick(['place', 'paint', 'remove']))}, axis: 'y', plane: start.y, layer: start.y,
                    last: start, start, grow: ${pick([1, -1])}, height: ${pick([1, 2, 3])}, changed: new Map, region: undefined};
                editor3DVoxelBoxTo(drag, vec3(${random() * 7 | 0}, start.y, ${random() * 6 | 0}));
                editor3DVoxelBoxTo(drag, vec3(${random() * 7 | 0}, start.y, ${random() * 6 | 0}));
                ${end}; })()`,
            voxelResize: `editor3DVoxelResize(vec3(${pick([1, 3, 5, 8])}, ${pick([1, 2, 4])}, ${pick([2, 5, 7])}))`,
            terrainAdd: `editor3DTerrainAdd(vec2(16), ${pick([4, 8])}, 4)`,
            terrainRemove: `editor3DTerrainRemove()`,
            terrainStroke: `(()=>{ ${pick([0, 1, 2]) ? '' : 'editor3DStrokeEnd();'}
                editor3DTerrainBrush.size = ${pick([3, 8])}; editor3DTerrainBrush.color = ${JSON.stringify(pick(['#ff0000', '#0000ff', '#00ff00', '#FF0000']))};
                editor3DTerrainSculpt(vec3(${x}, 0, ${z}), ${JSON.stringify(pick(['raise', 'lower', 'smooth', 'flatten']))}, .1, ${num(0, 1, 2)});
                editor3DTerrainPaintAt(vec3(${num(-8, 8)}, 0, ${num(-8, 8)}), ${random() < .3});
                editor3DTerrainSculpt(vec3(${num(-8, 8)}, 0, ${num(-8, 8)}), 'flatten', .2, ${num(0, 1, 2)});
                ${end}; })()`,
            // the game restarting the same level, as onRestart does: what it made goes, then the level loads again
            reload: 'while (editor3DPrefabBack()); engineObjectsDestroy(); level3DLoad(level)',
        };
        // GAME_SCENE=1: the game sets its own fog color and sun in code before loading the level again (finding G1)
        ops.gameSceneReload = `while (editor3DPrefabBack()); render3D.fogColor = hsl(${num(0, 1, 2)}, 1, .5);
            render3D.sunDirection = vec3(${num(-1, 1)}, 1, 0); gameFog = render3D.fogColor.toString();
            gameSun = render3D.sunDirection.copy(); engineObjectsDestroy(); level3DLoad(level)`;
        const names = Object.keys(ops), weights = {back: depth ? 3 : 0, enter: 2, reload: 1,
            gameSceneReload: gameScene ? 2 : 0};
        const bag = names.flatMap((n)=> Array(weights[n] ?? 2).fill(n));
        const op = pick(bag);
        counts[op] = (counts[op] ?? 0) + 1;
        log.push(op + ' ' + id);
        try { run(ops[op]); }
        catch (error) { failures.push(`seed ${seed} step ${step} ${op} THREW ${error.message}\n  ${ops[op].slice(0, 400)}\n  log: ${log.slice(-12).join(', ')}`); failed = true; break; }
        const problems = run(`JSON.stringify(${checkCode})`);
        if (problems !== '[]')
        {
            failures.push(`seed ${seed} step ${step} after ${op}: ${problems}\n  log: ${log.slice(-12).join(', ')}`);
            failed = true;
        }
    }
    if (!failed)
    {
        run('editor3DStrokeEnd(); while (editor3DPrefabBack()); editor3DAutosaveFlush()');
        const finalAll = run('JSON.stringify([level.objects, level.prefabs ?? {}, level.scene, level.voxels, level.terrain])');
        ({ run } = await loadGame(storage));
        run(loadCode);
        const reAll = run('JSON.stringify([level.objects, level.prefabs ?? {}, level.scene, level.voxels, level.terrain])');
        if (reAll !== finalAll)
            failures.push(`seed ${seed} reload differs\n  ${finalAll.slice(0, 600)}\n  ${reAll.slice(0, 600)}\n  log: ${log.slice(-12).join(', ')}`);
        else
        {
            const problems = run(`JSON.stringify(${checkCode})`);
            if (problems !== '[]') failures.push(`seed ${seed} after reload: ${problems}`);
        }
    }
}
return failures;
}

test('random edits keep the objects of the 3D editor in line with the level, and an autosave brings it all back', async ()=>
{
    assert.deepEqual(await fuzz(false, 12, 60), []);
});

test('the same with the game changing its own scene while the editor works', async ()=>
{
    assert.deepEqual(await fuzz(true, 12, 60, 101), []);
});
