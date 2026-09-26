/*
    LittleJS Particle Effects
    - The data side of the particle designer, no page code
    - A table of every setting the designer edits
    - Effects to emitters and to code
    - Behaviors, presets and the effect library
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
// settings, read by the page, the emitter setup, the export and the sanitizer

const effectGroups = ['Emitter', 'Particles', 'Color', 'Motion', 'Collision',
    'Texture', 'Behaviors'];
const effectSettings = [];
let effectSettingGroup; // the group settings are being added to

// the slider covers min to max, typed values may go out to hardMin and hardMax
function addEffectSetting(name, kind, value, min, max, step, description,
    hardMin=min, hardMax=max)
{
    // extras are not constructor arguments, the export assigns them after
    const extra = ['trailScale', 'velocityInheritance', 'localSpace',
        'restitution', 'friction'].includes(name);
    effectSettings.push({group:effectSettingGroup, name, kind, value, min, max,
        step, description, hardMin, hardMax, extra});
}

effectSettingGroup = 'Emitter';
addEffectSetting('emitRate', 'number', 100, 0, 500, 1,
    'Particles per second, 0 emits none', 0, 1e4);
addEffectSetting('emitTime', 'number', 0, 0, 5, .05,
    'Seconds to emit for, 0 is forever', 0, 1e9);
addEffectSetting('emitSize', 'number', 0, 0, 10, .05,
    'Diameter, or width when rectangular', 0, 1e9);
addEffectSetting('emitRect', 'checkbox', false, 0, 0, 0,
    'Rectangle emitter, off is a circle');
addEffectSetting('emitHeight', 'number', 0, 0, 10, .05,
    'Rectangle height', 0, 1e9);
addEffectSetting('emitConeAngle', 'number', PI, 0, PI, .01,
    'Half angle particles move in, 3.14 is all ways');
addEffectSetting('angle', 'number', 0, -3.14, 3.14, .01,
    'Emitter angle, 0 points up', -PI, PI); // the slider steps from its min

effectSettingGroup = 'Particles';
addEffectSetting('particleTime', 'number', .5, 0, 5, .05,
    'Seconds each particle lives', 0, 1e9);
addEffectSetting('sizeStart', 'number', .1, 0, 5, .01,
    'Size at the start of life', 0, 1e9);
addEffectSetting('sizeEnd', 'number', 1, 0, 5, .01,
    'Size at the end of life', 0, 1e9);
addEffectSetting('fadeRate', 'number', .1, 0, 1, .01,
    'Share of life spent fading in and out');
addEffectSetting('randomness', 'number', .2, 0, 1, .01,
    'How much each particle varies');
addEffectSetting('particleConeAngle', 'number', PI, 0, PI, .01,
    'Half angle of start rotation, 3.14 is any');
addEffectSetting('trailScale', 'number', 0, 0, 20, .1,
    'Stretch along the motion, 0 is off', 0, 1e9);
addEffectSetting('additive', 'checkbox', false, 0, 0, 0,
    'Glow with additive blending');

effectSettingGroup = 'Color';
addEffectSetting('colorStartA', 'color', [1,1,1,1], 0, 1, .01,
    'Start color, each particle picks between A and B');
addEffectSetting('colorStartB', 'color', [1,1,1,1], 0, 1, .01,
    'Second start color');
addEffectSetting('colorEndA', 'color', [1,1,1,0], 0, 1, .01,
    'End color, each particle picks between A and B');
addEffectSetting('colorEndB', 'color', [1,1,1,0], 0, 1, .01,
    'Second end color');
addEffectSetting('randomColorLinear', 'checkbox', true, 0, 0, 0,
    'Pick along A to B, off picks each channel');

effectSettingGroup = 'Motion';
addEffectSetting('speed', 'number', .1, 0, .5, .005,
    'Start speed, world units per frame', 0, 1e9);
addEffectSetting('angleSpeed', 'number', .05, 0, .5, .005,
    'Spin speed, radians per frame', 0, 1e9);
addEffectSetting('damping', 'number', 1, .8, 1, .001,
    'Speed kept each frame, 1 keeps it all', 0, 1);
addEffectSetting('angleDamping', 'number', 1, .8, 1, .001,
    'Spin kept each frame', 0, 1);
addEffectSetting('gravityScale', 'number', 0, -2, 2, .05,
    'How much gravity pulls', -1e9, 1e9);
addEffectSetting('velocityInheritance', 'number', 0, 0, 1, .01,
    'Share of emitter motion passed on');
addEffectSetting('localSpace', 'checkbox', false, 0, 0, 0,
    'Particles move with the emitter');

effectSettingGroup = 'Collision';
addEffectSetting('collideTiles', 'checkbox', false, 0, 0, 0,
    'Hit tiles, the preview adds a floor');
addEffectSetting('restitution', 'number', 0, 0, 1, .01,
    'Bounce when hitting tiles');
addEffectSetting('friction', 'number', .8, 0, 1, .01,
    'Speed kept sliding along tiles');

effectSettingGroup = 'Texture';
addEffectSetting('tileIndex', 'number', 0, -1, 63, 1,
    'Tile in the texture, -1 is untextured', -1, 1e4);
addEffectSetting('tileSize', 'number', 16, 1, 128, 1,
    'Tile size in texture pixels', 1, 4096);
addEffectSetting('tilePadding', 'number', 1, 0, 8, 1,
    'Pixels of padding around each tile', 0, 64);

// settings that do nothing unless another is on, the page dims them
const effectNeeds = {emitHeight:'emitRect', restitution:'collideTiles',
    friction:'collideTiles'};

// settings effectApply sets itself instead of copying across
const effectIndirect = ['emitSize', 'emitRect', 'emitHeight', 'tileIndex',
    'tileSize', 'tilePadding'];

///////////////////////////////////////////////////////////////////////////////
// behaviors, each a plain named function so the export can write its source,
// using only the particle, its emitter and engine globals

function wobble(p, strength)
{
    // sway from side to side, each particle on its own beat
    p.wobblePhase ??= rand(9);
    p.velocity.x += strength * .003 * sin(time*6 + p.wobblePhase);
}

function swirl(p, strength)
{
    // turn the direction of travel a little each frame
    const a = strength * .05, c = cos(a), s = sin(a), v = p.velocity;
    v.set(v.x*c - v.y*s, v.x*s + v.y*c);
}

function turbulence(p, strength)
{
    // a random push each frame
    p.velocity.x += rand(-1, 1) * strength * .005;
    p.velocity.y += rand(-1, 1) * strength * .005;
}

function attract(p, strength)
{
    // pull toward the emitter, a negative strength pushes away
    const e = p.emitter;
    const x = e.localSpace ? 0 : e.pos.x, y = e.localSpace ? 0 : e.pos.y;
    p.velocity.x += (x - p.pos.x) * strength * .002;
    p.velocity.y += (y - p.pos.y) * strength * .002;
}

function orbit(p, strength)
{
    // push around the emitter, pair with attract to hold a circle
    const e = p.emitter;
    const x = e.localSpace ? 0 : e.pos.x, y = e.localSpace ? 0 : e.pos.y;
    p.velocity.x -= (p.pos.y - y) * strength * .002;
    p.velocity.y += (p.pos.x - x) * strength * .002;
}

function wind(p, strength)
{
    // a sideways push that grows as the particle ages
    const age = min((time - p.spawnTime) / p.lifeTime, 1);
    p.velocity.x += strength * .004 * age;
}

function stick(p, strength)
{
    // grip the ground on landing, pair with collideTiles
    if (!p.groundObject) return;
    p.velocity.x *= 1 - strength;
    p.angleVelocity *= 1 - strength;
}

const effectBehaviors =
[
    {update:wobble,     min:0,  max:5, value:1,
        description:'Sway from side to side'},
    {update:swirl,      min:-2, max:2, value:1,
        description:'Turn the direction of travel'},
    {update:turbulence, min:0,  max:5, value:1,
        description:'Random pushes every frame'},
    {update:attract,    min:-2, max:2, value:1,
        description:'Pull toward the emitter, negative pushes away'},
    {update:orbit,      min:-2, max:2, value:1,
        description:'Push around the emitter, add attract to circle it'},
    {update:wind,       min:-2, max:2, value:1,
        description:'A sideways push that grows with age'},
    {update:stick,      min:0,  max:1, value:1,
        description:'Grip on landing, pair with collideTiles'},
];
for (const b of effectBehaviors)
    b.name = b.update.name;
const effectBehavior = (name)=> effectBehaviors.find(b=> b.name === name);

///////////////////////////////////////////////////////////////////////////////
// effects

// a color from an [r,g,b,a] array or a Color, undefined if it is neither
function effectColor(value)
{
    if (value instanceof Color)
        value = [value.r, value.g, value.b, value.a];
    if (isArray(value) && value.length === 4 && value.every(isNumber))
        return value.map(c=> clamp(c));
}

// any input into a whole effect: missing fields take defaults,
// bad ones are dropped or clamped
function effectSanitize(raw)
{
    const name = typeof raw?.name === 'string' && raw.name.trim() ?
        raw.name.trim().slice(0, 60) : 'Effect';
    const input = raw?.settings && typeof raw.settings === 'object' ?
        raw.settings : {};
    const settings = {};
    for (const setting of effectSettings)
    {
        const value = input[setting.name], fallback = setting.value;
        if (setting.kind === 'checkbox')
            settings[setting.name] = typeof value === 'boolean' ? value :
                value === 0 || value === 1 ? !!value : fallback;
        else if (setting.kind === 'color')
            settings[setting.name] = effectColor(value) || fallback.slice();
        else if (isNumber(value))
        {
            const clamped = clamp(value, setting.hardMin, setting.hardMax);
            settings[setting.name] =
                setting.step >= 1 ? round(clamped) : clamped;
        }
        else
            settings[setting.name] = fallback;
    }

    // local space particles are placed relative to the emitter,
    // the tile collision is in the world
    if (settings.localSpace)
        settings.collideTiles = false;

    // known behaviors once each, in table order
    const behaviors = [];
    const list = isArray(raw?.behaviors) ? raw.behaviors : [];
    for (const b of effectBehaviors)
    {
        const found = list.find(x=> x?.name === b.name);
        if (!found)
            continue;
        const strength = isNumber(found.strength) ?
            clamp(found.strength, b.min, b.max) : b.value;
        behaviors.push({name:b.name, strength});
    }
    return {name, settings, behaviors};
}

// does the effect's tile fit texture 0, an untextured effect always does
function effectTileFits(settings)
{
    if (settings.tileIndex < 0)
        return true;
    const texture = textureInfos[0];
    const cell = settings.tileSize + settings.tilePadding*2;
    if (!texture || !texture.size.x)
        return false;
    const columns = floor(texture.size.x / cell);
    const rows = floor(texture.size.y / cell);
    return settings.tileIndex < columns * rows;
}

// the update callback that runs the effect's behaviors, if it has any
function effectUpdateCallback(behaviors)
{
    const calls = behaviors.map(b=>
        [effectBehavior(b.name).update, b.strength]);
    if (calls.length)
        return (p)=>
        {
            for (const [update, strength] of calls)
                update(p, strength);
        };
}

// set an emitter to an effect, live, so a running one keeps its particles
function effectApply(emitter, effect)
{
    const s = effect.settings;
    for (const setting of effectSettings)
    {
        if (effectIndirect.includes(setting.name))
            continue;
        emitter[setting.name] = setting.kind === 'color' ?
            new Color(...s[setting.name]) : s[setting.name];
    }
    emitter.emitCircle = !s.emitRect;
    emitter.emitSize = vec2(s.emitSize, s.emitRect ? s.emitHeight : s.emitSize);
    emitter.tileInfo = s.tileIndex >= 0 && effectTileFits(s) ?
        tile(s.tileIndex, s.tileSize, 0, s.tilePadding) : undefined;
    emitter.renderOrder = s.additive ? 1e9 : 0;
    emitter.particleUpdateCallback = effectUpdateCallback(effect.behaviors);
}

function effectMakeEmitter(effect, pos)
{
    const emitter = new ParticleEmitter(pos);
    effectApply(emitter, effect);
    return emitter;
}

///////////////////////////////////////////////////////////////////////////////
// code export

// the code to make the effect, one expression unless it needs more
function effectToCode(effect, expand)
{
    // settings are written as they are, colors are turned into hsl
    // and rounded, which changes nothing that can be seen
    const s = effect.settings;
    const value = (name)=> s[name] === PI ? 'PI' : String(s[name]);
    const arg = (name)=> [value(name), name];
    const color = (name)=>
    {
        const num = (n)=> String(Number(n.toFixed(3)));
        const [h, sat, l, a] = new Color(...s[name]).HSLA();
        return [`hsl(${num(h)}, ${num(sat)}, ${num(l)}, ${num(a)})`, name];
    };
    const tileCode = s.tileIndex < 0 ? 'undefined' :
        `tile(${s.tileIndex}, ${s.tileSize}` +
        (s.tilePadding ? `, 0, ${s.tilePadding})` : ')');
    const emitSize = s.emitRect ?
        `vec2(${s.emitSize}, ${s.emitHeight})` : value('emitSize');

    // constructor arguments in order
    const args =
    [
        ['vec2()', 'pos'], arg('angle'), [emitSize, 'emitSize'],
        arg('emitTime'), arg('emitRate'), arg('emitConeAngle'),
        [tileCode, 'tileInfo'],
        color('colorStartA'), color('colorStartB'),
        color('colorEndA'), color('colorEndB'),
        ...['particleTime', 'sizeStart', 'sizeEnd', 'speed', 'angleSpeed',
            'damping', 'angleDamping', 'gravityScale', 'particleConeAngle',
            'fadeRate', 'randomness', 'collideTiles', 'additive',
            'randomColorLinear'].map(arg),
    ];
    let code = 'new ParticleEmitter(';
    if (expand)
    {
        const last = args.length - 1;
        code += '\n' + args.map(([v, name], i)=> '    ' +
            (v + (i < last ? ',' : '')).padEnd(32) + '// ' + name).join('\n');
        code += '\n)';
    }
    else
        code += args.map(a=> a[0]).join(', ') + ')';

    // extra settings and behaviors need the emitter in a variable
    const extras = effectSettings.filter(x=> x.extra && s[x.name] !== x.value);
    const behaviors = effect.behaviors;
    if (!extras.length && !behaviors.length)
        return code + ';';

    code = 'const emitter = ' + code + ';\n';
    for (const x of extras)
        code += `emitter.${x.name} = ${value(x.name)};\n`;
    if (behaviors.length)
    {
        code += 'emitter.particleUpdateCallback = (p)=>\n{\n';
        for (const b of behaviors)
            code += `    ${b.name}(p, ${b.strength});\n`;
        code += '};\n';
        for (const b of behaviors)
            code += '\n' + effectBehavior(b.name).update + '\n';
    }
    return code;
}

///////////////////////////////////////////////////////////////////////////////
// library

// a library file, or one effect, into sanitized effects; throws on bad input
function effectLibraryParse(text)
{
    const data = JSON.parse(text);
    const list = isArray(data?.effects) ? data.effects :
        data?.settings ? [data] : undefined;
    if (!list || !list.length)
        throw new Error('no effects in this file');
    return list.map(effectSanitize);
}

function effectLibraryText(effects)
{ return JSON.stringify({version:1, effects}, undefined, 1); }

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
// presets, starting points tuned with the designer's gravity of -.01
// tiles.png: 0 hard circle, 1 circle, 2 glow, 3 smoke, 4 square, 5 line,
// 6 plus, 7 triangle, 8 ring

const effectPresets =
[
    {name:'Fire', settings:{emitRate:200, emitSize:.5, emitConeAngle:.3,
        tileIndex:2, particleTime:.7, sizeStart:.6, sizeEnd:.1, speed:.04,
        angleSpeed:.02, damping:.95, gravityScale:-.2, fadeRate:.3,
        randomness:.3, additive:true,
        colorStartA:hsl(.08,1,.6), colorStartB:hsl(.14,1,.65),
        colorEndA:hsl(.02,1,.5,0), colorEndB:hsl(0,1,.3,0)}},
    {name:'Smoke', settings:{emitRate:40, emitSize:.5, emitConeAngle:.3,
        tileIndex:3, particleTime:3, sizeStart:.5, sizeEnd:2.5, speed:.015,
        angleSpeed:.01, damping:.99, gravityScale:-.03, fadeRate:.5,
        randomness:.3,
        colorStartA:hsl(0,0,.5,.5), colorStartB:hsl(0,0,.3,.5),
        colorEndA:hsl(0,0,.2,0), colorEndB:hsl(0,0,.4,0)},
        behaviors:[{name:'wobble', strength:.5}]},
    {name:'Sparks', settings:{emitRate:100, emitSize:.2, tileIndex:1,
        particleTime:.6, sizeStart:.1, sizeEnd:.05, speed:.2, damping:.96,
        gravityScale:1, fadeRate:.1, randomness:.4, additive:true,
        trailScale:3,
        colorStartA:hsl(.17,1,.9), colorStartB:hsl(.12,1,.65),
        colorEndA:hsl(.07,1,.5,0), colorEndB:hsl(.03,1,.5,0)}},
    {name:'Explosion', settings:{emitRate:800, emitTime:.1, tileIndex:2,
        particleTime:.6, sizeStart:1, sizeEnd:.1, speed:.2, damping:.9,
        fadeRate:.2, randomness:.5, additive:true,
        colorStartA:hsl(.12,1,.65), colorStartB:hsl(.06,1,.55),
        colorEndA:hsl(0,1,.5,0), colorEndB:hsl(0,0,.3,0)}},
    {name:'Magic', settings:{emitRate:60, emitSize:1.5, tileIndex:1,
        particleTime:1.5, sizeStart:.3, sizeEnd:0, speed:.02, fadeRate:.3,
        randomness:.3, additive:true,
        colorStartA:hsl(.55,1,.65), colorStartB:hsl(.79,1,.65),
        colorEndA:hsl(0,0,1,0), colorEndB:hsl(0,0,1,0)},
        behaviors:[{name:'swirl', strength:.5}]},
    {name:'Rain', settings:{emitRate:300, emitSize:12, emitRect:true,
        emitHeight:8, angle:PI, emitConeAngle:0, tileIndex:1,
        particleTime:.8, sizeStart:.06, sizeEnd:.06, speed:.3, gravityScale:1,
        fadeRate:.1, randomness:.2, trailScale:6,
        colorStartA:hsl(.63,1,.8,.6), colorStartB:hsl(.63,1,.8,.4),
        colorEndA:hsl(.63,1,.8,.6), colorEndB:hsl(.63,1,.8,.4)}},
    {name:'Snow', settings:{emitRate:40, emitSize:12, emitRect:true,
        emitHeight:8, angle:PI, emitConeAngle:.3, tileIndex:1,
        particleTime:5, sizeStart:.15, sizeEnd:.15, speed:.02, damping:.98,
        gravityScale:.1, fadeRate:.2, randomness:.3,
        colorStartA:hsl(0,0,1), colorStartB:hsl(.58,1,.9),
        colorEndA:hsl(0,0,1), colorEndB:hsl(.58,1,.9)},
        behaviors:[{name:'wobble', strength:1}]},
    {name:'Blood', settings:{emitRate:300, emitTime:.1, emitConeAngle:.8,
        tileIndex:0, particleTime:3, sizeStart:.15, sizeEnd:.1, speed:.2,
        gravityScale:1, fadeRate:.1, randomness:.4, collideTiles:true,
        restitution:.1,
        colorStartA:hsl(0,1,.35), colorStartB:hsl(0,1,.2),
        colorEndA:hsl(0,1,.25), colorEndB:hsl(0,1,.15)},
        behaviors:[{name:'stick', strength:1}]},
];
