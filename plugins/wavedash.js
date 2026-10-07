/**
 * LittleJS Wavedash Plugin
 * - The Wavedash twin of the Newgrounds plugin: achievements and leaderboards, the same shape so a game can switch
 * - Wavedash serves the game's page and puts its SDK in window.Wavedash before the game runs, so nothing is bundled;
 *   off Wavedash (local, itch, GitHub Pages) there is none, and every call does nothing
 * - Make the plugin when the game can draw, at the end of gameInit: Wavedash.init is called then, and until it is
 *   Wavedash keeps its loading screen over the game
 * - WavedashMedal is a Medal with the identifier of its Wavedash achievement; on Wavedash an unlock is sent as that
 *   achievement and Wavedash shows its own toast in place of the engine's popup, off it the medal unlocks as any does
 * - Wavedash refuses an achievement until it has loaded the player's, a moment after launch, so refused and earlier
 *   unlocks are sent again every two seconds until it takes them; medals unlocked before, in the save, are sent too
 * - Leaderboards are made from code: give the plugin a table of them, each with how it sorts and shows its scores,
 *   and they are made at once, so each one exists from the first launch
 * - The SDK checks its arguments' types and throws on a wrong one, so every call passes real booleans and whole
 *   numbers and is caught; a game built with its own minifier keeps the SDK's names, see REFERENCE
 * @namespace Wavedash
 */

'use strict';

/** Global Wavedash plugin object
 *  @type {WavedashPlugin}
 *  @memberof Wavedash */
let wavedash;

// Engine internal variables not exposed to documentation
const wavedashRetryMS = 2e3; // how long to wait before sending refused achievements again
const wavedashRetries = 30;   // how many times one is sent before it is taken as never to be, about a minute
const wavedashTimeoutMS = 15e3; // how long a leaderboard call may take, as the Newgrounds plugin waits
const wavedashDisplayTypes = {number: 0, seconds: 1, milliseconds: 2, ticks: 3}; // the SDK's display types

// the SDK Wavedash put on the page, read at each call, undefined off Wavedash
const wavedashSDK = ()=> globalThis['Wavedash'];

// a call's answer, or undefined if it does not come in time or fails, with a warning; the time limit is let go of once
// the answer is in, so nothing waits on it after
function wavedashWait(name, answer)
{
    let timer;
    const limit = new Promise((resolve)=> timer = setTimeout(resolve, wavedashTimeoutMS));
    return Promise.race([Promise.resolve(answer), limit])
        .catch((error)=> { console.warn('Wavedash ' + name + ' failed: ' + error); })
        .finally(()=> clearTimeout(timer));
}

///////////////////////////////////////////////////////////////////////////////
/**
 * WavedashMedal: a medal that is also a Wavedash achievement, unlocked on Wavedash by its identifier
 * @extends Medal
 * @memberof Wavedash
 * @example
 * const medal_finish = new WavedashMedal(0, 'ACH_01_FINISH', 'Finish', 'Finish a level');
 * medal_finish.unlock(); // Wavedash's toast on Wavedash, the engine's popup anywhere else
 */
class WavedashMedal extends Medal
{
    /** Create a WavedashMedal and add it to the list of medals
     *  @param {number} id            - The unique identifier of the medal, as for any Medal
     *  @param {string} achievement   - The identifier of its Wavedash achievement, as made with the Wavedash CLI
     *  @param {string} name          - Name of the medal
     *  @param {string} [description] - Description of the medal
     *  @param {string} [icon]        - Icon for the medal
     *  @param {string} [src]         - Image location for the medal
     */
    constructor(id, achievement, name, description, icon, src)
    {
        ASSERT(typeof achievement === 'string' && achievement !== '', 'WavedashMedal: achievement must be the identifier of a Wavedash achievement', achievement);
        super(id, name, description, icon, src);

        /** @property {string} - The identifier of its Wavedash achievement */
        this.achievement = achievement;
    }

