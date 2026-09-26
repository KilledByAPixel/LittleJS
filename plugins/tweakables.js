/**
 * LittleJS Tweakables Plugin
 * - Change values live from a panel while the game runs, for tuning without a reload
 * - tweak('name') adds a global, or a field of an object with the object option, a number gets a slider when it
 *   has a range, a boolean a checkbox, a Color a color picker with an alpha slider, a Vector2 or Vector3 a number
 *   for each axis
 * - tweakButton adds a button that calls a function, like one to restart the level
 * - Press 9 while the debug overlay is open to show the panel, or set debugTweakables to show it from the start
 * - Changes are saved and come back after a refresh, until the value in the code itself changes
 * - Copy puts the changed values on the clipboard as lines of code, to paste over the values in the code
 * - Debug builds only, in a release build nothing is added and the code's values are used as they are
 * @namespace Tweakables
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// the tweaks and dividers in the order they were added
const tweakList = [];

// the saved values by name, each with the code value it was saved over, read when the first tweak is added
let tweakSaved;

// the panel, made the first time it is shown, and if its rows need to be made again
let tweakPanel, tweakRows, tweakRowsDirty = true;

// a global's name, or a dotted path to a field on one
const tweakPathRegex = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

/** Options for a tweak
 *  @typedef {Object} TweakOptions
 *  @property {number} [min] - Lowest value on the slider, the slider shows when min and max are both set
 *  @property {number} [max] - Highest value on the slider
 *  @property {number} [step] - Step for the slider and number box, a thousandth of the range by default
 *  @property {string} [label] - Name to show in place of the path, and the name it is saved by with an object
 *  @property {Object} [object] - Object the path is a field of, in place of a global, for an ES module game
 *  @memberof Tweakables */

/** Add a value to the tweakables panel, so it can be changed while the game runs
 *  - The path is the name of a global, or a dotted path to a field on one like 'player.speed'
 *  - Only globals of a script can be found by name, an ES module game passes the object its values are on
 *  - Its type comes from the value it has now: a number, boolean, Color, Vector2 or Vector3
 *  - Call it after the value is set, at the end of gameInit
 *  - Adding the same path again keeps its row and brings its tweaked value back, for an object made again;
 *    with the object option it is known by its label, so two objects with the same field need their own labels
 *  - Does nothing in release builds
 *  @param {string} path - Name of a global, or a dotted path to a field on one or on the object option
 *  @param {TweakOptions} [options]
 *  @memberof Tweakables
 *  @example
 *  tweak('jumpSpeed', {min: 0, max: 1});
 *  tweak('skyColor');
 *  tweak('player.size', {label: 'Player Size'});
 *  tweak('speed', {object: settings}); // settings.speed, in an ES module */
function tweak(path, options={})
{
    if (!debug) return;
    ASSERT(isStringLike(path) && tweakPathRegex.test(path), 'tweak path must be a name like speed or player.speed');

    const {object} = options;
    let name = path, get, set, toCode;
    if (object)
    {
        // a field of the object, the object at each step is looked up again so one made again is found
        ASSERT(typeof object === 'object', 'tweak object must be an object');
        const keys = path.split('.'), last = keys.pop();
        const parent = ()=> keys.reduce((o, key)=> o?.[key], object);
        name = options.label ?? path;
        get = ()=> parent()?.[last];
        set = (v)=> { parent()[last] = v; };
        toCode = (v)=> `${path}: ${v},`; // as it is written in the object
    }
    else
    {
        // a global, compiled once, a missing object on the path reads as undefined
        get = new Function(`try { return ${path} } catch {}`);
        set = new Function('v', `'use strict'; ${path} = v`);
        toCode = (v)=> `${path} = ${v};`;
    }
    const value = get();
    ASSERT(value !== undefined, object ? `tweak could not find ${path} on the object` :
        `tweak could not find ${path}, it must be a global of a script, an ES module game passes the object option`);
    try { set(value); }
    catch { ASSERT(false, `tweak can not change ${path}, it must not be a const or frozen`); }
    tweakAdd(name, get, set, toCode, options);
}

