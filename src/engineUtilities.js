/**
 * LittleJS Utility Classes and Functions
 * - Timer - tracks time automatically with support for pause and real-time modes
 * - Time formatting helper
 * - JSON file fetching
 * - File saving (text, canvas, data URLs)
 * - Native share dialog support
 * - Local storage save data management
 * - Value noise (1D and 2D)
 * @namespace Utilities
 */

'use strict';

// how far a timer may be short of its end and count as elapsed, far below a frame, more than time's rounding
const timerTolerance = 1e-6;

/**
 * Timer object tracks how long has passed since it was set
 * @memberof Engine
 * @example
 * let a = new Timer;    // creates a timer that is not set
 * a.set(3);             // sets the timer to 3 seconds
 *
 * let b = new Timer(1); // creates a timer with 1 second left
 * b.unset();            // unset the timer
 */
class Timer
{
    /** Create a timer object set time passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds (undefined = unset)
     *  @param {boolean} [useRealTime] - Should the timer keep running even when the game is paused? (useful for UI) */
    constructor(timeLeft, useRealTime=false)
    {
        ASSERT(timeLeft === undefined || isNumber(timeLeft), 'Timer: time must be a number of seconds', timeLeft);
        /** @property {boolean} - Runs on real time, so it keeps going while the game is paused, see setUseRealTime */
        this.useRealTime = useRealTime;
        const globalTime = this.getGlobalTime();
        /** @type {number|undefined} */
        this.time = timeLeft === undefined ? undefined : globalTime + timeLeft;
        /** @type {number|undefined} */
        this.setTime = timeLeft;
    }

    /** Set the timer with seconds passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0)
    {
        ASSERT(isNumber(timeLeft), 'Timer.set: time must be a number of seconds', timeLeft);
        const globalTime = this.getGlobalTime();
        this.time = globalTime + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set if the timer should keep running even when the game is paused
     *  @param {boolean} [useRealTime] */
    setUseRealTime(useRealTime=true)
    {
        ASSERT(!this.isSet(), 'Cannot change global time setting while timer is set.');
        this.useRealTime = useRealTime;
    }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {boolean} */
    isSet() { return this.time !== undefined; }

    /** Returns true if set and has not elapsed
     * @return {boolean} */
    active() { return this.getGlobalTime() + timerTolerance < this.time; }

    /** Returns true if set and elapsed, on the frame it ends though the time it was set at and its seconds round
     *  apart, so a timer of a whole number of frames takes that many
     * @return {boolean} */
    elapsed() { return this.getGlobalTime() + timerTolerance >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active), 0 on the frame it
     *  ends, as elapsed() reads it
     * @return {number} */
    get()
    {
        const since = this.isSet() ? this.getGlobalTime() - this.time : 0;
        return abs(since) < timerTolerance ? 0 : since;
    }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set.
     *  Zero-duration timers report 1 (already elapsed).
     * @return {number} */
    getPercent()
    {
        if (!this.isSet()) return 0;
        if (!(this.setTime > 0) || this.elapsed()) return 1; // as elapsed() reads it, on the frame it ends
        if (this.setTime === Infinity) return 0; // a timer that never ends has not begun, not Infinity / Infinity
        return 1 - percent(this.time - this.getGlobalTime(), 0, this.setTime);
    }

    /** Get the time this timer was set to, returns 0 if not set
     * @return {number} */
    getSetTime() { return this.isSet() ? this.setTime : 0; }

    /** Get the current global time this timer is based on
     * @return {number} */
    getGlobalTime() { return this.useRealTime ? timeReal : time; }

