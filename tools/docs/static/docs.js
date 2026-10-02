// LittleJS docs: the sidebar drawer and filter, search, the theme toggle, the outline marker

'use strict';

(function()
{
    const $ = (s, root=document)=> root.querySelector(s);
    const $$ = (s, root=document)=> [...root.querySelectorAll(s)];

    // theme: the inline script in the head set it before paint, this just flips it
    $('.theme').addEventListener('click', ()=>
    {
        const light = document.documentElement.dataset.theme != 'light';
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
    });

    // the drawer on a phone
    const menu = $('.menu');
    menu.addEventListener('click', e => { e.stopPropagation(); document.body.classList.toggle('nav-open'); });
    document.addEventListener('click', e =>
    {
        if (document.body.classList.contains('nav-open') && !e.target.closest('.sidebar'))
            document.body.classList.remove('nav-open');
    });

    // the sidebar filter: show the names containing the text, open what holds one
    const filter = $('.sidebar .filter');
    const details = $$('.sidebar details');
    const wasOpen = details.map(d => d.open);
    filter.addEventListener('input', ()=>
    {
        const text = filter.value.trim().toLowerCase();
        details.forEach((d, i) =>
        {
            const items = $$('li', d);
            let any = !text || $('summary a', d).textContent.toLowerCase().includes(text);
            for (const li of items)
            {
                const hit = !text || li.textContent.toLowerCase().includes(text);
                li.classList.toggle('hidden', !hit);
                any = any || hit;
            }
            d.classList.toggle('hidden', !any);
            d.open = text ? any : wasOpen[i];
        });
        $$('.sidebar h2').forEach(h =>
        {
            let next = h.nextElementSibling, any = false;
            for (; next && next.tagName == 'DETAILS'; next = next.nextElementSibling)
                any = any || !next.classList.contains('hidden');
            h.classList.toggle('hidden', !any);
        });
    });

    // an old #.name link is turned into #name by the head script on load, and here when the hash changes in place
    addEventListener('hashchange', ()=>
    {
        if (location.hash.indexOf('#.') == 0)
            location.replace('#' + location.hash.slice(2));
    });

    // the current page's entry in the sidebar scrolls into view
    const current = $('.sidebar a.current');
    if (current)
        current.scrollIntoView({ block: 'center' });

    // search: the index loads as a script on first focus, so it works from file://
    const input = $('.search input');
    const results = $('.search .results');
    let index, active = -1;
    const load = ()=>
    {
        if (index || window.docsSearchIndex)
            return void (index = window.docsSearchIndex);
        const script = document.createElement('script');
        script.src = 'search.js';
        script.onload = ()=> { index = window.docsSearchIndex; search(); };
        document.head.appendChild(script);
    };
    const href = (row)=> row.p + (row.a ? '#' + row.a : '');
    const search = ()=>
    {
        const text = input.value.trim().toLowerCase();
        results.innerHTML = '';
        active = -1;
        if (!text || !index)
            return void (results.hidden = true);
        const starts = [], has = [];
        for (const row of index)
        {
            const name = row.n.toLowerCase();
            if (name.startsWith(text))
                starts.push(row);
            else if (name.includes(text))
                has.push(row);
        }
        const rows = starts.concat(has).slice(0, 20);
        for (const row of rows)
        {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = href(row);
            a.textContent = row.n;
            const where = document.createElement('span');
            where.className = 'where';
            where.textContent = row.ns + ' · ' + row.k;
            a.appendChild(where);
            li.appendChild(a);
            results.appendChild(li);
        }
        results.hidden = !rows.length;
    };
    input.addEventListener('focus', load);
    input.addEventListener('input', search);
    input.addEventListener('keydown', e =>
    {
        const items = $$('li', results);
        if (e.key == 'ArrowDown' || e.key == 'ArrowUp')
        {
            e.preventDefault();
            active = (active + (e.key == 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items.forEach((li, i) => li.classList.toggle('active', i == active));
        }
        else if (e.key == 'Enter' && items.length)
            location.href = $('a', items[Math.max(active, 0)]).href;
        else if (e.key == 'Escape')
            results.hidden = true;
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) results.hidden = true; });

    // the outline marks the entry in view
    const outline = $('.outline');
    if (outline && 'IntersectionObserver' in window)
    {
        const links = new Map($$('a', outline).map(a => [a.getAttribute('href').slice(1), a]));
        const observer = new IntersectionObserver(entries =>
        {
            for (const entry of entries)
                if (entry.isIntersecting)
                {
                    links.forEach(a => a.classList.remove('current'));
                    const a = links.get(entry.target.id);
                    if (a)
                        a.classList.add('current');
                    break;
                }
        }, { rootMargin: '-68px 0px -70% 0px' }); // the band starts under the scroll padding, so the entry above a deep link's target stays out of it
        links.forEach((a, id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    }
})();
