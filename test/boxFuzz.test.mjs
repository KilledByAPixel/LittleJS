import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// A seeded fuzz of plain boxes, not bullets, against tiles, from full pass 12: random rooms of solid and one way
// tiles in one or two layers, turned and mirrored, gravity either way or none, restitution and friction, sizes from
// a tenth to near two, a third whole, starts on grid lines; checked each frame:
// - into: a box ends a frame overlapping a solid cell it did not overlap at its start
// - stuck: with no gravity and some speed, a box that has not moved for 30 frames
// - nan: a position that is not a number
// - oneWay: a box ends a frame in a one way cell whose blocking side it was wholly on; a box moving a whole tile a
//   frame can still end there now and then, a few in ten thousand frames, so this is only kept low
const scene = (seed, scenes)=> `
    setHeadlessMode(true);
    var mulberry = (a)=> ()=> { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    var R = mulberry(${seed});
    var stats = {scenes: 0, frames: 0, into: 0, oneWay: 0, stuck: 0, nan: 0, ex: {into: [], oneWay: [], stuck: []}};
    var E = 1e-6;
    // cell kind: 0 empty, 1 solid, 2 one way (way in wayOf)
    var cellInfo = (X, Y)=>
    {
        let r = 0, way;
        for (const layer of tileCollisionLayers)
        {
            const lx = X - layer.pos.x, ly = Y - layer.pos.y;
            if (lx < 0 || ly < 0 || lx >= layer.size.x || ly >= layer.size.y) continue;
            const d = layer.collisionData[ly*layer.size.x + lx];
            if (!(d > 0)) continue;
            const data = layer.data[ly*layer.size.x+lx], w = data && layer.oneWayTiles.get(data.tile);
            if (!w) return {kind: 1};
            let wx = data.mirror ? -w.x : w.x, wy = w.y;
            for (let t = data.direction & 3; t--;) [wx, wy] = [wy, -wx];
            r = 2, way = [wx, wy];
        }
        return r ? {kind: 2, way} : {kind: 0};
    };
    var overlaps = (p, s, X, Y)=> p.x + s.x/2 > X + E && p.x - s.x/2 < X + 1 - E && p.y + s.y/2 > Y + E && p.y - s.y/2 < Y + 1 - E;
    // wholly on the blocking side of a one way cell (the side it is passed toward)
    var farSide = (p, s, X, Y, w)=> w[0] > .5 ? p.x - s.x/2 >= X + 1 - 1e-3 : w[0] < -.5 ? p.x + s.x/2 <= X + 1e-3 :
        w[1] > .5 ? p.y - s.y/2 >= Y + 1 - 1e-3 : p.y + s.y/2 <= Y + 1e-3;
    for (let scene = 0; scene < ${scenes}; ++scene)
    {
        engineObjectsDestroy();
        ++stats.scenes;
        const gr = R(), g = gr < .4 ? 0 : gr < .7 ? -.02 : gr < .85 ? -.05 : .02;
        setGravity(vec2(0, g));
        const layers = [];
        const twoLayers = R() < .3;
        for (let k = twoLayers ? 2 : 1; k--;)
        {
            const pos = layers.length ? layers[0].pos.add(vec2(Math.floor(R()*3)-1, Math.floor(R()*3)-1)) :
                vec2(Math.floor(R()*6) - 3, Math.floor(R()*6) - 3);
            const size = vec2(10 + Math.floor(R()*8), 10 + Math.floor(R()*8));
            const layer = new TileCollisionLayer(pos, size, tile(), 0, false);
            const density = .08 + R()*.25;
            for (let y = 0; y < size.y; ++y) for (let x = 0; x < size.x; ++x)
            {
                const edge = !layers.length && (x == 0 || y == 0 || x == size.x-1 || y == size.y-1);
                if (edge || R() < density)
                {
                    const t = edge ? 1 : R() < .7 ? 1 : 5;
                    layer.setData(vec2(x, y), new TileLayerData(t, Math.floor(R()*4), R() < .5));
                    layer.setCollisionData(vec2(x, y), 1);
                }
            }
            layer.setOneWay(5, [vec2(0,1), vec2(0,-1), vec2(1,0), vec2(-1,0)][Math.floor(R()*4)]);
            if (R() < .3) layer.restitution = R();
            layers.push(layer);
        }
        const L = layers[0];
        const boxes = [];
        for (let i = 0; i < 16; ++i)
        {
            const sk = R();
            const size = sk < .3 ? vec2(.1 + R()*.9, .1 + R()*.9) : sk < .6 ? vec2(1) : sk < .8 ? vec2(.5, .98) :
                vec2(.2 + R()*1.7, .2 + R()*1.7);
            let p, tries = 0;
            for (;;)
            {
                p = vec2(L.pos.x + 1 + R()*(L.size.x - 2), L.pos.y + 1 + R()*(L.size.y - 2));
                if (R() < .3) p.y = Math.floor(p.y) + size.y/2 + 1e-4; // resting on a grid line
                let bad = false;
                for (let Y = Math.floor(p.y - size.y/2) - 1; Y <= Math.floor(p.y + size.y/2) + 1; ++Y)
                for (let X = Math.floor(p.x - size.x/2) - 1; X <= Math.floor(p.x + size.x/2) + 1; ++X)
                    if (cellInfo(X, Y).kind && overlaps(p, size, X, Y)) bad = true;
                if (!bad || ++tries > 50) break;
            }
            if (tries > 50) continue;
            const b = new EngineObject(p, size);
            b.setCollision(false, false, true);
            b.restitution = R() < .3 ? 1 : R() < .3 ? 0 : R();
            b.friction = R();
            const a = R() < .3 ? Math.floor(R()*8) * Math.PI/4 : R()*Math.PI*2;
            const s = R() < .3 ? 1 : R()*1.2;
            b.velocity = vec2(Math.cos(a)*s, Math.sin(a)*s);
            boxes.push({b, still: 0, hist: [[p.x, p.y, b.velocity.x, b.velocity.y]]});
        }
        for (let f = 0; f < 240; ++f)
        {
            const starts = boxes.map(({b})=> b.pos.copy());
            engineObjectsUpdate();
            ++stats.frames;
            boxes.forEach((o, i)=>
            {
                const b = o.b, s = b.size, a = starts[i], p = b.pos;
                o.hist.push([p.x, p.y, b.velocity.x, b.velocity.y]);
                const around = ()=> [2,1,0,-1].map(dy=>[-1,0,1,2].map(dx=>cellInfo(Math.floor(a.x)+dx,
                    Math.floor(a.y)+dy).kind).join('')).concat(['x0=' + (Math.floor(a.x)-1) + ' ytop=' + (Math.floor(a.y)+2)]);
                if (!isFinite(p.x) || !isFinite(p.y)) { ++stats.nan; return; }
                for (let Y = Math.floor(p.y - s.y/2) - 1; Y <= Math.floor(p.y + s.y/2) + 1; ++Y)
                for (let X = Math.floor(p.x - s.x/2) - 1; X <= Math.floor(p.x + s.x/2) + 1; ++X)
                {
                    const c = cellInfo(X, Y);
                    if (!c.kind || !overlaps(p, s, X, Y)) continue;
                    if (c.kind == 1 && !overlaps(a, s, X, Y))
                    {
                        ++stats.into;
                        stats.ex.into.length < 5 && stats.ex.into.push({scene, f, from: [a.x, a.y], to: [p.x, p.y],
                            size: [s.x, s.y], v: [b.velocity.x, b.velocity.y], cell: [X, Y], g, hist: o.hist.slice(-5), around: around()});
                    }
                    if (c.kind == 2 && farSide(a, s, X, Y, c.way))
                    {
                        ++stats.oneWay;
                        stats.ex.oneWay.length < 5 && stats.ex.oneWay.push({scene, f, from: [a.x, a.y], to: [p.x, p.y],
                            size: [s.x, s.y], v: [b.velocity.x, b.velocity.y], cell: [X, Y], way: c.way, g, hist: o.hist.slice(-4), around: around()});
                    }
                }
                if (!g && b.velocity.length() > .05 && p.x === a.x && p.y === a.y)
                {
                    if (++o.still == 30)
                    {
                        ++stats.stuck;
                        stats.ex.stuck.length < 5 && stats.ex.stuck.push({scene, f, pos: [p.x, p.y], size: [s.x, s.y],
                            v: [b.velocity.x, b.velocity.y]});
                    }
                }
                else o.still = 0;
            });
        }
        for (const l of layers) l.destroy();
    }
    JSON.stringify(stats);
`;

for (const seed of [1, 2])
test(`plain boxes against tiles never end inside a solid tile, never stick and stay numbers (seed ${seed})`, ()=>
{
    const { run } = loadEngine();
    const stats = JSON.parse(run(scene(seed, 40)));
    assert.equal(stats.frames, 9600);
    assert.deepEqual([stats.into, stats.stuck, stats.nan], [0, 0, 0], JSON.stringify(stats.ex).slice(0, 2000));
    assert.ok(stats.oneWay <= 20, 'one way ' + stats.oneWay);
});
