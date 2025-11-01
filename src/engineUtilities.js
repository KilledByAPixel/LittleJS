/**
 * LittleJS Utility Classes and Functions
 * - General purpose math library
 * - Vector2 - fast, simple, easy 2D vector class
 * - Color - holds a rgba color with some math functions
 * - Timer - tracks time automatically
 * - RandomGenerator - seeded random number generator
 * @namespace Utilities
 */

'use strict';

/** Formats seconds to mm:ss style for display purposes
 *  @param {number} t - time in seconds
 *  @return {string}
 *  @memberof Utilities */
function formatTime(t)
{
    const sign = t < 0 ? '-' : '';
    t = abs(t)|0;
    return sign + (t/60|0) + ':' + (t%60<10?'0':'') + t%60;
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
    ASSERT(isString(url), 'saveDataURL requires url string');
    ASSERT(isString(filename), 'saveDataURL requires filename string');

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
    ASSERT(isString(title), 'shareURL requires title string');
    ASSERT(isString(url), 'shareURL requires url string');
    navigator.share?.({title, url}).then(()=>callback?.());
}