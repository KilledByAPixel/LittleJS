/**
 * LittleJS Audio Effects Plugin
 * - Web Audio effects with a wet/dry mix: filter, reverb, delay, distortion, compressor
 * - Route a sound through one with sound.output = effect.input
 * - Route everything with setAudioMasterEffect(effect.input, effect.output)
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
 * footstep.output = cave.input; // every play of this sound is in the cave
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
 * setAudioMasterEffect(muffle.input, muffle.output);
 * muffle.setFrequency(20000, .5); // sweep back to clear
 */
class AudioFilter extends AudioEffect
{
    /** Create a filter effect
     *  @param {string} [type] - lowpass, highpass, bandpass, notch, etc.
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
