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

///////////////////////////////////////////////////////////////////////////////
// behaviors, the 2D pushes: a distance moved grows with the particle's scale, so a bigger effect moves the same way

{
    const b = particleEffectBehavior;
    b('wobble').update = (p, s)=>
    {
        p.wobblePhase ??= rand(9); // each particle on its own beat
        p.velocity.x += s * .003 * p.scale * sin(time*6 + p.wobblePhase);
    };
    b('swirl').update = (p, s)=>
    {
        // turn the direction of travel a little each frame
        const a = s * .05, c = cos(a), n = sin(a), v = p.velocity;
        v.set(v.x*c - v.y*n, v.x*n + v.y*c);
    };
    b('turbulence').update = (p, s)=>
    {
        p.velocity.x += rand(-1, 1) * s * .005 * p.scale;
        p.velocity.y += rand(-1, 1) * s * .005 * p.scale;
    };
    b('attract').update = (p, s)=>
    {
        // pull toward the emitter by the distance, which grows with the scale already
        const e = p.emitter, x = e.localSpace ? 0 : e.pos.x, y = e.localSpace ? 0 : e.pos.y;
        p.velocity.x += (x - p.pos.x) * s * .002;
        p.velocity.y += (y - p.pos.y) * s * .002;
    };
    b('orbit').update = (p, s)=>
    {
        const e = p.emitter, x = e.localSpace ? 0 : e.pos.x, y = e.localSpace ? 0 : e.pos.y;
        p.velocity.x -= (p.pos.y - y) * s * .002;
        p.velocity.y += (p.pos.x - x) * s * .002;
    };
    b('wind').update = (p, s)=>
        p.velocity.x += s * .004 * p.scale * min((time - p.spawnTime) / p.lifeTime, 1);
    b('stick').update = (p, s)=>
    {
        // grip the ground on landing, pair with collideLevel
        if (!p.groundObject) return;
        p.velocity.x *= 1 - s;
        p.angleVelocity *= 1 - s;
    };
}

/** Add a behavior effects can use by name, or replace one
 *  @param {string} name
 *  @param {function(Particle, number): void} update - Pushes a 2D particle, given the strength
 *  @param {function(Particle3D, number): void} [update3D] - The same for a 3D particle, none leaves 3D alone
 *  @param {number} [min] - Strength range the designer offers
 *  @param {number} [max]
 *  @param {number} [value] - Strength when first added
 *  @param {string} [description]
 *  @memberof ParticleEffects */
function particleEffectsAddBehavior(name, update, update3D, min=-2, max=2, value=1, description='')
{
    const old = particleEffectBehavior(name);
    old && particleEffectBehaviors.splice(particleEffectBehaviors.indexOf(old), 1);
    particleEffectBehaviors.push({name, update, update3D, min, max, value, description});
}

// the update callback that runs an effect's behaviors, in 2D or 3D, undefined when it has none for that
function particleEffectUpdateCallback(behaviors, is3D)
{
    const calls = behaviors.map(b=> [particleEffectBehavior(b.name)?.[is3D ? 'update3D' : 'update'], b.strength])
        .filter(c=> c[0]);
    if (calls.length)
        return (p)=> { for (const [update, strength] of calls) update(p, strength); };
}

///////////////////////////////////////////////////////////////////////////////
// 2D effects

// the settings the builders set themselves instead of copying across
const particleEffectIndirect = ['emitSize', 'emitRect', 'emitHeight', 'tileIndex', 'tileSize', 'tilePadding', 'shape'];

// the tile an effect draws with: its shape, else its tile in texture 0 when that fits, else none
function particleEffectTileInfo(s)
{
    if (s.shape)
        return particleEffectShapeTile(s.shape);
    if (s.tileIndex < 0) return;
    const texture = textureInfos[0], cell = s.tileSize + s.tilePadding*2;
    if (!texture || !texture.size.x) return;
    if (s.tileIndex < floor(texture.size.x / cell) * floor(texture.size.y / cell))
        return tile(s.tileIndex, s.tileSize, 0, s.tilePadding);
}

