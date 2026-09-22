/**
 * LittleJS Audio Effects Plugin
 * - Web Audio effects with a wet/dry mix: filter, reverb, delay, distortion, compressor
 * - Route a sound through one with sound.output = effect
 * - Route everything with setAudioMasterEffect(effect)
 * - Chain effects with effect.connect(nextEffect)
 * - Create effects after engineInit, in gameInit or later
 * @namespace AudioEffects
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

// ramp an audio param to a value, cancelling anything already scheduled so stacked calls don't fight
function audioParamRamp(param, value, fadeTime=0)
{
    ASSERT(fadeTime >= 0, 'fadeTime must be positive or zero');
    const startTime = audioContext.currentTime;
    param.cancelScheduledValues(startTime);
    if (fadeTime)
    {
        param.setValueAtTime(param.value, startTime);
        param.linearRampToValueAtTime(value, startTime + fadeTime);
    }
    else
        param.value = value;
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Base class for audio effects, an input and output with a wet/dry mix between them
 * - Sounds connect to input, output goes to the master gain until connect() moves it
 * - Subclasses put their nodes between input and the wet gain with connectEffect
 * @memberof AudioEffects
 * @example
 * const cave = new AudioReverb(3, 2);
 * footstep.output = cave; // every play of this sound is in the cave
 */
class AudioEffect
{
    /** Create an audio effect
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(mix=1)
    {
        ASSERT(isNumber(mix), 'mix must be a number');

        /** @property {GainNode} - Connect sounds to this node */
        this.input = audioContext.createGain();
        /** @property {GainNode} - This node carries the mixed result */
        this.output = audioContext.createGain();
        /** @property {GainNode} - Level of the unprocessed signal */
        this.dryGain = audioContext.createGain();
        /** @property {GainNode} - Level of the processed signal */
        this.wetGain = audioContext.createGain();
        /** @property {number} - Wet/dry balance, 0 is fully dry and 1 is fully wet */
        this.mix = mix;

        this.input.connect(this.dryGain).connect(this.output);
        this.wetGain.connect(this.output);
        this.setMix(mix);

