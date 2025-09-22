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

        if (zzfxSound)
        {
            // generate zzfx sound now for fast playback
            const defaultRandomness = .05;
            this.randomness = zzfxSound[1] != undefined ? zzfxSound[1] : defaultRandomness;
            zzfxSound[1] = 0; // generate without randomness
            this.sampleChannels = [zzfxG(...zzfxSound)];
            this.sampleRate = zzfxR;
        }
    }

    /** Play the sound
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {number}  [volume] - How much to scale volume by (in addition to range fade)
     *  @param {number}  [pitch] - How much to scale pitch by (also adjusted by this.randomness)
     *  @param {number}  [randomnessScale] - How much to scale randomness
     *  @param {boolean} [loop] - Should the sound loop
     *  @return {AudioBufferSourceNode} - The audio source node
     */
    play(pos, volume=1, pitch=1, randomnessScale=1, loop=false)
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

        // play the sound
        const playbackRate = pitch + pitch * this.randomness*randomnessScale*rand(-1,1);
        this.gainNode = audioContext.createGain();
        this.source = playSamples(this.sampleChannels, volume, playbackRate, pan, loop, this.sampleRate, this.gainNode);
        return this.source;
    }

    /** Set the sound volume of the most recently played instance of this sound
     *  @param {number}  [volume] - How much to scale volume by
     */
    setVolume(volume=1)
    {
        if (this.gainNode)
            this.gainNode.gain.value = volume;
    }

    /** Stop the last instance of this sound that was played */
    stop()
    {
        if (this.source)
            this.source.stop();
        this.source = undefined;
    }
    
    /** Get source of most recent instance of this sound that was played
     *  @return {AudioBufferSourceNode}
     */
    getSource() { return this.source; }

    /** Play the sound as a note with a semitone offset
     *  @param {number}  semitoneOffset - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {number}  [volume=1] - How much to scale volume by (in addition to range fade)
     *  @return {AudioBufferSourceNode} - The audio source node
     */
    playNote(semitoneOffset, pos, volume)
    { return this.play(pos, volume, 2**(semitoneOffset/12), 0); }

    /** Get how long this sound is in seconds
     *  @return {number} - How long the sound is in seconds (undefined if loading)
     */
    getDuration() 
    { return this.sampleChannels && this.sampleChannels[0].length / this.sampleRate; }
    
    /** Check if sound is loading, for sounds fetched from a url
     *  @return {boolean} - True if sound is loading and not ready to play
     */
    isLoading() { return !this.sampleChannels; }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Sound Wave Object - Stores a wave sound for later use and can be played positionally
 * - this can be used to play wave, mp3, and ogg files
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
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        this.sampleChannels = [];
        for (let i = audioBuffer.numberOfChannels; i--;)
            this.sampleChannels[i] = Array.from(audioBuffer.getChannelData(i));
        this.sampleRate = audioBuffer.sampleRate;
        if (this.onloadCallback)
            this.onloadCallback();
    }
}

/** Play an mp3, ogg, or wav audio from a local file or url
 *  @param {string}  filename - Location of sound file to play
 *  @param {number}  [volume] - How much to scale volume by
 *  @param {boolean} [loop] - True if the music should loop
 *  @return {SoundWave} - The sound object for this file
 *  @memberof Audio */
function playAudioFile(filename, volume=1, loop=false)
{
    if (!soundEnable || headlessMode) return;

    return new SoundWave(filename,0,0,0, s=>s.play(undefined, volume, 1, 1, loop));
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
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=false, sampleRate=zzfxR, gainNode) 
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

    // play the sound
    if (audioContext.state != 'running')
    {
        // fix stalled audio and play
        audioContext.resume().then(()=>source.start());
    }
    else
        source.start();

    // return sound
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

/** Sample rate used for all ZzFX sounds
 *  @default 44100
 *  @memberof Audio */
const zzfxR = 44100; 

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
 *  @memberof Audio
 */
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
    let sampleRate = zzfxR,
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
    for(length = attack + decay + sustain + release + delay | 0;
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
