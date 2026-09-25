/**
 * LittleJS Medal System
 * - Achievement/trophy system for games
 * - Medal class with name, description, icon, and unlock tracking
 * - Automatic saving to local storage, unless a service like Newgrounds holds the medal (see Medal.isLocal)
 * - Visual display queue with slide-in notifications
 * - The Newgrounds plugin extends it with NewgroundsMedal, held on the server while logged in
 * - Setting debugMedals = true in the game code before medalsInit skips the load and the save, and in the debug build logs the Newgrounds traffic; it is not exported, so only a script tag build can set it
 * @namespace Medals
 */

'use strict';

let debugMedals = false; // see the header

///////////////////////////////////////////////////////////////////////////////
// Medals settings

/** How long to show medals for in seconds
 *  @type {number}
 *  @default
 *  @memberof Settings */
let medalDisplayTime = 5;

/** How quickly to slide on/off medals in seconds
 *  @type {number}
 *  @default
 *  @memberof Settings */
let medalDisplaySlideTime = .5;

/** Size of medal display
 *  @type {Vector2}
 *  @default Vector2(640,80)
 *  @memberof Settings */
let medalDisplaySize = vec2(640, 80);

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @type {boolean}
 *  @default
 *  @memberof Settings */
let medalsPreventUnlock = false;

/** List of all medals
 *  @type {Object<number, Medal>}
 *  @memberof Medals */
const medals = {};

// Engine internal variables not exposed to documentation
let medalsDisplayQueue = [], medalsSaveName, medalsDisplayTimeLast, medalsRenderAdded;
let medalsLoadWaiting = false; // medalsInit came before any medal, each one made reads its own unlock

///////////////////////////////////////////////////////////////////////////////

/** Initialize medals with a save name used for storage
 *  - Call this after creating all medals
 *  - Loads which medals are unlocked from the save, and writes the catalog back
 *  - A medal a service like Newgrounds holds is left as it is, see Medal.isLocal
 *  @param {string} saveName - The localStorage key the medals are kept under, a different one from the game's own
 *  readSaveData and writeSaveData, or each would overwrite the other
 *  @memberof Medals */
function medalsInit(saveName)
{
    medalsSaveName = saveName;
    medalsLoad();

    // add the medal display once, however often this is called
    if (!medalsRenderAdded)
        engineAddPlugin(undefined, medalsRender);
    medalsRenderAdded = true;
}

// check which local medals are unlocked in the save, and write the catalog back
function medalsLoad()
{
    // with no medals made yet, the save is left as it is for them, a game that calls medalsInit first keeps its unlocks;
    // it keeps waiting from then on, so loading again (a dropped Newgrounds session) does not drop medals still to come
    medalsLoadWaiting ||= !Object.keys(medals).length;
    if (debugMedals || !medalsSaveName) return;
    const saved = readSaveData(medalsSaveName);
    ASSERT(Object.keys(saved).every(key=> isNumber(+key)),
        'the medals save name holds other data, give medalsInit a name of its own');
    medalsForEach(medal=> {
        if (medal.isLocal())
            medal.unlocked = !!saved[medal.id]?.unlocked;
    });
    medalsSave();
}

// show the first medal in the queue, sliding it on and off
function medalsRender()
{
    if (!medalsDisplayQueue.length) return;

    // update first medal in queue
    const medal = medalsDisplayQueue[0];
    const elapsed = timeReal - medalsDisplayTimeLast;
    if (!medalsDisplayTimeLast)
        medalsDisplayTimeLast = timeReal;
    else if (elapsed > medalDisplayTime)
    {
        medalsDisplayTimeLast = 0;
        medalsDisplayQueue.shift();
    }
    else
    {
        // slide on/off medals, the slides share the display time when it is short
        const slideTime = min(medalDisplaySlideTime, medalDisplayTime/2);
        const slideOffTime = medalDisplayTime - slideTime;
        const hidePercent =
            elapsed < slideTime ? 1 - elapsed / slideTime :
            elapsed > slideOffTime ? (elapsed - slideOffTime) / slideTime : 0;
        medal.render(hidePercent);
    }
}

/**
 *  @callback MedalCallbackFunction - Function that processes a medal
 *  @param {Medal} medal
 *  @memberof Medals
 */

/** Calls a function for each medal
 *  @param {MedalCallbackFunction} callback
 *  @memberof Medals */
function medalsForEach(callback)
{ Object.values(medals).forEach(medal=> callback(medal)); }

/** Reset all medals to locked and persist the cleared catalog
 *  - A medal a service like Newgrounds holds is left alone, the service has it
 *  @memberof Medals */
function medalsReset()
{
    medalsForEach(medal=> medal.isLocal() && (medal.unlocked = false));
    if (medalsLoadWaiting && medalsSaveName && !debugMedals)
    {
        // the saved unlocks of medals not made yet are cleared too, they are read when those medals are made
        const saved = readSaveData(medalsSaveName);
        for (const id in saved)
            if (!medals[id] && saved[id] && typeof saved[id] === 'object')
                saved[id].unlocked = false;
        writeSaveData(medalsSaveName, saved);
    }
    medalsSave();
}

