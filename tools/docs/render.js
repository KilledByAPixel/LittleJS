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
// text inside an element needs no quote escaping, which keeps code readable in the source
const escText = (s)=> String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// a type as html: identifiers that name a documented class or typedef link to it
function typeHtml(names, links)
{
    const one = (raw)=>
    {
        raw = raw.replace(/\.</g, '<');
        let out = '', last = 0;
        for (const m of raw.matchAll(/[A-Za-z_$][\w$]*/g))
        {
            out += esc(raw.slice(last, m.index));
            out += links.has(m[0]) ? `<a href="${links.get(m[0])}">${m[0]}</a>` : esc(m[0]);
            last = m.index + m[0].length;
        }
        return out + esc(raw.slice(last));
    };
    return names.map(one).join('<span class="sep">|</span>');
}

// each @param, @property, @type and @return tag of a comment by name, as
// {type, optional, description} read from the text, for the tags whose type
// jsdoc could not parse: it then drops the tag's optional flag and description too
function tagTypes(comment)
{
    const types = new Map();
    const re = /@(param|property|type|returns?)\s*\{/g;
    let m;
    while ((m = re.exec(comment)))
    {
        let depth = 1, i = re.lastIndex;
        for (; i < comment.length && depth; ++i)
            depth += comment[i] == '{' ? 1 : comment[i] == '}' ? -1 : 0;
        const type = comment.slice(re.lastIndex, i - 1).trim();
        let rest = comment.slice(i), name, optional = false;
        if (m[1] == 'type')
            name = '@type';
        else if (m[1].startsWith('return'))
            name = '@return';
        else
        {
            // a default inside the brackets may be an array itself
            const n = rest.match(/^\s*(\[)?\s*(?:\.\.\.)?([\w$.]+)(?:=(?:\[[^\]]*\]|[^\]])*)?\]?/);
            if (!n)
                continue;
            name = n[2];
            optional = !!n[1];
            rest = rest.slice(n[0].length);
        }
        // the description runs to the next tag or the comment's end, over the star of each line
        const description = rest.split(/\n\s*\*?\s*@|\*\/\s*$/)[0].replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ').replace(/^\s*-?\s*/, '').trim();
        types.set(name, { type, optional, description });
    }
    return types;
}

// the tags of a doclet, read once
const tagCache = new WeakMap();
function tagsOf(doclet)
{
    if (!tagCache.has(doclet))
        tagCache.set(doclet, tagTypes(doclet.comment || ''));
    return tagCache.get(doclet);
}

// a small highlighter for the examples: comments, strings, numbers, keywords
const HIGHLIGHT_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(\d+\.?\d*(?:e[+-]?\d+)?)\b|\b(const|let|var|function|class|new|return|if|else|for|while|do|switch|case|break|continue|this|true|false|null|undefined|async|await|of|in|typeof|instanceof|import|export|from|extends|super|throw|try|catch|finally|static|get|set|yield|default|delete|void)\b/g;
function highlight(code)
{
    let out = '', last = 0, m;
    HIGHLIGHT_RE.lastIndex = 0;
    while ((m = HIGHLIGHT_RE.exec(code)))
    {
        out += escText(code.slice(last, m.index));
        const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
        out += `<span class="${cls}">${escText(m[0])}</span>`;
        last = HIGHLIGHT_RE.lastIndex;
    }
    return out + escText(code.slice(last));
}

// the sidebar tree: the two groups, each namespace a details holding its classes
function sidebarHtml(model, current)
{
    let html = '<nav class="sidebar" id="sidebar"><input class="filter" type="search" placeholder="Filter" aria-label="Filter the tree">';
    for (const group of model.groups)
    {
        if (!group.namespaces.length)
            continue;
        html += `<h2>${group.name}</h2>`;
        for (const ns of group.namespaces)
        {
            const open = current == ns.page || ns.classes.some(c => c.page == current);
            const cls = (page)=> page == current ? ' class="current"' : '';
            html += `<details${open ? ' open' : ''}><summary><a href="${ns.page}"${cls(ns.page)}>${ns.name}</a></summary>`;
            if (ns.classes.length)
                html += '<ul>' + ns.classes.map(c => `<li><a href="${c.page}"${cls(c.page)}>${c.name}</a></li>`).join('') + '</ul>';
            html += '</details>';
        }
    }
    return html + '</nav>';
}

