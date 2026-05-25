/**
 * LittleJS Utility Classes and Functions
 * - Timer - tracks time automatically with support for pause and real-time modes
 * - Time formatting helper
 * - JSON file fetching
 * - File saving (text, canvas, data URLs)
 * - Native share dialog support
 * - Local storage save data management
 * - Gradient noise (1D and 2D)
 * @namespace Utilities
 */

'use strict';

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
     *  @param {number} [timeLeft] - How much time left before the timer 
     *  @param {boolean} [useRealTime] - Should the timer keep running even when the game is paused? (useful for UI) */
    constructor(timeLeft, useRealTime=false)
    {
        ASSERT(timeLeft === undefined || isNumber(timeLeft), 'Constructed Timer is invalid.', timeLeft);
        this.useRealTime = useRealTime;
        const globalTime = this.getGlobalTime();
        this.time = timeLeft === undefined ? undefined : globalTime + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set the timer with seconds passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0)
    {
        ASSERT(isNumber(timeLeft), 'Timer is invalid.', timeLeft);
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
    active() { return this.getGlobalTime() < this.time; }

    /** Returns true if set and elapsed
     * @return {boolean} */
    elapsed() { return this.getGlobalTime() >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    get() { return this.isSet()? this.getGlobalTime() - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set.
     *  Zero-duration timers report 1 (already elapsed).
     * @return {number} */
    getPercent()
    {
        if (!this.isSet()) return 0;
        if (!this.setTime) return 1;
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
    const signStr = t < 0 ? '-' : '';
    t = abs(t)|0;
    return signStr + (t/60|0) + ':' + (t%60<10?'0':'') + t%60;
}

/** Fetches a JSON file from a URL and returns the parsed JSON object. Must be used with await!
 *  @param {string} url - URL of JSON file
 *  @return {Promise<object>}
 *  @memberof Utilities */
async function fetchJSON(url)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Failed to fetch JSON from ${url}: ${response.status} ${response.statusText}`);
    return response.json();
}

///////////////////////////////////////////////////////////////////////////////

/** Save a text file to disk
 *  @param {string} text
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Utilities */
function saveText(text, filename='text', type='text/plain')
{ saveDataURL(URL.createObjectURL(new Blob([text], {'type':type})), filename); }

/** Save a canvas to disk
 *  @param {HTMLCanvasElement|OffscreenCanvas} canvas
 *  @param {string} [filename]
 *  @param {string} [type]
 *  @memberof Utilities */
function saveCanvas(canvas, filename='screenshot', type='image/png')
{
    if (canvas instanceof OffscreenCanvas)
    {
        // copy to temporary canvas and save
        const saveCanvas = document.createElement('canvas');
        saveCanvas.width = canvas.width;
        saveCanvas.height = canvas.height;
        saveCanvas.getContext('2d').drawImage(canvas, 0, 0);
        saveDataURL(saveCanvas.toDataURL(type), filename);
    }
    else
        saveDataURL(canvas.toDataURL(type), filename);
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
 *  @param {Function} [callback] - Called when share is complete
 *  @memberof Utilities */
function shareURL(title, url, callback)
{
    ASSERT(isStringLike(title), 'shareURL requires title string');
    ASSERT(isStringLike(url), 'shareURL requires url string');
    navigator.share?.({title, url}).then(()=>callback?.());
}

///////////////////////////////////////////////////////////////////////////////

/** Read save data from local storage
 *  @param {string} saveName - unique name for the game/save
 *  @param {Object} [defaultSaveData] - default values for save
 *  @return {Object}
 *  @memberof Utilities */
function readSaveData(saveName, defaultSaveData)
{
    ASSERT(isStringLike(saveName), 'loadData requires saveName string');

    // tolerate localStorage being unavailable (iOS private mode, sandboxed
    // iframes) and corrupt JSON in stored data
    let loadedData = {};
    try
    {
        const data = localStorage[saveName];
        if (data)
        {
            try { loadedData = JSON.parse(data); }
            catch { LOG('readSaveData: corrupt JSON for', saveName, '— using defaults'); }
        }
    }
    catch { LOG('readSaveData: localStorage unavailable — using defaults'); }
    return { ...defaultSaveData, ...loadedData };
}

/** Write save data to local storage
 *  @param {string} saveName - unique name for the game/save
 *  @param {Object} saveData - object containing data to be saved
 *  @memberof Utilities */
function writeSaveData(saveName, saveData)
{
    ASSERT(isStringLike(saveName), 'saveData requires saveName string');
    // tolerate localStorage being unavailable or quota exceeded
    try { localStorage[saveName] = JSON.stringify(saveData); }
    catch { LOG('writeSaveData: failed to write', saveName); }
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

/** 1D gradient noise — returns a smooth value in [0, 1] for any real x.
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

/** 2D gradient noise — returns a smooth value in [0, 1] for any real (x, y).
 *  @param {number} x
 *  @param {number} y
 *  @return {number}
 *  @memberof Utilities */
function noise2D(x, y)
{
    const ix = floor(x), iy = floor(y);
    const fx = smoothStep(x - ix), fy = smoothStep(y - iy);
    // large prime decorrelates neighboring rows
    const h = (a, b) => noiseHash(a + b * 374761393);
    return lerp(
        lerp(h(ix,     iy    ), h(ix + 1, iy    ), fx),
        lerp(h(ix,     iy + 1), h(ix + 1, iy + 1), fx),
        fy);
}