/*
    LittleJS Particle Designer
    - The page: settings panel, preview, code panel and storage
    - Effects, behaviors and the code export are in particleEffects.js
*/

'use strict';

// allow html input controls
setInputPreventDefault(false);

const storageKey = 'particles_library';
const storageSelectedKey = 'particles_selected';
const storageExpandKey = 'particles_expand';

let library = [];      // every effect, saved as one
let effect;            // the effect being edited, one of the library
let emitter;           // the preview emitter
let floorLayer;        // a floor to land on while the effect collides with tiles
let dragging = false;  // moving the emitter with the mouse
let previewHover = false;
const restartTimer = new Timer;
const rows = {};           // settings rows by name, each with refresh()
const settingsGroups = {}; // group content elements by name

///////////////////////////////////////////////////////////////////////////////
// page helpers

const $ = (id)=> document.getElementById(id);

function makeElement(tag, parent, className)
{
    const element = document.createElement(tag);
    className && (element.className = className);
    parent && parent.appendChild(element);
    return element;
}

// storage can be missing or throw, the page works without it
function storageLoad(key)
{
    try { return localStorage.getItem(key) ?? undefined; }
    catch { return undefined; }
}

function storageSave(key, value)
{
    try { value === undefined ? localStorage.removeItem(key) : localStorage.setItem(key, value); }
    catch {}
}

///////////////////////////////////////////////////////////////////////////////
// settings panel

function buildSettingsPanel()
{
    const panel = $('settingsPanel');
    for (const group of effectGroups)
    {
        const details = makeElement('details', panel, 'group');
        details.open = group !== 'Advanced';
        makeElement('summary', details).textContent = group;
        settingsGroups[group] = makeElement('div', details);
    }

    for (const setting of effectSettings)
    {
        const parent = settingsGroups[setting.group];
        if (setting.kind === 'color')
            rows[setting.name] = makeColorRow(parent, setting);
        else if (setting.kind === 'checkbox')
            rows[setting.name] = makeCheckboxRow(parent, setting);
        else
            rows[setting.name] = makeNumberRow(parent, setting);
    }

    // gradient strips show each color range at a glance
    const colorGroup = settingsGroups.Color;
    for (const pair of ['A', 'B'])
    {
        makeElement('div', colorGroup, 'stripLabel').textContent = `${pair}: start to end`;
        const strip = makeElement('div', colorGroup, 'strip');
        strip.id = 'strip' + pair;
    }

    for (const behavior of effectBehaviors)
        rows['behavior_' + behavior.name] = makeBehaviorRow(settingsGroups.Behaviors, behavior);
}

// a row with a label, a hint under it and a reset button, the controls go in between
function makeRow(parent, name, description, onReset)
{
    const row = makeElement('div', parent, 'row');
    row.dataset.name = name;
    const label = makeElement('label', row);
    label.textContent = name;
    label.title = description;
    const finish = ()=>
    {
        const reset = makeElement('button', row, 'reset');
        reset.textContent = '↺';
        reset.title = 'Reset to default';
        reset.onclick = onReset;
        makeElement('div', row, 'hint').textContent = description;
    };
    return {row, label, finish};
}

function makeNumberRow(parent, setting)
{
    const {row, finish} = makeRow(parent, setting.name, setting.description,
        ()=> setValue(setting.name, setting.value));
    const range = makeElement('input', row);
    range.type = 'range';
    range.min = setting.min;
    range.max = setting.max;
    range.step = setting.step;
    const box = makeElement('input', row);
    box.type = 'number';
    box.step = setting.step;
    box.min = setting.hardMin;
    box.max = setting.hardMax;
    finish();

    range.oninput = ()=> setValue(setting.name, parseFloat(range.value));
    box.oninput = ()=>
    {
        const value = parseFloat(box.value);
        isNumber(value) && setValue(setting.name, value);
    };
    box.onchange = ()=> refresh(); // tidy what was typed
    const refresh = ()=>
    {
        const value = effect.settings[setting.name];
        range.value = value;
        document.activeElement === box || (box.value = String(Number(value.toFixed(4))));
    };
    return {refresh};
}

