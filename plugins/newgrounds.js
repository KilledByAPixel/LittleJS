/** 
 * LittleJS Newgrounds API
 * - NewgroundsMedal extends Medal with Newgrounds API functionality
 * - Call newgroundsInit to enable Newgrounds functionality
 * - Uses CryptoJS for encryption if optional cipher is provided
 * - Keeps connection alive and logs views
 * - Functions to interact with scoreboards
 * - Functions to unlock medals
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Newgrounds medal auto unlocks in newgronds API */
class NewgroundsMedal extends Medal
{
    /** Create a medal object and adds it to the list of medals */
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
 
/** Global Newgrounds object */
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
 * const app_id = '52123:1ZuSTQ7l';
 * newgrounds = new Newgrounds(app_id);
 */
class Newgrounds
{
    /** Create a newgrounds object
     *  @param {String} app_id   - The newgrounds App ID
     *  @param {String} [cipher] - The encryption Key (AES-128/Base64)
     *  @param {Object} [cryptoJS] - An instance of CryptoJS, if there is a cipher */
    constructor(app_id, cipher, cryptoJS)
    {
        ASSERT(!newgrounds, 'there can only be one newgrounds object');
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

                if (medal.value) // add value to description
                    medal.description = medal.description + ` (${ medal.value })`;
            }
        }
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);

        // keep the session alive with a ping every 5 minutes
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