/** Add a button to the tweakables panel that calls a function, like one to restart the level
 *  - Adding the same label again replaces its function
 *  - Does nothing in release builds
 *  @param {string} label
 *  @param {function():void} callback
 *  @memberof Tweakables
 *  @example
 *  tweakButton('Restart', restartLevel); */
function tweakButton(label, callback)
{
    if (!debug) return;
    ASSERT(isStringLike(label), 'tweakButton label must be a string');
    ASSERT(typeof callback === 'function', 'tweakButton callback must be a function');
    const t = tweakList.find(t=> t.type === 'button' && t.label === label);
    if (t)
        t.callback = callback;
    else
    {
        tweakList.push({type: 'button', label, callback});
        tweakRowsDirty = true;
    }
}

/** Add a divider to the tweakables panel, with a label for the tweaks after it
 *  - Does nothing in release builds
 *  @param {string} [label]
 *  @memberof Tweakables */
function tweakDivider(label='')
{
    if (!debug) return;
    if (label && tweakList.find(t=> t.type === 'divider' && t.label === label))
        return; // added again, as a game that calls its setup again does
    tweakList.push({type: 'divider', label});
    tweakRowsDirty = true;
}

/** Add the engine settings a game most often tunes to the tweakables panel:
 *  gravity, timeScale, cameraScale and soundVolume, under an Engine divider
 *  - They are changed through their setters, so this works in the ES module build too
 *  - Does nothing in release builds
 *  @memberof Tweakables */
function tweakEngineDefaults()
{
    if (!debug) return;
    tweakDivider('Engine');
    tweakAdd('gravity', ()=> gravity, setGravity, (v)=> `setGravity(${v});`, {min: -.05, max: .05});
    tweakAdd('timeScale', ()=> timeScale, setTimeScale, (v)=> `setTimeScale(${v});`, {min: 0, max: 2});
    tweakAdd('cameraScale', ()=> cameraScale, setCameraScale, (v)=> `setCameraScale(${v});`,
        {min: 1, max: 128, step: 1});
    tweakAdd('soundVolume', ()=> soundVolume, setSoundVolume, (v)=> `setSoundVolume(${v});`, {min: 0, max: 1});
}

///////////////////////////////////////////////////////////////////////////////
// tweaks

function tweakAdd(name, get, set, toCode, options)
{
    const value = get();
    const type = isNumber(value) ? 'number' : typeof value === 'boolean' ? 'boolean' :
        isColor(value) ? 'color' : isVector2(value) ? 'vector2' : tweakIsVector3(value) ? 'vector3' : undefined;
    ASSERT(type, `tweak ${name} must be a number, boolean, Color, Vector2 or Vector3`);
    if (!type) return;

    // added again, the code value stays the one it had first, the value now may be a tweaked one
    let t = tweakList.find(t=> t.name === name);
    if (!t)
    {
        tweakList.push(t = {name, codeValue: tweakCopy(value)});
        tweakRowsDirty = true;
    }
    Object.assign(t, {type, get, set, toCode, options});

    // a saved value comes back while the code value is the one it was saved over, after an edit it is dropped
    tweakSaved ||= readSaveData(tweakSaveName(), {});
    const saved = tweakSaved[name];
    if (!saved) return;
    if (tweakSaveText(saved.code) === tweakSaveText(tweakToSave(t.codeValue)))
        set(tweakFromSave(type, saved.value));
    else
    {
        delete tweakSaved[name];
        writeSaveData(tweakSaveName(), tweakSaved);
    }
}

// every page keeps its own tweaks
function tweakSaveName() { return 'LittleJS tweaks ' + (globalThis.location?.pathname ?? ''); }

function tweakCopy(v) { return v?.copy ? v.copy() : v; }

// a Vector3, a build may leave out the 3D math
function tweakIsVector3(v) { return typeof Vector3 !== 'undefined' && isVector3(v); }

// the value as json can hold it, and back
function tweakToSave(v)
{
    return isColor(v) ? [v.r, v.g, v.b, v.a] : isVector2(v) ? [v.x, v.y] :
        tweakIsVector3(v) ? [v.x, v.y, v.z] : v;
}
function tweakFromSave(type, v)
{
    return type === 'color' ? rgb(...v) : type === 'vector2' ? vec2(...v) : type === 'vector3' ? vec3(...v) : v;
}
function tweakSaveText(v) { return JSON.stringify(v); }

