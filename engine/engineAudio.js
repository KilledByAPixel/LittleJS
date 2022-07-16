/** 
 * LittleJS Audio System
 * <br> - <a href=https://killedbyapixel.github.io/ZzFX/>ZzFX Sound Effects</a>
 * <br> - <a href=https://keithclark.github.io/ZzFXM/>ZzFXM Music</a>
 * <br> - Caches sounds and music for fast playback
 * <br> - Can attenuate and apply stereo panning to sounds
 * <br> - Ability to play mp3, ogg, and wave files
 * <br> - Speech synthesis wrapper functions
 */

'use strict';

/** 
 * Sound Object - Stores a zzfx sound for later use and can be played positionally
 * <br>
 * <br><b><a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a></b>
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
     *  @param {Number} [range=soundDefaultRange] - World space max range of sound, will not play if camera is farther away
     *  @param {Number} [taper=soundDefaultTaper] - At what percentage of range should it start tapering off
     */
    constructor(zzfxSound, range=soundDefaultRange, taper=soundDefaultTaper)
    {
        if (!soundEnable) return;

        /** @property {Number} - World space max range of sound, will not play if camera is farther away */
        this.range = range;

        /** @property {Number} - At what percentage of range should it start tapering off */
        this.taper = taper;

        // get randomness from sound parameters
        this.randomness = zzfxSound[1] || 0;
        zzfxSound[1] = 0;

        // generate sound now for fast playback
        this.cachedSamples = zzfxG(...zzfxSound);
    }

    /** Play the sound
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {Number}  [volume=1] - How much to scale volume by (in addition to range fade)
     *  @param {Number}  [pitch=1] - How much to scale pitch by (also adjusted by this.randomness)
     *  @param {Number}  [randomnessScale=1] - How much to scale randomness
     *  @return {AudioBufferSourceNode} - The audio, can be used to stop sound later
     */
    play(pos, volume=1, pitch=1, randomnessScale=1)
    {
        if (!soundEnable) return;

        let pan = 0;
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
        return playSamples([this.cachedSamples], volume, playbackRate, pan);
    }

    /** Play the sound as a note with a semitone offset
     *  @param {Number}  semitoneOffset - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {Number}  [volume=1] - How much to scale volume by (in addition to range fade)
     *  @return {AudioBufferSourceNode} - The audio, can be used to stop sound later
     */
    playNote(semitoneOffset, pos, volume=1)
    {
        if (!soundEnable) return;

        return this.play(pos, volume, 2**(semitoneOffset/12), 0);
    }
}

/**
 * Music Object - Stores a zzfx music track for later use
 * <br>
 * <br><b><a href=https://keithclark.github.io/ZzFXM/>Create music with the ZzFXM tracker.</a></b>
 * @example
 * // create some music
 * const music_example = new Music(
 * [
 *     [                         // instruments
 *       [,0,400]                // simple note
 *     ], 
 *     [                         // patterns
 *         [                     // pattern 1
 *             [                 // channel 0
 *                 0, -1,        // instrument 0, left speaker
 *                 1, 0, 9, 1    // channel notes
 *             ], 
 *             [                 // channel 1
 *                 0, 1,         // instrument 1, right speaker
 *                 0, 12, 17, -1 // channel notes
 *             ]
 *         ],
 *     ],
 *     [0, 0, 0, 0], // sequence, play pattern 0 four times
 *     90            // BPM
 * ]);
 * 
 * // play the music
 * music_example.play();
 */
class Music
{
    /** Create a music object and cache the zzfx music samples for later use
     *  @param {Array} zzfxMusic - Array of zzfx music parameters
     */
    constructor(zzfxMusic)
    {
        if (!soundEnable) return;

        this.cachedSamples = zzfxM(...zzfxMusic);
    }

    /** Play the music
     *  @param {Number}  [volume=1] - How much to scale volume by
     *  @param {Boolean} [loop=1] - True if the music should loop when it reaches the end
     *  @return {AudioBufferSourceNode} - The audio node, can be used to stop sound later
     */
    play(volume = 1, loop = 1)
    {
        if (!soundEnable) return;

        return playSamples(this.cachedSamples, volume, 1, 0, loop);
    }
}

/** Play an mp3 or wav audio from a local file or url
 *  @param {String}  url - Location of sound file to play
 *  @param {Number}  [volume=1] - How much to scale volume by
 *  @param {Boolean} [loop=1] - True if the music should loop when it reaches the end
 *  @return {HTMLAudioElement} - The audio element for this sound
 *  @memberof Audio */
function playAudioFile(url, volume=1, loop=1)
{
    if (!soundEnable) return;

    const audio = new Audio(url);
    audio.volume = soundVolume * volume;
    audio.loop = loop;
    audio.play();
    return audio;
}

/** Speak text with passed in settings
 *  @param {String} text - The text to speak
 *  @param {String} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @param {Number} [volume=1] - How much to scale volume by
 *  @param {Number} [rate=1] - How quickly to speak
 *  @param {Number} [pitch=1] - How much to change the pitch by
 *  @return {SpeechSynthesisUtterance} - The utterance that was spoken
 *  @memberof Audio */