function makeCheckboxRow(parent, setting)
{
    const {row, finish} = makeRow(parent, setting.name, setting.description,
        ()=> setValue(setting.name, setting.value));
    const checkbox = makeElement('input', row);
    checkbox.type = 'checkbox';
    checkbox.style.gridColumn = 'span 2';
    finish();
    checkbox.oninput = ()=> setValue(setting.name, checkbox.checked);
    return {refresh: ()=> checkbox.checked = effect.settings[setting.name]};
}

function makeColorRow(parent, setting)
{
    const {row, finish} = makeRow(parent, setting.name, setting.description,
        ()=> setValue(setting.name, setting.value.slice()));
    row.classList.add('colorRow');
    const swatch = makeElement('div', row, 'swatch');
    const picker = makeElement('input', swatch);
    picker.type = 'color';
    const alpha = makeElement('input', swatch);
    alpha.type = 'range';
    alpha.min = 0;
    alpha.max = 1;
    alpha.step = .01;
    alpha.title = 'Alpha';
    const alphaBox = makeElement('input', row);
    alphaBox.type = 'number';
    alphaBox.min = 0;
    alphaBox.max = 1;
    alphaBox.step = .01;
    alphaBox.title = 'Alpha';
    finish();

    const update = ()=>
    {
        const c = new Color().setHex(picker.value);
        const a = clamp(parseFloat(alpha.value));
        setValue(setting.name, [c.r, c.g, c.b, a]);
    };
    picker.oninput = update;
    alpha.oninput = ()=> { alphaBox.value = alpha.value; update(); };
    alphaBox.oninput = ()=>
    {
        const a = parseFloat(alphaBox.value);
        if (isNumber(a)) { alpha.value = clamp(a); update(); }
    };
    const refresh = ()=>
    {
        const c = effect.settings[setting.name];
        picker.value = rgb(c[0], c[1], c[2]).toString(false);
        alpha.value = c[3];
        document.activeElement === alphaBox || (alphaBox.value = String(Number(c[3].toFixed(3))));
    };
    return {refresh};
}

function makeBehaviorRow(parent, behavior)
{
    const {row, label, finish} = makeRow(parent, behavior.name, behavior.description,
        ()=> setBehavior(behavior.name, false));
    const checkbox = makeElement('input');
    checkbox.type = 'checkbox';
    label.prepend(checkbox, ' ');
    const range = makeElement('input', row);
    range.type = 'range';
    range.min = behavior.min;
    range.max = behavior.max;
    range.step = .01;
    const box = makeElement('input', row);
    box.type = 'number';
    box.min = behavior.min;
    box.max = behavior.max;
    box.step = .01;
    finish();

    checkbox.oninput = ()=> setBehavior(behavior.name, checkbox.checked, parseFloat(range.value));
    range.oninput = ()=> setBehavior(behavior.name, true, parseFloat(range.value));
    box.oninput = ()=>
    {
        const value = parseFloat(box.value);
        isNumber(value) && setBehavior(behavior.name, true, value);
    };
    const refresh = ()=>
    {
        const found = effect.behaviors.find(b=> b.name === behavior.name);
        const strength = found ? found.strength : behavior.value;
        checkbox.checked = !!found;
        range.value = strength;
        document.activeElement === box || (box.value = String(strength));
        row.style.opacity = found ? 1 : .6;
    };
    return {refresh};
}

///////////////////////////////////////////////////////////////////////////////
// editing

// change one setting of the effect being edited
function setValue(name, value)
{
    const setting = effectSettings.find(s=> s.name === name);
    if (setting.kind === 'number')
    {
        value = clamp(value, setting.hardMin, setting.hardMax);
        setting.step >= 1 && (value = round(value));
    }
    const s = effect.settings;
    s[name] = value;

    // local space particles cannot collide with tiles, the one just turned on wins
    if (name === 'localSpace' && value) s.collideTiles = false;
    if (name === 'collideTiles' && value) s.localSpace = false;

    refreshAll();
    effectChanged();
}

