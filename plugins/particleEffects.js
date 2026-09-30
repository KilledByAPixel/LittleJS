/**
 * LittleJS Particle Effects Plugin
 * - Ready made particle effects in one line, particleEffect('fire', pos), and particleEffect3D for 3D
 * - Every built-in effect is tuned around a one unit emitter; options.scale grows it to fit, options.hue and
 *   options.saturation recolor it
 * - Effects are plain data, {name, settings, behaviors}, the format the particle designer saves: load a library the
 *   designer saved with particleEffectsLoad and play its effects by name
 * - The built-in effects draw with a sheet of shapes the plugin draws itself, so they need no image
 * @namespace ParticleEffects
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
// settings, what an effect sets on an emitter

/** The groups the settings are in, in order
 *  @type {Array<string>}
 *  @memberof ParticleEffects */
const particleEffectGroups = ['Emitter', 'Particles', 'Color', 'Motion', 'Collision', 'Texture', 'Behaviors'];

/** Every setting an effect has: its name, kind (number, checkbox, color or shape), default, the range the designer's
 *  slider covers (min, max, step), the hard limits a typed value is clamped to, and whether it is set after the
 *  emitter is made rather than passed to its constructor (extra)
 *  @type {Array<{group:string, name:string, kind:string, value:any, min:number, max:number, step:number,
 *  description:string, hardMin:number, hardMax:number, extra:boolean}>}
 *  @memberof ParticleEffects */
const particleEffectSettings = [];
let particleEffectSettingGroup; // the group settings are being added to

// the slider covers min to max, typed values may go out to hardMin and hardMax
function particleEffectAddSetting(name, kind, value, min, max, step, description, hardMin=min, hardMax=max)
{
    // extras are not constructor arguments, the code export assigns them after
    const extra = ['trailScale', 'velocityInheritance', 'localSpace', 'restitution', 'friction', 'gravity'].includes(name);
    particleEffectSettings.push({group:particleEffectSettingGroup, name, kind, value, min, max, step, description,
        hardMin, hardMax, extra});
}

particleEffectSettingGroup = 'Emitter';
particleEffectAddSetting('emitRate', 'number', 100, 0, 500, 1,
    'Particles per second, 0 emits none', 0, 1e4);
particleEffectAddSetting('emitTime', 'number', 0, 0, 5, .05,
    'Seconds to emit for, 0 is forever', 0, 1e9);
particleEffectAddSetting('emitSize', 'number', 0, 0, 10, .05,
    'Diameter, or width when rectangular', 0, 1e9);
particleEffectAddSetting('emitRect', 'checkbox', false, 0, 0, 0,
    'Rectangle emitter, off is a circle');
particleEffectAddSetting('emitHeight', 'number', 0, 0, 10, .05,
    'Rectangle height', 0, 1e9);
particleEffectAddSetting('emitConeAngle', 'number', PI, 0, PI, .01,
    'Half angle particles move in, 3.14 is all ways');
particleEffectAddSetting('angle', 'number', 0, -3.14, 3.14, .01,
    'Emitter angle, 0 points up', -PI, PI); // the slider steps from its min

particleEffectSettingGroup = 'Particles';
particleEffectAddSetting('particleTime', 'number', .5, 0, 5, .05,
    'Seconds each particle lives', 0, 1e9);
particleEffectAddSetting('sizeStart', 'number', .1, 0, 5, .01,
    'Size at the start of life', 0, 1e9);
particleEffectAddSetting('sizeEnd', 'number', 1, 0, 5, .01,
    'Size at the end of life', 0, 1e9);
particleEffectAddSetting('fadeRate', 'number', .1, 0, 1, .01,
    'Share of life spent fading in and out');
particleEffectAddSetting('randomness', 'number', .2, 0, 1, .01,
    'How much each particle varies');
particleEffectAddSetting('particleConeAngle', 'number', PI, 0, PI, .01,
    'Half angle of start rotation, 3.14 is any');
particleEffectAddSetting('trailScale', 'number', 0, 0, 20, .1,
    'Stretch along the motion, 0 is off', 0, 1e9);
particleEffectAddSetting('additive', 'checkbox', false, 0, 0, 0,
    'Glow with additive blending');

particleEffectSettingGroup = 'Color';
particleEffectAddSetting('colorStartA', 'color', [1,1,1,1], 0, 1, .01,
    'Start color, each particle picks between A and B');