    /** Unlocks the medal if not already unlocked, saved as any medal is; on Wavedash its achievement is sent, until
     *  Wavedash takes it, and Wavedash shows its own toast in place of the engine's popup; one unlocked before the
     *  plugin is made is sent when it is
     *  @return {Promise<boolean>} - Whether the medal is unlocked */
    unlock()
    {
        // off Wavedash, or testing medals with debugMedals, the engine's own popup and nothing sent
        if (medalsPreventUnlock || this.unlocked || !wavedashSDK() || debugMedals)
            return super.unlock();
        this.unlocked = true;
        medalsSave();
        wavedash?.sendAchievements();
        return Promise.resolve(true);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Wavedash plugin: starts the Wavedash SDK, sends achievements and posts and reads leaderboards
 * @memberof Wavedash
 * @example
 * // at the end of gameInit, with the leaderboards the game posts to
 * new WavedashPlugin({LEVEL_1: {lowerWins: true, display: 'milliseconds'}, HIGH_SCORE: {}});
 * wavedash.postScore('LEVEL_1', timeMs);
 */
class WavedashPlugin
{
    /** Start the Wavedash SDK when the game is on Wavedash, and make its leaderboards
     *  @param {Object<string, {lowerWins?: boolean, display?: string}>} [leaderboards] - The game's leaderboards by
     *    name: lowerWins for times and golf, where a lower score is better, higher wins when left out; display how
     *    Wavedash shows a score, 'number', 'seconds', 'milliseconds' or 'ticks' (60 a second), 'number' when left out
     */
    constructor(leaderboards={})
    {
        ASSERT(!wavedash, 'WavedashPlugin already initialized');
        ASSERT(!!leaderboards && typeof leaderboards === 'object', 'WavedashPlugin: leaderboards is an object of them by name');
        wavedash = this;

        /** @property {Object<string, Promise<string|undefined>>} - Each leaderboard's id by its name, once Wavedash
         *  has made or found it, undefined when it could not
         *  @type {Object<string, Promise<string|undefined>>} */
        this.leaderboards = Object.create(null); // no inherited names, a board may be called constructor
        /** @type {Object<string, {lowerWins?: boolean, display?: string}>} */
        this.leaderboardSettings = leaderboards; // how each one sorts and shows its scores, read as its own entries
        /** @type {Set<string>} */
        this.achievementsSent = new Set; // the achievements Wavedash took this visit, or refused for good
        /** @type {Object<string, number>} */
        this.achievementTries = Object.create(null); // how many times each one not taken yet was sent
        /** @type {ReturnType<typeof setTimeout>|undefined} */
        this.achievementRetry = undefined; // the timer that sends refused ones again

        // Wavedash keeps its loading screen until init, which is called once
        wavedashWait('init', this.call('init'));
        for (const name in leaderboards)
            this.leaderboard(name);
        this.sendAchievements(); // the medals the save already has, unlocked before or off Wavedash
    }

    /** Whether the game is on Wavedash, its SDK on the page
     *  @return {boolean} */
    isActive() { return !!wavedashSDK(); }

    /** Call the SDK, undefined off Wavedash; a call that throws, as on an argument of the wrong type, says so in
     *  the console and gives undefined
     *  @param {string} name - The SDK function
     *  @param {...*} args
     *  @return {*}
     *  @ignore */
    call(name, ...args)
    {
        const sdk = wavedashSDK();
        if (!sdk) return;
        try { return sdk[name](...args); }
        catch (error) { console.warn('Wavedash ' + name + ' failed: ' + error); }
    }

    /** A leaderboard's id by its name, made on Wavedash the first time it is asked for, with the settings it was given
     *  @param {string} name
     *  @return {Promise<string|undefined>}
     *  @ignore */
    leaderboard(name)
    {
        ASSERT(typeof name === 'string' && name !== '', 'Wavedash: a leaderboard name must be a string', name);
        if (this.leaderboards[name]) return this.leaderboards[name];
        const settings = Object.prototype.hasOwnProperty.call(this.leaderboardSettings, name) ?
            this.leaderboardSettings[name] : undefined; // its own entry, not an inherited one
        const {lowerWins=false, display='number'} = settings || {};
        const known = wavedashDisplayTypes.hasOwnProperty(display);
        ASSERT(known, 'Wavedash: a leaderboard display is number, seconds, milliseconds or ticks', display);
        const made = this.call('getOrCreateLeaderboard', name, lowerWins ? 0 : 1, known ? wavedashDisplayTypes[display] : 0);
        const id = wavedashWait('leaderboard ' + name, made).then((result)=>
            result?.['success'] ? result['data']?.['id'] : undefined);
        // one that could not be made is asked for again next time
        id.then((value)=> value === undefined && this.leaderboards[name] === id && delete this.leaderboards[name]);
        return this.leaderboards[name] = id;
    }

    /** Post a score to a leaderboard, Wavedash keeping the player's best; off Wavedash it does nothing
     *  - A leaderboard not in the table given to the plugin is made the first time, higher wins and shown as a number
     *  @param {string} name - The leaderboard's name
     *  @param {number} score - A whole number, milliseconds for a time
     *  @return {Promise<boolean>} - Whether it was posted */
    async postScore(name, score)
    {
        ASSERT(isNumber(score), 'Wavedash postScore: score must be a number', score);
        if (!this.isActive()) return false;
        const id = await this.leaderboard(name);
        if (id === undefined) return false;
        const result = await wavedashWait('postScore', this.call('uploadLeaderboardScore', id, round(score), true));
        return !!result?.['success'];
    }

    /** Read a leaderboard's entries, undefined off Wavedash or when it could not be read
     *  @param {string} name - The leaderboard's name
     *  @param {number} [offset] - How many entries to skip over
     *  @param {number} [limit] - How many entries to read
     *  @param {boolean} [friendsOnly] - Only the player and their friends
     *  @return {Promise<Array<Object>|undefined>} - The entries, as Wavedash gives them */
    async getScores(name, offset=0, limit=10, friendsOnly=false)
    {
        if (!this.isActive()) return;
        const id = await this.leaderboard(name);
        if (id === undefined) return;
        const result = await wavedashWait('getScores',
            this.call('listLeaderboardEntries', id, offset|0, limit|0, !!friendsOnly));
        return result?.['success'] ? result['data'] : undefined;
    }

    /** Send every unlocked WavedashMedal's achievement Wavedash has not taken yet, again every two seconds while it
     *  refuses some, as it does until it has loaded the player's achievements; one refused for about a minute is
     *  taken as an identifier Wavedash does not have, said once in the console, and not sent again this visit
     *  @ignore */
    sendAchievements()
    {
        if (!this.isActive() || debugMedals) return;
        let refused = false;
        medalsForEach((medal)=>
        {
            const achievement = medal instanceof WavedashMedal && medal.unlocked && medal.achievement;
            if (!achievement || this.achievementsSent.has(achievement)) return;
            const result = this.call('setAchievement', achievement, true);
            if (result === true || result?.['success'] === true)
                this.achievementsSent.add(achievement);
            else if ((this.achievementTries[achievement] = (this.achievementTries[achievement] || 0) + 1) < wavedashRetries)
                refused = true;
            else
            {
                console.warn('Wavedash refused achievement ' + achievement + ' ' + wavedashRetries +
                    ' times; is it made, with that identifier?');
                this.achievementsSent.add(achievement); // not sent again this visit
            }
        });
        clearTimeout(this.achievementRetry);
        this.achievementRetry = refused ? setTimeout(()=> this.sendAchievements(), wavedashRetryMS) : undefined;
    }
}