// write the local medals to the save, keeping the entries of medals a service holds
function medalsSave()
{
    if (debugMedals || !medalsSaveName) return;
    // while medalsInit waits for medals made later, their saved entries are kept for them
    const saved = readSaveData(medalsSaveName);
    const data = medalsLoadWaiting ? {...saved} : {};
    for (const key in saved) // what is not a medal is the game's own, saved under the same name, and stays
        isNumber(+key) || (data[key] = saved[key]);
    medalsForEach(medal=> {
        if (!medal.isLocal())
        {
            // a service holds this medal, its entry stays as it was for when it is local again
            if (saved[medal.id]) data[medal.id] = saved[medal.id];
            return;
        }
        const entry = {
            name: medal.name,
            description: medal.description,
            icon: medal.icon,
            unlocked: medal.unlocked,
        };
        if (medal.image) entry.src = medal.image.src;
        data[medal.id] = entry;
    });
    writeSaveData(medalsSaveName, data);
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Medal - Tracks an unlockable medal
 * @memberof Medals
 * @example
 * // create a medal
 * const medal_example = new Medal(0, 'Example Medal', 'More info about the medal goes here.', '🎖️');
 *
 * // initialize medals
 * medalsInit('Example Game');
 *
 * // unlock the medal
 * medal_example.unlock();
 */
class Medal
{
    /** Create a medal and add it to the list of medals
     *  @param {number} id            - The unique identifier of the medal
     *  @param {string} name          - Name of the medal
     *  @param {string} [description] - Description of the medal
     *  @param {string} [icon]        - Icon for the medal
     *  @param {string} [src]         - Image location for the medal
     */
    constructor(id, name, description='', icon='🏆', src)
    {
        ASSERT(isNumber(id) && id >= 0 && !medals[id], 'medal id must be a unique number of 0 or more');

        /** @property {number} - The unique identifier of the medal */
        this.id = id;

        /** @property {string} - Name of the medal */
        this.name = name;

        /** @property {string} - Description of the medal */
        this.description = description;

        /** @property {string} - Icon for the medal */
        this.icon = icon;

        /** @property {boolean} - Is the medal unlocked? */
        this.unlocked = false;

        /** @property {HTMLImageElement|undefined} - Source image for the medal icon, if any
         *  @type {HTMLImageElement|undefined} */
        this.image = undefined;
        if (src)
            (this.image = new Image).src = src;

        // add this to list of medals, unlocked if the save says so when medalsInit came before any medal
        medals[id] = this;
        if (medalsLoadWaiting && !debugMedals && this.isLocal())
            this.unlocked = !!readSaveData(medalsSaveName)[id]?.unlocked;
    }

    /** Unlocks a medal if not already unlocked
     *  - The promise is optional, for when a game wants to know the outcome
     *  @return {Promise<boolean>} - Whether the medal is unlocked, right away unless a service like Newgrounds has to confirm */
    unlock()
    {
        if (!medalsPreventUnlock && !this.unlocked)
        {
            ASSERT(medalsSaveName, 'save name must be set');
            this.unlocked = true;
            medalsSave();
            medalsDisplayQueue.push(this);
        }
        return Promise.resolve(this.unlocked);
    }

    /** Whether the local save holds this medal, it is neither loaded nor written while a service like Newgrounds holds it
     *  @return {boolean} */
    isLocal() { return true; }

    /** Render a medal
     *  @param {number} [hidePercent] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = mainContext;
        const width = min(medalDisplaySize.x, mainCanvasSize.x);
        const height = medalDisplaySize.y;
        const x = mainCanvasSize.x - width;
        const y = -height*hidePercent;
        const backgroundColor = hsl(0,0,.9);

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = backgroundColor.toString();
        context.strokeStyle = BLACK.toString();
        const lineWidth = context.lineWidth = 3;
        context.rect(x + lineWidth/2, y + lineWidth/2, width - lineWidth, height - lineWidth); // the whole border shows
        context.fill();
        context.stroke();
        context.clip();

        // draw the icon
        const gap = vec2(.1, .05).scale(height);
        const iconSize = height - 2*gap.x;
        this.renderIcon(vec2(x + gap.x + iconSize/2, y + height/2), iconSize);

        // draw the name
        const nameSize = height*.5;
        const descriptionSize = height*.3;
        const pos = vec2(x + iconSize + 2*gap.x, y + gap.y*2 + nameSize/2);
        const textWidth = width - iconSize - 3*gap.x;
        drawTextScreen(this.name, pos, nameSize, BLACK, 0, undefined, 'left', undefined, undefined, textWidth);

        // draw the description
        pos.y = y + height - gap.y*2 - descriptionSize/2;
        drawTextScreen(this.description, pos, descriptionSize, BLACK, 0, undefined, 'left', undefined, undefined, textWidth);
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Vector2} pos - Screen space position
     *  @param {number} size - Screen space size
     */
    renderIcon(pos, size)
    {
        // draw the image once it has loaded, or the icon; a broken image would throw
        const image = this.image;
        if (image && image.complete && image.naturalWidth)
            mainContext.drawImage(image, pos.x-size/2, pos.y-size/2, size, size);
        else
            drawTextScreen(this.icon, pos, size*.7, BLACK);
    }

}

///////////////////////////////////////////////////////////////////////////////
// Medals setting setters

/** Set how long to show medals for in seconds
 *  @param {number} time
 *  @memberof Settings */
function setMedalDisplayTime(time) { medalDisplayTime = time; }

/** Set how quickly to slide on/off medals in seconds
 *  @param {number} time
 *  @memberof Settings */
function setMedalDisplaySlideTime(time) { medalDisplaySlideTime = time; }

/** Set size of medal display
 *  @param {Vector2} size
 *  @memberof Settings */
function setMedalDisplaySize(size) { medalDisplaySize = size.copy(); }

/** Set to stop medals from being unlockable
 *  @param {boolean} preventUnlock
 *  @memberof Settings */
function setMedalsPreventUnlock(preventUnlock) { medalsPreventUnlock = preventUnlock; }