/** Set a 2D emitter to an effect, live, so a running one keeps its particles
 *  @param {ParticleEmitter} emitter
 *  @param {Object} effect
 *  @memberof ParticleEffects */
function particleEffectApply(emitter, effect)
{
    const s = effect.settings;
    for (const setting of particleEffectSettings)
        if (!particleEffectIndirect.includes(setting.name))
            emitter[setting.name] = setting.kind === 'color' ? new Color(...s[setting.name]) : s[setting.name];
    emitter.emitCircle = !s.emitRect;
    emitter.emitSize = vec2(s.emitSize, s.emitRect ? s.emitHeight : s.emitSize);
    emitter.tileInfo = particleEffectTileInfo(s);
    emitter.renderOrder = s.additive ? 1e9 : 0;
    emitter.particleUpdateCallback = particleEffectUpdateCallback(effect.behaviors);
}

// an effect from a name or an effect, recolored by the options
function particleEffectResolve(nameOrEffect, options)
{
    const effect = typeof nameOrEffect == 'string' ? particleEffectsGet(nameOrEffect) : nameOrEffect;
    ASSERT(!!effect, 'no particle effect named ' + nameOrEffect);
    if (!effect) return;
    const {hue=0, saturation=1} = options;
    return hue || saturation != 1 ? particleEffectRecolor(effect, hue, saturation) : effect;
}

/** Play an effect: a 2D emitter set to it, placed, scaled and recolored
 *  - A continuous effect (fire, a torch) goes until destroyed or given an emitTime, a one-shot ends itself
 *  - Attach it to an object with addChild to follow it
 *  @param {string|Object} nameOrEffect - A built-in or added effect's name, or an effect
 *  @param {Vector2} [pos]
 *  @param {Object} [options]
 *  @param {number} [options.scale] - Grows the whole effect, the built-ins fit a one unit object at 1
 *  @param {number} [options.hue] - Turns its colors around the color wheel, 1 is all the way
 *  @param {number} [options.saturation] - Multiplies its saturation, 0 is grey
 *  @param {number} [options.angle] - Direction, 0 is up; the effect's own angle when not given
 *  @return {ParticleEmitter|undefined} - undefined when there is no such effect
 *  @memberof ParticleEffects */
function particleEffect(nameOrEffect, pos=vec2(), options={})
{
    const effect = particleEffectResolve(nameOrEffect, options);
    if (!effect) return;
    const emitter = new ParticleEmitter(pos.copy());
    particleEffectApply(emitter, effect);
    emitter.scale = options.scale ?? 1;
    if (options.angle !== undefined)
        emitter.angle = options.angle;
    return emitter;
}

/** An effect with a 2D emitter's settings, to save, build again, or build in 3D with particleEffect3D; its tile is
 *  left out, since a hand made emitter's tile is its own texture and not one an effect can name
 *  @param {ParticleEmitter} emitter
 *  @param {string} [name]
 *  @return {Object}
 *  @memberof ParticleEffects */
function particleEffectFromEmitter(emitter, name='Effect')
{
    const settings = {};
    for (const setting of particleEffectSettings)
        if (!particleEffectIndirect.includes(setting.name) && emitter[setting.name] !== undefined)
            settings[setting.name] = emitter[setting.name]; // a Color is taken as its channels by the sanitizer
    settings.emitRect = !emitter.emitCircle;
    settings.emitSize = emitter.emitSize.x;
    settings.emitHeight = emitter.emitSize.y;
    settings.shape = '';
    settings.tileIndex = -1;
    return particleEffectSanitize({name, settings});
}

///////////////////////////////////////////////////////////////////////////////
// 3D effects

