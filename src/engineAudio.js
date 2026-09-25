/**
 * LittleJS Audio System
 * - Play audio files (mp3, ogg, wave) and generate sounds with ZzFX
 * - ZzFX sound generator integration: <a href=https://killedbyapixel.github.io/ZzFX/>ZzFX</a>
 * - Sound caching for fast playback and memory efficiency
 * - Volume control with attenuation and stereo panning
 * - 2D spatial audio based on camera position with distance-based falloff
 * - Sound instance management (pause, resume, stop)
 * - Speech synthesis for text-to-speech
 * - Music playback with ZzFXM support
 * - Web Audio API integration with master gain control
 * - Sounds and the master bus can route through effects, see the audio effects plugin
 * @namespace Audio
 */

'use strict';

/** Audio context used by the engine, undefined outside a browser, where the engine runs headless
 *  @type {AudioContext}
 *  @memberof Audio */
let audioContext = typeof AudioContext == 'undefined' ? undefined : new AudioContext;

/** Master gain node for all audio to pass through, made at load so effects can connect to it any time
 *  @type {GainNode}
 *  @memberof Audio */
let audioMasterGain = audioContext?.createGain();
if (audioMasterGain)
{
    audioMasterGain.connect(audioContext.destination);
    audioMasterGain.gain.value = soundVolume; // set starting value
    audioContext.addEventListener?.('statechange', audioStateChange);
}

// the current master effect, kept so setAudioMasterEffect can undo the route it made,
// and whether its output came from an effect, which gets its default route back
let audioMasterEffectInput, audioMasterEffectOutput, audioMasterEffectOutputIsEffect;

/** Default sample rate used for sounds
 *  @default 44100
 *  @memberof Audio */
const audioDefaultSampleRate = 44100;

/** Check if the audio context is running and available for playback
 *  @return {boolean} - True if the audio context is running, false when there is none
 *  @memberof Audio */
function audioIsRunning()
{ return audioContext?.state === 'running'; }

function audioInit()
{
    if (!soundEnable || headlessMode) return;

    document.addEventListener('visibilitychange', audioVisibilityChange);
}

// a hidden page stops the game, so its sound stops too, and the audio clock with it so every sound picks up
// exactly where it was; only a suspend made here is undone, not one the browser holds until the first input
let audioSuspendedWhenHidden = false;
function audioVisibilityChange()
{
    if (document.hidden)
    {
        if (!soundPauseWhenHidden || audioContext.state != 'running') return;
        audioSuspendedWhenHidden = true;
        audioContext.suspend();
    }
    else if (audioSuspendedWhenHidden)
    {
        audioSuspendedWhenHidden = false;
        audioContext.resume();
    }
}

// sound instances whose start failed only because the context was not running, like music started in gameInit
// before the first input, each with the time it tried; they start once the context runs unless paused or stopped
// first, and a one shot drops out once it would have ended anyway, so a backlog of sounds can't all play at once
const audioWaitingInstances = new Map;
function audioWaitingPrune(now=performance.now())
{
    for (const [instance, startTime] of audioWaitingInstances)
    {
        const remaining = (instance.getDuration() - instance.pausedTime) / instance.rate;
        if (!instance.loop && now - startTime > remaining * 1e3)
            audioWaitingInstances.delete(instance);
    }
}
function audioStateChange()
{
    if (!audioIsRunning()) return;
    audioWaitingPrune();
    const instances = [...audioWaitingInstances.keys()];
    audioWaitingInstances.clear();
    for (const instance of instances)
        instance.resume();
}

/** Anything with input and output audio nodes, like an effect from the audio effects plugin
 *  @typedef {{input: AudioNode, output: AudioNode}} AudioEffectNodes
 *  @memberof Audio */

/** Route all sound through an effect between the master gain and the speakers
 *  - Pass a node or an effect, or the first and last of a chain, each a node or an effect
 *  - With one argument a node is both ends, and an effect uses its own input and output
 *  - The output node is disconnected from everything else first, so it only feeds the speakers
 *  - The two ends of a chain must already be connected to each other, like effectA.connect(effectB)
 *  - Call with no arguments to remove the effect, an effect that was the master goes back to feeding the master gain
 *  - Debug video capture records the end of the master chain, but loses its tap if the effect changes mid-capture
 *  @param {AudioNode|AudioEffectNodes} [input] - Node or effect the master gain connects to
 *  @param {AudioNode|AudioEffectNodes} [output] - Node or effect that connects to the audio destination, defaults to the input's output
 *  @memberof Audio */