// the page outline for the right column
function outlineHtml(outline)
{
    if (!outline.length)
        return '';
    const items = outline.map(o => `<li class="d${o.depth}"><a href="${o.href}">${esc(o.text)}</a></li>`).join('');
    return `<aside class="outline"><h3>On this page</h3><ul>${items}</ul></aside>`;
}

const MENU_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const THEME_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A6 6 0 0 1 12 3z" fill="currentColor"/></svg>';

// every page: head, header, sidebar, content, outline, footer
function shell(model, options, page)
{
    const meta = (options.meta || []).map(m => `<meta ${Object.entries(m).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}>`).join('\n');
    const menu = (options.menu || []).map(m => `<a href="${esc(m.link)}">${esc(m.title)}</a>`).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
${meta}
<link rel="icon" href="favicon.png">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="top">
<button class="menu" aria-label="Menu">${MENU_ICON}</button>
<a class="brand" href="index.html"><img src="favicon.png" alt="" width="24" height="24"> LittleJS <span class="ver">${esc(options.version)}</span></a>
<nav class="links">${menu}</nav>
<div class="search"><input type="search" placeholder="Search" aria-label="Search"><ul class="results" hidden></ul></div>
<button class="theme" aria-label="Toggle theme">${THEME_ICON}</button>
</header>
${sidebarHtml(model, page.current)}
<main class="content">
${page.body}
<footer>${options.footer || ''}</footer>
</main>
${outlineHtml(page.outline)}
<script src="docs.js"></script>
</body>
</html>
`;
}

// the homepage: the README's html, its headings the outline
function homePage(model, options)
{
    const readme = options.readme || '';
    const outline = [];
    for (const m of readme.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g))
        outline.push({ href: '#' + m[2], text: m[3].replace(/<[^>]+>/g, ''), depth: m[1] - 2 });
    return shell(model, options, { title: options.title, current: 'index.html', body: `<article class="readme">${readme}</article>`, outline });
}

const KIND_TITLES = { function: 'Functions', member: 'Members', constant: 'Constants', typedef: 'Typedefs' };

// the link to a doclet's line on GitHub at the release tag
function sourceLink(doclet, options)
{
    const meta = doclet.meta;
    if (!meta || !meta.filename)
        return '';
    const root = String(options.root || '').replace(/\\/g, '/').replace(/\/$/, '');
    const folder = String(meta.path || '').replace(/\\/g, '/').replace(root, '').replace(/^\//, '');
    const file = (folder ? folder + '/' : '') + meta.filename;
    const href = `${options.repo}/blob/v${options.version}/${file}#L${meta.lineno}`;
    return `<a class="src" href="${href}" title="${esc(file)}">${esc(meta.filename)}:${meta.lineno}</a>`;
}

// the type of a param, property or doclet: what jsdoc parsed, or the tag's
// text when it could not
function typeOf(item, name, doclet, model)
{
    if (item.type && item.type.names && item.type.names.length)
        return typeHtml(item.type.names, model.links);
    const tag = tagsOf(doclet).get(name);
    return tag && tag.type ? typeHtml([tag.type], model.links) : '';
}

// a param or property jsdoc parsed has its own fields, one whose type it
// rejected is read back from the tag
const isOptional = (p, doclet)=> p.optional || !p.type && !!(tagsOf(doclet).get(p.name) || {}).optional;
function descriptionOf(p, doclet)
{
    if (p.description || p.type)
        return p.description || '';
    const tag = tagsOf(doclet).get(p.name);
    return tag && tag.description ? `<p>${esc(tag.description)}</p>` : '';
}

// a list of params or properties as a definition list, dotted names nested
function paramsHtml(items, doclet, model)
{
    if (!items || !items.length)
        return '';
    let html = '<dl class="params">';
    for (const p of items)
    {
        if (!p.name)
            continue;
        const depth = (p.name.match(/\./g) || []).length;
        const notes = [];
        if (isOptional(p, doclet))
            notes.push('optional');
        if (p.defaultvalue !== undefined && p.defaultvalue !== null)
            notes.push('default ' + esc(JSON.stringify(p.defaultvalue).replace(/^"(.*)"$/, '$1')));
        const type = typeOf(p, p.name, doclet, model);
        const note = notes.length ? ` <span class="opt">${notes.join(', ')}</span>` : '';
        html += `<dt${depth ? ` class="d${depth}"` : ''}><code>${(p.variable ? '…' : '') + esc(p.name.split('.').pop())}</code>${type ? ' ' + type : ''}${note}</dt>`;
        html += `<dd>${descriptionOf(p, doclet)}</dd>`;
    }
    return html + '</dl>';
}

