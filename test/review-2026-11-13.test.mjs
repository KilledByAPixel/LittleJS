import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine } from './vmEngine.mjs';

// The external review of 2026-11-13: attached prefabs and the level shapes under their parts, a type taking a
// level prefab's name, property types in a level and from code, a video stopped while the page is hidden, the FAQ's
// music and on screen answers, and an Aseprite tag's direction

const builds = ['littlejs.js', 'littlejs.release.js'];
const engine3D = (file)=>
{
    const { run } = loadEngine({}, '', file);
    run('setHeadlessMode(true); new Render3DPlugin');
    return run;
};

test('an attached prefab\'s mesh collision part blocks nothing, a prefab of separate parts keeps it', ()=>
{
    for (const file of builds)
    {
        const run = engine3D(file);
        const heights = JSON.parse(run(`
            level3DAddMesh('Floor', buildBox(vec3(4, 1, 4)), undefined, WHITE, true);
            level3DAddPrefab('Attached', {attached: true, objects: [{type: 'Floor'}]});
            level3DAddPrefab('Separate', {objects: [{type: 'Floor'}]});
            render3D.gravity = vec3();
            const drop = (x)=>
            {
                const body = new EngineObject3D(vec3(x, .6, 0));
                body.size3D = vec3(1); body.mass = 1; body.setCollision();
                body.updatePhysics();
                return body.pos3D.y;
            };
            level3DSpawn('Attached', vec3(20, 0, 0));
            level3DSpawn('Separate', vec3(-20, 0, 0));
            JSON.stringify([drop(20), drop(-20)])`));
        assert.equal(heights[0], .6, file + ': the attached one leaves it where it is');
        assert.ok(Math.abs(heights[1] - 1) < 1e-6, file + ': the separate one pushes it out: ' + heights[1]);
    }
});

test('a type added over a level prefab\'s name stays through later loads', ()=>
{
    for (const file of builds)
    {
        const run = engine3D(file);
        const result = JSON.parse(run(`
            level3DLoad({prefabs: {ReplaceMe: {objects: [{type: 'Box'}]}}, objects: []});
            level3DAddType('ReplaceMe', (pos)=> { const o = new EngineObject3D(pos); o.mine = true; return o; });
            level3DLoad({objects: []});
            const kept = level3DSpawn('ReplaceMe')?.mine;
            level3DLoad({prefabs: {ReplaceMe: {objects: [{type: 'Box'}]}}, objects: []});
            JSON.stringify([kept, level3DSpawn('ReplaceMe')?.mine])`));
        assert.deepEqual(result, [true, true], file);
    }
});

test('a level property of a list or an object keeps its default when given the other', ()=>
{
    for (const file of builds)
    {
        const run = engine3D(file);
        const result = JSON.parse(run(`
            const seen = [];
            level3DAddType('Route', (pos, properties)=>
            {
                seen.push([isArray(properties.waypoints), properties.waypoints.length, isArray(properties.box)]);
                return new EngineObject3D(pos);
            }, {waypoints: [], box: {a: 1}, anything: null});
            const made = level3DLoad({objects: [
                {type: 'Route', properties: {waypoints: {bad: true}, box: [1, 2]}},
                {type: 'Route', properties: {waypoints: [1, 2], box: {b: 2}, anything: [3]}}]});
            JSON.stringify({seen, made: made.length})`));
        assert.deepEqual(result, {seen: [[true, 0, false], [true, 2, false]], made: 2}, file);
    }
});

test('level3DSpawn takes a Color and vectors as code has them, or as a level file writes them', ()=>
{
    for (const file of builds)
    {
        const run = engine3D(file);
        const result = JSON.parse(run(`
            level3DAddType('Probe', (pos, properties)=> Object.assign(new EngineObject3D(pos), properties),
                {tint: WHITE, offset: vec3(), flat: vec2()});
            const red = RED;
            const a = level3DSpawn('Probe', undefined, undefined, undefined,
                {tint: red, offset: vec3(1, 2, 3), flat: vec2(4, 5)});
            const b = level3DSpawn('Probe', undefined, undefined, undefined,
                {tint: '#ff0000', offset: [1, 2, 3], flat: [4, 5]});
            const c = level3DSpawn('Probe', undefined, undefined, undefined, {tint: vec3(), offset: RED});
            JSON.stringify({a: [a.tint.toString(), a.offset.toString(), a.flat.toString(), a.tint !== red],
                b: [b.tint.toString(), b.offset.toString(), b.flat.toString()],
                c: [c.tint.toString(), c.offset.toString()]})`));
        const color = result.b[0];
        assert.deepEqual(result.a, [color, result.b[1], result.b[2], true], file + ': the same, copied');
        assert.notEqual(result.c[0], color, file + ': a vector is not a color');
        assert.deepEqual(result.c[1], JSON.parse(run('JSON.stringify(vec3().toString())')), file + ': nor the other way');
    }
});