        // send the result to the speakers, connect() moves it into a chain instead
        if (audioMasterGain)
            this.output.connect(audioMasterGain);
        else
            ASSERT(!soundEnable || headlessMode, 'Create audio effects after engineInit, in gameInit or later');
    }

    /** Set the wet/dry balance
     *  @param {number} mix - 0 is fully dry and 1 is fully wet
     *  @param {number} [fadeTime] - Seconds to ramp over so the change doesn't click */
    setMix(mix, fadeTime=0)
    {
        ASSERT(isNumber(mix), 'mix must be a number');
        this.mix = mix = clamp(mix);
        audioParamRamp(this.dryGain.gain, 1-mix, fadeTime);
        audioParamRamp(this.wetGain.gain, mix, fadeTime);
    }

    /** Send this effect's output into another effect or audio node instead of the speakers
     *  @param {AudioEffect|AudioNode} target - The next effect in the chain, or any audio node
     *  @return {AudioEffect|AudioNode} - The target, so chains read left to right */
    connect(target)
    {
        ASSERT(target && (target instanceof AudioEffect || typeof target.connect === 'function'), 'target must be an AudioEffect or AudioNode');
        this.output.disconnect();
        this.output.connect(target instanceof AudioEffect ? target.input : target);
        return target;
    }

    /** Stop sending this effect's output anywhere */
    disconnect() { this.output.disconnect(); }

    /** Wire nodes between the input and the wet gain, for subclasses
     *  @param {AudioNode} first - Node the input connects to
     *  @param {AudioNode} [last=first] - Node that connects to the wet gain
     *  @protected */
    connectEffect(first, last=first)
    {
        this.input.connect(first);
        last.connect(this.wetGain);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Filter effect, muffle sounds underwater or behind a wall
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const muffle = new AudioFilter('lowpass', 400);
 * setAudioMasterEffect(muffle);
 * muffle.setFrequency(20000, .5); // sweep back to clear
 */
class AudioFilter extends AudioEffect
{
    /** Create a filter effect
     *  @param {BiquadFilterType} [type] - lowpass, highpass, bandpass, notch, etc.
     *  @param {number} [frequency] - Cutoff or center frequency in Hz
     *  @param {number} [q] - Resonance at the cutoff, higher is sharper
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(type='lowpass', frequency=1000, q=1, mix=1)
    {
        super(mix);
        ASSERT(isNumber(frequency) && frequency >= 0, 'frequency must be positive or zero');
        ASSERT(isNumber(q), 'q must be a number');

        /** @property {BiquadFilterNode} - The filter node */
        this.node = audioContext.createBiquadFilter();
        this.node.type = type;
        this.node.frequency.value = frequency;
        this.node.Q.value = q;
        this.connectEffect(this.node);
    }

    /** Set the cutoff or center frequency
     *  @param {number} frequency - Frequency in Hz
     *  @param {number} [fadeTime] - Seconds to sweep over */
    setFrequency(frequency, fadeTime=0)
    {
        ASSERT(isNumber(frequency) && frequency >= 0, 'frequency must be positive or zero');
        audioParamRamp(this.node.frequency, frequency, fadeTime);
    }

    /** Set the resonance at the cutoff
     *  @param {number} q - Higher is sharper
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setQ(q, fadeTime=0)
    {
        ASSERT(isNumber(q), 'q must be a number');
        audioParamRamp(this.node.Q, q, fadeTime);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Reverb effect, puts sounds in a room, cave, or hall
 * - The impulse response is generated, no audio file needed
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const hall = new AudioReverb(4, 1.5, .4);
 * footstep.output = hall;
 */
class AudioReverb extends AudioEffect
{
    /** Create a reverb effect
     *  @param {number} [duration] - Seconds until the reverb tail is silent
     *  @param {number} [decay] - How quickly the tail fades, higher is faster
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(duration=2, decay=2, mix=.5)
    {
        super(mix);
        ASSERT(isNumber(duration) && duration > 0, 'duration must be positive');
        ASSERT(isNumber(decay) && decay >= 0, 'decay must be positive or zero');

        /** @property {ConvolverNode} - The convolver node */
        this.node = audioContext.createConvolver();
        this.node.buffer = this.createImpulse(duration, decay);
        this.connectEffect(this.node);
    }

    /** Build a stereo impulse response of decaying noise
     *  @param {number} duration - Seconds until silence
     *  @param {number} decay - How quickly it fades, higher is faster
     *  @return {AudioBuffer} */
    createImpulse(duration, decay)
    {
        const sampleRate = audioContext.sampleRate;
        const length = max(1, sampleRate * duration | 0);
        const buffer = audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 2; channel--;)
        {
            const samples = buffer.getChannelData(channel);
            for (let i = length; i--;)
                samples[i] = rand(-1, 1) * (1 - i/length) ** decay;
        }
        return buffer;
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Delay effect, echoes that repeat and fade
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const canyon = new AudioDelay(.4, .5);
 * shout.output = canyon;
 */
class AudioDelay extends AudioEffect
{
    /** Create a delay effect
     *  @param {number} [time] - Seconds between echoes, up to 5
     *  @param {number} [feedback] - How much of each echo repeats, 0 to .95
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(time=.3, feedback=.4, mix=.5)
    {
        super(mix);

        /** @property {DelayNode} - The delay node */
        this.node = audioContext.createDelay(5);
        /** @property {GainNode} - How much of the delayed signal feeds back in */
        this.feedbackGain = audioContext.createGain();
        this.node.connect(this.feedbackGain).connect(this.node);
        this.connectEffect(this.node);
        this.setTime(time);
        this.setFeedback(feedback);
    }

    /** Set the time between echoes
     *  @param {number} time - Seconds, up to 5
     *  @param {number} [fadeTime] - Seconds to ramp over, pitch bends while it moves */
    setTime(time, fadeTime=0)
    {
        ASSERT(isNumber(time) && time >= 0 && time <= 5, 'time must be between 0 and 5');
        audioParamRamp(this.node.delayTime, time, fadeTime);
    }

    /** Set how much of each echo repeats, clamped below 1 so it always dies out
     *  @param {number} feedback - 0 to .95
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setFeedback(feedback, fadeTime=0)
    {
        ASSERT(isNumber(feedback), 'feedback must be a number');
        audioParamRamp(this.feedbackGain.gain, clamp(feedback, 0, .95), fadeTime);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Distortion effect, overdrive for radios, damaged robots, and engines
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const radio = new AudioDistortion(.8);
 * voice.output = radio;
 */
class AudioDistortion extends AudioEffect
{
    /** Create a distortion effect
     *  @param {number} [amount] - How hard to drive the signal, 0 is clean and 1 is crushed
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(amount=.5, mix=1)
    {
        super(mix);

        /** @property {WaveShaperNode} - The wave shaper node */
        this.node = audioContext.createWaveShaper();
        this.node.oversample = '2x';
        /** @property {number} - How hard the signal is driven, 0 is clean and 1 is crushed */
        this.amount = amount;
        this.setAmount(amount);
        this.connectEffect(this.node);
    }

    /** Set how hard to drive the signal, rebuilds the shaping curve
     *  @param {number} amount - 0 is clean and 1 is crushed */
    setAmount(amount)
    {
        ASSERT(isNumber(amount), 'amount must be a number');
        this.amount = amount = clamp(amount);

        // soft clip curve, drive grows with the square of amount so low values stay subtle
        const drive = 100 * amount * amount;
        const samples = 256;
        const curve = new Float32Array(samples);
        for (let i = samples; i--;)
        {
            const x = i * 2 / (samples - 1) - 1;
            curve[i] = (1 + drive) * x / (1 + drive * abs(x));
        }
        this.node.curve = curve;
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Compressor effect, evens out loud and quiet so many sounds at once don't clip
 * - Meant for the master bus, it is not on by default
 * @extends AudioEffect
 * @memberof AudioEffects
 * @example
 * const compressor = new AudioCompressor;
 * setAudioMasterEffect(compressor);
 */
class AudioCompressor extends AudioEffect
{
    /** Create a compressor effect
     *  @param {number} [threshold] - Level in dB above which the signal is reduced
     *  @param {number} [ratio] - How much to reduce it, 12 means 12 dB in becomes 1 dB out
     *  @param {number} [mix] - Wet/dry balance, 0 is fully dry and 1 is fully wet */
    constructor(threshold=-24, ratio=12, mix=1)
    {
        super(mix);
        ASSERT(isNumber(threshold), 'threshold must be a number');
        ASSERT(isNumber(ratio) && ratio >= 1, 'ratio must be 1 or more');

        /** @property {DynamicsCompressorNode} - The compressor node */
        this.node = audioContext.createDynamicsCompressor();
        this.node.threshold.value = threshold;
        this.node.ratio.value = ratio;
        this.connectEffect(this.node);
    }

    /** Set the level above which the signal is reduced
     *  @param {number} threshold - Level in dB
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setThreshold(threshold, fadeTime=0)
    {
        ASSERT(isNumber(threshold), 'threshold must be a number');
        audioParamRamp(this.node.threshold, threshold, fadeTime);
    }

    /** Set how much the signal is reduced above the threshold
     *  @param {number} ratio - 1 is no reduction, 20 is a hard limit
     *  @param {number} [fadeTime] - Seconds to ramp over */
    setRatio(ratio, fadeTime=0)
    {
        ASSERT(isNumber(ratio) && ratio >= 1, 'ratio must be 1 or more');
        audioParamRamp(this.node.ratio, ratio, fadeTime);
    }
}