function setAudioMasterEffect(input, output)
{
    // an effect stands in for its nodes, and a node is both ends when no output is passed
    // (the output resolves first since its default comes from the input effect)
    const outputArg = output || input;
    const outputIsEffect = !!outputArg && 'input' in outputArg;
    output = audioEffectNode(output, 'output') || audioEffectNode(input, 'output');
    input = audioEffectNode(input, 'input');
    ASSERT(!input || typeof input.connect === 'function', 'input must be an AudioNode or an effect with input and output nodes');
    ASSERT(!output || typeof output.connect === 'function', 'output must be an AudioNode or an effect with input and output nodes');
    if (!audioMasterGain) return; // no audio outside a browser, where the engine runs headless

    // undo the current route selectively so other taps survive; an effect's output that still feeds the speakers
    // goes back to the master gain, its default, so it still works for sounds, but one that connect() already moved
    // on, like the head of a longer chain being set now, stays where it was sent
    audioMasterGain.disconnect(audioMasterEffectInput || audioContext.destination);
    if (audioMasterEffectOutput)
    {
        let fedSpeakers = true;
        try { audioMasterEffectOutput.disconnect(audioContext.destination); }
        catch { fedSpeakers = false; }
        if (audioMasterEffectOutputIsEffect && fedSpeakers)
            audioMasterEffectOutput.connect(audioMasterGain);
    }
    audioMasterEffectInput = input;
    audioMasterEffectOutput = output;
    audioMasterEffectOutputIsEffect = outputIsEffect;

    // connect the master gain to the speakers, through the effect if there is one
    if (input)
    {
        audioMasterGain.connect(input);
        output.disconnect();
        output.connect(audioContext.destination);
    }
    else
        audioMasterGain.connect(audioContext.destination);
}

// get one of an effect's nodes, or the thing itself when it is already a node
/** @param {AudioNode|AudioEffectNodes|undefined} effectOrNode
 *  @param {'input'|'output'} key
 *  @return {AudioNode} */
function audioEffectNode(effectOrNode, key)
{
    if (effectOrNode && 'input' in effectOrNode)
        return /** @type {AudioEffectNodes} */ (effectOrNode)[key];
    return /** @type {AudioNode} */ (effectOrNode);
}

///////////////////////////////////////////////////////////////////////////////

/**
 * @callback SoundLoadCallback - Function called when sound is loaded
 * @param {Sound} sound
 * @memberof Audio
 */

/**
 * Sound Object - Stores a sound for later
 * - this can be used to load and play wave, mp3, and ogg files
 * - it can also create sounds using the ZzFX sound generator
 * - can attenuate and apply stereo panning to sounds
 * - sound instance control with pause/resume capability
 *
 * <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 * @memberof Audio
 * @example
 * // load an audio asset file
 * const sound_example = new Sound('sound.mp3');
 *
 * // create a zzfx sound
 * const sound_example = new Sound([.5,.5]);
 *
 * // play a sound
 * sound_example.play();
 */
class Sound
{
    /** Create a sound object and cache the audio for later use
     *  @param {string|Array} [asset] - Filename of audio file or zzfx array
     *  @param {number} [randomness] - How much to randomize frequency each time sound plays, for zzfx sounds it overrides the array's own randomness, which is used if undefined
     *  @param {number} [range=soundDefaultRange] - World space max range of sound
     *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     *  @param {SoundLoadCallback} [onloadCallback] - callback function to call when sound is loaded
     */
    constructor(asset, randomness, range=soundDefaultRange, taper=soundDefaultTaper, onloadCallback)
    {
        if (!soundEnable || headlessMode) return;

        ASSERT(!asset || isArray(asset) || isStringLike(asset), 'asset must be a file name or zzfx array');
        ASSERT(randomness === undefined || isNumber(randomness), 'randomness must be a number');
        ASSERT(randomness === undefined || randomness >= 0 && randomness <=1, 'randomness must be between 0 and 1');
        ASSERT(isNumber(range), 'range must be a number');
        ASSERT(isNumber(taper), 'taper must be a number');

        /** @property {number} - World space max range of sound */
        this.range = range;
        /** @property {number} - At what percentage of range should it start tapering */
        this.taper = taper;
        /** @property {number} - How much to randomize frequency each time sound plays
         *  @type {number} */
        this.randomness = randomness ?? 0;
        /** @property {number} - Sample rate for this sound */
        this.sampleRate = audioDefaultSampleRate;
        /** @property {number} - How many samples per channel this sound has */
        this.sampleLength = 0;
        /** @property {AudioBuffer} - Decoded audio shared by every play of this sound
         *  @type {AudioBuffer} */
        this.sampleBuffer = undefined;
        /** @ignore internal, the 3D plugin reads it to know the sound has loaded
         *  @type {Array<Array<number>|Float32Array>|undefined} */
        this._sampleChannels = undefined;
        /** @property {number} - Percentage of this sound currently loaded, sounds
         *  fetched from a url stay at 0 until decoding completes */
        this.loadedPercent = 0;
        /** @property {SoundLoadCallback|undefined} - function to call when sound is loaded
         *  @type {SoundLoadCallback|undefined} */
        this.onloadCallback = onloadCallback;
        /** @property {AudioNode|AudioEffectNodes} - Node or effect to route every play of this sound through instead of the master gain
         *  - Where this sound's audio goes, unlike AudioEffect.output which is an effect's own node, effects chain with connect()
         *  @type {AudioNode|AudioEffectNodes} */
        this.output = undefined;

        if (isArray(asset))
        {
            // generate zzfx sound — copy so we don't mutate the caller's array
            const zzfxSound = asset.slice();

            // remove randomness so it can be applied on playback, a value passed in wins over the array's
            const randomnessIndex = 1;
            this.randomness = randomness ?? zzfxSound[randomnessIndex] ?? .05;
            zzfxSound[randomnessIndex] = 0;

            // generate the zzfx samples, then hand them to an audio buffer so
            // the plain arrays can be released and every play shares the buffer
            this.sampleChannels = [zzfxG(...zzfxSound)];
            this.buildSampleBuffer();
            this.loadedPercent = 1;
            onloadCallback?.(this);
        }
        else if (asset)
        {
            // load the audio file, a URL object as bundlers give works like its string;
            // report failures rather than leaving an unhandled rejection, the sound just stays unloaded and silent
            const filename = asset + '';
            this.loadSound(filename).catch(e=>
                LOG('Sound load failed for', filename, '-', e.message));
        }
    }

