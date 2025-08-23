/** 
 * LittleJS Medal System
 * - Tracks and displays medals
 * - Saves medals to local storage
 * - Newgrounds integration
 * @namespace Medals
 */

'use strict';

/** List of all medals
 *  @type {Object}
 *  @memberof Medals */
const medals = {};

// Engine internal variables not exposed to documentation
let medalsDisplayQueue = [], medalsSaveName, medalsDisplayTimeLast;

///////////////////////////////////////////////////////////////////////////////

/** Initialize medals with a save name used for storage
 *  - Call this after creating all medals
 *  - Checks if medals are unlocked
 *  @param {String} saveName
 *  @memberof Medals */
function medalsInit(saveName)
{
    // check if medals are unlocked
    medalsSaveName = saveName;
    if (!debugMedals)
        medalsForEach(medal=> medal.unlocked = !!localStorage[medal.storageKey()]);

    // engine automatically renders medals
    engineAddPlugin(undefined, medalsRender);
    function medalsRender()
    {
        if (!medalsDisplayQueue.length)
            return;
        
        // update first medal in queue
        const medal = medalsDisplayQueue[0];
        const time = timeReal - medalsDisplayTimeLast;
        if (!medalsDisplayTimeLast)
            medalsDisplayTimeLast = timeReal;
        else if (time > medalDisplayTime)
        {
            medalsDisplayTimeLast = 0;
            medalsDisplayQueue.shift();
        }
        else
        {
            // slide on/off medals
            const slideOffTime = medalDisplayTime - medalDisplaySlideTime;
            const hidePercent = 
                time < medalDisplaySlideTime ? 1 - time / medalDisplaySlideTime :
                time > slideOffTime ? (time - slideOffTime) / medalDisplaySlideTime : 0;
            medal.render(hidePercent);
        }
    }
}

/** Calls a function for each medal
 *  @param {Function} callback
 *  @memberof Medals */
function medalsForEach(callback)
{ Object.values(medals).forEach(medal=>callback(medal)); }

///////////////////////////////////////////////////////////////////////////////

/** 
 * Medal - Tracks an unlockable medal 
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
    /** Create a medal object and adds it to the list of medals
     *  @param {Number} id            - The unique identifier of the medal
     *  @param {String} name          - Name of the medal
     *  @param {String} [description] - Description of the medal
     *  @param {String} [icon]        - Icon for the medal
     *  @param {String} [src]         - Image location for the medal
     */
    constructor(id, name, description='', icon='🏆', src)
    {
        ASSERT(id >= 0 && !medals[id]);
        
        /** @property {Number} - The unique identifier of the medal */
        this.id = id;
        
        /** @property {String} - Name of the medal */
        this.name = name;
        
        /** @property {String} - Description of the medal */
        this.description = description;
        
        /** @property {String} - Icon for the medal */
        this.icon = icon;
        
        /** @property {boolean} - Is the medal unlocked? */
        this.unlocked = false;

        // load the source image if provided
        if (src)
            (this.image = new Image).src = src;

        // add this to list of medals
        medals[id] = this;
    }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked)
            return;

        // save the medal
        ASSERT(medalsSaveName, 'save name must be set');
        localStorage[this.storageKey()] = this.unlocked = true;
        medalsDisplayQueue.push(this);
    }

    /** Render a medal
     *  @param {Number} [hidePercent] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = overlayContext;
        const width = min(medalDisplaySize.x, mainCanvas.width);
        const height = medalDisplaySize.y;
        const x = overlayCanvas.width - width;
        const y = -height*hidePercent;

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = new Color(.9,.9,.9).toString();
        context.strokeStyle = new Color(0,0,0).toString();
        context.lineWidth = 3;
        context.rect(x, y, width, height);
        context.fill();
        context.stroke();
        context.clip();

        // draw the icon
        const gap = vec2(.1, .05).scale(height);
        const medalDisplayIconSize = height - 2*gap.x;
        this.renderIcon(vec2(x + gap.x + medalDisplayIconSize/2, y + height/2), medalDisplayIconSize);

        // draw the name
        const nameSize = height*.5;
        const descriptionSize = height*.3;
        const pos = vec2(x + medalDisplayIconSize + 2*gap.x, y + gap.y*2 + nameSize/2);
        const textWidth = width - medalDisplayIconSize - 3*gap.x;
        drawTextScreen(this.name, pos, nameSize, new Color(0,0,0), 0, undefined, 'left', undefined, textWidth);

        // draw the description
        pos.y = y + height - gap.y*2 - descriptionSize/2;
        drawTextScreen(this.description, pos, descriptionSize, new Color(0,0,0), 0, undefined, 'left', undefined, textWidth);
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Vector2} pos - Screen space position
     *  @param {Number} size - Screen space size
     */
    renderIcon(pos, size)
    {
        // draw the image or icon
        if (this.image)
            overlayContext.drawImage(this.image, pos.x-size/2, pos.y-size/2, size, size);
        else
            drawTextScreen(this.icon, pos, size*.7, new Color(0,0,0));
    }
 
    // Get local storage key used by the medal
    storageKey() { return medalsSaveName + '_' + this.id; }
}