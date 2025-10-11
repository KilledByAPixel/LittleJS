/**
 * LittleJS Audio System
 * - <a href=https://killedbyapixel.github.io/ZzFX/>ZzFX Sound Effects</a> - ZzFX Sound Effect Generator
 * - <a href=https://keithclark.github.io/ZzFXM/>ZzFXM Music</a> - ZzFXM Music System
 * - Caches sounds and music for fast playback
 * - Can attenuate and apply stereo panning to sounds
 * - Ability to play mp3, ogg, and wave files
 * - Speech synthesis functions
 * @namespace Audio
 */

'use strict';

/** Audio context used by the engine
 *  @type {AudioContext}
 *  @memberof Audio */
let audioContext = new AudioContext;

/** Master gain node for all audio to pass through
 *  @type {GainNode}
 *  @memberof Audio */
let audioMasterGain;

/** Default sample rate used for sounds
 *  @default 44100
 *  @memberof Audio */
const audioDefaultSampleRate = 44100;

/** Check if the audio context is running and available for playback
 *  @return {boolean} - True if the audio context is running
 *  @memberof Audio */
function audioIsRunning()
{ return audioContext.state === 'running'; }

function audioInit()
{
    if (!soundEnable || headlessMode) return;

    audioMasterGain = audioContext.createGain();
    audioMasterGain.connect(audioContext.destination);
    audioMasterGain.gain.value = soundVolume; // set starting value
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Sound Object - Stores a sound for later use and can be played positionally
 *
 * <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 * @memberof Audio
 * @example
 * // create a sound
 * const sound_example = new Sound([.5,.5]);
 *
 * // play the sound
 * sound_example.play();
 */
class Sound
{
    /** Create a sound object and cache the zzfx samples for later use
     *  @param {Array}  zzfxSound - Array of zzfx parameters, ex. [.5,.5]
     *  @param {number} [range=soundDefaultRange] - World space max range of sound
     *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     */
    constructor(zzfxSound, range=soundDefaultRange, taper=soundDefaultTaper)
    {
        if (!soundEnable || headlessMode) return;

        /** @property {number} - World space max range of sound */
        this.range = range;
        /** @property {number} - At what percentage of range should it start tapering */
        this.taper = taper;
        /** @property {number} - How much to randomize frequency each time sound plays */
        this.randomness = 0;
        /** @property {number} - Sample rate for this sound */
        this.sampleRate = audioDefaultSampleRate;
        /** @property {number} - Percentage of this sound currently loaded */
        this.loadedPercent = 0;

        // generate zzfx sound now for fast playback
        if (zzfxSound)
        {
            // remove randomness so it can be applied on playback
            const randomnessIndex = 1, defaultRandomness = .05;
            this.randomness = zzfxSound[randomnessIndex] !== undefined ? 
                zzfxSound[randomnessIndex] : defaultRandomness;
            zzfxSound[randomnessIndex] = 0;

            // generate the zzfx samples
            this.sampleChannels = [zzfxG(...zzfxSound)];
            this.loadedPercent = 1;
        }
    }

    /** Play the sound
     *  Sounds may not play until a user interaction occurs
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume] - How much to scale volume by
     *  @param {number}  [pitch] - How much to scale pitch by
     *  @param {number}  [randomnessScale] - How much to scale pitch randomness
     *  @param {boolean} [loop] - Should the sound loop?
     *  @param {boolean} [paused] - Should the sound start paused
     *  @return {SoundInstance} - The audio source node
     */
    play(pos, volume=1, pitch=1, randomnessScale=1, loop=false, paused=false)
    {
        if (!soundEnable || headlessMode) return;
        if (!this.sampleChannels) return;

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

                // attenuate volume by distance
                volume *= percent(lengthSquared**.5, range, range*this.taper);
            }

            // get pan from screen space coords
            pan = worldToScreen(pos).x * 2/mainCanvas.width - 1;
        }
        
        // Create and return sound instance
        const rate = pitch + pitch * this.randomness*randomnessScale*rand(-1,1);
        return new SoundInstance(this, volume, rate, pan, loop, paused);
    }
    
    /** Play a music track that loops by default
     *  @param {number} [volume] - Volume to play the music at
     *  @param {boolean} [loop] - Should the music loop?
     *  @param {boolean} [paused] - Should the music start paused
     *  @return {SoundInstance} - The audio source node
     */
    playMusic(volume=1, loop=true, paused=false)
    { return this.play(undefined, volume, 1, 0, loop, paused); }

    /** Play the sound as a musical note with a semitone offset
     *  This can be used to play music with chromatic scales
     *  @param {number}  [semitoneOffset=0] - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound if any
     *  @param {number}  [volume=1] - How much to scale volume by
     *  @return {SoundInstance} - The audio source node
     */
    playNote(semitoneOffset=0, pos, volume)
    {
        const pitch = getNoteFrequency(semitoneOffset, 1);
        return this.play(pos, volume, pitch, 0);
    }

    /** Get how long this sound is in seconds
     *  @return {number} - How long the sound is in seconds (undefined if loading)
     */
    getDuration()
    { return this.sampleChannels && this.sampleChannels[0].length / this.sampleRate; }

    /** Check if sound is loaded, for sounds fetched from a url
     *  @return {boolean} - True if sound is loaded and ready to play
     */
    isLoaded() { return this.loadedPercent === 1; }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Sound Wave Object - Stores a wave sound for later use and can be played positionally
 * - this can be used to play wave, mp3, and ogg files
 * @extends Sound
 * @memberof Audio
 * @example
 * // create a sound
 * const sound_example = new SoundWave('sound.mp3');
 *
 * // play the sound
 * sound_example.play();
 */