    /** Sample data for each channel
     *  Sounds keep their samples in an audio buffer, so reading this rebuilds
     *  the arrays from it and caches them. The copies are safe to hold onto,
     *  playing a sound detaches the buffer's own channel arrays.
     *  @type {Array<Array<number>|Float32Array>} */
    get sampleChannels()
    {
        const buffer = this.sampleBuffer;
        if (!this._sampleChannels && buffer)
        {
            const channels = [];
            for (let i = 0; i < buffer.numberOfChannels; i++)
                channels.push(buffer.getChannelData(i).slice());
            this._sampleChannels = channels;
        }
        return this._sampleChannels;
    }

    /** @param {Array<Array<number>|Float32Array>} sampleChannels */
    set sampleChannels(sampleChannels)
    {
        // new samples invalidate the buffer built from the old ones
        this._sampleChannels = sampleChannels;
        this.sampleBuffer = undefined;
        this.sampleLength = sampleChannels?.[0]?.length || 0;
    }

    /** Move this sound's samples into an audio buffer that every play can share
     *  Does nothing if there is already a buffer or no samples to build one from */
    buildSampleBuffer()
    {
        if (this.sampleBuffer || !this._sampleChannels || headlessMode) return;

        this.sampleBuffer = createAudioBuffer(this._sampleChannels, this.sampleRate);

        // the buffer owns the samples now, release the arrays we built it from
        this._sampleChannels = undefined;
    }

    /** Play the sound
     *  - Browsers hold audio until the first user input, a sound played before it returns a paused instance
     *    that starts on its own once audio runs, unless paused or stopped first; a one shot that would have
     *    ended by then is dropped, and only the newest play of each sound waits, so a sound played every frame
     *    starts once
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {number}  [pitch] - How much to scale pitch by
     *  @param {number}  [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [loop] - Should the sound loop?
     *  @param {boolean} [paused] - Should the sound start paused
     *  @return {SoundInstance|undefined} - The sound instance, or undefined if sound is disabled, not loaded, out of range, or running in headless mode
     */
    play(pos, volume=1, pitch=1, randomnessScale=1, loop=false, paused=false)
    {
        ASSERT(!pos || isVector2(pos), 'pos must be a vec2');
        ASSERT(isNumber(volume), 'volume must be a number');
        ASSERT(isNumber(pitch), 'pitch must be a number');
        ASSERT(isNumber(randomnessScale), 'randomnessScale must be a number');

        if (!soundEnable || headlessMode) return;
        if (!this.sampleBuffer && !this._sampleChannels) return;

        let pan;
        if (pos)
        {
            const range = this.range;
            if (range)
            {
                // apply range based fade
                const lengthSquared = cameraPos.distanceSquared(pos);
                if (lengthSquared > range*range)
                    return; // out of range

                // attenuate volume by distance, full volume out to the taper and a fade past it,
                // so a taper of 1 plays at full volume right up to the range
                const distance = lengthSquared**.5, taperRange = range*this.taper;
                if (distance > taperRange)
                    volume *= percent(distance, range, taperRange);
            }

            // get pan from screen space coords
            pan = worldToScreen(pos).x * 2/mainCanvasSize.x - 1;
        }
        
        // Create sound instance
        const rate = pitch + pitch * this.randomness*randomnessScale*rand(-1,1);
        const instance = new SoundInstance(this, volume, rate, pan, loop, paused);

        if (debug && debugSound && pos)
        {
            // visualize where positioned sounds play and their falloff range
            debugCircle(pos, .5, '#0ff', .5, true);
            if (this.range)
            {
                debugCircle(pos, 2*this.range, '#0ff', .5);            // silent radius
                debugCircle(pos, 2*this.range*this.taper, '#0ff', .5); // full volume radius
            }
            debugText('vol '+volume.toFixed(2)+' pitch '+rate.toFixed(2), pos, .5, '#0ff', .5);
        }

        return instance;
    }
    
    /** Play the sound on a loop, the same as play with loop on; stop or change it through the SoundInstance returned
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {number}  [pitch] - How much to scale pitch by
     *  @param {number}  [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [paused] - Should the sound start paused
     *  @return {SoundInstance|undefined} - The sound instance, or undefined if sound is disabled, not loaded, out of range, or running in headless mode */
    playLoop(pos, volume=1, pitch=1, randomnessScale=1, paused=false)
    { return this.play(pos, volume, pitch, randomnessScale, true, paused); }