particleEffectAddSetting('colorStartB', 'color', [1,1,1,1], 0, 1, .01,
    'Second start color');
particleEffectAddSetting('colorEndA', 'color', [1,1,1,0], 0, 1, .01,
    'End color, each particle picks between A and B');
particleEffectAddSetting('colorEndB', 'color', [1,1,1,0], 0, 1, .01,
    'Second end color');
particleEffectAddSetting('randomColorLinear', 'checkbox', true, 0, 0, 0,
    'Pick along A to B, off picks each channel');

particleEffectSettingGroup = 'Motion';
particleEffectAddSetting('speed', 'number', .1, 0, .5, .005,
    'Start speed, world units per frame', 0, 1e9);
particleEffectAddSetting('angleSpeed', 'number', .05, 0, .5, .005,
    'Spin speed, radians per frame', 0, 1e9);
particleEffectAddSetting('damping', 'number', 1, .8, 1, .001,
    'Speed kept each frame, 1 keeps it all', 0, 1);
particleEffectAddSetting('angleDamping', 'number', 1, .8, 1, .001,
    'Spin kept each frame', 0, 1);
particleEffectAddSetting('gravityScale', 'number', 0, -2, 2, .05,
    'How much gravity pulls', -1e9, 1e9);
particleEffectAddSetting('gravity', 'number', 0, -.02, .02, .0005,
    'Its own fall each frame, the same in any game', -1, 1);
particleEffectAddSetting('velocityInheritance', 'number', 0, 0, 1, .01,
    'Share of emitter motion passed on');
particleEffectAddSetting('localSpace', 'checkbox', false, 0, 0, 0,
    'Particles move with the emitter');

particleEffectSettingGroup = 'Collision';
particleEffectAddSetting('collideLevel', 'checkbox', false, 0, 0, 0,
    'Hit tiles, the preview adds a floor');
particleEffectAddSetting('restitution', 'number', 0, 0, 1, .01,
    'Bounce when hitting tiles');
particleEffectAddSetting('friction', 'number', .8, 0, 1, .01,
    'Speed kept sliding along tiles');

particleEffectSettingGroup = 'Texture';
particleEffectAddSetting('shape', 'shape', 'soft', 0, 0, 0,
    'Built-in shape, none uses the tile');
particleEffectAddSetting('tileIndex', 'number', -1, -1, 63, 1,
    'Tile in texture 0 when no shape, -1 is untextured', -1, 1e4);
particleEffectAddSetting('tileSize', 'number', 16, 1, 128, 1,
    'Tile size in texture pixels', 1, 4096);
particleEffectAddSetting('tilePadding', 'number', 1, 0, 8, 1,
    'Pixels of padding around each tile', 0, 64);

/** The behaviors an effect can use, each a push applied to every particle every update, with a 2D and a 3D version
 *  @type {Array<{name:string, update:Function|undefined, update3D:Function|undefined, min:number, max:number,
 *  value:number, description:string}>}
 *  @memberof ParticleEffects */
const particleEffectBehaviors =
[
    {name:'wobble',     min:0,  max:5, value:1, description:'Sway from side to side'},
    {name:'swirl',      min:-2, max:2, value:1, description:'Turn the direction of travel'},
    {name:'turbulence', min:0,  max:5, value:1, description:'Random pushes every frame'},
    {name:'attract',    min:-2, max:2, value:1, description:'Pull toward the emitter, negative pushes away'},
    {name:'orbit',      min:-2, max:2, value:1, description:'Push around the emitter, add attract to circle it'},
    {name:'wind',       min:-2, max:2, value:1, description:'A sideways push that grows with age'},
    {name:'stick',      min:0,  max:1, value:1, description:'Grip on landing, pair with collideLevel'},
].map(b=> ({...b, update: undefined, update3D: undefined}));
const particleEffectBehavior = (name)=> particleEffectBehaviors.find(b=> b.name === name);

/** Names of the shapes the plugin draws, for an effect's shape setting
 *  @type {Array<string>}
 *  @memberof ParticleEffects */
const particleEffectShapes = ['dot', 'soft', 'glow', 'smoke', 'spark', 'square', 'triangle', 'ring', 'star', 'plus'];

///////////////////////////////////////////////////////////////////////////////
// effects

