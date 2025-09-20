/** 
 * LittleJS Newgrounds API
 * - NewgroundsMedal extends Medal with Newgrounds API functionality
 * - Call newgroundsInit to enable Newgrounds functionality
 * - Uses CryptoJS for encryption if optional cipher is provided
 * - Keeps connection alive and logs views
 * - Functions to interact with scoreboards
 * - Functions to unlock medals
 * @namespace Plugins
 */

'use strict';

/** Global Newgrounds object
 *  @type {NewgroundsPlugin}
 *  @memberof Medal */
let newgrounds;

///////////////////////////////////////////////////////////////////////////////
/**
 * Newgrounds medal auto unlocks in newgrounds API
 * @extends Medal
 */
class NewgroundsMedal extends Medal
{
    /** Create a newgrounds medal object and adds it to the list of medals
     *  @param {Number} id            - The unique identifier of the medal
     *  @param {String} name          - Name of the medal
     *  @param {String} [description] - Description of the medal
     *  @param {String} [icon]        - Icon for the medal
     *  @param {String} [src]         - Image location for the medal
     */
    constructor(id, name, description, icon, src)
    { super(id, name, description, icon, src); }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        super.unlock();
        newgrounds && newgrounds.unlockMedal(this.id);
    }
}

///////////////////////////////////////////////////////////////////////////////
/** 
 * Newgrounds API object
 */
class NewgroundsPlugin
{
    /** Create the global newgrounds object
     *  @param {string} app_id     - The newgrounds App ID
     *  @param {string} [cipher]   - The encryption Key (AES-128/Base64)
     *  @param {Object} [cryptoJS] - An instance of CryptoJS, if there is a cipher 
     *  @example
     *  // create the newgrounds object, replace the app id with your own
     *  const app_id = 'your_app_id_here';
     *  new NewgroundsPlugin(app_id);
     */
    constructor(app_id, cipher, cryptoJS)
    {
        ASSERT(!newgrounds, 'there can only be one newgrounds object');
        ASSERT(!cipher || cryptoJS, 'must provide cryptojs if there is a cipher');

        newgrounds = this; // set global newgrounds object
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

                if (medal.value) // add value to description
                    medal.description = medal.description + ` (${ medal.value })`;
            }
        }
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);

        // keep the session alive with a ping every minute
        const keepAliveMS = 60 * 1e3;
        setInterval(()=>this.call('Gateway.ping', 0, true), keepAliveMS);
    }

    /** Send message to unlock a medal by id
     * @param {number} id - The medal id */
    unlockMedal(id) { return this.call('Medal.unlock', {'id':id}, true); }

    /** Send message to post score
     * @param {number} id    - The scoreboard id
     * @param {number} value - The score value */
    postScore(id, value) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}, true); }

    /** Get scores from a scoreboard
     * @param {number} id       - The scoreboard id
     * @param {string} [user]   - A user's id or name
     * @param {number} [social] - If true, only social scores will be loaded
     * @param {number} [skip]   - Number of scores to skip before start
     * @param {number} [limit]  - Number of scores to include in the list
     * @return {Object}         - The response JSON object
     */
    getScores(id, user, social=0, skip=0, limit=10)
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send message to log a view */
    logView() { return this.call('App.logView', {'host':this.host}, true); }

    /** Send a message to call a component of the Newgrounds API
     * @param {string}  component    - Name of the component
     * @param {Object}  [parameters] - Parameters to use for call
     * @param {boolean} [async]      - If true, don't wait for response before continuing
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
        try { xmlHttp.send(formData); }
        catch(e)
        {
            debugMedals && console.log('newgrounds call failed', e);
            return;
        }
        debugMedals && console.log(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    }
}