// turn a behavior on or off, or set its strength
function setBehavior(name, on, strength)
{
    const behavior = effectBehavior(name);
    const others = effect.behaviors.filter(b=> b.name !== name);
    if (on)
        others.push({name, strength:clamp(isNumber(strength) ? strength : behavior.value,
            behavior.min, behavior.max)});

    // kept in table order so the export reads the same every time
    const order = (b)=> effectBehaviors.indexOf(effectBehavior(b.name));
    effect.behaviors = others.sort((a, b)=> order(a) - order(b));
    refreshAll();
    effectChanged();
}

// write the effect into every control
function refreshAll()
{
    for (const name in rows)
        rows[name].refresh();
    const css = (c)=> `rgb(${c[0]*255} ${c[1]*255} ${c[2]*255} / ${c[3]})`;
    const checker = 'repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 10px 10px';
    const s = effect.settings;
    for (const pair of ['A', 'B'])
        $('strip' + pair).style.background = `linear-gradient(to right, ` +
            `${css(s['colorStart' + pair])}, ${css(s['colorEnd' + pair])}), ${checker}`;
    typeof refreshTexture === 'function' && refreshTexture();
}

// after any edit: the live emitter, the floor, the code and storage
function effectChanged()
{
    effectApply(emitter, effect);
    updateFloor();
    updateCode();
    saveLibrary();
}

function updateCode()
{
    $('codeText').value = effectToCode(effect, $('expandCheckbox').checked);
}

function restartEmitter()
{
    emitter && emitter.destroy(true);
    emitter = effectMakeEmitter(effect, vec2());
    restartTimer.unset();
}

// a floor to land on while particles collide with tiles, at the bottom of the view
function updateFloor()
{
    const collide = effect.settings.collideTiles;
    if (collide && !floorLayer)
    {
        const bottom = ceil(-getCameraSize().y/2), width = 400;
        floorLayer = new TileCollisionLayer(vec2(-width/2, bottom), vec2(width, 1));
        floorLayer.friction = 0; // so the effect's own friction decides
        for (let x = 0; x < width; ++x)
            floorLayer.setCollisionData(vec2(x, 0));
    }
    else if (!collide && floorLayer)
    {
        floorLayer.destroy();
        floorLayer = undefined;
    }
}

///////////////////////////////////////////////////////////////////////////////
// library and storage

function saveLibrary()
{
    storageSave(storageKey, effectLibraryText(library));
    storageSave(storageSelectedKey, String(library.indexOf(effect)));
}

function loadLibrary()
{
    const text = storageLoad(storageKey);
    if (text)
    {
        try { library = effectLibraryParse(text); }
        catch { library = []; }
    }
    if (!library.length)
        library = effectPresets.map(effectSanitize);

    // the designer used to keep one effect as a key per field, carried over once
    const saved = migrateOldSettings();
    if (saved)
    {
        saved.name = effectUniqueName(library, saved.name);
        library.push(saved);
        return library.length - 1;
    }
    const selected = parseInt(storageLoad(storageSelectedKey));
    return selected >= 0 && selected < library.length ? selected : 0;
}