// the signature line of a function: name(params) → returns
function signatureHtml(entry, doclet, model)
{
    const params = (doclet.params || []).filter(p => p.name && !p.name.includes('.'))
        .map(p => (p.variable ? '…' : '') + (isOptional(p, doclet) ? `<span class="opt">${esc(p.name)}</span>` : esc(p.name)));
    let html = `<span class="name">${esc(entry.name)}</span>(${params.join(', ')})`;
    const returns = doclet.returns && doclet.returns[0];
    const type = returns ? typeOf(returns, '@return', doclet, model) : '';
    if (type)
        html += ` → ${type}`;
    return html;
}

// jsdoc trims an example's first line and leaves one space on the lines after
// it when the comment indents them past the star, so take the common indent
// of the later lines off
function dedent(code)
{
    const lines = code.replace(/\s+$/, '').split('\n');
    const rest = lines.slice(1).filter(l => l.trim());
    const indent = rest.length ? Math.min(...rest.map(l => l.match(/^ */)[0].length)) : 0;
    return [lines[0].trim(), ...lines.slice(1).map(l => l.slice(indent))].join('\n');
}

// one entry: the top line, the description, params, returns, properties, example
function entryHtml(entry, model, options)
{
    const d = entry.doclet;
    const isFunction = d.kind == 'function' || d.kind == 'class' || (d.kind == 'typedef' && d.type && d.type.names && d.type.names[0] == 'function');
    const badges = [];
    if (entry.static)
        badges.push('static');
    if (d.async)
        badges.push('async');
    if (d.deprecated)
        badges.push('deprecated');
    // a member with @property and @type has no description, the text is in its one unnamed property,
    // and one with @property alone has its type there too
    const unnamed = d.properties && d.properties.length == 1 && !d.properties[0].name;
    let top;
    if (isFunction)
        top = signatureHtml(entry, d, model);
    else
    {
        const typed = d.type && d.type.names && d.type.names.length ? d : unnamed && d.properties[0].type ? d.properties[0] : d;
        const type = typeOf(typed, '@type', d, model);
        const def = d.defaultvalue !== undefined && d.defaultvalue !== null ? ` <span class="opt">default ${esc(String(d.defaultvalue))}</span>` : '';
        top = `<span class="name">${esc(entry.name)}</span>${type ? ' : ' + type : ''}${def}`;
    }
    const description = d.description || (unnamed && d.properties[0].description) || '';
    let html = `<div class="entry" id="${entry.anchor}">`;
    html += `<div class="head"><code class="sig">${top}</code>${badges.map(b => `<span class="badge ${b}">${b}</span>`).join('')}${sourceLink(d, options)}</div>`;
    if (d.deprecated && d.deprecated !== true)
        html += `<p class="deprecated">Deprecated ${d.deprecated}</p>`;
    if (description)
        html += `<div class="desc">${description}</div>`;
    html += paramsHtml(d.params, d, model);
    const returns = d.returns && d.returns[0];
    if (returns && returns.description)
        html += `<dl class="params"><dt>Returns</dt><dd class="returns">${returns.description}</dd></dl>`;
    if (d.properties && !unnamed)
        html += paramsHtml(d.properties, d, model);
    for (const example of d.examples || [])
    {
        const m = example.match(/^\s*<caption>([\s\S]+?)<\/caption>\s*\n([\s\S]+)$/i);
        const code = dedent(m ? m[2] : example);
        html += (m ? `<p class="caption">${m[1]}</p>` : '') + `<pre><code>${highlight(code)}</code></pre>`;
    }
    return html + '</div><!-- /entry -->';
}

// the index of a page: a grid of links per section
function indexHtml(sections)
{
    const parts = sections.filter(s => s.items.length).map(s =>
        `<h3>${s.title}</h3><ul>${s.items.map(i => `<li><a href="${i.href}">${esc(i.text)}</a></li>`).join('')}</ul>`);
    return parts.length ? `<section class="index">${parts.join('')}</section>` : '';
}

// the entries of one kind under a heading
function entriesSection(entries, kind, model, options, outline)
{
    const list = entries.filter(e => e.kind == kind);
    if (!list.length)
        return '';
    const id = KIND_TITLES[kind].toLowerCase();
    outline.push({ href: '#' + id, text: KIND_TITLES[kind], depth: 0 });
    for (const e of list)
        outline.push({ href: '#' + e.anchor, text: e.name, depth: 1 });
    return `<h2 id="${id}">${KIND_TITLES[kind]}</h2>` + list.map(e => entryHtml(e, model, options)).join('');
}