    /** Returns this timer expressed as a string
     * @return {string} */
    toString() { return this.isSet() ? abs(this.get()) + ' seconds ' + (this.get()<0 ? 'before' : 'after' ) : 'unset'; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    valueOf() { return this.get(); }
}

///////////////////////////////////////////////////////////////////////////////

/** Formats seconds to mm:ss style for display purposes
 *  @param {number} t - time in seconds
 *  @return {string}
 *  @memberof Utilities */
function formatTime(t)
{
    t = isFinite(t) ? t : 0; // no time shows 0:00
    const signStr = t <= -1 ? '-' : ''; // no sign when it shows 0:00
    t = Math.trunc(abs(t)); // not |0, which wraps past 2^31 seconds
    return signStr + Math.trunc(t/60) + ':' + (t%60<10?'0':'') + t%60;
}

/** Fetches a JSON file from a URL and returns the parsed JSON object. Must be used with await!
 *  @param {string} url - URL of JSON file
 *  @return {Promise<any>} - The parsed JSON, any shape, as response.json() gives it
 *  @memberof Utilities */
async function fetchJSON(url)
{
    const response = await loadFetch(url, 'fetchJSON');
    if (!response.ok)
        throw new Error(`fetchJSON: could not load ${url}, HTTP ${response.status} ${response.statusText}`);
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e)
    {
        // a dev server answers a mistyped path with its own page, which is no JSON, so the error says which file
        throw new Error(`fetchJSON: ${url} is not JSON` + (loadIsWebPage(text) ?
            ', it is a web page, so the path may be wrong' : ': ' + e.message));
    }
    editorJSONFetched(url, json); // debug builds remember the file a level came from, to save it by that name
    return json;
}

// is a file's text a web page, as a dev server sends for a path it does not have
const loadIsWebPage = (text)=> /^\s*</.test(text);

