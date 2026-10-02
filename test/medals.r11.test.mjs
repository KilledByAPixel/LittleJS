import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Medal, medalsInit } from '../dist/littlejs.esm.js';

// review round 11: while medalsInit waits for medals made later, an unlock keeps the saved entries of the rest
// its own file, so the medal list and save name start empty

test('an unlock before every medal is made keeps the saved unlocks of the medals still to come', () =>
{
    localStorage.WaitingMedals = JSON.stringify({0: {unlocked: true}, 1: {unlocked: false}, 2: {unlocked: true}});
    medalsInit('WaitingMedals');
    new Medal(0, 'First');
    new Medal(1, 'Second').unlock(); // unlocked while level 1 sets up, before medal 2 exists
    const later = new Medal(2, 'Later');
    assert.equal(later.unlocked, true, 'its saved unlock was kept for it');
});
