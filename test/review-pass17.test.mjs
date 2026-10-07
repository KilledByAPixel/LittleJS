import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeSaveData, readSaveData } from '../dist/littlejs.esm.js';

// review pass 17, the small ones

test('save data whose JSON is nothing is not written, and the old save stays', () =>
{
    assert.equal(writeSaveData('pass17', {best: 3}), true);
    const warn = console.warn, said = [];
    console.warn = (...a)=> said.push(a.join(' '));
    let written;
    try { written = writeSaveData('pass17', {toJSON() {}}); }
    finally { console.warn = warn; }
    assert.equal(written, false);
    assert.equal(said.length, 1, 'it says so');
    assert.deepEqual(readSaveData('pass17'), {best: 3});
});