    /** Play a music track that loops by default
     *  @param {number} [volume] - Volume to play the music at
     *  @param {boolean} [loop] - Should the music loop?
     *  @param {boolean} [paused] - Should the music start paused
     *  @return {SoundInstance|undefined} - The sound instance, or undefined if sound is disabled, not loaded, or running in headless mode
     */
    playMusic(volume=1, loop=true, paused=false)
    { return this.play(undefined, volume, 1, 0, loop, paused); }

    /** Play the sound as a musical note with a semitone offset
     *  This can be used to play music with chromatic scales
     *  @param {number}  [semitoneOffset] - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume=1] - How much to scale volume by
     *  @return {SoundInstance|undefined} - The sound instance, or undefined if sound is disabled, not loaded, out of range, or running in headless mode
     */
    playNote(semitoneOffset=0, pos, volume)
    {
        ASSERT(isNumber(semitoneOffset), 'semitoneOffset must be a number');
        const pitch = getNoteFrequency(semitoneOffset, 1);
        return this.play(pos, volume, pitch, 0);
    }

    /** Get how long this sound is in seconds
     *  @return {number} - How long the sound is in seconds (0 if loading)
     */
    getDuration()
    { return this.sampleLength / this.sampleRate || 0; }

    /** Check if sound is loaded, for sounds fetched from a url
     *  @return {boolean} - True if sound is loaded and ready to play
     */
    isLoaded() { return this.loadedPercent === 1; }
    
