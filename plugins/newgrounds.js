/**
 * LittleJS Newgrounds Plugin
 * - NewgroundsMedal extends Medal with Newgrounds API functionality
 * - When logged in, Newgrounds holds the player's medals: they unlock once the server confirms and the local save is left alone
 * - Call new NewgroundsPlugin(app_id) to setup Newgrounds
 * - Encrypts calls with the browser's own WebCrypto when the app has a cipher, no library needed
 * - provides functions to interact with medals scoreboards
 * - Keeps connection alive and logs views
 * - Every call is a fetch, so the functions return promises; await newgrounds.ready for the medals and scoreboards
 * @namespace Newgrounds
 */

'use strict';

/** Global Newgrounds object
 *  @type {NewgroundsPlugin}
 *  @memberof Newgrounds */
let newgrounds;

///////////////////////////////////////////////////////////////////////////////
/**
 * Newgrounds medal auto unlocks in newgrounds API
 * @extends Medal
 * @memberof Newgrounds
 */
class NewgroundsMedal extends Medal
{
    /** Create a newgrounds medal object and adds it to the list of medals
     *  @param {number} id            - The unique identifier of the medal
     *  @param {string} name          - Name of the medal
     *  @param {string} [description] - Description of the medal
     *  @param {string} [icon]        - Icon for the medal
     *  @param {string} [src]         - Image location for the medal
     */
    constructor(id, name, description, icon, src)
    { super(id, name, description, icon, src); }

    /** Unlocks a medal if not already unlocked, once newgrounds confirms it when logged in
     *  - The promise is optional, for when a game wants to know the outcome
     *  @return {Promise<boolean>} - Whether the medal is unlocked, once the server has answered when logged in */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked || !newgrounds || !newgrounds.session_id)
            return super.unlock(); // logged out, the local save holds the medal

        // logged in, newgrounds holds the medal: it unlocks once the server confirms, one request at a time
        const pending = newgrounds.pendingUnlocks;
        if (pending.has(this))
            return pending.get(this);
        const request = newgrounds.unlockMedal(this.id).then(response=>
        {
            if (!response?.result?.data?.medal?.unlocked)
            {
                // still pending, the keep alive ping resends it
                debugMedals && LOG('newgrounds did not unlock medal', this.id, response?.result?.error || response?.error);
                return false;
            }
            pending.delete(this);
            return super.unlock();
        });
        pending.set(this, request);
        return request;
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Newgrounds API object
 * @memberof Newgrounds
 */
class NewgroundsPlugin
{
    /** Create the global newgrounds object
     *  @param {string} app_id   - The newgrounds App ID
     *  @param {string} [cipher] - The encryption key from the app's settings, AES-128 as Base64; calls are encrypted with
     *    the browser's WebCrypto, which needs a secure page, https or localhost
     *  @example
     *  // create the newgrounds object, replace the app id with your own
     *  const app_id = 'your_app_id_here';
     *  new NewgroundsPlugin(app_id);
     */
    constructor(app_id, cipher)
    {
        ASSERT(!newgrounds, 'there can only be one newgrounds object');
        ASSERT(!cipher || typeof crypto != 'undefined' && crypto.subtle, 'a cipher needs WebCrypto, which the browser only has on a secure page');

        newgrounds = this; // set global newgrounds object
        /** @property {string} - The newgrounds App ID */
        this.app_id = app_id;
        /** @property {string|undefined} - AES-128/Base64 encryption key, if any */
        this.cipher = cipher;
        this.cryptoKey = undefined; // the cipher imported for WebCrypto, on the first encrypted call
        const hasLocation = typeof location != 'undefined';
        /** @property {string} - Hostname used when logging views */
        this.host = hasLocation ? location.hostname : '';
        /** @property {Array} - Medals fetched from Newgrounds, empty until ready */
        this.medals = [];
        /** @property {Array} - Scoreboards fetched from Newgrounds, empty until ready */
        this.scoreboards = [];

        /** @property {Map<NewgroundsMedal, Promise<boolean>>} - Medals sent to unlock that the server has not confirmed yet, resent on the keep alive ping, each with the promise of its request
         *  @type {Map<NewgroundsMedal, Promise<boolean>>} */
        this.pendingUnlocks = new Map;

        // get session id from url search params
        /** @property {string|null} - Newgrounds session id from the URL (null when not logged in) */
        this.session_id = hasLocation ? new URL(location.href).searchParams.get('ngio_session_id') : null;
        if (this.session_id)
        {
            // newgrounds holds this player's medals, the local save is only for logged out play
            medalsPreventSave = true;
            medalsForEach(medal=> medal.unlocked = false); // locked until the server says otherwise
        }

        /** @property {Promise<NewgroundsPlugin>} - Resolves once the medals and scoreboards have been fetched, or right away when not logged in */
        this.ready = this.session_id ? this.init() : Promise.resolve(this); // only use newgrounds when logged in
    }

