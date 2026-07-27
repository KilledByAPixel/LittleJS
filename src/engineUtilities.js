/**
 * LittleJS Utility Classes and Functions
 * - Timer - tracks time automatically
 * - Time formatting helper
 * - JSON file fetching
 * @namespace Utilities
 */

'use strict';

/** Formats seconds to mm:ss style for display purposes 
 *  @param {number} t - time in seconds
 *  @return {string}
 *  @memberof Utilities */
function formatTime(t) { return (t/60|0) + ':' + (t%60<10?'0':'') + (t%60|0); }

/** Fetches a JSON file from a URL and returns the parsed JSON object. Must be used with await!
 *  @param {string} url - URL of JSON file
 *  @return {Promise<object>}
 *  @memberof Utilities */
async function fetchJSON(url)
{
    const response = await fetch(url);
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
            catch { LOG('readSaveData: corrupt JSON for', saveName, '- using defaults'); }
        }
    }
    catch { LOG('readSaveData: localStorage unavailable - using defaults'); }
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
// Murmur3 finalizer - adjacent integers produce uncorrelated outputs.
function noiseHash(i)
{
    let h = (i | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 2**32;
}

/** 1D gradient noise - returns a smooth value in [0, 1] for any real x.
 *  Integer inputs land on deterministic lattice values; non-integer inputs
 *  are interpolated with smoothStep for C1 continuity.
 *  @param {number} x
 *  @return {number}
 *  @memberof Utilities */
function noise1D(x)
{
    const i = Math.floor(x);
    return lerp(noiseHash(i), noiseHash(i + 1), smoothStep(x - i));
}

/** 2D gradient noise - returns a smooth value in [0, 1] for any real (x, y).
 *  @param {number} x
 *  @param {number} y
 *  @return {number}
 *  @memberof Utilities */
function noise2D(x, y)
{
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smoothStep(x - ix), fy = smoothStep(y - iy);
    // large prime decorrelates neighboring rows
    const h = (a, b) => noiseHash(a + b * 374761393);
    return lerp(
        lerp(h(ix,     iy    ), h(ix + 1, iy    ), fx),
        lerp(h(ix,     iy + 1), h(ix + 1, iy + 1), fx),
        fy);
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Timer object tracks how long has passed since it was set
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
     *  @param {number} [timeLeft] - How much time left before the timer elapses in seconds */
    constructor(timeLeft)
    {
        ASSERT(timeLeft === undefined || isNumber(timeLeft), 'Constructed Timer is invalid.', timeLeft);
        this.time = timeLeft === undefined ? undefined : time + timeLeft;
        this.setTime = timeLeft;
    }

    /** Set the timer with seconds passed in
     *  @param {number} [timeLeft] - How much time left before the timer is elapsed in seconds */
    set(timeLeft=0)
    {
        ASSERT(isNumber(timeLeft), 'Timer is invalid.', timeLeft);
        this.time = time + timeLeft;
        this.setTime = timeLeft;
    }

    /** Unset the timer */
    unset() { this.time = undefined; }

    /** Returns true if set
     * @return {boolean} */
    isSet() { return this.time !== undefined; }

    /** Returns true if set and has not elapsed
     * @return {boolean} */
    active() { return time < this.time; }

    /** Returns true if set and elapsed
     * @return {boolean} */
    elapsed() { return time >= this.time; }

    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    get() { return this.isSet()? time - this.time : 0; }

    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {number} */
    getPercent() { return this.isSet()? 1-percent(this.time - time, 0, this.setTime) : 0; }
    
    /** Returns this timer expressed as a string
     * @return {string} */
    toString() { if (debug) { return this.isSet() ? Math.abs(this.get()) + ' seconds ' + (this.get()<0 ? 'before' : 'after' ) : 'unset'; }}
    
    /** Get how long since elapsed, returns 0 if not set (returns negative if currently active)
     * @return {number} */
    valueOf() { return this.get(); }
}