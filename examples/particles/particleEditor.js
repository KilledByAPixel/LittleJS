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
let floorLayer;        // a floor to land on while the effect hits tiles
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
    try
    {
        value === undefined ? localStorage.removeItem(key) :
            localStorage.setItem(key, value);
    }
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
        const label = makeElement('div', colorGroup, 'stripLabel');
        label.textContent = `${pair}: start to end`;
        const strip = makeElement('div', colorGroup, 'strip');
        strip.id = 'strip' + pair;
    }

    for (const behavior of effectBehaviors)
        rows['behavior_' + behavior.name] =
            makeBehaviorRow(settingsGroups.Behaviors, behavior);
}

// a row with a label, a hint under it and a reset button,
// the controls go in between
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
        if (document.activeElement !== box)
            box.value = String(Number(value.toFixed(4)));
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
        picker.value = new Color(c[0], c[1], c[2]).toString(false);
        alpha.value = c[3];
        if (document.activeElement !== alphaBox)
            alphaBox.value = String(Number(c[3].toFixed(3)));
    };
    return {refresh};
}

function makeBehaviorRow(parent, behavior)
{
    const {row, label, finish} = makeRow(parent, behavior.name,
        behavior.description, ()=> setBehavior(behavior.name, false));
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

    const strength = ()=> parseFloat(range.value);
    checkbox.oninput = ()=>
        setBehavior(behavior.name, checkbox.checked, strength());
    range.oninput = ()=> setBehavior(behavior.name, true, strength());
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

    // local space particles cannot collide with tiles,
    // the one just turned on wins
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
    {
        const value = isNumber(strength) ? strength : behavior.value;
        others.push({name, strength:clamp(value, behavior.min, behavior.max)});
    }

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
    const css = (c)=> new Color(...c).toString();
    const checker =
        'repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 10px 10px';
    const s = effect.settings;
    for (const pair of ['A', 'B'])
        $('strip' + pair).style.background = `linear-gradient(to right, ` +
            `${css(s['colorStart' + pair])}, ${css(s['colorEnd' + pair])}), ` +
            checker;
    refreshTexture();
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

// a floor to land on while particles collide with tiles, 3 below the emitter
function updateFloor()
{
    const collide = effect.settings.collideTiles;
    if (collide && !floorLayer)
    {
        // a 1 pixel tile keeps the layer's canvas small
        const width = 200, tileInfo = tile(0, 1, defaultTextureInfo, 0);
        floorLayer = new TileCollisionLayer(vec2(-width/2, -4),
            vec2(width, 1), tileInfo);
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

    // the designer used to keep one effect as a key per field,
    // carried over once
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
    const kept = ['particles_textureData', storageKey, storageSelectedKey,
        storageExpandKey];
    try
    {
        for (const key of Object.keys(localStorage))
            if (key.startsWith('particles_') && !kept.includes(key))
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
    if (document.activeElement !== $('effectName'))
        $('effectName').value = effect.name;
}

///////////////////////////////////////////////////////////////////////////////
// preview and code panel controls

function setupPreviewControls()
{
    const preview = $('previewArea');
    preview.addEventListener('pointerdown', (e)=>
        e.button === 0 && (dragging = true));
    addEventListener('pointerup', ()=> dragging = false);
    preview.addEventListener('pointerenter', ()=> previewHover = true);
    preview.addEventListener('pointerleave', ()=> previewHover = false);

    // the canvas fills the preview area, not the window, never shrinking to 0
    const fit = ()=> setCanvasMaxSize(vec2(max(preview.clientWidth, 1),
        max(preview.clientHeight, 1)));
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
    $('debugCheckbox').oninput = ()=>
        debugParticles = $('debugCheckbox').checked;

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
// library bar

function setupLibraryBar()
{
    $('effectName').onchange = ()=>
    {
        const name = $('effectName').value.trim().slice(0, 60);
        if (name && name !== effect.name)
        {
            const others = library.filter(e=> e !== effect);
            effect.name = effectUniqueName(others, name);
        }
        refreshLibraryBar();
        saveLibrary();
    };
    $('buttonNew').onclick = ()=>
        addEffect(effectSanitize({name:'New Effect'}));
    $('buttonDuplicate').onclick = ()=> addEffect(structuredClone(effect));
    $('buttonDelete').onclick = ()=>
    {
        if (!confirm(`Delete ${effect.name}?`))
            return;
        const index = library.indexOf(effect);
        library.splice(index, 1);
        library.length || library.push(effectSanitize({name:'New Effect'}));
        selectEffect(min(index, library.length - 1));
    };
    $('buttonPresets').onclick = ()=>
    {
        const first = library.length;
        for (const preset of effectPresets)
            addEffect(effectSanitize(preset), false);
        selectEffect(first);
    };
    $('buttonExport').onclick = ()=>
    {
        const blob = new Blob([effectLibraryText(library)],
            {type:'application/json'});
        const link = makeElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'littlejs-particles.json';
        link.click();
        setTimeout(()=> URL.revokeObjectURL(link.href), 1e3);
    };
    $('buttonImport').onclick = ()=> $('importFile').click();
    $('importFile').onchange = ()=>
    {
        const file = $('importFile').files[0];
        $('importFile').value = ''; // the same file can be picked again
        file && file.text().then(importLibrary);
    };
}

// add an effect with a unique name, selecting it unless told not to
function addEffect(newEffect, select=true)
{
    newEffect.name = effectUniqueName(library, newEffect.name);
    library.push(newEffect);
    select ? selectEffect(library.length - 1) : saveLibrary();
}

// add every effect in a library file, a bad file changes nothing
function importLibrary(text)
{
    let effects;
    try { effects = effectLibraryParse(text); }
    catch (e) { alert('Could not import: ' + e.message); return; }
    const first = library.length;
    for (const imported of effects)
        addEffect(imported, false);
    selectEffect(first);
}

///////////////////////////////////////////////////////////////////////////////
// texture: tile picker, custom image and the default texture

let defaultTextureInfo; // tiles.png, captured at startup

function setupTexture()
{
    defaultTextureInfo = textureInfos[0];

    // picker, buttons and warning go above the tile rows
    const group = settingsGroups.Texture;
    const picker = makeElement('canvas');
    picker.id = 'tilePicker';
    picker.title = 'Click a tile to use it';
    const buttons = makeElement('div', undefined, 'buttons');
    const buttonNone = makeElement('button', buttons);
    buttonNone.textContent = 'Untextured';
    buttonNone.onclick = ()=> setValue('tileIndex', -1);
    const buttonLoad = makeElement('button', buttons);
    buttonLoad.textContent = 'Load Image';
    buttonLoad.onclick = ()=> $('textureFile').click();
    const buttonDefault = makeElement('button', buttons);
    buttonDefault.id = 'buttonDefaultTexture';
    buttonDefault.textContent = 'Default Texture';
    buttonDefault.onclick = ()=> restoreDefaultTexture();
    const warning = makeElement('div', undefined, 'warning');
    warning.id = 'tileWarning';
    warning.textContent =
        'This tile does not fit the texture, drawing untextured';
    const file = makeElement('input');
    file.id = 'textureFile';
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    group.prepend(picker, buttons, warning, file);

    picker.onclick = (e)=>
    {
        // the tile under the click, in texture pixels
        const s = effect.settings, texture = textureInfos[0].size;
        const rect = picker.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * texture.x;
        const y = (e.clientY - rect.top) / rect.height * texture.y;
        const cell = s.tileSize + s.tilePadding*2;
        const columns = floor(texture.x / cell), rows = floor(texture.y / cell);
        const column = floor(x / cell), row = floor(y / cell);
        if (column < columns && row < rows)
            setValue('tileIndex', row * columns + column);
    };
    file.onchange = ()=>
    {
        file.files[0] && readTextureFile(file.files[0]);
        file.value = '';
    };

    // drop an image anywhere on the page
    document.addEventListener('dragover', (e)=> e.preventDefault());
    document.addEventListener('drop', (e)=>
    {
        e.preventDefault();
        const dropped = e.dataTransfer.files[0];
        dropped && readTextureFile(dropped);
    });

    const saved = storageLoad('particles_textureData');
    saved && loadCustomTexture(saved);
}

function readTextureFile(file)
{
    if (!file.type.startsWith('image/'))
        return;
    const reader = new FileReader;
    reader.onload = ()=>
    {
        // too big for storage still works, it just is not kept
        try { localStorage.setItem('particles_textureData', reader.result); }
        catch { storageSave('particles_textureData'); }
        loadCustomTexture(reader.result);
    };
    reader.readAsDataURL(file);
}

function loadCustomTexture(dataURL)
{
    const image = new Image;
    image.onload = ()=> setCustomTexture(image);
    image.src = dataURL;
}

function setCustomTexture(image)
{
    // swap texture 0 so tile() and the exported code keep working
    swapTexture(new TextureInfo(image));
}

function restoreDefaultTexture()
{
    storageSave('particles_textureData');
    swapTexture(defaultTextureInfo);
}

function swapTexture(textureInfo)
{
    // particles keep the tile they were made with, so they go first
    const old = textureInfos[0];
    textureInfos[0] = textureInfo;
    restartEmitter();
    refreshAll();
    effectChanged();
    if (old !== defaultTextureInfo && old !== textureInfo)
        old.destroyWebGLTexture();
}

// draw the texture with its tile grid and the chosen tile,
// and show the warning if the tile does not fit
function refreshTexture()
{
    const picker = $('tilePicker');
    if (!picker || !defaultTextureInfo)
        return;
    const s = effect.settings, texture = textureInfos[0];
    const image = texture.image, size = texture.size;
    const scale = max(1, floor(256 / max(size.x, size.y)));
    picker.width = size.x * scale;
    picker.height = size.y * scale;
    const context = picker.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#222';
    context.fillRect(0, 0, picker.width, picker.height);
    image && context.drawImage(image, 0, 0, picker.width, picker.height);

    // grid lines and the chosen tile
    const cell = (s.tileSize + s.tilePadding*2) * scale;
    const columns = floor(size.x * scale / cell);
    const rows = floor(size.y * scale / cell);
    context.strokeStyle = 'hsla(0,0%,100%,.12)';
    context.lineWidth = 1;
    for (let x = 0; x <= columns; ++x)
        context.strokeRect(x * cell + .5, 0, 0, rows * cell);
    for (let y = 0; y <= rows; ++y)
        context.strokeRect(0, y * cell + .5, columns * cell, 0);
    if (s.tileIndex >= 0 && s.tileIndex < columns * rows)
    {
        context.strokeStyle = 'hsl(200,80%,60%)';
        context.lineWidth = 2;
        const x = s.tileIndex % columns, y = floor(s.tileIndex / columns);
        context.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    }
    $('tileWarning').style.display = effectTileFits(s) ? 'none' : '';
    $('buttonDefaultTexture').disabled = textureInfos[0] === defaultTextureInfo;
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    setGravity(vec2(0, -.01));
    setCameraScale(64);
    setCanvasClearColor(hsl(0, 0, 0));
    buildSettingsPanel();
    setupLibraryBar();
    setupTexture();
    setupPreviewControls();
    $('effectSelect').oninput = ()=>
        selectEffect(parseInt($('effectSelect').value));
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
    if ($('particleCount').textContent !== count)
        $('particleCount').textContent = count;
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // show the floor the particles land on
    if (floorLayer)
    {
        const size = floorLayer.size;
        drawRect(floorLayer.pos.add(size.scale(.5)), size, hsl(0, 0, .3));
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost() {}

///////////////////////////////////////////////////////////////////////////////
// startup LittleJS engine, drawing into the preview area
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost,
    ['tiles.png'], $('previewArea'));