    // keep the session alive, then fetch the medals and scoreboards
    async init()
    {
        // ping every minute, and resend the unlocks the server has not confirmed
        const keepAliveMS = 60 * 1e3;
        setInterval(()=>
        {
            this.call('Gateway.ping', 0);
            if (medalsPreventUnlock) return; // they stay pending until unlocks are allowed again
            const pending = [...this.pendingUnlocks.keys()];
            this.pendingUnlocks.clear();
            for (const medal of pending)
                medal.unlock();
        }, keepAliveMS);

        const medalsResult = await this.call('Medal.getList');

        // bail early if the first call failed (offline / bad session / server error)
        if (!medalsResult || !medalsResult.result || medalsResult.result.error)
        {
            debugMedals && LOG('Newgrounds session unavailable; skipping plugin init');
            return this;
        }

        this.medals = medalsResult.result.data?.['medals'] || [];
        debugMedals && LOG(this.medals);
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
                medal.unlocked =    medal.unlocked || !!newgroundsMedal['unlocked']; // an unlock may have landed first
                medal.difficulty =  newgroundsMedal['difficulty'];
                medal.value =       newgroundsMedal['value'];

                if (medal.value) // add value to description
                    medal.description = medal.description + ` (${ medal.value })`;
            }
        }

        const scoreboardResult = await this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult?.result?.data?.scoreboards || [];
        debugMedals && LOG(this.scoreboards);
        return this;
    }

    /** Send message to unlock a medal by id, the medal itself waits for the response
     * @param {number} id - The medal id
     * @return {Promise<Object>} - The response JSON object, undefined when the call failed */
    unlockMedal(id) { return this.call('Medal.unlock', {'id':id}); }

    /** Send message to post score
     * @param {number} id    - The scoreboard id
     * @param {number} value - The score value
     * @return {Promise<Object>} - The response JSON object */
    postScore(id, value) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}); }

    /** Get scores from a scoreboard
     * @param {number} id       - The scoreboard id
     * @param {string} [user]   - A user's id or name
     * @param {number} [social] - If true, only social scores will be loaded
     * @param {number} [skip]   - Number of scores to skip over
     * @param {number} [limit]  - Number of scores to include in the list
     * @return {Promise<Object>} - The response JSON object
     */
    getScores(id, user, social=0, skip=0, limit=10)
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send message to log a view
     * @return {Promise<Object>} - The response JSON object */
    logView() { return this.call('App.logView', {'host':this.host}); }

    /** Encrypt text the way the Newgrounds gateway expects, AES-128 CBC with a random iv in front, as Base64
     * @param {string} text
     * @return {Promise<string>} */
    async encrypt(text)
    {
        if (!this.cryptoKey)
        {
            const keyBytes = Uint8Array.from(atob(this.cipher), c=> c.charCodeAt(0));
            this.cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
        }
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const encrypted = new Uint8Array(await crypto.subtle.encrypt({'name':'AES-CBC', iv}, this.cryptoKey, new TextEncoder().encode(text)));
        const bytes = new Uint8Array(iv.length + encrypted.length);
        bytes.set(iv);
        bytes.set(encrypted, iv.length);
        let binary = '';
        for (const b of bytes)
            binary += String.fromCharCode(b);
        return btoa(binary);
    }

    /** Send a message to call a component of the Newgrounds API
     * @param {string}  component    - Name of the component
     * @param {Object}  [parameters] - Parameters to use for call
     * @return {Promise<Object>}     - The response JSON object, undefined when the call failed
     */
    async call(component, parameters)
    {
        const call = {'component':component, 'parameters':parameters};
        if (this.cipher)
        {
            // the whole call goes encrypted in its place
            call['secure'] = await this.encrypt(JSON.stringify(call));
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
        const url = 'https://newgrounds.io/gateway_v3.php';
        try
        {
            const response = await fetch(url, {'method':'POST', 'body':formData});
            const text = await response.text();
            debugMedals && LOG(text);
            return text && JSON.parse(text);
        }
        catch(e) { debugMedals && LOG('newgrounds call failed', e); }
    }
}