// remember a tweak's value, or forget it when it is back to the code value
function tweakSave(t)
{
    const value = tweakToSave(t.get()), code = tweakToSave(t.codeValue);
    if (tweakSaveText(value) === tweakSaveText(code))
        delete tweakSaved[t.name];
    else
        tweakSaved[t.name] = {value, code};
    writeSaveData(tweakSaveName(), tweakSaved);
}

// put every tweak back to its code value and forget the saved ones
function tweakReset()
{
    for (const t of tweakList)
        t.set?.(tweakCopy(t.codeValue));
    tweakSaved = {};
    writeSaveData(tweakSaveName(), tweakSaved);
}

// a line of code for each tweak changed from its code value
function tweakChangedCode()
{
    // numbers as the code writes them, without float noise or a leading zero,
    // colors as hsl rounded more, which changes nothing that can be seen
    const number = (n, digits=6)=> String(+n.toFixed(digits)).replace(/^(-?)0\./, '$1.');
    const code = (v)=>
    {
        if (isColor(v))
        {
            const [h, s, l, a] = v.HSLA();
            return `hsl(${[h, s, l, ...(a < 1 ? [a] : [])].map((n)=> number(n, 3)).join(', ')})`;
        }
        if (isVector2(v))
            return `vec2(${number(v.x)}, ${number(v.y)})`;
        if (tweakIsVector3(v))
            return `vec3(${number(v.x)}, ${number(v.y)}, ${number(v.z)})`;
        return isNumber(v) ? number(v) : String(v);
    };
    return tweakList.filter(t=> t.get && tweakSaveText(tweakToSave(t.get())) !==
        tweakSaveText(tweakToSave(t.codeValue))).map(t=> t.toCode(code(t.get()))).join('\n');
}

///////////////////////////////////////////////////////////////////////////////
// panel

// shows or hides the panel each frame, and shows values the game changed itself
function tweakRender()
{
    if (headlessMode) return;
    if (!debugTweakables)
    {
        if (tweakPanel && tweakPanel.style.display !== 'none')
        {
            // hidden, a box it had focus in lets go of the keys
            const active = /** @type {HTMLElement} */ (document.activeElement);
            tweakPanel.contains(active) && active.blur();
            tweakPanel.style.display = 'none';
        }
        return;
    }

    tweakPanel || tweakPanelInit();
    tweakPanel.style.display = '';
    if (tweakRowsDirty)
    {
        tweakRowsDirty = false;
        tweakRows.replaceChildren();
        for (const t of tweakList)
            t.refresh = tweakRow(t);
        tweakList.length || tweakElement('div', tweakRows, 'color:#888', 'Nothing to tweak, add values with tweak()');
    }
    for (const t of tweakList)
        t.refresh?.();
}

function tweakPanelInit()
{
    tweakPanel = tweakElement('div', document.body,
        'position:fixed;top:8px;right:8px;width:260px;max-height:calc(100% - 16px);overflow-y:auto;' +
        'box-sizing:border-box;padding:8px;background:#111d;color:#eee;font:12px monospace;' +
        'border-radius:4px;z-index:9999');

    // a click or touch on the panel is not the game's, a mouse up still goes on so a button can let go
    for (const type of ['mousedown','wheel','touchstart','touchmove','touchend','touchcancel'])
        tweakPanel.addEventListener(type, (e)=> e.stopPropagation());

    tweakElement('div', tweakPanel, 'font-weight:bold;margin-bottom:4px', 'Tweakables');
    tweakRows = tweakElement('div', tweakPanel);
    const buttons = tweakElement('div', tweakPanel, 'display:flex;gap:6px;margin-top:8px');
    const button = (text, onclick)=>
        tweakElement('button', buttons, 'flex:1;padding:4px;cursor:pointer', text).onclick = onclick;
    button('Copy', (e)=>
    {
        // lines for the changed values, to paste over the values in the code
        const code = tweakChangedCode(), target = /** @type {HTMLElement} */ (e.target);
        code && navigator.clipboard?.writeText(code).catch(()=> console.log(code));
        target.textContent = code ? 'Copied' : 'No changes';
        setTimeout(()=> target.textContent = 'Copy', 1e3);
    });
    button('Reset', tweakReset);
}

