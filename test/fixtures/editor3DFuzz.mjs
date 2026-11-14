// The 3D level editor fuzz of test/editor3DFuzz.test.mjs, imported once for each set of flags in its url, as
// editor3DFuzz.mjs?mid&inplace, since the level file and the checks are made from them as it loads:
// - mid: the game changes sunColor and shadows mid level, fields no block in this fuzz sets, and the fog color and
//   the sun just before a scene edit; inplace: it changes them in place (setHSLA, set) as well, as a day cycle does
// - cube: scene edits with sky boxes, environments and lens flares, their loads landing on the next tick
// - big: a level whose autosave waits, a big terrain, and the reload at the end goes through another level loading
//   instead of a flush
import { loadEngine } from '../vmEngine.mjs';
const flags = new URL(import.meta.url).searchParams;
const MID = flags.has('mid'), INPLACE = flags.has('inplace'), CUBE = flags.has('cube'), BIG = flags.has('big');
const tick = ()=> new Promise((r)=> setTimeout(r, 0));

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
        var gameFog = render3D.fogColor.toString(), gameSun = render3D.sunDirection.copy();
        render3D.sunColor = hsl(.1, .5, .8); render3D.shadows = false;
        var gameSunColor = render3D.sunColor.toString(), gameShadows = false;
        var gameBox = {name: 'game', dispose() {}}; render3D.skyBox = ${CUBE ? 'gameBox' : 'undefined'};
        loadCubeMap = (urls)=> Promise.resolve({name: urls[0], dispose() { this.disposed = true; }});
        var urls = (n)=> [n, 'b', 'c', 'd', 'e', 'f'];`);
    return engine;
}

const bigRandom = rng(7);
const bigTerrain = {pos: [0, -2, 0], size: [40, 40], height: 8, color: '#6a9955',
    heights: Array.from({length: 129}, ()=> Array.from({length: 129}, ()=> Math.round(bigRandom() * 1e3) / 1e3))};
const fileText = JSON.stringify({littlejs3D: 1, ...(BIG ? {terrain: bigTerrain} : {}),
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
        if (render3D.sunColor.toString() !== gameSunColor) problems.push('sunColor ' + render3D.sunColor + ' want ' + gameSunColor);
        if (render3D.shadows !== gameShadows) problems.push('shadows ' + render3D.shadows + ' want ' + gameShadows);
        if ((render3D.skyBox?.name) !== (scene?.skyBox ? scene.skyBox[0] : ${CUBE ? "'game'" : 'undefined'}))
            problems.push('skyBox ' + render3D.skyBox?.name + ' want ' + (scene?.skyBox?.[0] ?? 'game'));
        if ((render3D.environment?.name) !== scene?.environment?.[0])
            problems.push('environment ' + render3D.environment?.name + ' want ' + scene?.environment?.[0]);
        const flares = engineObjects.filter((o)=> o instanceof LensFlare3D && !o.destroyed && !o.light).length;
        if (flares !== (scene?.lensFlare === true ? 1 : 0)) problems.push('flares ' + flares + ' want ' + (scene?.lensFlare === true ? 1 : 0));
        if (render3D.skyBox?.disposed || render3D.environment?.disposed) problems.push('disposed cube map on screen');
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

    // pass 11 extra: collision list, object list, maps put away, the game's held maps
    {
        const dupes = engineObjects.length - new Set(engineObjects).size;
        if (dupes) problems.push('engineObjects duplicates ' + dupes);
        const lv = render3DLevel;
        if (lv.length !== new Set(lv).size) problems.push('render3DLevel duplicates');
        for (const o of lv)
        {
            if (o.destroyed) problems.push('destroyed in render3DLevel ' + o.constructor.name);
            if (!engineObjects.includes(o)) problems.push('render3DLevel has one not in engineObjects ' + o.constructor.name);
        }
        const away = [...[...editor3DMapsRemoved.values()].flat(), ...editor3DPrefabStack.flatMap((f)=> f.maps)].filter((m)=> m);
        for (const m of away)
        {
            if (engineObjects.includes(m) && !m.destroyed) problems.push('away map in engineObjects ' + m.constructor.name);
            if (lv.includes(m)) problems.push('away map in render3DLevel ' + m.constructor.name);
            if (m.children.some((c)=> engineObjects.includes(c))) problems.push('away map child in engineObjects');
            if (m === level3DVoxelMap || m === level3DTerrainMap) problems.push('away map is the live map');
        }
        if (away.length !== new Set(away).size) problems.push('same map away twice');
        for (const m of [level3DVoxelMap, level3DTerrainMap])
        {
            if (!m || m.destroyed) continue;
            if (!engineObjects.includes(m)) problems.push('live map not in engineObjects ' + m.constructor.name);
            if (!lv.includes(m)) problems.push('live map not in render3DLevel ' + m.constructor.name);
            if (m.children.some((c)=> !engineObjects.includes(c) && !c.destroyed)) problems.push('live map child missing');
        }
        const allMaps = engineObjects.filter((o)=> !o.destroyed && (o instanceof VoxelMap || o instanceof HeightMap));
        for (const o of allMaps)
            if (o !== level3DVoxelMap && o !== level3DTerrainMap && !o.parent) problems.push('stray live map ' + o.constructor.name);
        // the game's held maps: a destroyed one is replaced by one of another shape only
        if (!editor3DPrefabStack.length)
        {
            const shapeT = (m)=> m && [m.pos3D.x, m.pos3D.y, m.pos3D.z, m.mapSize.x, m.mapSize.y, m.height, m.rows, m.columns].join();
            const shapeV = (m)=> m && [m.pos3D.x, m.pos3D.y, m.pos3D.z, m.mapSize.x, m.mapSize.y, m.mapSize.z].join();
            const T = level3DTerrainMap && !level3DTerrainMap.destroyed ? level3DTerrainMap : undefined;
            const V = level3DVoxelMap && !level3DVoxelMap.destroyed ? level3DVoxelMap : undefined;
            if (globalThis.heldT && globalThis.heldT.destroyed && T && T !== globalThis.heldT && shapeT(T) === globalThis.heldShapeT)
                problems.push('held terrain destroyed for one of the same shape');
            if (globalThis.heldV && globalThis.heldV.destroyed && V && V !== globalThis.heldV && shapeV(V) === globalThis.heldShapeV)
                problems.push('held voxels destroyed for one of the same shape');
            for (const [h, cur, name] of [[globalThis.heldT, T, 'terrain'], [globalThis.heldV, V, 'voxels']])
                if (h && !h.destroyed && cur && cur !== h && (editor3DMapsRemoved.get(name) ?? []).includes(h) &&
                    (name === 'terrain' ? shapeT(h) === shapeT(cur) : shapeV(h) === shapeV(cur)))
                    problems.push('held ' + name + ' kept and fits, but another is live');
            if (T) globalThis.heldT = T, globalThis.heldShapeT = shapeT(T);
            if (V) globalThis.heldV = V, globalThis.heldShapeV = shapeV(V);
        }
    }
    return problems;
})()`;

