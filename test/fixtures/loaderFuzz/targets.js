// runs inside the vm after the engine and mutate.js: each target has a base value, a way to mutate it and a run
var targets = (function()
{
    class Coin extends EngineObject { constructor(pos) { super(pos, vec2(1)); } }
    let started = [];
    objectLayersAddType('Coin', Coin, {value: 1, tint: RED, offset: vec2(), tags: {}, list: [1, 2], name: 'c'});
    objectLayersAddType('Start', (pos)=> { started.push(pos); });

    const flip = (gid, h, v, d)=> (gid | (h ? 0x80000000 : 0) | (v ? 0x40000000 : 0) | (d ? 0x20000000 : 0)) >>> 0;
    const tiledBase = {width: 4, height: 3, tilewidth: 16, tileheight: 16, infinite: false, nextobjectid: 5,
        tilesets: [{firstgid: 1, name: 't', image: 't.png', imagewidth: 70, imageheight: 52, tilewidth: 16,
            tileheight: 16, margin: 1, spacing: 2, columns: 4, tilecount: 12}],
        layers: [
            {id: 1, type: 'tilelayer', name: 'Ground', width: 4, height: 3, opacity: 1, visible: true,
                tintcolor: '#80ff00ff', data: [1, 2, 0, 3, flip(1, 1), 0, flip(4, 0, 1, 1), 5, flip(2, 0, 0, 1), 0, 0, 1]},
            {id: 2, type: 'group', name: 'G', opacity: .5, layers: [
                {id: 3, type: 'tilelayer', name: 'Top', width: 4, height: 3, visible: false,
                    data: [0, 0, 7, 0, 0, 0, 0, 0, 0, 12, 0, 0]}]},
            {id: 4, type: 'objectgroup', name: 'Things', objects: [
                {id: 1, type: 'Coin', x: 8, y: 8, width: 16, height: 16, properties: [
                    {name: 'value', type: 'int', value: 3}, {name: 'tint', type: 'color', value: '#ff112233'},
                    {name: 'offset', type: 'string', value: '1,2'}, {name: 'tags', type: 'class', value: {a: 1}},
                    {name: 'list', type: 'string', value: 'x'}]},
                {id: 2, class: 'Start', x: 0, y: 40}]},
            {id: 5, type: 'imagelayer', name: 'Sky', image: 'sky.png'}]};

    const ldtkBase = {defs: {tilesets: [{uid: 7, relPath: 'art/t.png', pxWid: 32, pxHei: 32, tileGridSize: 16,
        __cWid: 2, __cHei: 2, padding: 0, spacing: 0}]},
        levels: [{identifier: 'L0', pxWid: 48, pxHei: 32, layerInstances: [
            {__type: 'Entities', __identifier: 'Things', __gridSize: 16, __cWid: 3, __cHei: 2, entityInstances: [
                {__identifier: 'Coin', px: [8, 8], __pivot: [.5, .5], width: 16, height: 16, fieldInstances: [
                    {__identifier: 'value', __type: 'Int', __value: 4}, {__identifier: 'tint', __type: 'Color', __value: '#00ff00'},
                    {__identifier: 'kind', __type: 'LocalEnum.Kind', __value: 'Gold'}]},
                {__identifier: 'Start', px: [40, 24], __pivot: [0, 1], width: 8, height: 8, fieldInstances: []}]},
            {__type: 'IntGrid', __identifier: 'Collisions', __gridSize: 16, __cWid: 3, __cHei: 2, __tilesetDefUid: 7,
                intGridCsv: [1, 0, 1, 1, 1, 1], autoLayerTiles: [{px: [0, 0], t: 1, f: 0}, {px: [16, 16], t: 2, f: 3, a: .5}]},
            {__type: 'Tiles', __identifier: 'Ground', __gridSize: 16, __cWid: 3, __cHei: 2, __tilesetDefUid: 7,
                __opacity: .8, gridTiles: [{px: [0, 0], t: 0, f: 0}, {px: [0, 0], t: 3, f: 1}, {px: [32, 16], t: 2, f: 2}]}]}]};

    level3DAddType('Crate', class extends EngineObject3D
    {
        constructor(pos, p) { super(pos, render3D.boxMesh, undefined, p.color); this.p = p; }
    }, {color: WHITE, weight: 2, size: vec3(1), uv: vec2(), tags: [], info: {}, label: 'x'});
    const level3DBase = {littlejs3D: 1,
        scene: {sky: ['#88aaff', '#ffffff', '#335533'], ambient: .4, sunDirection: [1, 2, 3], sunColor: '#ffeecc',
            fog: [10, 50], fogColor: '#aabbcc', shadows: true, lensFlare: true},
        voxels: {pos: [-4, 0, -4], size: [4, 3, 4], blocks: [16, 1, 8, 2, 4, 0, 20, 3]},
        terrain: {pos: [0, -1, 0], size: [20, 20], height: 4, color: '#448844',
            heights: [[0, .1, .2], [.3, .4, .5], [.6, .7, 1]], paint: {colors: ['#ff0000', '#0000ff'], cells: [3, 1, 2, 2, 4, 0]}},
        prefabs: {House: {objects: [{id: 1, type: 'Box', pos: [0, .5, 0], scale: [2, 1, 2]},
                {id: 2, type: 'Crate', pos: [1, 1, 0], properties: {weight: 3}}]},
            Hut: {attached: true, objects: [{id: 1, type: 'Box', pos: [0, .5, 0]}, {id: 2, type: 'House', pos: [0, 2, 0]}]}},
        objects: [
            {id: 1, type: 'Box', pos: [0, 0, 0], rotation: [0, 45, 0], scale: [1, 2, 1], properties: {color: '#ff0000', solid: false}},
            {id: 2, type: 'Sphere', pos: [3, 1, 0]},
            {id: 3, type: 'Light', pos: [0, 4, 0], rotation: [-90, 0, 0], properties: {cone: 30, radius: 8, shadows: true, lensFlare: true}},
            {id: 4, type: 'Crate', pos: [2, 0, 2], properties: {color: '#00ff0080', size: [1, 2, 3], uv: [1, 1], tags: ['a'], info: {k: 1}}},
            {id: 5, type: 'House', pos: [5, 0, 5], rotation: [0, 90, 0]},
            {id: 6, type: 'Hut', pos: [-5, 0, 5], scale: [2, 2, 2]},
            {id: 7, type: 'Cylinder', pos: [0, 0, -5]}]};

    // a glTF: a skinned quad with an animation, and a strip of a sparse accessor with no buffer under it
    function gltfBuild()
    {
        const parts = [], views = [], accessors = [];
        let length = 0;
        const add = (array, type, componentType, extra={})=>
        {
            const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            const at = length;
            parts.push([at, bytes]);
            length = at + bytes.length + 3 & ~3;
            views.push({buffer: 0, byteOffset: at, byteLength: bytes.length});
            accessors.push({bufferView: views.length - 1, componentType, type,
                count: array.length / {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[type], ...extra});
            return accessors.length - 1;
        };
        const POS = add(new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]), 'VEC3', 5126);
        const NOR = add(new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1]), 'VEC3', 5126);
        const UV = add(new Float32Array([0,0, 1,0, 1,1, 0,1]), 'VEC2', 5126);
        const IDX = add(new Uint16Array([0,1,2, 0,2,3]), 'SCALAR', 5123);
        const JNT = add(new Uint8Array([0,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0]), 'VEC4', 5121);
        const WGT = add(new Float32Array([1,0,0,0, 1,0,0,0, .5,.5,0,0, 1,0,0,0]), 'VEC4', 5126);
        const TIME = add(new Float32Array([0, .5, 1]), 'SCALAR', 5126);
        const TRN = add(new Float32Array([0,0,0, 0,1,0, 0,0,0]), 'VEC3', 5126);
        const ROT = add(new Float32Array([0,0,0,1, 0,.7071,0,.7071, 0,0,0,1]), 'VEC4', 5126);
        const COL = add(new Uint8Array([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,128]), 'VEC4', 5121, {normalized: true});
        const IBM = add(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1, 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-1,1]), 'MAT4', 5126);
        const SPI = add(new Uint32Array([2]), 'SCALAR', 5125);
        const SPV = add(new Float32Array([5, 5, 5]), 'VEC3', 5126);
        accessors.push({componentType: 5126, type: 'VEC3', count: 4,
            sparse: {count: 1, indices: {bufferView: accessors[SPI].bufferView, componentType: 5125},
                values: {bufferView: accessors[SPV].bufferView}}});
        const SPARSE = accessors.length - 1;
        const bin = new Uint8Array(length);
        for (const [at, bytes] of parts) bin.set(bytes, at);
        const json = {asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}],
            nodes: [{name: 'root', children: [1, 2, 4], translation: [0, 1, 0]}, {name: 'body', mesh: 0, skin: 0},
                {name: 'joint', translation: [0, 0, 1], rotation: [0, 0, 0, 1], children: [3]}, {name: 'tip', scale: [1, 0, 1]},
                {name: 'strip', mesh: 1, matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 2,0,0,1]}],
            meshes: [{primitives: [{attributes: {POSITION: POS, NORMAL: NOR, TEXCOORD_0: UV, JOINTS_0: JNT, WEIGHTS_0: WGT,
                COLOR_0: COL}, indices: IDX, material: 0}]},
                {primitives: [{attributes: {POSITION: SPARSE}, mode: 5, material: 1}, {attributes: {POSITION: POS}, mode: 6}]}],
            materials: [{pbrMetallicRoughness: {baseColorFactor: [1, .5, .5, 1], roughnessFactor: .5}, emissiveFactor: [.1, 0, 0],
                doubleSided: true}, {alphaMode: 'BLEND', pbrMetallicRoughness: {baseColorFactor: [1, 1, 1, .5]}}],
            skins: [{joints: [2, 3], inverseBindMatrices: IBM}],
            animations: [{name: 'wave', channels: [{sampler: 0, target: {node: 2, path: 'translation'}},
                {sampler: 1, target: {node: 3, path: 'rotation'}}, {sampler: 2, target: {node: 3, path: 'scale'}}],
                samplers: [{input: TIME, output: TRN}, {input: TIME, output: ROT, interpolation: 'LINEAR'},
                    {input: TIME, output: TRN, interpolation: 'STEP'}]}],
            accessors, bufferViews: views, buffers: [{byteLength: length}]};
        return {json, bin};
    }
    const gltf = gltfBuild();
    const base64 = (bytes)=> { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
    const gltfJSONBase = fuzz.clone(gltf.json);
    gltfJSONBase.buffers[0].uri = 'data:application/octet-stream;base64,' + base64(gltf.bin);
    function glb(json, bin)
    {
        const text = new TextEncoder().encode(JSON.stringify(json));
        const jsonLength = text.length + 3 & ~3, binLength = bin.length + 3 & ~3;
        const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength), view = new DataView(out.buffer);
        view.setUint32(0, 0x46546C67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
        view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4E4F534A, true);
        out.fill(32, 20, 20 + jsonLength); out.set(text, 20);
        view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004E4942, true);
        out.set(bin, 28 + jsonLength);
        return out.buffer;
    }
    const glbBase = glb(gltf.json, gltf.bin);

    async function gltfRun(v)
    {
        const model = await parseGLTF(v);
        const o = new GLTFObject(model);
        model.animations.length && o.play(0, true, 1.3);
        engineStep(3);
        o.getJointMatrix?.('joint');
        o.destroy();
        model.dispose();
        return {parts: model.parts.length, points: model.parts.reduce((n, p)=> n + p.mesh.points.length, 0)};
    }

    const objBase = ['# a cube corner', 'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 1', 'vt 0 0', 'vt 1 0',
        'vt 1 1', 'vn 0 0 1', 'vn 0 0 -1', 'f 1/1/1 2/2/1 3/3/1 4/1/1', 'f -1 -2 -3', 'f 1//2 3//2 5//2', 'f 2 3 5 4 1',
        'v 2 2 2 \\', '3'].map((line)=> line.split(' '));

    const atlasBase = {frames: {'run_0.png': {frame: {x: 0, y: 0, w: 8, h: 8}, sourceSize: {w: 8, h: 8},
            spriteSourceSize: {x: 0, y: 0}}, 'run_1.png': {frame: {x: 8, y: 0, w: 8, h: 8}, rotated: true},
            'run_2.png': {frame: {x: 16, y: 0, w: 8, h: 8}}, 'idle.png': {frame: {x: 0, y: 8, w: 6, h: 6},
            sourceSize: {w: 8, h: 8}, spriteSourceSize: {x: 1, y: 1}}, 'jump/0.png': {frame: {x: 0, y: 16, w: 8, h: 8}},
            'jump/1.png': {frame: {x: 8, y: 16, w: 8, h: 8}}},
        meta: {frameTags: [{name: 'walk', from: 0, to: 2, direction: 'pingpong'}, {name: 'up', from: 4, to: 5}]}};
    const atlasArrayBase = {frames: [{filename: 'a_0', frame: {x: 0, y: 0, w: 4, h: 4}}, {filename: 'a_1',
        frame: {x: 4, y: 0, w: 4, h: 4}}, {filename: 'b', frame: {x: 8, y: 0, w: 4, h: 4}, trimmed: true}]};

    const particleBase = {version: 1, effects: [
        {name: 'Fire', settings: {emitRate: 50, emitTime: 0, emitSize: .5, emitRect: true, emitHeight: .2, particleTime: .6,
            sizeStart: .3, sizeEnd: .1, colorStartA: [1, .5, 0, 1], colorEndB: [1, 0, 0, 0], speed: .05, angle: 4,
            collideLevel: true, shape: 'glow', localSpace: 1, trailScale: 2, tileIndex: 3},
            behaviors: [{name: 'wobble', strength: 2}, {name: 'stick', strength: 1}, {name: 'custom', strength: 3}]},
        {name: 'Puff\nline', settings: {emitTime: .2, shape: '', tileIndex: 2, tileSize: 8, tilePadding: 1}}]};

    // the 2D editor's autosave: a record for the url levels/a.json, made by the editor from the base map
    let autosave2DBase, autosave3DBase;
    if (debug)
    {
        const map = fuzz.clone(tiledBase);
        editorJSONFetched('levels/a.json', map);
        tileLayersLoad(map, tile(0, 16));
        objectLayersLoad(map);
        const record = editorMapList.find((r)=> r.map === map);
        const layers = editorTileLayerData(map.layers).map((l)=> [...l]);
        layers[0][2] = 9;
        autosave2DBase = {hash: record.hash, width: 4, height: 3, layers,
            objects: [[{...map.layers[2].objects[0], x: 24}, map.layers[2].objects[1]]], nextobjectid: 6};
        engineObjectsDestroy();
        const level = fuzz.clone(level3DBase);
        editorJSONFetched('levels/b.json', level);
        level3DLoad(level);
        const r3 = editor3DRecords.get(level);
        const objects = fuzz.clone(level.objects);
        objects[0].pos = [1, 2, 3];
        autosave3DBase = {hash: r3.hash, objects, scene: fuzz.clone(level.scene), voxels: fuzz.clone(level.voxels),
            terrain: fuzz.clone(level.terrain), prefabs: fuzz.clone(level.prefabs)};
        engineObjectsDestroy();
    }

    const list = {
        tiled: {base: tiledBase, run(v)
        {
            const layers = tileLayersLoad(v, tile(0, 16), 0, 'Ground');
            const made = objectLayersLoad(v);
            engineStep(2);
            return {layers: layers.filter(Boolean).length, made: made.length};
        }},
        ldtk: {base: ldtkBase, run(v)
        {
            const map = tileLayersFromLDtk(v, v?.levels?.[0]?.identifier ?? 0);
            const layers = tileLayersLoad(map, tile(0, 16), 0, 'Collisions');
            const made = objectLayersLoad(map);
            engineStep(2);
            return {layers: layers.filter(Boolean).length, made: made.length};
        }},
        level3d: {base: level3DBase, run(v)
        {
            const made = level3DLoad(v);
            engineStep(2);
            return {made: made.length, objects: engineObjects.length};
        }},
        gltf: {base: gltfJSONBase, run: gltfRun},
        glb: {base: glbBase, bytes: true, run: gltfRun},
        obj: {base: objBase, run(v)
        {
            const text = Array.isArray(v) ? v.map((l)=> Array.isArray(l) ? l.map(String).join(' ') : String(l)).join('\n') : String(v);
            const mesh = parseOBJ(text, v?.length % 2 === 0);
            mesh.center();
            mesh.getTriangles();
            return {points: mesh.points.length, indices: mesh.indices.length};
        }},
        atlas: {base: atlasBase, run(v) { return {groups: parseAtlas(v).length}; }},
        atlasArray: {base: atlasArrayBase, run(v) { return {groups: parseAtlas(v).length}; }},
        particles: {base: particleBase, run(v)
        {
            const effects = particleEffectsFromData(v);
            particleEffectsAdd(effects);
            for (const e of effects)
            {
                particleEffect(e, vec2(), {scale: 2});
                particleEffect3D(e.name, vec3(), {hue: .2});
            }
            engineStep(3);
            return {effects: effects.length};
        }},
        autosave2d: {base: autosave2DBase, debugOnly: true, run(v)
        {
            localStorage.setItem(editorSaveName(), JSON.stringify({'levels/a.json': v}));
            const map = fuzz.clone(tiledBase);
            editorJSONFetched('levels/a.json', map);
            const layers = tileLayersLoad(map, tile(0, 16));
            const made = objectLayersLoad(map);
            engineStep(1);
            const record = editorMapList.find((r)=> r.map === map);
            return {layers: layers.filter(Boolean).length, made: made.length, pending: !!record?.pending};
        }},
        autosave3d: {base: autosave3DBase, debugOnly: true, run(v)
        {
            localStorage.setItem(editor3DSaveName(), JSON.stringify({'levels/b.json': v}));
            const level = fuzz.clone(level3DBase);
            editorJSONFetched('levels/b.json', level);
            const made = level3DLoad(level);
            engineStep(1);
            return {made: made.length};
        }},
    };
    return list;
})();