    /** Loads a sound from a URL and decodes it into sample data.
    *  @param {string} filename
    *  @return {Promise} */
    async loadSound(filename)
    {
        const response = await fetch(filename);
        if (!response.ok)
            throw new Error(`Failed to load sound from ${filename}: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // keep the decoded buffer as is, it is exactly what playback needs and
        // every play shares it, no channel data is read or copied
        this.sampleRate = audioBuffer.sampleRate;
        this.sampleLength = audioBuffer.length;
        this.sampleBuffer = audioBuffer;
        this.loadedPercent = 1;
        this.onloadCallback?.(this);
    }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Sound Instance - Wraps an AudioBufferSourceNode for individual sound control
 * Represents a single playing instance of a sound with pause/resume capabilities
 * @memberof Audio
 * @example
 * // Play a sound and get an instance for control
 * const jumpSound = new Sound([.5,.5,220]);
 * const instance = jumpSound.play();
 * 
 * // Control the individual instance
 * instance.setVolume(.5);
 * instance.pause();
 * instance.resume();
 * instance.stop();
 */
class SoundInstance
{
    /** Create a sound instance
     *  @param {Sound}    sound    - The sound object
     *  @param {number}   [volume] - How much to scale volume by
     *  @param {number}   [rate]   - The playback rate to use
     *  @param {number}   [pan]    - How much to apply stereo panning
     *  @param {boolean}  [loop]   - Should the sound loop?
     *  @param {boolean}  [paused] - Should the sound start paused? */
    constructor(sound, volume=1, rate=1, pan=0, loop=false, paused=false)
    {
        ASSERT(sound instanceof Sound, 'SoundInstance requires a valid Sound object');
        ASSERT(volume >= 0, 'Sound volume must be positive or zero');
        ASSERT(rate >= 0, 'Sound rate must be positive or zero');
        ASSERT(isNumber(pan), 'Sound pan must be a number');

        /** @property {Sound} - The sound object */
        this.sound = sound;
        /** @property {number} - How much to scale volume by */
        this.volume = volume;
        /** @property {number} - The playback rate to use */
        this.rate = rate;
        /** @property {number} - How much to apply stereo panning */
        this.pan = pan;
        /** @property {boolean} - Should the sound loop */
        this.loop = loop;
        /** @property {number|undefined} - Where it is in the sound while not playing, in the sound's own seconds, undefined while playing
         *  @type {number|undefined} */
        this.pausedTime = 0;
        /** @property {number} - Audio context time its place was last taken at, while playing
         *  @type {number|undefined} */
        this.startTime = undefined;
        /** @property {number} - Where it was in the sound at startTime, in the sound's own seconds */
        this.startOffset = 0;
        /** @property {GainNode|undefined} - Gain node for the sound, undefined once it is stopped or paused
         *  @type {GainNode|undefined} */
        this.gainNode = undefined;
        /** @property {StereoPannerNode|undefined} - Stereo panner for the sound, undefined once it is stopped or paused
         *  @type {StereoPannerNode|undefined} */
        this.pannerNode = undefined;
        /** @property {AudioBufferSourceNode|undefined} - Source node of the audio, undefined while not playing
         *  @type {AudioBufferSourceNode|undefined} */
        this.source = undefined;
        /** @property {AudioNode|AudioEffectNodes} - Node or effect to route this instance through, copied from the sound
         *  @type {AudioNode|AudioEffectNodes} */
        this.output = sound.output;
        /** @property {AudioEndedCallback|undefined} - Called when this instance plays to its end, not when it is stopped
         *  or paused; it is read when the sound ends, so it can be set at any time
         *  @type {AudioEndedCallback|undefined} */
        this.onendedCallback = undefined;
        /** A playback that ends on its own leaves the instance stopped, its time back at 0; the ended event of one
         *  stopped or replaced since is too late to change anything
         *  @private */
        this.sourceEnded = (source)=>
        {
            if (source !== this.source) return;
            this.source = this.gainNode = this.pannerNode = undefined;
            this.startTime = undefined;
            this.pausedTime = 0;
            this.onendedCallback?.(source);
        };

        // start sound
        if (!paused)
            this.start();
    }

    /** Start playing the sound instance from a place in the sound
     *  @param {number} [offset] - Where to start in the sound, in its own seconds whatever the rate
     */
    start(offset=0)
    {
        ASSERT(offset >= 0, 'Sound start offset must be positive or zero');
        if (this.isPlaying())
            this.stop();
        this.gainNode = audioContext.createGain();
        this.pannerNode = new StereoPannerNode(audioContext, {'pan':clamp(this.pan, -1, 1)});

        // build the shared buffer if it was not made at load time, then play it
        this.sound.buildSampleBuffer();
        this.source = this.sound.sampleBuffer ?
            playAudioBuffer(this.sound.sampleBuffer, this.volume, this.rate, this.pan, this.loop, this.gainNode, offset, this.sourceEnded, this.output, this.pannerNode) :
            playSamples(this.sound.sampleChannels, this.volume, this.rate, this.pan, this.loop, this.sound.sampleRate, this.gainNode, offset, this.sourceEnded, this.output, this.pannerNode);
        audioWaitingInstances.delete(this);
        if (this.source)
        {
            this.startTime = audioContext.currentTime;
            this.startOffset = offset;
            this.pausedTime = undefined;
        }
        else
        {
            // the sound could not start, keep the place so a later resume picks it up,
            // which happens on its own when it failed only because audio is not running yet
            this.startTime = this.gainNode = this.pannerNode = undefined;
            this.pausedTime = offset;
            if (!audioIsRunning())
            {
                // only the newest of each sound waits, a loop a game plays again each frame is one loop
                audioWaitingPrune();
                for (const other of audioWaitingInstances.keys())
                    other.sound === this.sound && audioWaitingInstances.delete(other);
                audioWaitingInstances.set(this, performance.now());
            }
        }
    }

    /** Set the volume of this sound instance, with an optional fade to it
     *  - A fade ducks music under dialogue or cross fades two tracks without a click
     *  @param {number} volume
     *  @param {number} [fadeTime] - Seconds to fade to the new volume over */
    setVolume(volume, fadeTime=0)
    {
        ASSERT(volume >= 0, 'Sound volume must be positive or zero');
        ASSERT(fadeTime >= 0, 'Sound fade time must be positive or zero');
        this.volume = volume;
        if (!this.gainNode) return;

        // drop any fade still scheduled so stacked calls don't fight,
        // then ramp from wherever the gain is now or jump straight there
        const gain = this.gainNode.gain;
        const startFade = audioContext.currentTime;
        gain.cancelScheduledValues(startFade);
        if (fadeTime)
        {
            gain.setValueAtTime(gain.value, startFade);
            gain.linearRampToValueAtTime(volume, startFade + fadeTime);
        }
        else
            gain.value = volume;
    }

    /** Set the stereo pan of this sound instance, while it plays too
     *  - A looping sound can follow its source across the screen this way
     *  @param {number} pan - -1 is left, 0 is center, 1 is right, clamped to that range */
    setPan(pan)
    {
        ASSERT(isNumber(pan), 'Sound pan must be a number');
        this.pan = pan;
        if (this.pannerNode)
            this.pannerNode.pan.value = clamp(pan, -1, 1);
    }

    /** Set the playback rate of this sound instance, its speed and pitch, while it plays
     *  - A looping sound can follow something smoothly this way, like an engine with the speed
     *  - A rate of 0 freezes the sound in place, and it carries on from there when the rate comes back
     *  @param {number} rate - 1 is normal, 2 is twice as fast and an octave up */
    setRate(rate)
    {
        ASSERT(rate >= 0, 'Sound rate must be positive or zero');
        // keep the place in the sound, only the speed changes from here
        if (this.isPlaying())
        {
            this.startOffset = this.getCurrentTime();
            this.startTime = audioContext.currentTime;
        }
        this.rate = rate;
        if (this.source)
            this.source.playbackRate.value = rate;
    }

    /** Stop this sound instance and reset position to the start
     *  @param {number} [fadeTime] - Seconds to fade out over before stopping */
    stop(fadeTime=0)
    {
        ASSERT(fadeTime >= 0, 'Sound fade time must be positive or zero');
        audioWaitingInstances.delete(this); // a sound waiting for audio to run no longer starts
        if (this.isPlaying())
        {
            if (fadeTime)
            {
                // ramp off gain from where it is now (not 1, or low-volume
                // instances would jump back up before fading, and a volume
                // fade in flight carries on down from its current point);
                // cancel any prior scheduling so stacked stop calls don't
                // re-anchor partway through a previous fade
                const gain = this.gainNode.gain;
                const startFade = audioContext.currentTime;
                const endFade = startFade + fadeTime;
                gain.cancelScheduledValues(startFade);
                gain.setValueAtTime(gain.value, startFade);
                gain.linearRampToValueAtTime(0, endFade);
                this.source.stop(endFade);
            }
            else
                this.source.stop();
        }
        this.pausedTime = 0;
        this.source = undefined;
        this.startTime = undefined;
        // let go of the gain node so a later setVolume can't cancel the fade out, the ended listener disconnects
        // it, and start makes a new one
        this.gainNode = undefined;
        this.pannerNode = undefined;
    }

    /** Pause this sound instance */
    pause()
    {
        audioWaitingInstances.delete(this); // a sound waiting for audio to run no longer starts
        if (this.isPaused()) return;

        // save current time and stop sound
        this.pausedTime = this.getCurrentTime();
        this.source.stop();
        this.source = undefined;
        this.startTime = undefined;
        this.gainNode = undefined; // resume starts with a new one at the volume set meanwhile
        this.pannerNode = undefined;
    }

    /** Resume this sound instance */
    resume()
    {
        if (!this.isPaused()) return;
        
        // restart sound from paused time
        this.start(this.pausedTime);
    }

    /** Check if this instance is currently playing
     *  @return {boolean} - True if playing
     */
    isPlaying() { return !!this.source; }

    /** Check if this instance is paused or stopped (not currently playing)
     *  @return {boolean} - True if not playing
     */
    isPaused() { return !this.isPlaying(); }

    /** Get where it is in the sound, in the sound's own seconds: at a rate of 2 it moves two seconds for each one
     *  that passes, and at 0 it stays put
     *  @return {number} - Seconds into the sound
     */
    getCurrentTime()
    {
        if (!this.isPlaying()) return this.pausedTime;
        const duration = this.getDuration();
        const place = this.startOffset + (audioContext.currentTime - this.startTime) * this.rate;
        return duration ? mod(place, duration) : 0; // a sound still loading has no length yet
    }

    /** Get the length of the sound in its own seconds, the same at any rate; divide by the rate for how long it takes to play
     *  @return {number} - Length in seconds (0 if loading)
     */
    getDuration() { return this.sound.getDuration(); }

    /** Get source of this sound instance
     *  @return {AudioBufferSourceNode|undefined} - The source, or undefined while not playing
     */
    getSource() { return this.source; }
}

///////////////////////////////////////////////////////////////////////////////

/** Speak text with passed in settings
 *  @param {string} text - The text to speak
 *  @param {number} [volume] - How much to scale volume by
 *  @param {number} [rate] - How quickly to speak
 *  @param {number} [pitch] - How much to change the pitch by
 *  @param {string} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @return {SpeechSynthesisUtterance|undefined} - The utterance that was spoken, or undefined if speech is unavailable
 *  @memberof Audio */
function speak(text, volume=1, rate=1, pitch=1, language='')
{
    ASSERT(typeof volume !== 'string', 'speak() signature changed: language is now the last parameter, after pitch');
    if (!soundEnable || headlessMode) return;
    if (typeof speechSynthesis === 'undefined') return;

    // common languages (not supported by all browsers)
    // en - english,  it - italian, fr - french,  de - german, es - spanish
    // ja - japanese, ru - russian, zh - chinese, hi - hindi,  ko - korean

    // build utterance and speak
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.volume = clamp(volume*soundVolume);
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
    return utterance;
}

/** Stop all queued speech
 *  @memberof Audio */
function speakStop()
{
    if (typeof speechSynthesis !== 'undefined')
        speechSynthesis.cancel();
}

/** Get frequency of a note on a musical scale
 *  @param {number} semitoneOffset - How many semitones away from the root note
 *  @param {number} [rootFrequency] - Frequency at semitone offset 0
 *  @return {number} - The frequency of the note
 *  @memberof Audio */
function getNoteFrequency(semitoneOffset, rootFrequency=220)
{ return rootFrequency * 2**(semitoneOffset/12); }

///////////////////////////////////////////////////////////////////////////////

/**
 * @callback AudioEndedCallback - Function called when a sound ends
 * @param {AudioBufferSourceNode} source
 * @memberof Audio
 */

/** Play cached audio samples with given settings
 *  @param {Array}    sampleChannels - Array of arrays of samples to play (for stereo playback)
 *  @param {number}   [volume] - How much to scale volume by
 *  @param {number}   [rate] - The playback rate to use
 *  @param {number}   [pan] - How much to apply stereo panning
 *  @param {boolean}  [loop] - True if the sound should loop when it reaches the end
 *  @param {number}   [sampleRate=44100] - Sample rate for the sound
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing (disconnected when the sound ends)
 *  @param {number}   [offset] - Where to start in the sound, in its own seconds whatever the rate
 *  @param {AudioEndedCallback} [onended] - Callback for when the sound ends
 *  @param {AudioNode|AudioEffectNodes} [output] - Node or effect to connect the gain to instead of the master gain
 *  @param {StereoPannerNode} [pannerNode] - Optional stereo panner for panning while playing, its pan already set (disconnected when the sound ends)
 *  @return {AudioBufferSourceNode|undefined} - The source node of the sound played, undefined if play fails
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate=audioDefaultSampleRate, gainNode, offset=0, onended, output, pannerNode)
{
    if (!soundEnable || headlessMode) return;

    if (!audioIsRunning())
    {
        // fix stalled audio, don't build a buffer that can't be played;
        // but a context suspended because the page is hidden stays suspended until it shows
        if (!audioSuspendedWhenHidden)
            audioContext.resume();
        return;
    }

    const buffer = createAudioBuffer(sampleChannels, sampleRate);
    return playAudioBuffer(buffer, volume, rate, pan, loop, gainNode, offset, onended, output, pannerNode);
}

/** Copy arrays of samples into a new audio buffer
 *  @param {Array}  sampleChannels - Array of arrays of samples (for stereo playback)
 *  @param {number} [sampleRate=44100] - Sample rate for the sound
 *  @return {AudioBuffer} - The audio buffer holding the samples
 *  @memberof Audio */
function createAudioBuffer(sampleChannels, sampleRate=audioDefaultSampleRate)
{
    const channelCount = sampleChannels.length;
    const sampleLength = sampleChannels[0].length;
    const buffer = audioContext.createBuffer(channelCount, sampleLength, sampleRate);
    sampleChannels.forEach((c,i)=> buffer.getChannelData(i).set(c));
    return buffer;
}

/** Play an audio buffer with given settings
 *  The buffer can be shared by any number of sounds playing at once
 *  @param {AudioBuffer} buffer - The audio buffer to play
 *  @param {number}   [volume] - How much to scale volume by
 *  @param {number}   [rate] - The playback rate to use
 *  @param {number}   [pan] - How much to apply stereo panning
 *  @param {boolean}  [loop] - True if the sound should loop when it reaches the end
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing (disconnected when the sound ends)
 *  @param {number}   [offset] - Where to start in the sound, in its own seconds whatever the rate
 *  @param {AudioEndedCallback} [onended] - Callback for when the sound ends
 *  @param {AudioNode|AudioEffectNodes} [output] - Node or effect to connect the gain to instead of the master gain
 *  @param {StereoPannerNode} [pannerNode] - Optional stereo panner for panning while playing, its pan already set (disconnected when the sound ends)
 *  @return {AudioBufferSourceNode|undefined} - The source node of the sound played, undefined if play fails
 *  @memberof Audio */
function playAudioBuffer(buffer, volume=1, rate=1, pan=0, loop=false, gainNode, offset=0, onended, output, pannerNode)
{
    if (!soundEnable || headlessMode) return;

    if (!audioIsRunning())
    {
        // fix stalled audio, this sound won't be able to play;
        // but a context suspended because the page is hidden stays suspended until it shows
        if (!audioSuspendedWhenHidden)
            audioContext.resume();
        return;
    }

    // setup source, many sources can share one buffer
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;

    // create and connect gain node
    gainNode = gainNode || audioContext.createGain();
    gainNode.gain.value = volume;
    const outputNode = audioEffectNode(output, 'input') || audioMasterGain;
    ASSERT(typeof outputNode.connect === 'function', 'output must be an AudioNode or an effect with input and output nodes');
    gainNode.connect(outputNode);

    // connect source to stereo panner and gain
    const panner = pannerNode || new StereoPannerNode(audioContext, {'pan':clamp(pan, -1, 1)});
    source.connect(panner).connect(gainNode);

    // disconnect nodes when the sound ends so the audio graph doesn't grow
    // unbounded across many play() calls (source.stop() also fires 'ended')
    source.addEventListener('ended', ()=>
    {
        gainNode.disconnect();
        panner.disconnect();
        if (onended) onended(source);
    });

    // play and return sound, the offset is a place in the buffer whatever the rate
    source.start(0, offset);

    if (debug && debugSound)
        LOG('sound', 'vol', volume.toFixed(2), 'rate', rate.toFixed(2), 'pan', pan.toFixed(2), loop ? 'loop' : '');

    return source;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.3.2 by Frank Force

/** Generate and play a ZzFX sound
 *
 *  <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
 *  @return {AudioBufferSourceNode|undefined} - The audio node of the sound played, undefined if play fails
 *  @memberof Audio */
function zzfx(...zzfxSound) { return playSamples([zzfxG(...zzfxSound)]); }

/** Generate samples for a ZzFX sound
 *  @param {number}  [volume] - Volume scale (percent)
 *  @param {number}  [randomness] - How much to randomize frequency (percent Hz)
 *  @param {number}  [frequency] - Frequency of sound (Hz)
 *  @param {number}  [attack] - Attack time, how fast sound starts (seconds)
 *  @param {number}  [sustain] - Sustain time, how long sound holds (seconds)
 *  @param {number}  [release] - Release time, how fast sound fades out (seconds)
 *  @param {number}  [shape] - Shape of the sound wave
 *  @param {number}  [shapeCurve] - Squareness of wave (0=square, 1=normal, 2=pointy)
 *  @param {number}  [slide] - How much to slide frequency (kHz/s)
 *  @param {number}  [deltaSlide] - How much to change slide (kHz/s/s)
 *  @param {number}  [pitchJump] - Frequency of pitch jump (Hz)
 *  @param {number}  [pitchJumpTime] - Time of pitch jump (seconds)
 *  @param {number}  [repeatTime] - Resets some parameters periodically (seconds)
 *  @param {number}  [noise] - How much random noise to add (percent)
 *  @param {number}  [modulation] - Frequency of modulation wave, negative flips phase (Hz)
 *  @param {number}  [bitCrush] - Resamples at a lower frequency in (samples*100)
 *  @param {number}  [delay] - Overlap sound with itself for reverb and flanger effects (seconds)
 *  @param {number}  [sustainVolume] - Volume level for sustain (percent)
 *  @param {number}  [decay] - Decay time, how long to reach sustain after attack (seconds)
 *  @param {number}  [tremolo] - Trembling effect, rate controlled by repeat time (percent)
 *  @param {number}  [filter] - Filter cutoff frequency, positive for HPF, negative for LPF (Hz)
 *  @return {Array} - Array of audio samples
 *  @memberof Audio */
function zzfxG
(
    volume = 1,
    randomness = .05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = .1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0
)
{
    // init parameters
    let sampleRate = audioDefaultSampleRate,
        PI2 = PI*2,
        startSlide = slide *= 500 * PI2 / sampleRate / sampleRate,
        startFrequency = frequency *=
            (1 + rand(randomness,-randomness)) * PI2 / sampleRate,
        modOffset = 0, // modulation offset
        repeat = 0,    // repeat offset
        crush = 0,     // bit crush offset
        jump = 1,      // pitch jump timer
        length,        // sample length
        b = [],        // sample buffer
        t = 0,         // sample time
        i = 0,         // sample index
        s = 0,         // sample value
        f,             // wave frequency

        // biquad LP/HP filter
        quality = 2, w = PI2 * min(abs(filter), sampleRate/4 - 1) * 2 / sampleRate, // stable below a quarter rate
        cosw = cos(w), alpha = sin(w) / 2 / quality,
        a0 = 1 + alpha, a1 = -2*cosw / a0, a2 = (1 - alpha) / a0,
        b0 = (1 + sign(filter) * cosw) / 2 / a0,
        b1 = -(sign(filter) + cosw) / a0, b2 = b0,
        x2 = 0, x1 = 0, y2 = 0, y1 = 0;

        // scale by sample rate
        const minAttack = 9; // prevent pop if attack is 0
        attack = attack * sampleRate || minAttack;
        decay *= sampleRate;
        sustain *= sampleRate;
        release *= sampleRate;
        delay *= sampleRate;
        deltaSlide *= 500 * PI2 / sampleRate**3;
        modulation *= PI2 / sampleRate;
        pitchJump *= PI2 / sampleRate;
        pitchJumpTime *= sampleRate;
        repeatTime = repeatTime * sampleRate | 0;

    // generate waveform
    for (length = attack + decay + sustain + release + delay | 0;
        i < length; b[i++] = s * volume)                   // sample
    {
        if (!(++crush%(bitCrush*100|0)))                   // bit crush
        {
            s = shape? shape>1? shape>2? shape>3? shape>4? // wave shape
                (t/PI2%1 < shapeCurve/2? 1 : -1) : // 5 square duty
                sin(t**3) :                        // 4 noise
                max(min(tan(t),1),-1):             // 3 tan
                1-(2*t/PI2%2+2)%2:                 // 2 saw
                1-4*abs(round(t/PI2)-t/PI2):       // 1 triangle
                sin(t);                            // 0 sin

            s = (repeatTime ?
                    1 - tremolo + tremolo*sin(PI2*i/repeatTime) // tremolo
                    : 1) *
                (shape>4?s:sign(s)*abs(s)**shapeCurve) * // shape curve
                (i < attack ? i/attack :                 // attack
                i < attack + decay ?                     // decay
                1-((i-attack)/decay)*(1-sustainVolume) : // decay falloff
                i < attack  + decay + sustain ?          // sustain
                sustainVolume :                          // sustain volume
                i < length - delay ?                     // release
                (length - i - delay)/release *           // release falloff
                sustainVolume :                          // release volume
                0);                                      // post release

            s = delay ? s/2 + (delay > i ? 0 :           // delay
                (i<length-delay? 1 : (length-i)/delay) * // release delay
                b[i-delay|0]/2/(volume||1)) : s;         // sample delay, stored samples are 0 at volume 0

            if (filter)                                  // apply filter
                s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
        }

        f = (frequency += slide += deltaSlide) *// frequency
            cos(modulation*modOffset++);        // modulation
        t += f + f*noise*sin(i**5);             // noise

        if (jump && ++jump > pitchJumpTime)     // pitch jump
        {
            frequency += pitchJump;             // apply pitch jump
            startFrequency += pitchJump;        // also apply to start
            jump = 0;                           // stop pitch jump time
        }

        if (repeatTime && !(++repeat % repeatTime)) // repeat
        {
            frequency = startFrequency;   // reset frequency
            slide = startSlide;           // reset slide
            jump ||= 1;                   // reset pitch jump time
        }
    }

    return b; // return sample buffer
}