// the row for a tweak, returns what shows its value
function tweakRow(t)
{
    const row = tweakElement('div', tweakRows, 'margin:6px 0');
    if (t.type === 'divider')
    {
        row.style.cssText = 'margin:10px 0 4px;padding-top:4px;border-top:1px solid #555;color:#aaa';
        row.textContent = t.label;
        return;
    }
    if (t.type === 'button')
    {
        // the function is looked up on click, so one added again replaces it
        const button = tweakElement('button', row, 'width:100%;padding:4px;cursor:pointer', t.label);
        button.onclick = ()=> t.callback();
        return;
    }

    const label = t.options.label ?? t.name;
    const save = ()=> tweakSave(t);
    if (t.type === 'boolean')
    {
        const labelElement = tweakElement('label', row, 'display:flex;gap:6px;align-items:center;cursor:pointer');
        const box = tweakElement('input', labelElement);
        box.type = 'checkbox';
        tweakElement('span', labelElement, '', label);
        box.onchange = ()=> { t.set(box.checked); save(); };
        return ()=> { box.checked = !!t.get(); };
    }

    tweakElement('div', row, '', label);
    if (t.type === 'number')
        return tweakNumber(row, '', t.get, t.set, t.options, save);

    // a part of a vector or color is a number of its own, set as a new copy with that part changed
    const part = (key, options)=> tweakNumber(row, key, ()=> t.get()?.[key],
        (n)=> { const v = t.get().copy(); v[key] = n; t.set(v); }, options, save);
    if (t.type === 'vector2' || t.type === 'vector3')
    {
        const axes = (t.type === 'vector2' ? ['x', 'y'] : ['x', 'y', 'z']).map((key)=> part(key, t.options));
        return ()=> axes.forEach((refresh)=> refresh());
    }

    // a color picker has no alpha, a slider below it has
    const picker = tweakElement('input', row, 'width:100%;height:24px;padding:0;border:0;background:none');
    picker.type = 'color';
    picker.oninput = ()=>
    {
        const color = rgb().setHex(picker.value);
        color.a = t.get().a;
        t.set(color);
        save();
    };
    const alpha = part('a', {min: 0, max: 1});
    return ()=>
    {
        const color = t.get();
        const hex = isColor(color) && color.toString(false);
        hex && picker !== document.activeElement && picker.value !== hex && (picker.value = hex);
        alpha();
    };
}

// a slider when there is a range and a box to type in, returns what shows the value
function tweakNumber(parent, axis, get, set, options, save)
{
    const {min, max} = options;
    const hasRange = isNumber(min) && isNumber(max);
    const value = get(), size = abs(value);
    const step = options.step ?? (hasRange ? (max - min) / 1e3 : size >= 10 ? 1 : size >= 1 ? .1 : .001);

    const row = tweakElement('div', parent, 'display:flex;gap:4px;align-items:center');
    axis && tweakElement('span', row, 'color:#888', axis);
    const slider = hasRange ? tweakElement('input', row, 'flex:1;min-width:0') : undefined;
    const box = tweakElement('input', row,
        'width:80px;box-sizing:border-box;background:#222;color:#eee;border:1px solid #555' +
        (hasRange ? '' : ';flex:1'));
    if (slider)
        Object.assign(slider, {type: 'range', min, max, step});
    Object.assign(box, {type: 'number', step});

    const change = (input)=>
    {
        const v = parseFloat(input.value);
        if (!isNumber(v)) return; // a box part way through typing
        set(v);
        save();
    };
    slider && (slider.oninput = ()=> change(slider));
    box.oninput = ()=> change(box);
    return ()=>
    {
        // the one being used keeps what it has, so typing is not undone
        const v = get();
        if (!isNumber(v)) return;
        for (const input of [slider, box])
            input && input !== document.activeElement && (input.value === '' || +input.value !== v) &&
                (input.value = String(v));
    };
}

function tweakElement(tag, parent, style='', text='')
{
    const element = document.createElement(tag);
    element.style.cssText = style;
    element.textContent = text;
    parent?.appendChild(element);
    return element;
}

///////////////////////////////////////////////////////////////////////////////
// plugin

debug && engineAddPlugin(undefined, tweakRender);