function speak(text, language='', volume=1, rate=1, pitch=1)
{
    if (!soundEnable || !speechSynthesis) return;

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
const speakStop = ()=> speechSynthesis && speechSynthesis.cancel();

/** Get frequency of a note on a musical scale
 *  @param {Number} semitoneOffset - How many semitones away from the root note
 *  @param {Number} [rootNoteFrequency=220] - Frequency at semitone offset 0
 *  @return {Number} - The frequency of the note
 *  @memberof Audio */
const getNoteFrequency = (semitoneOffset, rootFrequency=220)=> rootFrequency * 2**(semitoneOffset/12); 

///////////////////////////////////////////////////////////////////////////////

/** Audio context used by the engine
 *  @memberof Audio */
let audioContext;

/** Play cached audio samples with given settings
 *  @param {Array}   sampleChannels - Array of arrays of samples to play (for stereo playback)
 *  @param {Number}  [volume=1] - How much to scale volume by
 *  @param {Number}  [rate=1] - The playback rate to use
 *  @param {Number}  [pan=0] - How much to apply stereo panning
 *  @param {Boolean} [loop=0] - True if the sound should loop when it reaches the end
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function playSamples(sampleChannels, volume=1, rate=1, pan=0, loop=0) 
{
    if (!soundEnable) return;

    // create audio context
    if (!audioContext)
        audioContext = new (window.AudioContext||webkitAudioContext);

    // fix stalled audio
    audioContext.resume();

    // prevent sounds from building up if they can't be played
    if (audioContext.state != 'running')
        return;

    // create buffer and source
    const buffer = audioContext.createBuffer(sampleChannels.length, sampleChannels[0].length, zzfxR), 
        source = audioContext.createBufferSource();

    // copy samples to buffer and setup source
    sampleChannels.forEach((c,i)=> buffer.getChannelData(i).set(c));
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;

    // create and connect gain node (createGain is more widley spported then GainNode construtor)
    const gainNode = audioContext.createGain();
    gainNode.gain.value = soundVolume*volume;
    gainNode.connect(audioContext.destination);

    // connect source to gain
    (
        window.StereoPannerNode ? // create pan node if possible
        source.connect(new StereoPannerNode(audioContext, {'pan':clamp(pan, -1, 1)}))
        : source
    )
    .connect(gainNode);

    // play and return sound
    source.start();
    return source;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.1.8 by Frank Force

/** Generate and play a ZzFX sound
 *  <br>
 *  <br><b><a href=https://killedbyapixel.github.io/ZzFX/>Create sounds using the ZzFX Sound Designer.</a></b>
 *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
 *  @return {Array} - Array of audio samples
 *  @memberof Audio */
const zzfx = (...zzfxSound) => playSamples([zzfxG(...zzfxSound)]);

/** Sample rate used for all ZzFX sounds
 *  @default 44100
 *  @memberof Audio */
const zzfxR = 44100; 

/** Generate samples for a ZzFX sound
 *  @memberof Audio */
function zzfxG
(
    // parameters
    volume = 1, randomness = .05, frequency = 220, attack = 0, sustain = 0,
    release = .1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0,
    pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0,
    bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0
)
{
    // init parameters
    let PI2 = PI*2, startSlide = slide *= 500 * PI2 / zzfxR / zzfxR, b=[],
        startFrequency = frequency *= (1 + randomness*rand(-1,1)) * PI2 / zzfxR,
        t=0, tm=0, i=0, j=1, r=0, c=0, s=0, f, length;
        
    // scale by sample rate
    attack = attack * zzfxR + 9; // minimum attack to prevent pop
    decay *= zzfxR;
    sustain *= zzfxR;
    release *= zzfxR;
    delay *= zzfxR;
    deltaSlide *= 500 * PI2 / zzfxR**3;
    modulation *= PI2 / zzfxR;
    pitchJump *= PI2 / zzfxR;
    pitchJumpTime *= zzfxR;
    repeatTime = repeatTime * zzfxR | 0;

    // generate waveform
    for (length = attack + decay + sustain + release + delay | 0;
        i < length; b[i++] = s)
    {
        if (!(++c%(bitCrush*100|0)))                      // bit crush
        {
            s = shape? shape>1? shape>2? shape>3?         // wave shape
                Math.sin((t%PI2)**3) :                    // 4 noise
                max(min(Math.tan(t),1),-1):               // 3 tan
                1-(2*t/PI2%2+2)%2:                        // 2 saw
                1-4*abs(Math.round(t/PI2)-t/PI2):         // 1 triangle
                Math.sin(t);                              // 0 sin
                
            s = (repeatTime ?
                    1 - tremolo + tremolo*Math.sin(PI2*i/repeatTime) // tremolo
                    : 1) *
                sign(s)*(abs(s)**shapeCurve) *            // curve 0=square, 2=pointy
                volume * soundVolume * (                  // envelope
                i < attack ? i/attack :                   // attack
                i < attack + decay ?                      // decay
                1-((i-attack)/decay)*(1-sustainVolume) :  // decay falloff
                i < attack  + decay + sustain ?           // sustain
                sustainVolume :                           // sustain volume
                i < length - delay ?                      // release
                (length - i - delay)/release *            // release falloff
                sustainVolume :                           // release volume
                0);                                       // post release
 
            s = delay ? s/2 + (delay > i ? 0 :            // delay
                (i<length-delay? 1 : (length-i)/delay) *  // release delay 
                b[i-delay|0]/2) : s;                      // sample delay
        }

        f = (frequency += slide += deltaSlide) *          // frequency
            Math.cos(modulation*tm++);                    // modulation
        t += f - f*noise*(1 - (Math.sin(i)+1)*1e9%2);     // noise

        if (j && ++j > pitchJumpTime)       // pitch jump
        {
            frequency += pitchJump;         // apply pitch jump
            startFrequency += pitchJump;    // also apply to start
            j = 0;                          // reset pitch jump time
        }

        if (repeatTime && !(++r % repeatTime)) // repeat
        {
            frequency = startFrequency;     // reset frequency
            slide = startSlide;             // reset slide
            j = j || 1;                     // reset pitch jump time
        }
    }
    
    return b;
}

///////////////////////////////////////////////////////////////////////////////
// ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force

/** Generate samples for a ZzFM song with given parameters
 *  @param {Array} instruments - Array of ZzFX sound paramaters
 *  @param {Array} patterns - Array of pattern data
 *  @param {Array} sequence - Array of pattern indexes
 *  @param {Number} [BPM=125] - Playback speed of the song in BPM
 *  @returns {Array} - Left and right channel sample data
 *  @memberof Audio */
function zzfxM(instruments, patterns, sequence, BPM = 125) 
{
  let instrumentParameters;
  let i;
  let j;
  let k;
  let note;
  let sample;
  let patternChannel;
  let notFirstBeat;
  let stop;
  let instrument;
  let attenuation;
  let outSampleOffset;
  let isSequenceEnd;
  let sampleOffset = 0;
  let nextSampleOffset;
  let sampleBuffer = [];
  let leftChannelBuffer = [];
  let rightChannelBuffer = [];
  let channelIndex = 0;
  let panning = 0;
  let hasMore = 1;
  let sampleCache = {};
  let beatLength = zzfxR / BPM * 60 >> 2;

  // for each channel in order until there are no more
  for (; hasMore; channelIndex++) {

    // reset current values
    sampleBuffer = [hasMore = notFirstBeat = outSampleOffset = 0];

    // for each pattern in sequence
    sequence.forEach((patternIndex, sequenceIndex) => {
      // get pattern for current channel, use empty 1 note pattern if none found
      patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];

      // check if there are more channels
      hasMore |= !!patterns[patternIndex][channelIndex];

      // get next offset, use the length of first channel
      nextSampleOffset = outSampleOffset + (patterns[patternIndex][0].length - 2 - !notFirstBeat) * beatLength;
      // for each beat in pattern, plus one extra if end of sequence
      isSequenceEnd = sequenceIndex == sequence.length - 1;
      for (i = 2, k = outSampleOffset; i < patternChannel.length + isSequenceEnd; notFirstBeat = ++i) {

        // <channel-note>
        note = patternChannel[i];

        // stop if end, different instrument or new note
        stop = i == patternChannel.length + isSequenceEnd - 1 && isSequenceEnd ||
            instrument != (patternChannel[0] || 0) | note | 0;

        // fill buffer with samples for previous beat, most cpu intensive part
        for (j = 0; j < beatLength && notFirstBeat;

            // fade off attenuation at end of beat if stopping note, prevents clicking
            j++ > beatLength - 99 && stop ? attenuation += (attenuation < 1) / 99 : 0
        ) {
          // copy sample to stereo buffers with panning
          sample = (1 - attenuation) * sampleBuffer[sampleOffset++] / 2 || 0;
          leftChannelBuffer[k] = (leftChannelBuffer[k] || 0) - sample * panning + sample;
          rightChannelBuffer[k] = (rightChannelBuffer[k++] || 0) + sample * panning + sample;
        }

        // set up for next note
        if (note) {
          // set attenuation
          attenuation = note % 1;
          panning = patternChannel[1] || 0;
          if (note |= 0) {
            // get cached sample
            sampleBuffer = sampleCache[
              [
                instrument = patternChannel[sampleOffset = 0] || 0,
                note
              ]
            ] = sampleCache[[instrument, note]] || (
                // add sample to cache
                instrumentParameters = [...instruments[instrument]],
                instrumentParameters[2] *= 2 ** ((note - 12) / 12),

                // allow negative values to stop notes
                note > 0 ? zzfxG(...instrumentParameters) : []
            );
          }
        }
      }

      // update the sample offset
      outSampleOffset = nextSampleOffset;
    });
  }

  return [leftChannelBuffer, rightChannelBuffer];
}