function migrateOldSettings()
{
    const old = (name)=> storageLoad('particles_' + name);
    if (old('emitRate') === undefined)
        return;

    const settings = {};
    for (const setting of effectSettings)
    {
        const value = old(setting.name);
        if (value === undefined)
            continue;
        if (setting.kind === 'checkbox')
            settings[setting.name] = value === 'true';
        else if (setting.kind === 'color')
        {
            if (!/^#[0-9a-f]{6}$/i.test(value))
                continue;
            const c = new Color().setHex(value);
            const a = parseFloat(old(setting.name + '_alpha'));
            settings[setting.name] = [c.r, c.g, c.b, isNumber(a) ? a : 1];
        }
        else
            settings[setting.name] = parseFloat(value);
    }

    // remove the old keys, the texture keeps its key
    try
    {
        for (const key of Object.keys(localStorage))
            if (key.startsWith('particles_') && key !== 'particles_textureData' &&
                key !== storageKey && key !== storageSelectedKey && key !== storageExpandKey)
                localStorage.removeItem(key);
    }
    catch {}
    return effectSanitize({name:'Saved', settings});
}

function selectEffect(index)
{
    effect = library[index];
    refreshLibraryBar();
    refreshAll();
    restartEmitter();
    updateFloor();
    updateCode();
    saveLibrary();
}

function refreshLibraryBar()
{
    const select = $('effectSelect');
    select.replaceChildren(...library.map((e, i)=>
    {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = e.name;
        return option;
    }));
    select.value = library.indexOf(effect);
    document.activeElement === $('effectName') || ($('effectName').value = effect.name);
}

///////////////////////////////////////////////////////////////////////////////
// preview and code panel controls

function setupPreviewControls()
{
    const preview = $('previewArea');
    preview.addEventListener('pointerdown', (e)=> e.button === 0 && (dragging = true));
    addEventListener('pointerup', ()=> dragging = false);
    preview.addEventListener('pointerenter', ()=> previewHover = true);
    preview.addEventListener('pointerleave', ()=> previewHover = false);

    // the canvas fills the preview area, not the window, and never shrinks to nothing
    const fit = ()=> setCanvasMaxSize(vec2(max(preview.clientWidth, 1), max(preview.clientHeight, 1)));
    new ResizeObserver(fit).observe(preview);
    fit();

    $('buttonRestart').onclick = ()=> restartEmitter();
    $('buttonPause').onclick = ()=>
    {
        setPaused(!paused);
        $('buttonPause').textContent = paused ? 'Play' : 'Pause';
    };
    $('backgroundSelect').oninput = ()=>
        setCanvasClearColor(hsl(0, 0, parseFloat($('backgroundSelect').value)));
    $('debugCheckbox').oninput = ()=> debugParticles = $('debugCheckbox').checked;

    $('expandCheckbox').checked = storageLoad(storageExpandKey) === 'true';
    $('expandCheckbox').oninput = ()=>
    {
        storageSave(storageExpandKey, String($('expandCheckbox').checked));
        updateCode();
    };
    $('buttonCopy').onclick = ()=>
    {
        navigator.clipboard.writeText($('codeText').value).then(()=>
        {
            $('buttonCopy').textContent = 'Copied';
            setTimeout(()=> $('buttonCopy').textContent = 'Copy', 1e3);
        });
    };
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    setGravity(vec2(0, -.01));
    setCameraScale(64);
    setCanvasClearColor(hsl(0, 0, 0));
    buildSettingsPanel();
    typeof setupLibraryBar === 'function' && setupLibraryBar();
    typeof setupTexture === 'function' && setupTexture();
    setupPreviewControls();
    $('effectSelect').oninput = ()=> selectEffect(parseInt($('effectSelect').value));
    selectEffect(loadLibrary());
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // a finished one shot effect plays again after a second
    if (emitter.destroyed)
    {
        if (!restartTimer.isSet())
            restartTimer.set(1);
        else if (restartTimer.elapsed())
            restartEmitter();
    }

    // drag to move the emitter, it goes back to the middle on release
    emitter.pos = dragging ? mousePos.copy() : vec2();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
    // zoom works while paused too
    if (mouseWheel && previewHover)
        setCameraScale(clamp(cameraScale * (1 - sign(mouseWheel)/5), 10, 300));

    const count = emitter.particles.length + ' particles';
    $('particleCount').textContent === count || ($('particleCount').textContent = count);
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // show the floor the particles land on
    if (floorLayer)
        drawRect(floorLayer.pos.add(vec2(floorLayer.size.x/2, .5)), vec2(floorLayer.size.x, 1),
            hsl(0, 0, .3));
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost() {}

///////////////////////////////////////////////////////////////////////////////
// startup LittleJS engine, drawing into the preview area
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png'],
    $('previewArea'));