// a namespace page: title, description, index, then the entries by kind
function namespacePage(ns, model, options)
{
    const outline = [];
    let body = `<article><h1>${esc(ns.name)}</h1><div class="desc">${ns.doclet.description || ''}</div>`;
    const sections = [{ title: 'Classes', items: ns.classes.map(c => ({ href: c.page, text: c.name })) }];
    for (const kind of ['function', 'member', 'constant', 'typedef'])
        sections.push({ title: KIND_TITLES[kind], items: ns.entries.filter(e => e.kind == kind).map(e => ({ href: '#' + e.anchor, text: e.name })) });
    body += indexHtml(sections);
    for (const kind of ['function', 'member', 'constant', 'typedef'])
        body += entriesSection(ns.entries, kind, model, options, outline);
    body += '</article>';
    return shell(model, options, { title: `${ns.name} - ${options.title}`, current: ns.page, body, outline });
}

// a class page: crumb, description, inheritance, constructor, index, members, methods
function classPage(c, model, options)
{
    const d = c.doclet;
    const outline = [];
    let body = `<article><p class="crumb"><a href="${c.namespace.page}">${esc(c.namespace.name)}</a></p><h1>${esc(c.name)}</h1>`;
    body += `<div class="desc">${d.classdesc || ''}</div>`;
    if (c.parent)
        body += `<p class="inherit">Extends <a href="${c.parent.page}">${esc(c.parent.name)}</a></p>`;
    if (c.children.length)
        body += `<p class="inherit">Extended by ${c.children.map(k => `<a href="${k.page}">${esc(k.name)}</a>`).join(', ')}</p>`;

    // the constructor is the class doclet itself
    outline.push({ href: '#constructor', text: 'Constructor', depth: 0 });
    body += '<h2 id="constructor">Constructor</h2>';
    body += entryHtml({ doclet: d, name: 'new ' + c.name, kind: 'function', static: false, owner: c, anchor: 'new' }, model, options);

    const members = c.entries.filter(e => e.kind != 'function');
    const methods = c.entries.filter(e => e.kind == 'function');
    body += indexHtml([
        { title: 'Members', items: members.map(e => ({ href: '#' + e.anchor, text: e.name })) },
        { title: 'Methods', items: methods.map(e => ({ href: '#' + e.anchor, text: e.name })) },
    ]);
    // what the parents have, by name, so an object's whole surface is on its page
    for (let p = c.parent; p; p = p.parent)
        if (p.entries.length)
            body += `<h3>Inherited from <a href="${p.page}">${esc(p.name)}</a></h3><ul class="inherited">`
                + p.entries.map(e => `<li><a href="${p.page}#${e.anchor}">${esc(e.name)}</a></li>`).join('') + '</ul>';

    const section = (list, id, title)=>
    {
        if (!list.length)
            return '';
        outline.push({ href: '#' + id, text: title, depth: 0 });
        for (const e of list)
            outline.push({ href: '#' + e.anchor, text: e.name, depth: 1 });
        return `<h2 id="${id}">${title}</h2>` + list.map(e => entryHtml(e, model, options)).join('');
    };
    body += section(members, 'members', 'Members') + section(methods, 'methods', 'Methods') + '</article>';
    return shell(model, options, { title: `${c.name} - ${options.title}`, current: c.page, body, outline });
}

// everything: the pages by file name and the search rows
function render(doclets, options)
{
    const model = buildModel(doclets);
    const pages = { 'index.html': homePage(model, options) };
    const search = [];
    for (const ns of model.namespaces)
        pages[ns.page] = namespacePage(ns, model, options);
    for (const c of model.classes)
        pages[c.page] = classPage(c, model, options);
    for (const ns of model.namespaces)
    {
        search.push({ n: ns.name, k: 'namespace', p: ns.page, a: '', ns: ns.name });
        for (const e of ns.entries)
            search.push({ n: e.name, k: e.kind, p: ns.page, a: e.anchor, ns: ns.name });
        for (const c of ns.classes)
        {
            search.push({ n: c.name, k: 'class', p: c.page, a: '', ns: ns.name });
            for (const e of c.entries)
                search.push({ n: e.name, k: e.kind, p: c.page, a: e.anchor, ns: ns.name });
        }
    }
    return { pages, search, model };
}

module.exports = { render, buildModel, typeHtml, tagTypes, highlight, esc };