class SoundWave extends Sound
{
    /** Create a sound object and cache the wave file for later use
     *  @param {string} filename - Filename of audio file to load
     *  @param {number} [randomness] - How much to randomize frequency each time sound plays
     *  @param {number} [range=soundDefaultRange] - World space max range of sound
     *  @param {number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering
     *  @param {Function} [onloadCallback] - callback function to call when sound is loaded
     */
    constructor(filename, randomness=0, range, taper, onloadCallback)
    {
        super(undefined, range, taper);
        if (!soundEnable || headlessMode) return;

        /** @property {Function} - callback function to call when sound is loaded */
        this.onloadCallback = onloadCallback;
        this.randomness = randomness;
        this.loadSound(filename);
    }

    /** Loads a sound from a URL and decodes it into sample data. Must be used with await!
    *  @param {string} filename
    *  @return {Promise<void>} */
    async loadSound(filename)
    {
        const response = await fetch(filename);
        if (!response.ok)
            throw new Error(`Failed to load sound from ${filename}: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // convert audio buffer to sample channels across multiple frames
        const channelCount = audioBuffer.numberOfChannels;
        const samplesPerFrame = 1e5;
        const sampleChannels = [];
        for (let channel = 0; channel < channelCount; channel++)
        {
            const channelData = audioBuffer.getChannelData(channel);
            const channelLength = channelData.length;
            sampleChannels[channel] = new Array(channelLength);
            let sampleIndex = 0;
            while (sampleIndex < channelLength)
            {
                // yield to next frame
                await new Promise(resolve => setTimeout(resolve, 0));

                // copy chunk of samples
                const endIndex = min(sampleIndex + samplesPerFrame, channelLength);
                for (; sampleIndex < endIndex; sampleIndex++)
                    sampleChannels[channel][sampleIndex] = channelData[sampleIndex];

                // update loaded percent
                const samplesTotal = channelCount * channelLength;
                const samplesProcessed = channel * channelLength + sampleIndex;
                this.loadedPercent = samplesProcessed / samplesTotal;
            }
        }
        
        // setup the sound to be played
        this.sampleRate = audioBuffer.sampleRate;
        this.sampleChannels = sampleChannels;
        this.loadedPercent = 1;
        if (this.onloadCallback)
            this.onloadCallback();
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
 * instance.unpause();
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
        /** @property {number} - Timestamp for audio context when paused */
        this.pausedTime = 0;
        /** @property {number} - Timestamp for audio context when started */
        this.startTime = undefined;
        /** @property {GainNode} - Gain node for the sound */
        this.gainNode = undefined;
        /** @property {AudioBufferSourceNode} - Source node of the audio */
        this.source = undefined;
        // setup end callback and start sound
        this.onendedCallback = (source)=>
        {
            if (source === this.source)
                this.source = undefined;
        };
        if (!paused)
            this.start();
    }

    /** Start playing the sound instance from the offset time
     *  @param {number} [offset] - Offset in seconds to start playback from 
     */
    start(offset=0)
    {
        ASSERT(offset >= 0, 'Sound start offset must be positive or zero');
        if (this.isPlaying())
            this.stop();
        this.gainNode = audioContext.createGain();
        this.source = playSamples(this.sound.sampleChannels, this.volume, this.rate, this.pan, this.loop, this.sound.sampleRate, this.gainNode, offset, this.onendedCallback);
        this.startTime = audioContext.currentTime - offset;
        this.pausedTime = undefined;
    }

    /** Set the volume of this sound instance
     *  @param {number} volume */
    setVolume(volume)
    {
        ASSERT(volume >= 0, 'Sound volume must be positive or zero');
        this.volume = volume;
        if (this.gainNode)
            this.gainNode.gain.value = volume;
    }

    /** Stop this sound instance and reset position to the start */
    stop(fadeTime=0)
    {
        ASSERT(fadeTime >= 0, 'Sound fade time must be positive or zero');
        if (this.isPlaying())
        {
            if (fadeTime)
            {
                // ramp off gain
                const startFade = audioContext.currentTime;
                const endFade = startFade + fadeTime;
                this.gainNode.gain.linearRampToValueAtTime(1, startFade);
                this.gainNode.gain.linearRampToValueAtTime(0, endFade);
                this.source.stop(endFade);
            }
            else
                this.source.stop();
        }
        this.pausedTime = 0;
        this.source = undefined;
        this.startTime = undefined;
    }

    /** Pause this sound instance */
    pause()
    {
        if (this.isPaused())
            return;

        // save current time and stop sound
        this.pausedTime = this.getCurrentTime();
        this.source.stop();
        this.source = undefined;
        this.startTime = undefined;
    }

    /** Unpauses this sound instance */
    resume()
    {
        if (!this.isPaused())
            return;
        
        // restart sound from paused time
        this.start(this.pausedTime);
    }

    /** Check if this instance is currently playing
     *  @return {boolean} - True if playing
     */
    isPlaying() { return !!this.source; }

    /** Check if this instance is paused and was not stopped
     *  @return {boolean} - True if paused
     */
    isPaused() { return !this.isPlaying(); }

    /** Get the current playback time in seconds
     *  @return {number} - Current playback time
     */
    getCurrentTime()
    {
        const deltaTime = mod(audioContext.currentTime - this.startTime, 
            this.getDuration());
        return this.isPlaying() ? deltaTime : this.pausedTime;
    }

    /** Get the total duration of this sound
     *  @return {number} - Total duration in seconds
     */
    getDuration() { return this.sound.getDuration() / this.rate; }

    /** Get source of this sound instance
     *  @return {AudioBufferSourceNode}
     */
    getSource() { return this.source; }
}

///////////////////////////////////////////////////////////////////////////////

/** Speak text with passed in settings
 *  @param {string} text - The text to speak
 *  @param {string} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @param {number} [volume] - How much to scale volume by
 *  @param {number} [rate] - How quickly to speak
 *  @param {number} [pitch] - How much to change the pitch by
 *  @return {SpeechSynthesisUtterance} - The utterance that was spoken
 *  @memberof Audio */
function speak(text, language='', volume=1, rate=1, pitch=1)
{
    if (!soundEnable || headlessMode) return;
    if (!speechSynthesis) return;

    // common languages (not supported by all browsers)
    // en - english,  it - italian, fr - french,  de - german, es - spanish
    // ja - japanese, ru - russian, zh - chinese, hi - hindi,  ko - korean

    // build utterance and speak
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.volume = 2*volume*soundVolume;
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
    return utterance;
}

/** Stop all queued speech
 *  @memberof Audio */
function speakStop() {speechSynthesis && speechSynthesis.cancel();}

/** Get frequency of a note on a musical scale
 *  @param {number} semitoneOffset - How many semitones away from the root note
 *  @param {number} [rootFrequency=220] - Frequency at semitone offset 0
 *  @return {number} - The frequency of the note
 *  @memberof Audio */
function getNoteFrequency(semitoneOffset, rootFrequency=220)
{ return rootFrequency * 2**(semitoneOffset/12); }

///////////////////////////////////////////////////////////////////////////////

/** Play cached audio samples with given settings
 *  @param {Array}    sampleChannels - Array of arrays of samples to play (for stereo playback)
 *  @param {number}   [volume] - How much to scale volume by
 *  @param {number}   [rate] - The playback rate to use
 *  @param {number}   [pan] - How much to apply stereo panning
 *  @param {boolean}  [loop] - True if the sound should loop when it reaches the end
 *  @param {number}   [sampleRate=44100] - Sample rate for the sound
 *  @param {GainNode} [gainNode] - Optional gain node for volume control while playing
 *  @param {number}   [offset] - Offset in seconds to start playback from
 *  @param {Function} [onended] - Callback for when the sound ends
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate=audioDefaultSampleRate, gainNode, offset=0, onended)
{
    if (!soundEnable || headlessMode) return;

    // create buffer and source
    const channelCount = sampleChannels.length;
    const sampleLength = sampleChannels[0].length;
    const buffer = audioContext.createBuffer(channelCount, sampleLength, sampleRate);
    const source = audioContext.createBufferSource();

    // copy samples to buffer and setup source
    sampleChannels.forEach((c,i)=> buffer.getChannelData(i).set(c));
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;

    // create and connect gain node
    gainNode = gainNode || audioContext.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(audioMasterGain);

    // connect source to stereo panner and gain
    const pannerNode = new StereoPannerNode(audioContext, {'pan':clamp(pan, -1, 1)});
    source.connect(pannerNode).connect(gainNode);

    // callback when the sound ends
    if (onended)
        source.addEventListener('ended', ()=> onended(source));

    if (!audioIsRunning())
    {
        // fix stalled audio, this sound won't be able to play
        audioContext.resume();
        return;
    }

    // play and return sound
    const startOffset = offset * rate;
    source.start(0, startOffset);
    return source;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.3.2 by Frank Force

/** Generate and play a ZzFX sound
 *
 *  <a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a>
 *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
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
        quality = 2, w = PI2 * abs(filter) * 2 / sampleRate,
        cos = Math.cos(w), alpha = Math.sin(w) / 2 / quality,
        a0 = 1 + alpha, a1 = -2*cos / a0, a2 = (1 - alpha) / a0,
        b0 = (1 + sign(filter) * cos) / 2 / a0,
        b1 = -(sign(filter) + cos) / a0, b2 = b0,
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
                (t/PI2%1 < shapeCurve/2? 1 : -1) :         // 5 square duty
                Math.sin(t**3) :                           // 4 noise
                Math.max(Math.min(Math.tan(t),1),-1):      // 3 tan
                1-(2*t/PI2%2+2)%2:                         // 2 saw
                1-4*abs(Math.round(t/PI2)-t/PI2):          // 1 triangle
                Math.sin(t);                               // 0 sin

            s = (repeatTime ?
                    1 - tremolo + tremolo*Math.sin(PI2*i/repeatTime) // tremolo
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
                b[i-delay|0]/2/volume) : s;              // sample delay

            if (filter)                                  // apply filter
                s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
        }

        f = (frequency += slide += deltaSlide) *// frequency
            Math.cos(modulation*modOffset++);   // modulation
        t += f + f*noise*Math.sin(i**5);        // noise

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