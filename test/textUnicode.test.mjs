import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './vmEngine.mjs';

// Text is read the way a reader counts characters: an emoji, joiners and all, is one glyph of an image font, a
// letter with a combining accent is its letter, and Windows line endings break lines as \n does, in image fonts,
// canvas text and 3D text alike.

const { run } = loadEngine();
run(`setHeadlessMode(true);
    var glyphs = [];
    ImageFont.prototype.getGlyphPos = function(index, pos) { glyphs.push(index); return pos; };
    drawTile = ()=> {}; // which glyph is drawn is under test, not the drawing
    var font = new ImageFont(tile(0, 8, new TextureInfo({width: 128, height: 128})));
    var glyphsOf = (text)=> { glyphs = []; font.drawTextScreen(text, vec2(), 8, false, WHITE, false, {}); return glyphs.slice().reverse(); };`);
const glyphsOf = (text)=> JSON.parse(run(`JSON.stringify(glyphsOf(${JSON.stringify(text)}))`));
const code = (c)=> c.charCodeAt(0) - 32, box = 95;

test('an image font draws an emoji, joiners and all, as one box, and an accented letter as its letter', ()=>
{
    assert.deepEqual(glyphsOf('A\u{1F600}'), [code('A'), box]);
    assert.deepEqual(glyphsOf('\u{1F468}‍\u{1F469}‍\u{1F467}'), [box], 'a family is one');
    assert.deepEqual(glyphsOf('é'), [code('e')], 'e with a combining accent');
    assert.deepEqual(glyphsOf('hi!'), [code('h'), code('i'), code('!')]);
});

test('a Windows line ending breaks a line as \n does', ()=>
{
    // each line's glyphs are drawn last first, so reversed the second line comes first; no box for the \r
    assert.deepEqual(glyphsOf('ab\r\ncd'), [code('c'), code('d'), code('a'), code('b')]);
    // the canvas text draws each line without the \r
    const lines = JSON.parse(run(`(()=> { const drawn = [];
        const context = new Proxy({ save() {}, restore() {}, translate() {}, rotate() {}, measureText: ()=> ({width: 1}),
            fillText: (t)=> drawn.push(t), strokeText() {} }, { get: (o, k)=> k in o ? o[k] : undefined, set: ()=> true });
        drawTextScreen('ab\\r\\ncd', vec2(), 10, WHITE, 0, BLACK, 'right', 'arial', '', undefined, 0, context);
        return JSON.stringify(drawn); })()`));
    assert.deepEqual(lines, ['ab', 'cd']);
});
