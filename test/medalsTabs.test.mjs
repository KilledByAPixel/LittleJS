import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Medal, medalsInit, medalsReset } from '../dist/littlejs.esm.js';

// Two tabs of a game share one save: a tab loaded before another unlocked a medal still has it locked, and its own
// unlock wrote that over the save, so a medal earned in the other tab was lost; medals favour the player

test('a stale tab unlocking a medal keeps the unlock another tab saved, and reset still clears both', () =>
{
    medalsInit('TabMedals');
    new Medal(1, 'First');
    const second = new Medal(2, 'Second');

    // another tab, loaded at the same time, unlocks the first medal and saves
    localStorage.TabMedals = JSON.stringify({1: {name: 'First', unlocked: true}});

    second.unlock();
    const saved = JSON.parse(localStorage.TabMedals);
    assert.equal(saved[2].unlocked, true);
    assert.equal(saved[1].unlocked, true, 'the other tab\'s unlock is kept');

    medalsReset();
    const reset = JSON.parse(localStorage.TabMedals);
    assert.equal(reset[1].unlocked, false);
    assert.equal(reset[2].unlocked, false);
});
