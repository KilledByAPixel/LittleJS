/*
    LittleJS Particle Designer: page helpers
    - Effects, settings, behaviors and presets come from the particle
      effects plugin, the same ones a game plays
    - The code export, as a one line call or the whole emitter by hand
*/

'use strict';

// the plugin's behavior by name
const effectBehavior = (name)=>
    particleEffectBehaviors.find(b=> b.name === name);

// settings that do nothing unless another is on or off, the page dims them
const effectNeeds =
{
    emitHeight:  (s)=> s.emitRect,
    restitution: (s)=> s.collideLevel,
    friction:    (s)=> s.collideLevel,
    tileIndex:   (s)=> !s.shape,
    tileSize:    (s)=> !s.shape,
    tilePadding: (s)=> !s.shape,
};

// does the effect's tile fit texture 0; a shape or no tile always does
function effectTileFits(settings)
{
    if (settings.shape || settings.tileIndex < 0)
        return true;
    const texture = textureInfos[0];
    const cell = settings.tileSize + settings.tilePadding*2;
    if (!texture || !texture.size.x)
        return false;
    const columns = floor(texture.size.x / cell);
    const rows = floor(texture.size.y / cell);
    return settings.tileIndex < columns * rows;
}

// the name, or the name with the lowest number after it that no effect has
function effectUniqueName(effects, name)
{
    const names = new Set(effects.map(e=> e.name));
    let unique = name;
    for (let i = 2; names.has(unique); ++i)
        unique = name + ' ' + i;
    return unique;
}

///////////////////////////////////////////////////////////////////////////////
// code export

const effectNumber = (n)=> String(Number(n.toFixed(3)));

// the play options that are not their default, as an object literal
function effectOptionsCode(options, is3D)
{
    const list = [];
    options.scale != 1 && list.push('scale: ' + effectNumber(options.scale));
    options.hue && list.push('hue: ' + effectNumber(options.hue));
    options.saturation != 1 &&
        list.push('saturation: ' + effectNumber(options.saturation));
    is3D && options.flatten && list.push('flatten: true');
    return list.length ? ', {' + list.join(', ') + '}' : '';
}

// the code for what the preview plays: the one line call, or expanded the
// whole 2D emitter made by hand; 3D is always the call
function effectToCode(effect, options, expand, is3D)
{
    return expand && !is3D ? effectEmitterCode(effect, options) :
        effectCallCode(effect, options, is3D);
}

function effectCallCode(effect, options, is3D)
{
    const name = effect.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const call = is3D ? 'particleEffect3D' : 'particleEffect';
    const code = `${call}('${name}', ${is3D ? 'vec3()' : 'vec2()'}` +
        effectOptionsCode(options, is3D) + ');';

    // a built-in plays as it is, anything else once the library is loaded
    const builtIn = particleEffectsBuiltIn.includes(effect.name.toLowerCase());
    const text = (e)=> JSON.stringify(particleEffectSanitize(e));
    if (builtIn && text(effect) === text(particleEffectsGet(effect.name)))
        return code;
    return code + (builtIn ?
        ' // your version, it replaces the built-in once your library loads' :
        ' // from your library, after particleEffectsLoad');
}

// the whole emitter, settings written as they are, colors turned into hsl
// and rounded, which changes nothing that can be seen
function effectEmitterCode(effect, options)
{
    const {hue, saturation} = options;
    if (hue || saturation != 1)
        effect = particleEffectRecolor(effect, hue, saturation);
    const s = effect.settings;
    const value = (name)=> s[name] === PI ? 'PI' : String(s[name]);
    const arg = (name)=> [value(name), name];
    const color = (name)=>
    {
        const [h, sat, l, a] = new Color(...s[name]).HSLA();
        const n = effectNumber;
        return [`hsl(${n(h)}, ${n(sat)}, ${n(l)}, ${n(a)})`, name];
    };
    const tileCode = s.shape ? `particleEffectShapeTile('${s.shape}')` :
        s.tileIndex < 0 ? 'undefined' :
        `tile(${s.tileIndex}, ${s.tileSize}` +
        (s.tilePadding ? `, 0, ${s.tilePadding})` : ')');
    const emitSize = s.emitRect ?
        `vec2(${s.emitSize}, ${s.emitHeight})` : value('emitSize');

    // constructor arguments in order, one a line
    const args =
    [
        ['vec2()', 'pos'], arg('angle'), [emitSize, 'emitSize'],
        arg('emitTime'), arg('emitRate'), arg('emitConeAngle'),
        [tileCode, 'tileInfo'],
        color('colorStartA'), color('colorStartB'),
        color('colorEndA'), color('colorEndB'),
        ...['particleTime', 'sizeStart', 'sizeEnd', 'speed', 'angleSpeed',
            'damping', 'angleDamping', 'gravityScale', 'particleConeAngle',
            'fadeRate', 'randomness', 'collideLevel', 'additive',
            'randomColorLinear'].map(arg),
    ];
    const last = args.length - 1;
    let code = 'const emitter = new ParticleEmitter(\n' +
        args.map(([v, name], i)=> '    ' +
        (v + (i < last ? ',' : '')).padEnd(37) + '// ' + name).join('\n') +
        '\n);\n';

    // settings set after it is made
    for (const x of particleEffectSettings)
        if (x.extra && s[x.name] !== x.value)
            code += `emitter.${x.name} = ${value(x.name)};\n`;
    if (options.scale != 1)
        code += `emitter.scale = ${effectNumber(options.scale)};\n`;
    if (s.additive)
        code += 'emitter.renderOrder = 1e9; // glows over the rest\n';

    // behaviors, each the plugin's own push written out
    const behaviors =
        effect.behaviors.filter(b=> effectBehavior(b.name)?.update);
    if (behaviors.length)
    {
        code += 'emitter.particleUpdateCallback = (p)=>\n{\n';
        for (const b of behaviors)
            code += `    ${b.name}(p, ${b.strength});\n`;
        code += '};\n';
        for (const b of behaviors)
        {
            const source = String(effectBehavior(b.name).update);
            code += `\nconst ${b.name} = ${source.replace(/\n {4}/g, '\n')};\n`;
        }
    }
    return code;
}
