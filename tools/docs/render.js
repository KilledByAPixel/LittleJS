/**
 * LittleJS docs template, the pure part
 * - render(doclets, options) turns jsdoc's doclets into the site's pages and search rows
 * - no file system and no jsdoc runtime here, so a test can run it on a doclet dump
 * - publish.js is the thin entry jsdoc calls
 */

'use strict';

// the namespaces in the order REFERENCE.md has them, a namespace in neither
// list goes at the end of Plugins alphabetically
const CORE_NAMESPACES = ['Engine', 'Math', 'Random', 'Utilities', 'Draw', 'Audio', 'Input', 'Particles',
    'TileLayers', 'Settings', 'WebGL', 'Editor', 'Debug'];
const PLUGIN_NAMESPACES = ['AudioEffects', 'TweenSystem', 'SceneSystem', 'Parallax', 'PathFinding', 'UISystem',
    'LightSystem', 'PostProcess', 'Math3D', 'Render3D', 'Level3D', 'GLTF', 'ThreeJS', 'Box2D', 'Medals',
    'Newgrounds', 'ParticleEffects', 'DrawUtilities', 'TextureSheets', 'Tweakables', 'ZzFXM'];
const ENTRY_KINDS = ['function', 'member', 'constant', 'typedef'];

// escape text for html
const esc = (s)=> String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byName = (a, b)=> a.name.localeCompare(b.name);

// which group a namespace is in and where
function namespaceOrder(name)
{
    let i = CORE_NAMESPACES.indexOf(name);
    if (i >= 0)
        return [0, i];
    i = PLUGIN_NAMESPACES.indexOf(name);
    return [1, i >= 0 ? i : PLUGIN_NAMESPACES.length];
}

// build the site's model from the doclets: namespaces holding classes and
// entries, classes holding entries, inheritance and the short name links
function buildModel(doclets)
{
    const docs = doclets.filter(d => !d.undocumented && !d.ignore && d.kind != 'package'
        && d.access != 'private' && d.memberof != '<anonymous>');

    const namespaces = new Map();
    for (const d of docs)
        if (d.kind == 'namespace')
            namespaces.set(d.longname, { doclet: d, name: d.name, page: d.longname + '.html', classes: [], entries: [] });

    const classes = new Map();
    for (const d of docs)
        if (d.kind == 'class' && namespaces.has(d.memberof))
        {
            const namespace = namespaces.get(d.memberof);
            const c = { doclet: d, name: d.name, page: d.longname + '.html', namespace, entries: [], parent: undefined, children: [] };
            classes.set(d.longname, c);
            namespace.classes.push(c);
        }

    // one entry per longname, the one with a description when there are two
    const seen = new Map();
    for (const d of docs)
    {
        if (!ENTRY_KINDS.includes(d.kind))
            continue;
        const owner = classes.get(d.memberof) || namespaces.get(d.memberof);
        if (!owner)
            continue;
        const before = seen.get(d.longname);
        if (before)
        {
            if (d.description && !before.doclet.description)
                before.doclet = d;
            continue;
        }
        const entry = { doclet: d, name: d.name, kind: d.kind, static: d.scope == 'static' && classes.has(d.memberof), owner, anchor: d.name };
        seen.set(d.longname, entry);
        owner.entries.push(entry);
    }

    // anchors: a static entry named like an instance one is name-static
    for (const owner of [...namespaces.values(), ...classes.values()])
        for (const e of owner.entries)
            if (e.static && owner.entries.some(o => o != e && o.name == e.name && !o.static))
                e.anchor = e.name + '-static';

    // short name links, a name documented twice would link wrong so it is an error
    const links = new Map();
    const twice = [];
    const link = (name, href)=> links.has(name) ? twice.push(name) : links.set(name, href);
    for (const c of classes.values())
        link(c.name, c.page);
    for (const ns of namespaces.values())
        for (const e of ns.entries)
            if (e.kind == 'typedef')
                link(e.name, ns.page + '#' + e.anchor);
    if (twice.length)
        throw new Error('documented twice, links would be ambiguous: ' + twice.join(', '));

    // inheritance, augments holds short names
    const classByName = new Map([...classes.values()].map(c => [c.name, c]));
    for (const c of classes.values())
        for (const name of c.doclet.augments || [])
        {
            const parent = classByName.get(name);
            if (parent)
            {
                c.parent = parent;
                parent.children.push(c);
            }
        }

    const sorted = [...namespaces.values()].sort((a, b)=>
    {
        const [ga, ia] = namespaceOrder(a.name), [gb, ib] = namespaceOrder(b.name);
        return ga - gb || ia - ib || byName(a, b);
    });
    for (const ns of sorted)
    {
        ns.classes.sort(byName);
        ns.entries.sort(byName);
        for (const c of ns.classes)
        {
            c.entries.sort(byName);
            c.children.sort(byName);
        }
    }
    const groups = [
        { name: 'Engine', namespaces: sorted.filter(ns => namespaceOrder(ns.name)[0] == 0) },
        { name: 'Plugins', namespaces: sorted.filter(ns => namespaceOrder(ns.name)[0] == 1) },
    ];
    // kinds the site does not render are a warning, printed by publish.js
    const warnings = docs.filter(d => ['module', 'event', 'mixin', 'interface', 'external'].includes(d.kind))
        .map(d => `${d.kind} ${d.longname} is not rendered, the template has no page for it`);
    return { groups, namespaces: sorted, classes: [...classes.values()], links, warnings };
}

// the pages come in later tasks, this stub lets the test file load
function render()
{
    return { pages: {}, search: [] };
}

module.exports = { render, buildModel, esc };