function rng(seed)
{
    let s = seed >>> 0 || 1;
    return ()=> ((s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) + 0x6d2b79f5 >>> 0) / 2 ** 32);
}

export async function fuzz(gameScene, seeds, opsPerRun, firstSeed=1)
{
const failures = [];
const counts = {};
for (let seed = firstSeed; seed < firstSeed + seeds; ++seed)
{
    const random = rng(seed * 104729), pick = (list)=> list[random() * list.length | 0];
    const num = (lo, hi, digits=1)=> (lo + random() * (hi - lo)).toFixed(digits);
    const storage = makeStorage();
    let { run } = await loadGame(storage);
    run(loadCode); await tick();
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
                `{...s, fogColor: undefined, sky: undefined}`, `undefined`,
                ...(CUBE ? [`{...s, skyBox: urls('${pick(['K1', 'K2', 'K3', 'K4', 'K5', 'K6'])}')}`,
                    `{...s, environment: urls('${pick(['K1', 'K2', 'E1'])}')}`, `{...s, skyBox: undefined}`,
                    `{...s, environment: undefined}`, `{...s, lensFlare: ${random() < .6}}`, `{...s, lensFlare: undefined}`] : [])])}));
                editor3DStrokeEnd()`,
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
            reload: 'while (editor3DPrefabBack()); engineObjectsDestroy(); level3DLoad(level); globalThis.heldT = globalThis.heldV = undefined',
            // Reset to file, which applies the whole scene again, and the editor closed and opened, from full pass 10
            revert: 'while (editor3DPrefabBack()); editor3DRevert()',
            closeOpen: 'editor3DStrokeEnd(); editor3DSetOpen(false); editor3DSetOpen(true)',

            restartKey: `while (editor3DPrefabBack()); levelEditor.onRestart = ()=> { engineObjectsDestroy(); level3DLoad(level); };
                editor3DRestart(); globalThis.heldT = globalThis.heldV = undefined; editor3DSetOpen(true)`,
            restartNoKey: `while (editor3DPrefabBack()); setDebugKey(''); levelEditor.onRestart = ()=> { engineObjectsDestroy(); level3DLoad(level); };
                editor3DRestart(); globalThis.heldT = globalThis.heldV = undefined;
                { const open = editor3DIsOpen; setDebugKey('Escape'); if (!open) throw new Error('no debug key restart closed the editor'); }`,
            playFrames: `editor3DStrokeEnd(); editor3DSetOpen(false); engineStep(${1 + (random() * 4 | 0)}); editor3DSetOpen(true)`,
            resizeUndo: `editor3DVoxelResize(vec3(${pick([3, 6, 9])}, ${pick([2, 3])}, ${pick([4, 6])})) && (editor3DUndo(), ${random() < .5 ? 'editor3DUndo(true)' : '0'})`,
            resizeBurst: `for (const s of [[3,2,3],[7,3,5],[4,4,4],[9,2,9],[5,3,6],[6,3,4]].slice(0, ${2 + (random() * 2 | 0)})) editor3DVoxelResize(vec3(...s)); ${random() < .7 ? 'for (let i = 6; i--;) editor3DUndo()' : ''}`,
            terrainShape: `editor3DTerrainRemove(); editor3DTerrainAdd(vec2(${pick([8, 16, 24])}), ${pick([2, 4, 8])}, ${pick([2, 4])}); ${random() < .6 ? 'editor3DUndo(); editor3DUndo()' : ''}`,
        };
        // GAME_SCENE=1: the game sets its own fog color and sun in code before loading the level again (finding G1)
        ops.gameSceneReload = `while (editor3DPrefabBack()); render3D.fogColor = hsl(${num(0, 1, 2)}, 1, .5);
            render3D.sunDirection = vec3(${num(-1, 1)}, 1, 0); gameFog = render3D.fogColor.toString();
            gameSun = render3D.sunDirection.copy(); engineObjectsDestroy(); level3DLoad(level); globalThis.heldT = globalThis.heldV = undefined`;
        const inPlace = INPLACE && random() < .5;
        // the game changes fields no block here sets, mid level, with the editor open or not
        ops.gameMid = inPlace ? `render3D.sunColor.setHSLA(${num(0, 1, 2)}, .5, .7); gameSunColor = render3D.sunColor.toString()` :
            `render3D.sunColor = hsl(${num(0, 1, 2)}, .5, .7); gameSunColor = render3D.sunColor.toString();
            render3D.shadows = gameShadows = ${random() < .5}`;
        // the game changes fog color and sun mid level, then the editor edits the scene, which applies the block again
        ops.gameMidScene = `while (editor3DPrefabBack()); ${inPlace ?
            `render3D.fogColor.setHSLA(${num(0, 1, 2)}, 1, .5); render3D.sunDirection.set(${num(-1, 1)}, 1, 0);` :
            `render3D.fogColor = hsl(${num(0, 1, 2)}, 1, .5); render3D.sunDirection = vec3(${num(-1, 1)}, 1, 0);`}
            gameFog = render3D.fogColor.toString(); gameSun = render3D.sunDirection.copy();
            ${ops.scene}; editor3DSetPart('scene', editor3DLevelPart('scene'))`;
        const names = Object.keys(ops), weights = {restartKey: 1, restartNoKey: 1, playFrames: 2, back: depth ? 3 : 0, enter: 2, reload: 1, revert: 1, closeOpen: 1,
            gameSceneReload: gameScene ? 2 : 0, gameMid: MID ? 2 : 0, gameMidScene: MID ? 2 : 0, scene: CUBE ? 4 : 2};
        const bag = names.flatMap((n)=> Array(weights[n] ?? 2).fill(n));
        const op = pick(bag);
        counts[op] = (counts[op] ?? 0) + 1;
        log.push(op + ' ' + id);
        try { run(ops[op]); CUBE && await tick(); }
        catch (error) { failures.push(`seed ${seed} step ${step} ${op} THREW ${error.message}\n  ${ops[op].slice(0, 400)}\n  log: ${log.slice(-12).join(', ')}`); failed = true; break; }
        const problems = run(`JSON.stringify(${checkCode})`);
        if (problems !== '[]')
        {
            failures.push(`seed ${seed} step ${step} after ${op}: ${problems}
  log: ${log.slice(-12).join(", ")}
  op: ${ops[op].slice(0, 700)}
  diag: ${run("JSON.stringify({scene: editor3DLevelPart(\"scene\"), set: [...level3DSceneSet].map(([k, v])=> [k, String(v.before), String(v.after)]), pending: !!editor3DRecords.get(editor3DLevel)?.pending, depth: editor3DPrefabStack.length, stroke: !!editor3DStroke})")}`);
            failed = true;
        }
    }
    if (!failed)
    {
        run(BIG ? 'editor3DStrokeEnd(); while (editor3DPrefabBack()); var other = level3DLoad({objects: []})' :
            'editor3DStrokeEnd(); while (editor3DPrefabBack()); editor3DAutosaveFlush()');
        const finalAll = run('JSON.stringify([level.objects, level.prefabs ?? {}, level.scene, level.voxels, level.terrain])');
        ({ run } = await loadGame(storage));
        run(loadCode); await tick();
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

