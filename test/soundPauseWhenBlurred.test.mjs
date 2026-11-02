import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// soundPauseWhenBlurred: all sound pauses while the window does not have focus, and comes back with it

// each engine's audio context records its suspends and resumes, and the test sets the window's focus
test('with soundPauseWhenBlurred, losing focus pauses the sound and getting it back resumes it', () =>
{
    const { run, context } = loadEngine({ audioCalls: [] }, `
        audioContext.suspend = ()=> { audioContext.state = 'suspended'; audioCalls.push('suspend'); };
        audioContext.resume = ()=> { audioContext.state = 'running'; audioCalls.push('resume');
            return Promise.resolve(); };`);
    let focus = true;
    context.document.hasFocus = ()=> focus;

    focus = false;
    run('audioPageChange()');
    assert.deepEqual(context.audioCalls, [], 'off by default, the sound plays on');

    run('setSoundPauseWhenBlurred(true); audioPageChange(); audioPageChange()');
    assert.deepEqual(context.audioCalls, ['suspend'], 'paused once');
    assert.equal(run('zzfx(1)'), undefined, 'a new sound does not wake it');
    assert.deepEqual(context.audioCalls, ['suspend']);

    focus = true;
    run('audioPageChange()');
    assert.deepEqual(context.audioCalls, ['suspend', 'resume'], 'back with the focus');
});

test('a page hidden and blurred stays paused until it is both shown and focused', () =>
{
    const { run, context } = loadEngine({ audioCalls: [] }, `
        audioContext.suspend = ()=> { audioContext.state = 'suspended'; audioCalls.push('suspend'); };
        audioContext.resume = ()=> { audioContext.state = 'running'; audioCalls.push('resume');
            return Promise.resolve(); };`);
    let focus = false;
    context.document.hasFocus = ()=> focus;
    run('setSoundPauseWhenBlurred(true)');

    context.document.hidden = true;
    run('audioPageChange()');
    context.document.hidden = false;
    run('audioPageChange()');
    assert.deepEqual(context.audioCalls, ['suspend'], 'shown but still without focus');

    focus = true;
    run('audioPageChange()');
    assert.deepEqual(context.audioCalls, ['suspend', 'resume']);
});

test('the setters take effect at once, with no focus change', () =>
{
    const { run, context } = loadEngine({ audioCalls: [] }, `
        audioContext.suspend = ()=> { audioContext.state = 'suspended'; audioCalls.push('suspend'); };
        audioContext.resume = ()=> { audioContext.state = 'running'; audioCalls.push('resume');
            return Promise.resolve(); };`);
    context.document.hasFocus = ()=> false;

    run('setSoundPauseWhenBlurred(true)');
    assert.deepEqual(context.audioCalls, ['suspend'], 'turned on while blurred, it pauses');
    run('setSoundPauseWhenBlurred(false)');
    assert.deepEqual(context.audioCalls, ['suspend', 'resume'], 'turned off, it plays again');
});