// a color from an [r,g,b,a] array or a Color, undefined if it is neither
function particleEffectColor(value)
{
    if (value instanceof Color)
        value = [value.r, value.g, value.b, value.a];
    if (isArray(value) && value.length === 4 && value.every(isNumber))
        return value.map(c=> clamp(c));
}

/** Any input into a whole effect: missing fields take their defaults, bad ones are dropped or clamped
 *  @param {Object} [raw] - {name, settings, behaviors}, from a library file, the designer or code
 *  @return {{name:string, settings:Object, behaviors:Array<{name:string, strength:number}>}}
 *  @memberof ParticleEffects */
function particleEffectSanitize(raw)
{
    const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'Effect';
    const input = raw?.settings && typeof raw.settings === 'object' ? {...raw.settings} : {};
    input.collideLevel ??= input.collideTiles; // its name before 1.20
    // a library saved before shapes names its tile and no shape, it keeps its tile
    if (input.shape === undefined && isNumber(input.tileIndex))
        input.shape = '';
    const settings = {};
    for (const setting of particleEffectSettings)
    {
        const value = input[setting.name], fallback = setting.value;
        if (setting.kind === 'checkbox')
            settings[setting.name] = typeof value === 'boolean' ? value : value === 0 || value === 1 ? !!value : fallback;
        else if (setting.kind === 'color')
            settings[setting.name] = particleEffectColor(value) || fallback.slice();
        else if (setting.kind === 'shape')
            settings[setting.name] = value === '' || particleEffectShapes.includes(value) ? value : fallback;
        else if (isNumber(value))
        {
            const clamped = clamp(value, setting.hardMin, setting.hardMax);
            settings[setting.name] = setting.step >= 1 ? round(clamped) : clamped;
        }
        else
            settings[setting.name] = fallback;
    }

    // local space particles are placed relative to the emitter, the tile collision is in the world
    if (settings.localSpace)
        settings.collideLevel = false;

    // known behaviors once each, in table order
    const behaviors = [];
    const list = isArray(raw?.behaviors) ? raw.behaviors : [];
    for (const b of particleEffectBehaviors)
    {
        const found = list.find(x=> x?.name === b.name);
        if (!found)
            continue;
        const strength = isNumber(found.strength) ? clamp(found.strength, b.min, b.max) : b.value;
        behaviors.push({name:b.name, strength});
    }
    return {name, settings, behaviors};
}

/** A copy of an effect with its four colors turned around the color wheel and their saturation scaled; lightness and
 *  alpha stay, and grey and white have no hue to turn
 *  @param {Object} effect
 *  @param {number} [hue] - How far around the wheel, 1 is all the way
 *  @param {number} [saturation] - Multiplies the saturation, 0 is grey, clamped to 1
 *  @return {Object}
 *  @memberof ParticleEffects */
function particleEffectRecolor(effect, hue=0, saturation=1)
{
    const settings = {...effect.settings};
    for (const name of ['colorStartA', 'colorStartB', 'colorEndA', 'colorEndB'])
    {
        const [h, s, l, a] = new Color(...settings[name]).HSLA();
        const c = new Color().setHSLA(mod(h + hue), clamp(s * saturation), l, a);
        settings[name] = [c.r, c.g, c.b, c.a];
    }
    return {...effect, settings, behaviors: effect.behaviors.map(b=> ({...b}))};
}

///////////////////////////////////////////////////////////////////////////////
// libraries

// the effects by lower case name, the built-ins and any a game adds or loads
const particleEffectsByName = new Map;

/** Add effects to play by name, sanitized; one with the name of an effect already there replaces it
 *  @param {Array<Object>|Object} effects
 *  @memberof ParticleEffects */
function particleEffectsAdd(effects)
{
    for (const effect of isArray(effects) ? effects : [effects])
    {
        const clean = particleEffectSanitize(effect);
        particleEffectsByName.set(clean.name.toLowerCase(), clean);
    }
}

/** The effect with a name, any case, undefined if there is none
 *  @param {string} name
 *  @return {Object|undefined}
 *  @memberof ParticleEffects */
function particleEffectsGet(name) { return particleEffectsByName.get(String(name).toLowerCase()); }

/** A library file, or one effect, into sanitized effects; throws on bad input
 *  @param {string} text
 *  @return {Array<Object>}
 *  @memberof ParticleEffects */
