/**
 * LittleJS docs template, the entry jsdoc calls
 * - hands the doclets and the README html to render.js and writes what comes back
 * - copies static/ (the stylesheet, the script, the favicon) next to the pages
 */

'use strict';

const fs = require('fs');
const path = require('path');
const env = require('jsdoc/env');
const { render } = require('./render');

exports.publish = (data, opts)=>
{
    const conf = (env.conf.templates || {}).littlejs || {};
    const root = env.pwd;
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const options = { readme: opts.readme, version: pkg.version, root, ...conf };
    const { pages, search, model } = render(data().get(), options);
    for (const warning of model.warnings)
        console.warn('WARNING: ' + warning);

    const outdir = path.normalize(env.opts.destination);
    fs.mkdirSync(outdir, { recursive: true });
    for (const [name, html] of Object.entries(pages))
        fs.writeFileSync(path.join(outdir, name), html);
    fs.writeFileSync(path.join(outdir, 'search.js'), 'docsSearchIndex=' + JSON.stringify(search) + ';\n');

    const staticDir = path.join(__dirname, 'static');
    for (const file of fs.readdirSync(staticDir))
        fs.copyFileSync(path.join(staticDir, file), path.join(outdir, file));
    console.log(`Docs template wrote ${Object.keys(pages).length} pages and ${search.length} search rows`);
};
