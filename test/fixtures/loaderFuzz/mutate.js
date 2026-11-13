// runs inside the vm: a seeded mutator of plain data (objects, arrays, numbers, strings) and of bytes
var fuzz = (function()
{
    function rng(seed)
    {
        let a = seed >>> 0 || 1;
        const r = ()=>
        {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
        r.int = (n)=> Math.floor(r() * n);
        r.pick = (list)=> list[r.int(list.length)];
        return r;
    }
    const specials = ()=> [NaN, Infinity, -Infinity, -1, 0, 1, 2, .5, -.5, 1e9, -1e9, 2**31, 2**32, 2**53, 1e300,
        '', 'x', '#ff00ff', '#ff00ff00', '1', '1,2', 'NaN', null, undefined, true, false, [], {}, [0], [1, 2, 3],
        [NaN, NaN, NaN], [1e9, 1e9, 1e9], {x: 1}, '__proto__', 'constructor', 'toString', 255, 256, 65535, 4294967295];
    function clone(v)
    {
        if (Array.isArray(v)) return v.map(clone);
        if (v && typeof v === 'object')
        {
            if (ArrayBuffer.isView(v)) return v.slice();
            if (v instanceof ArrayBuffer) return v.slice(0);
            const o = {};
            for (const k of Object.keys(v))
                Object.defineProperty(o, k, {value: clone(v[k]), enumerable: true, writable: true, configurable: true});
            return o;
        }
        return v;
    }
    // every [container, key] in the value
    function slots(v, list=[])
    {
        if (Array.isArray(v))
            v.forEach((x, i)=> { list.push([v, i]); slots(x, list); });
        else if (v && typeof v === 'object' && !ArrayBuffer.isView(v))
            for (const k of Object.keys(v)) { list.push([v, k]); slots(v[k], list); }
        return list;
    }
    function mutateOne(root, r, log)
    {
        const all = slots(root);
        if (!all.length) return;
        const [c, k] = r.pick(all), v = c[k], op = r.int(12);
        const set = (x, what)=> { log.push(k + ':' + what); if (Array.isArray(c) || k !== '__proto__') c[k] = x;
            else Object.defineProperty(c, k, {value: x, enumerable: true, writable: true, configurable: true}); };
        if (op === 0) { log.push(k + ':delete'); Array.isArray(c) ? c.splice(k, 1) : delete c[k]; return; }
        if (op <= 3) { const s = r.pick(specials()); return set(s, 'special ' + String(s)); }
        if (typeof v === 'number')
        {
            const n = r.pick([-v, v + 1, v - 1, v * 1e6, v / 3, Math.round(v * 2**20), -(2**31), v + .5, 1e7, 0]);
            return set(n, 'num ' + n);
        }
        if (typeof v === 'string')
        {
            const s = r.pick(['', v + v, v.slice(0, -1), v.toUpperCase(), ' ' + v, v + '\u0000', '__proto__', '9']);
            return set(s, 'str ' + s);
        }
        if (Array.isArray(v))
        {
            const w = r.int(7);
            if (w === 0) { log.push(k + ':empty'); v.length = 0; return; }
            if (w === 1) { log.push(k + ':half'); v.length = v.length >> 1; return; }
            if (w === 2 && v.length) { log.push(k + ':dup'); v.push(clone(r.pick(v))); return; }
            if (w === 3) { log.push(k + ':reverse'); v.reverse(); return; }
            if (w === 4 && v.length) { log.push(k + ':x50'); const e = r.pick(v);
                for (let i = 50; i--;) v.push(clone(e)); return; }
            if (w === 5) { log.push(k + ':holeAt9'); v[9] = undefined; return; }
            log.push(k + ':push special'); v.push(r.pick(specials())); return;
        }
        if (v && typeof v === 'object')
        {
            const key = r.pick(['__proto__', 'constructor', 'toString', 'length', 'x', 'type', 'name', 'id', 'data']);
            const val = r.pick(specials());
            log.push(k + ':addkey ' + key);
            Object.defineProperty(v, key, {value: val, enumerable: true, writable: true, configurable: true});
            return;
        }
        const s = r.pick(specials());
        set(s, 'special ' + String(s));
    }
    function mutate(value, seed, extra)
    {
        const r = rng(seed), root = {v: clone(value)}, log = [];
        const n = 1 + r.int(3);
        for (let i = n; i--;) mutateOne(root, r, log);
        extra && extra(root, r, log);
        let v = root.v, json = r() < .5;
        if (json)
        {
            try { v = JSON.parse(JSON.stringify(v) ?? 'null'); } catch { json = false; }
        }
        return {value: v, log: log.join(' | ') + (json ? ' [json]' : '')};
    }
    // bytes: flips, truncation, a 32 bit field set to something big
    function mutateBytes(buffer, seed)
    {
        const r = rng(seed), log = [];
        let bytes = new Uint8Array(buffer.slice(0));
        const spot = ()=> r() < .3 ? r.int(bytes.length) : r() < .3 ? r.int(24) : bytes.length - 1 - r.int(bytes.length / 4 | 0);
        for (let n = 1 + r.int(3); n--;)
        {
            const op = r.int(4);
            if (op === 0) { const i = spot(); bytes[i] = r.int(256); log.push('byte ' + i); }
            else if (op === 1) { const len = r.int(bytes.length); bytes = bytes.slice(0, len); log.push('cut ' + len); }
            else if (op === 2 && bytes.length >= 4)
            {
                const i = Math.min(spot(), bytes.length - 4) & ~3, value = r.pick([0, 1, 0xffffffff, 0x7fffffff, 1e6, 3]);
                new DataView(bytes.buffer).setUint32(i, value, true); log.push('u32 ' + i + '=' + value);
            }
            else { const i = spot(); bytes[i] ^= 1 << r.int(8); log.push('bit ' + i); }
        }
        return {value: bytes.buffer, log: log.join(' | ')};
    }
    return {rng, clone, mutate, mutateBytes};
})();