test('a video stopped or paused while the page is hidden stays so when it shows, one the page paused plays again', ()=>
{
    for (const file of builds)
    {
        const element = ()=> ({style: {}, paused: true, currentTime: 7, duration: 10,
            pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
            remove() {}, removeAttribute() {}, load() {}});
        const document = {hidden: false, addEventListener() {}, hasFocus: ()=> true,
            body: {appendChild() {}}, createElement: element};
        const { run } = loadEngine({document}, '', file);
        run(`setHeadlessMode(true); new UISystemPlugin;
            var videos = [0, 1, 2].map(()=> new UIVideo(vec2(), vec2(100), 'clip.mp4', false));
            videos.forEach((v)=> v.play());`);
        const result = JSON.parse(run(`
            document.hidden = true; uiVideosPageChange();
            videos[0].stop(); videos[1].pause();
            document.hidden = false; uiVideosPageChange();
            JSON.stringify(videos.map((v)=> v.video.paused))`));
        assert.deepEqual(result, [true, true, false], file);
    }
});

test('the FAQ\'s music answer plays the track once its file has loaded', async ()=>
{
    const faq = readFileSync(new URL('../FAQ.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const answer = faq.slice(faq.indexOf('### How do I play music?'));
    const start = answer.indexOf('```javascript\n') + 14, code = answer.slice(start, answer.indexOf('\n```', start));
    assert.match(code, /new Sound/);
    let complete;
    const { run } = loadEngine({fetch: ()=> new Promise((resolve)=> complete = resolve),
        StereoPannerNode: class { connect(n) { return n; } disconnect() {} }});
    run(`audioContext.decodeAudioData = async ()=> ({sampleRate: 44100, length: 44100}); var starts = 0;
        audioContext.createBufferSource = ()=> ({playbackRate: {value: 1}, connect(n) { return n; },
            addEventListener() {}, start() { ++starts; }, stop() {}});`);
    run(code.replace(/^(let|const) /gm, 'var '));
    assert.equal(run('starts'), 0, 'nothing before it loads');
    complete({ok: true, arrayBuffer: async ()=> new ArrayBuffer(0)});
    await new Promise((resolve)=> setTimeout(resolve, 0));
    assert.equal(run('starts'), 1, 'then it plays');
    assert.equal(run('!!trackInstance'), true, 'and the instance is kept to stop it');
});

test('the FAQ\'s on screen answer sees an object with the camera turned', ()=>
{
    const faq = readFileSync(new URL('../FAQ.md', import.meta.url), 'utf8');
    assert.match(faq, /if \(!isOnScreen\(this\.pos, this\.size\)\)/);
    const { run } = loadEngine();
    assert.equal(run(`mainCanvasSize = vec2(1000, 500); cameraPos = vec2(); cameraScale = 50; cameraAngle = PI / 2;
        isOnScreen(vec2(0, 8), vec2(1))`), true);
});

test('parseAtlas keeps an Aseprite tag\'s direction, its frames in the file\'s order', ()=>
{
    const { run } = loadEngine();
    const groups = JSON.parse(run(`JSON.stringify(parseAtlas({frames: [0, 1, 2].map((i)=> ({filename: 'f' + i,
        frame: {x: i * 8, y: 0, w: 8, h: 8}})), meta: {frameTags: [
            {name: 'back', from: 0, to: 2, direction: 'reverse'}, {name: 'bounce', from: 0, to: 2, direction: 'pingpong'},
            {name: 'plain', from: 0, to: 1}]}}).map((g)=> [g.name, g.frames.map((f)=> f.name).join(), g.direction]))`));
    assert.deepEqual(groups.slice(0, 3), [['back', 'f0,f1,f2', 'reverse'], ['bounce', 'f0,f1,f2', 'pingpong'],
        ['plain', 'f0,f1', null]]);
});