// fetch a file for a loader, a failure to reach it named with the file and who asked, and with the usual cause when
// the page was opened from a file on disk, where the browser lets it load nothing
async function loadFetch(url, who)
{
    try { return await fetch(url); }
    catch (error)
    {
        const fromDisk = globalThis.location?.protocol === 'file:';
        const failed = new Error(`${who}: could not load ${url}, ${error.message}` + (fromDisk ?
            ', the page was opened from a file, serve it from a local web server' : ''));
        /** @type {any} */ (failed).cause = error; // what the browser said, as the error option newer libraries know
        throw failed;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Save a text file to disk
 *  @param {string} text
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Utilities */
function saveText(text, filename='text', type='text/plain')
{ saveDataURL(URL.createObjectURL(new Blob([text], {'type':type})), filename, 1e3); } // freed once the download has it

/** Create an offscreen canvas to draw into, and return its 2D context
 *  - The canvas is context.canvas, which is what TextureInfo and the like take
 *  - A browser with no OffscreenCanvas, Safari before 16.4, gets a canvas element that is not on the page
 *  @param {number} width - In pixels
 *  @param {number} [height] - In pixels, defaults to the width for a square
 *  @param {boolean} [willReadFrequently] - Keep it in software, faster when getImageData is called on it often
 *  @return {OffscreenCanvasRenderingContext2D} An HTMLCanvasElement's context where there is no OffscreenCanvas, as
 *    in Safari before 16.4, which has the same drawing calls
 *  @memberof Utilities */
function createCanvasContext(width, height=width, willReadFrequently=false)
{
    ASSERT(isNumber(width) && isNumber(height), 'canvas width and height must be numbers', width, height);
    const canvas = typeof OffscreenCanvas != 'undefined' ? new OffscreenCanvas(width, height) :
        Object.assign(document.createElement('canvas'), {width, height});
    return /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d', {willReadFrequently}));
}

// can a canvas be made to draw into: an OffscreenCanvas, or a canvas element where there is none, as in Safari before
// 16.4; neither in a headless test
function canvasAvailable()
{ return typeof OffscreenCanvas != 'undefined' || typeof document != 'undefined' && !!document.createElement; }

/** Save a canvas to disk
 *  @param {HTMLCanvasElement|OffscreenCanvas} canvas
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Utilities */
function saveCanvas(canvas, filename='screenshot', type='image/png')
{
    if (typeof OffscreenCanvas != 'undefined' && canvas instanceof OffscreenCanvas)
    {
        // copy to temporary canvas and save
        const saveCanvas = document.createElement('canvas');
        saveCanvas.width = canvas.width;
        saveCanvas.height = canvas.height;
        saveCanvas.getContext('2d').drawImage(canvas, 0, 0);
        saveDataURL(saveCanvas.toDataURL(type), filename);
    }
    else
        saveDataURL(/** @type {HTMLCanvasElement} */ (canvas).toDataURL(type), filename);
}

/** Save a data url to disk
 *  @param {string} url
 *  @param {string} [filename]
 *  @param {number} [revokeTime] - how long before revoking the url
 *  @memberof Utilities */
function saveDataURL(url, filename='download', revokeTime)
{
    ASSERT(isStringLike(url), 'saveDataURL requires url string');
    ASSERT(isStringLike(filename), 'saveDataURL requires filename string');

    // create link for saving screenshots
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    if (revokeTime !== undefined)
        setTimeout(()=> URL.revokeObjectURL(url), revokeTime);
}

/** Share content using the native share dialog if available
 *  @param {string} title - title of the share
 *  @param {string} url - url to share
 *  @param {function(): void} [callback] - Called when share is complete
 *  @memberof Utilities */
function shareURL(title, url, callback)
{
    ASSERT(isStringLike(title), 'shareURL requires title string');
    ASSERT(isStringLike(url), 'shareURL requires url string');
    navigator.share?.({title, url}).then(()=>callback?.(), ()=>{}); // a player who cancels is not an error
}

///////////////////////////////////////////////////////////////////////////////

/** Read save data from local storage
 *  - The result has the type of defaultSaveData, or any when there is none
 *  - A top level value whose default is a vec2, a vec3 or a Color, a value with a copy method and only numbers,
 *    comes back as a new one, where JSON keeps only its numbers, a number not saved or not finite the default's;
 *    with nothing saved any value with a copy method is a copy of the default, so changing it leaves the default
 *  - A value whose default is a number, at the top level or inside an array or object default, comes back as the
 *    default when what was saved is not a number, as for Infinity, which JSON writes as null
 *  - An array or object default not saved comes back as a copy, a vec2 or a Color in it too, so changing it leaves
 *    the default; a key a nested object default has that the save has not, a setting added since, is the default's,
 *    and a saved array is the array that was saved, shorter or longer than its default
 *  - Inside an array or object a vec2 or a Color comes back as one too, from its saved numbers, and an object or
 *    array default saved as anything that is not one, an older save's number or a null, comes back as the default, so
 *    a value that may be none is best a default of null, but a vec2 or a Color, which over a null default comes back
 *    as plain numbers with no methods, is best its own default with a flag beside it; a value of a
 *    class with no copy method is the default's own when not saved, and as JSON gave it once saved
 *  @template {Object<string, any>} [T=any]
 *  @param {string} saveName - unique name for the game/save
 *  @param {T} [defaultSaveData] - default values, result is {...default, ...loaded} so this must be an object
 *  @return {T}
 *  @memberof Utilities */
function readSaveData(saveName, defaultSaveData)
{
    ASSERT(isStringLike(saveName), 'readSaveData requires saveName string');
    ASSERT(defaultSaveData === undefined ||
        (typeof defaultSaveData === 'object' && defaultSaveData !== null),
        'readSaveData: default must be an object - the result is ' +
        '{...default, ...loaded}, so a scalar default yields {}. ' +
        'Use readSaveData(key, {best:0}).best');

    // tolerate localStorage being unavailable (iOS private mode, sandboxed
    // iframes) and corrupt JSON in stored data
    let loadedData = {};
    try
    {
        const data = localStorage.getItem(saveName); // not the brackets, a name like 'key' or 'length' is a Storage member
        if (data)
        {
            try { loadedData = JSON.parse(data); }
            catch { console.warn('readSaveData: the save ' + saveName + ' can not be read, using the defaults'); }
            if (!loadedData || typeof loadedData !== 'object' || isArray(loadedData))
                loadedData = {}; // only an object of saved values, never a string spread into its letters
        }
    }
    catch { LOG('readSaveData: localStorage unavailable — using defaults'); }
    const result = { .../** @type {object} */ (defaultSaveData), ...loadedData };
    // an array or plain object taken from the defaults is a copy, so the game's changes do not write into them
    for (const key in defaultSaveData ?? {})
        Object.prototype.hasOwnProperty.call(loadedData, key) || (result[key] = saveDataCopy(defaultSaveData[key]));
    // a vec2 or a Color written as JSON is only its numbers, made one again from a copy of its default, taking only
    // the numbers the copy has, so a saved key of another name, a null JSON wrote for Infinity, or a __proto__ key,
    // changes nothing; a value with more than numbers, a Matrix4, stays as JSON gave it; a saved value that is not
    // an object at all, a string or a number from an older save format, is the default, never handed back as it is
    for (const key in defaultSaveData ?? {})
    {
        const value = defaultSaveData[key];
        if (typeof value === 'number' || saveDataPlain(value))
        {
            // a number saved as anything else, the null JSON writes for Infinity or NaN, is the default, so a best
            // time of Infinity saved before the first win can still be beaten, in an array or object of them too
            Object.prototype.hasOwnProperty.call(loadedData, key) &&
                (result[key] = saveDataNumbers(value, loadedData[key]));
            continue;
        }
        if (!value || typeof value !== 'object' || typeof value.copy !== 'function') continue;
        const copy = value.copy(), fields = Object.keys(copy), saved = loadedData[key];
        if (!Object.prototype.hasOwnProperty.call(loadedData, key))
            result[key] = copy; // the default's own object is the game's, or frozen like WHITE
        else if (fields.every((field)=> typeof copy[field] === 'number') && saved && typeof saved === 'object' &&
            Object.prototype.toString.call(saved) === '[object Object]')
        {
            for (const field of fields)
                Number.isFinite(saved[field]) && (copy[field] = saved[field]);
            result[key] = copy;
        }
        else if (!saved || typeof saved !== 'object' || isArray(saved))
            result[key] = copy;
    }
    return result;
}

// an array or an object of plain values, as JSON makes, not a vec2 or a Color, which have a copy of their own
const saveDataPlain = (v)=> isArray(v) ||
    !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

// a copy of a default's arrays and plain objects, all the way down, and of a value with a copy method in them, a
// vec2 or a Color, frozen like WHITE too; anything else is itself
function saveDataCopy(value)
{
    if (isArray(value)) return value.map(saveDataCopy);
    if (!saveDataPlain(value))
        return value && typeof value === 'object' && typeof value.copy === 'function' ? value.copy() : value;
    const copy = {};
    for (const key of Object.keys(value))
        key === '__proto__' || (copy[key] = saveDataCopy(value[key]));
    return copy;
}

// a saved value over its default: where the default has a number, at the top or at an index or key inside it, a
// saved value that is not one, the null JSON writes for Infinity, is the default's number; a key a nested object's
// default has and the save does not, a setting added after the save, is a copy of the default's; a saved array is
// the array, as long as it was saved; the rest is as saved
function saveDataNumbers(fallback, saved)
{
    if (typeof fallback === 'number')
        return typeof saved === 'number' ? saved : fallback;
    if (fallback && typeof fallback === 'object' && !saveDataPlain(fallback) && typeof fallback.copy === 'function')
    {
        // a vec2 or a Color in an array or object made one again from its numbers, as one at the top level is
        const copy = fallback.copy();
        if (!copy || typeof copy !== 'object') return saved;
        const fields = Object.keys(copy);
        if (saved && typeof saved === 'object' && !isArray(saved) && fields.every((f)=> typeof copy[f] === 'number'))
            for (const field of fields)
                Number.isFinite(saved[field]) && (copy[field] = saved[field]);
        else if (saved && typeof saved === 'object' && !isArray(saved))
            return saved; // one with more than numbers stays as JSON gave it
        return copy; // and a list saved for it is the default, as at the top level
    }
    if (!saveDataPlain(fallback))
        return saved;
    // an object or array default saved as a number, a string or null, an older save's form, is the default
    if (!saved || typeof saved !== 'object')
        return saveDataCopy(fallback);
    if (isArray(fallback) !== isArray(saved))
        return saved;
    for (const key of Object.keys(saved))
        key !== '__proto__' && Object.prototype.hasOwnProperty.call(fallback, key) &&
            (saved[key] = saveDataNumbers(fallback[key], saved[key]));
    if (!isArray(fallback))
        for (const key of Object.keys(fallback))
            key === '__proto__' || Object.prototype.hasOwnProperty.call(saved, key) ||
                (saved[key] = saveDataCopy(fallback[key]));
    return saved;
}

/** Write save data to local storage, an object as readSaveData gives it back
 *  @param {string} saveName - unique name for the game/save
 *  @param {object} saveData - object containing data to be saved
 *  @return {boolean} - Whether it was written, false when storage is unavailable or full
 *  @memberof Utilities */
function writeSaveData(saveName, saveData)
{
    ASSERT(isStringLike(saveName), 'writeSaveData requires saveName string');
    ASSERT(typeof saveData === 'object' && saveData !== null && !isArray(saveData),
        'writeSaveData: save data must be an object, readSaveData reads it back into one');
    // tolerate localStorage being unavailable or quota exceeded; in release too, a player's save going nowhere is
    // not silent, and the warning says which it was
    let text;
    try { text = JSON.stringify(saveData); }
    catch (error)
    {
        console.warn('writeSaveData: the save ' + saveName + ' can not be written as JSON, ' + error.message);
        return false;
    }
    if (text === undefined) // a toJSON that returns nothing, which would be stored as the text undefined
    {
        console.warn('writeSaveData: the save ' + saveName + ' is nothing as JSON, it is not written');
        return false;
    }
    try { localStorage.setItem(saveName, text); return true; }
    catch
    {
        console.warn('writeSaveData: the save ' + saveName + ' could not be written, storage is full or off');
        return false;
    }
}

///////////////////////////////////////////////////////////////////////////////

// Deterministic well-distributed hash of an integer lattice index to [0, 1).
// Murmur3 finalizer — adjacent integers produce uncorrelated outputs.
function noiseHash(i)
{
    let h = (i | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 2**32;
}

/** 1D value noise — returns a smooth value in [0, 1] for any real x.
 *  Integer inputs land on deterministic lattice values; non-integer inputs
 *  are interpolated with smoothStep for C1 continuity.
 *  @param {number} x
 *  @return {number}
 *  @memberof Utilities */
function noise1D(x)
{
    const i = floor(x);
    return lerp(noiseHash(i), noiseHash(i + 1), smoothStep(x - i));
}

/** 2D value noise — returns a smooth value in [0, 1] for any real (x, y)
 *  @param {number} x
 *  @param {number} y
 *  @return {number}
 *  @memberof Utilities */
function noise2D(x, y)
{
    const ix = floor(x), iy = floor(y);
    const fx = smoothStep(x - ix), fy = smoothStep(y - iy);
    // large prime decorrelates neighboring rows; multiplied as 32 bit integers, which is what the hash keeps of it,
    // so the row stays exact however far out y is, where a plain product would lose its low bits
    const h = (a, b) => noiseHash(a + Math.imul(b, 374761393));
    return lerp(
        lerp(h(ix,     iy    ), h(ix + 1, iy    ), fx),
        lerp(h(ix,     iy + 1), h(ix + 1, iy + 1), fx),
        fy);
}