function particleEffectsParse(text)
{
    const data = JSON.parse(text);
    const list = isArray(data?.effects) ? data.effects : data?.settings ? [data] : undefined;
    if (!list || !list.length)
        throw new Error('no effects in this file');
    return list.map(particleEffectSanitize);
}

/** The text of a library file with these effects, what particleEffectsLoad and the designer read
 *  @param {Array<Object>} effects
 *  @return {string}
 *  @memberof ParticleEffects */
function particleEffectsText(effects) { return JSON.stringify({version:1, effects}, undefined, 1); }

/** Load a library file the particle designer saved and add its effects
 *  @param {string} url
 *  @return {Promise<Array<Object>>} - The effects it had
 *  @memberof ParticleEffects */
async function particleEffectsLoad(url)
{
    const effects = particleEffectsParse(JSON.stringify(await fetchJSON(url)));
    particleEffectsAdd(effects);
    return effects;
}

///////////////////////////////////////////////////////////////////////////////
// the shape sheet: every shape white on clear in a 32 pixel cell of one canvas, drawn the first time one is asked for

let particleEffectShapeTiles;

/** The tile of a built-in shape, on a sheet the plugin draws once; undefined headless or without a canvas
 *  @param {string} name - One of particleEffectShapes
 *  @return {TileInfo|undefined}
 *  @memberof ParticleEffects */
function particleEffectShapeTile(name)
{
    if (!particleEffectShapeTiles)
    {
        if (headlessMode || !glContext || typeof OffscreenCanvas == 'undefined') return;
        const cell = 32, r = 15, count = particleEffectShapes.length;
        const context = createCanvasContext(cell * count, cell);
        context.fillStyle = context.strokeStyle = '#fff';
        const soft = (x, y, radius, alpha=(t)=> 1 - t)=>
        {
            // a round falloff from the middle out
            const g = context.createRadialGradient(x, y, 0, x, y, radius);
            for (let i = 0; i <= 8; ++i)
                g.addColorStop(i/8, 'rgba(255,255,255,' + alpha(i/8).toFixed(3) + ')');
            context.fillStyle = g;
            context.beginPath(); context.arc(x, y, radius, 0, 2*PI); context.fill();
            context.fillStyle = '#fff';
        };
        const draw =
        {
            dot:      (x, y)=> { context.beginPath(); context.arc(x, y, r, 0, 2*PI); context.fill(); },
            soft:     (x, y)=> soft(x, y, r),
            glow:     (x, y)=> soft(x, y, r, (t)=> engineGlowAlpha(t, 1)),
            smoke:    (x, y)=>
            {
                // a lumpy puff of soft circles
                for (const [dx, dy, dr] of [[-4,-3,9], [4,-2,8], [0,4,9], [-5,5,6], [6,5,6]])
                    soft(x + dx, y + dy, dr, (t)=> (1 - t) * .7);
            },
            spark:    (x, y)=>
            {
                // a glow squeezed thin, a streak along the tile's up
                context.save(); context.translate(x, y); context.scale(.3, 1);
                soft(0, 0, r, (t)=> engineGlowAlpha(t, .6));
                context.restore();
            },
            square:   (x, y)=> context.fillRect(x - r, y - r, 2*r, 2*r),
            triangle: (x, y)=>
            {
                context.beginPath(); context.moveTo(x, y - r); context.lineTo(x + r, y + r); context.lineTo(x - r, y + r);
                context.fill();
            },
            ring:     (x, y)=>
            {
                context.lineWidth = 3;
                context.beginPath(); context.arc(x, y, r - 2, 0, 2*PI); context.stroke();
            },
            star:     (x, y)=>
            {
                context.beginPath();
                for (let i = 0; i < 10; ++i)
                {
                    const a = i * PI / 5 - PI/2, d = i % 2 ? r * .45 : r;
                    context.lineTo(x + cos(a) * d, y + sin(a) * d);
                }
                context.fill();
            },
            plus:     (x, y)=> { context.fillRect(x - r, y - 4, 2*r, 8); context.fillRect(x - 4, y - r, 8, 2*r); },
        };
        particleEffectShapes.forEach((name, i)=> draw[name](i * cell + cell/2, cell/2));
        const texture = new TextureInfo(context.canvas);
        particleEffectShapeTiles = new Map(particleEffectShapes.map((name, i)=>
            [name, new TileInfo(vec2(i * cell + 1, 1), vec2(cell - 2), texture)]));
    }
    return particleEffectShapeTiles.get(name);
}