// the 3D pushes: a 3D particle is one view object the emitter reuses, so what differs per particle comes from its
// randomized lifetime, and distances grow with the emitter's scale
{
    const b = particleEffectBehavior;
    const scaleOf = (p)=> render3DMaxScale(render3DObjectMatrix(p.emitter).m);
    b('wobble').update3D = (p, s)=> p.velocity.x += s * .003 * scaleOf(p) * sin(time*6 + p.lifeTime * 97 % 9);
    b('swirl').update3D = (p, s)=>
    {
        const a = s * .05, c = cos(a), n = sin(a), v = p.velocity;
        v.set(v.x*c - v.y*n, v.x*n + v.y*c, v.z);
    };
    b('turbulence').update3D = (p, s)=>
    {
        const k = s * .005 * scaleOf(p);
        p.velocity.x += rand(-1, 1) * k, p.velocity.y += rand(-1, 1) * k, p.velocity.z += rand(-1, 1) * k;
    };
    b('attract').update3D = (p, s)=>
    {
        const c = p.emitter.getWorldPos3D();
        p.velocity.x += (c.x - p.pos.x) * s * .002;
        p.velocity.y += (c.y - p.pos.y) * s * .002;
        p.velocity.z += (c.z - p.pos.z) * s * .002;
    };
    b('orbit').update3D = (p, s)=>
    {
        const c = p.emitter.getWorldPos3D();
        p.velocity.x -= (p.pos.y - c.y) * s * .002;
        p.velocity.y += (p.pos.x - c.x) * s * .002;
    };
    b('wind').update3D = (p, s)=> p.velocity.x += s * .004 * scaleOf(p) * min(p.age / p.lifeTime, 1);
    b('stick').update3D = (p, s)=>
    {
        // resting after a landing, barely moving up or down, it grips
        if (abs(p.velocity.y) > .001) return;
        p.velocity.x *= 1 - s, p.velocity.z *= 1 - s;
    };
}

/** Play an effect in 3D: a ParticleEmitter3D set to it, placed, scaled and recolored
 *  - The same effect data as particleEffect, so the look carries across: a rectangle spawn area becomes a flat box, a
 *    trail becomes a streak of the same length, and the settings the 3D emitter lacks (particleConeAngle,
 *    randomColorLinear, velocityInheritance, localSpace) are left out
 *  @param {string|Object} nameOrEffect - A built-in or added effect's name, or an effect
 *  @param {Vector3} [pos3D]
 *  @param {Object} [options] - scale, hue, saturation and angle as particleEffect; angle turns it about z, so 0 is up
 *  @return {ParticleEmitter3D|undefined} - undefined when there is no such effect
 *  @memberof ParticleEffects */
function particleEffect3D(nameOrEffect, pos3D=vec3(), options={})
{
    const effect = particleEffectResolve(nameOrEffect, options);
    if (!effect) return;
    const s = effect.settings, color = (name)=> new Color(...s[name]);
    const e = new ParticleEmitter3D(pos3D.copy(), s.emitRect ? vec3(s.emitSize, s.emitHeight, 0) : s.emitSize,
        s.emitTime, s.emitRate, s.emitConeAngle, particleEffectTileInfo(s), color('colorStartA'), color('colorStartB'),
        color('colorEndA'), color('colorEndB'), s.particleTime, s.sizeStart, s.sizeEnd, s.speed, s.damping,
        s.gravity, s.fadeRate, s.randomness, s.additive);
    e.gravityScale = s.gravityScale;
    e.angleSpeed = s.angleSpeed, e.angleDamping = s.angleDamping;
    e.trailTime = s.trailScale / 60; // a stretch of speed times trailScale is a streak of that many frames
    e.collideLevel = s.collideLevel, e.restitution = s.restitution, e.friction = s.friction;
    // a 2D emitter at angle a shoots along (sin a, cos a), a z turn r takes up to (-sin r, cos r), so r is -a
    e.rotation3D = vec3(0, 0, -(options.angle ?? s.angle));
    e.scale3D = vec3(options.scale ?? 1);
    e.particleUpdateCallback = particleEffectUpdateCallback(effect.behaviors, true);
    return e;
}
