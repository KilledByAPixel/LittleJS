import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// 3D level collision must not depend on the order the level shapes were made in: a sloped HeightMap, a MeshCollider
// plaza a little under it at the join, a turned MeshCollider ramp and a VoxelMap ledge, made in all 24 orders, with
// walks across them in several directions and speeds, some jumping; every order must give the first order's place
// and ground on every frame (from full pass 36, after list order bugs in passes 31 to 35)

const permutations = (a)=> a.length < 2 ? [a] :
    a.flatMap((x, i)=> permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p)=> [x, ...p]));
const orders = permutations(['T', 'P', 'R', 'V']);
const walks = [
    {start: [-6, 0], vel: [.12, 0], jump: 0},
    {start: [-6, 1], vel: [.25, .03], jump: 0},
    {start: [-6, -2], vel: [.15, 0], jump: 40},
    {start: [7, 0], vel: [-.12, 0], jump: 0},
    {start: [7, 3], vel: [-.2, -.05], jump: 25},
    {start: [0, -9], vel: [0, .15], jump: 0},
    {start: [-3, -9], vel: [.05, .15], jump: 0},
    {start: [3, 9], vel: [0, -.18], jump: 30},
];

test('3D level collision gives the same walk in every order the level shapes are listed in', ()=>
{
    const { run } = loadEngine();
    run('setHeadlessMode(true); new Render3DPlugin; render3D.gravity = vec3(0, -.02, 0);');
    for (const [index, walk] of walks.entries())
    {
        let base;
        for (const order of orders)
        {
            const track = JSON.parse(run(`(()=>
            {
                const made = {};
                const make = {
                    T: ()=> { const h = []; for (let j = 0; j <= 32; ++j) { h.push([]);
                        for (let i = 0; i <= 32; ++i) h[j].push(-.3 * (i - 16) + .1 * Math.sin((j - 16) * .7)); }
                        return new HeightMap(h, vec2(32, 32), 1); },
                    P: ()=> new MeshCollider(buildBox(vec3(6, 4, 8)), vec3(4, -.03 - .3 - 2, 0)),
                    R: ()=> { const m = new MeshCollider(buildBox(vec3(4, .4, 3)), vec3(-2, 1.3, -5));
                        m.rotation3D = vec3(0, 0, .25); return m; },
                    V: ()=> { const v = new VoxelMap(vec3(-1, -1, 5), vec3(4, 3, 4));
                        for (let x = 0; x < 4; ++x) for (let z = 0; z < 4; ++z) for (let y = 0; y < 2; ++y)
                            v.setVoxel(vec3(x, y, z), 1);
                        return v; },
                };
                for (const k of ${JSON.stringify(order)}) made[k] = make[k]();
                const body = new EngineObject3D(vec3(${walk.start[0]},
                    made.T.getHeight(${walk.start[0]}, ${walk.start[1]}) + .6, ${walk.start[1]}));
                body.size3D = vec3(1); body.setCollision(); body.mass = 1;
                for (let f = 0; f < 20; ++f) { body.velocity3D.x = body.velocity3D.z = 0; engineObjectsUpdate(); }
                const track = [];
                for (let f = 0; f < 90; ++f)
                {
                    body.velocity3D.x = ${walk.vel[0]}; body.velocity3D.z = ${walk.vel[1]};
                    if (${walk.jump} && f === ${walk.jump} && body.groundObject) body.velocity3D.y = .3;
                    engineObjectsUpdate();
                    const g = body.groundObject;
                    track.push([body.pos3D.x, body.pos3D.y, body.pos3D.z,
                        g ? Object.keys(made).find((k)=> made[k] === g) || '?' : '-']);
                }
                engineObjectsDestroy();
                return JSON.stringify(track);
            })()`));
            if (!base) { base = track; continue; }
            for (let f = 0; f < track.length; ++f)
            {
                const name = `walk ${index}, order ${order.join('')}, frame ${f}`;
                const gap = Math.hypot(track[f][0] - base[f][0], track[f][1] - base[f][1], track[f][2] - base[f][2]);
                assert.ok(gap < 1e-6, `${name}: ${gap} from the first order`);
                assert.equal(track[f][3], base[f][3], name + ': the ground');
            }
        }
    }
});
