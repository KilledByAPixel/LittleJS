/** 
 * LittleJS Medal System
 * - Tracks and displays medals
 * - Saves medals to local storage
 * - Newgrounds integration
 * @namespace Medals
 */

'use strict';

/** List of all medals
 *  @type {Array}
 *  @memberof Medals */
const medals = [];

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
    debugMedals || medals.forEach(medal=> medal.unlocked = (localStorage[medal.storageKey()] | 0));
}

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

        // save attributes and add to list of medals
        medals[this.id = id] = this;
        this.name = name;
        this.description = description;
        this.icon = icon;
        if (src)
            (this.image = new Image).src = src;
    }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked)
            return;

        // save the medal
        ASSERT(medalsSaveName, 'save name must be set');
        localStorage[this.storageKey()] = this.unlocked = 1;
        medalsDisplayQueue.push(this);
        newgrounds && newgrounds.unlockMedal(this.id);
    }

    /** Render a medal
     *  @param {Number} [hidePercent] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = overlayContext;
        const width = min(medalDisplaySize.x, mainCanvas.width);
        const x = overlayCanvas.width - width;
        const y = -medalDisplaySize.y*hidePercent;

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = new Color(.9,.9,.9).toString();
        context.strokeStyle = new Color(0,0,0).toString();
        context.lineWidth = 3;
        context.rect(x, y, width, medalDisplaySize.y);
        context.fill();
        context.stroke();
        context.clip();

        // draw the icon and text
        this.renderIcon(vec2(x+15+medalDisplayIconSize/2, y+medalDisplaySize.y/2));
        const pos = vec2(x+medalDisplayIconSize+30, y+28);
        drawTextScreen(this.name, pos, 38, new Color(0,0,0), 0, undefined, 'left');
        pos.y += 32;
        drawTextScreen(this.description, pos, 24, new Color(0,0,0), 0, undefined, 'left');
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Vector2} pos - Screen space position
     *  @param {Number} [size=medalDisplayIconSize] - Screen space size
     */
    renderIcon(pos, size=medalDisplayIconSize)
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

// engine automatically renders medals
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

///////////////////////////////////////////////////////////////////////////////

// global Newgrounds object
let newgrounds;

/** This can used to enable Newgrounds functionality
 *  @param {Number} app_id   - The newgrounds App ID
 *  @param {String} [cipher] - The encryption Key (AES-128/Base64)
 *  @param {Object} [cryptoJS] - An instance of CryptoJS, if there is a cipher
 *  @memberof Medals */
function newgroundsInit(app_id, cipher, cryptoJS)
{ newgrounds = new Newgrounds(app_id, cipher, cryptoJS); }

/** 
 * Newgrounds API wrapper object
 * @example
 * // create a newgrounds object, replace the app id with your own
 * const app_id = '53123:1ZuSTQ9l';
 * newgrounds = new Newgrounds(app_id);
 */
class Newgrounds
{
    /** Create a newgrounds object
     *  @param {Number} app_id   - The newgrounds App ID
     *  @param {String} [cipher] - The encryption Key (AES-128/Base64)
     *  @param {Object} [cryptoJS] - An instance of CryptoJS, if there is a cipher */
    constructor(app_id, cipher, cryptoJS)
    {
        ASSERT(!newgrounds && app_id>0, 'there can only be one newgrounds object');
        ASSERT(!cipher || cryptoJS, 'must provide cryptojs if there is a cipher');

        this.app_id = app_id;
        this.cipher = cipher;
        this.cryptoJS = cryptoJS;
        this.host = location ? location.hostname : '';

        // get session id from url search params
        const url = new URL(location.href);
        this.session_id = url.searchParams.get('ngio_session_id');

        if (!this.session_id)
            return; // only use newgrounds when logged in

        // get medals
        const medalsResult = this.call('Medal.getList');
        this.medals = medalsResult ? medalsResult.result.data['medals'] : [];
        debugMedals && console.log(this.medals);
        for (const newgroundsMedal of this.medals)
        {
            const medal = medals[newgroundsMedal['id']];
            if (medal)
            {
                // copy newgrounds medal data
                medal.image =       new Image;
                medal.image.src =   newgroundsMedal['icon'];
                medal.name =        newgroundsMedal['name'];
                medal.description = newgroundsMedal['description'];
                medal.unlocked =    newgroundsMedal['unlocked'];
                medal.difficulty =  newgroundsMedal['difficulty'];
                medal.value =       newgroundsMedal['value'];

                if (medal.value)
                    medal.description = medal.description + ' (' + medal.value + ')';
            }
        }
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);

        const keepAliveMS = 5 * 60 * 1e3;
        setInterval(()=>this.call('Gateway.ping', 0, true), keepAliveMS);
    }

    /** Send message to unlock a medal by id
     * @param {Number} id - The medal id */
    unlockMedal(id) { return this.call('Medal.unlock', {'id':id}, true); }

    /** Send message to post score
     * @param {Number} id    - The scoreboard id
     * @param {Number} value - The score value */
    postScore(id, value) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}, true); }

    /** Get scores from a scoreboard
     * @param {Number} id       - The scoreboard id
     * @param {String} [user]   - A user's id or name
     * @param {Number} [social] - If true, only social scores will be loaded
     * @param {Number} [skip]   - Number of scores to skip before start
     * @param {Number} [limit]  - Number of scores to include in the list
     * @return {Object}         - The response JSON object
     */
    getScores(id, user, social=0, skip=0, limit=10)
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send message to log a view */
    logView() { return this.call('App.logView', {'host':this.host}, true); }

    /** Send a message to call a component of the Newgrounds API
     * @param {String}  component    - Name of the component
     * @param {Object}  [parameters] - Parameters to use for call
     * @param {Boolean} [async]      - If true, don't wait for response before continuing
     * @return {Object}              - The response JSON object
     */
    call(component, parameters, async=false)
    {
        const call = {'component':component, 'parameters':parameters};
        if (this.cipher)
        {
            // encrypt using AES-128 Base64 with cryptoJS
            const cryptoJS = this.cryptoJS;
            const aesKey = cryptoJS['enc']['Base64']['parse'](this.cipher);
            const iv = cryptoJS['lib']['WordArray']['random'](16);
            const encrypted = cryptoJS['AES']['encrypt'](JSON.stringify(call), aesKey, {'iv':iv});
            call['secure'] = cryptoJS['enc']['Base64']['stringify'](iv.concat(encrypted['ciphertext']));
            call['parameters'] = 0;
        }

        // build the input object
        const input =
        {
            'app_id':     this.app_id,
            'session_id': this.session_id,
            'call':       call
        };

        // build post data
        const formData = new FormData();
        formData.append('input', JSON.stringify(input));
        
        // send post data
        const xmlHttp = new XMLHttpRequest();
        const url = 'https://newgrounds.io/gateway_v3.php';
        xmlHttp.open('POST', url, !debugMedals && async);
        xmlHttp.send(formData);
        debugMedals && console.log(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    }
}