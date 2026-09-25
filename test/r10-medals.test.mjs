import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Medal, medals, medalsInit } from '../dist/littlejs.esm.js';

// review round 10: calling medalsInit before the medals are made keeps the saved unlocks
// its own file, so the medal list and save name start empty

test('medals made after medalsInit keep their saved unlocks, and the save keeps them meanwhile', () =>
{
    localStorage.LateMedals = JSON.stringify({0: {unlocked: true}, 1: {unlocked: false}});
    medalsInit('LateMedals');
    assert.ok(JSON.parse(localStorage.LateMedals)[0]?.unlocked, 'the save still has the unlock before the medal exists');
    const win = new Medal(0, 'Win', 'Beat it'), lose = new Medal(1, 'Lose');
    assert.equal(win.unlocked, true, 'restored from the save');
    assert.equal(lose.unlocked, false);
    assert.equal(Object.keys(medals).length, 2);
});
