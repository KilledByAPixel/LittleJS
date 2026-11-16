import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as LJS from '../dist/littlejs.esm.js';

// The platformer's character in its real level, headless: its wall test, changed in three review passes running, and
// the level's edges. A wall is a solid tile or a solid object beside it, not the tile layer, which is an object whose
// box covers the level; falling in open air with no sideways speed is no wall

LJS.setHeadlessMode(true);
LJS.setEngineManualStep(true);
globalThis.fetch = async ()=> ({ ok: true,
    text: async ()=> fs.readFileSync('examples/platformer/gameLevelData.json', 'utf8') });
const Game = await import('../examples/platformer/game.js');
const GameCharacter = await import('../examples/platformer/gameCharacter.js');
const GameLevel = await import('../examples/platformer/gameLevel.js');
for (let i = 0; i < 100 && !Game.player; ++i) await new Promise((resolve)=> setTimeout(resolve, 30));
const { vec2 } = LJS;

// a cell of open air, nothing solid two cells round it, in the lower left where the tile layer's box is
function openAir()
{
    for (let x = 20; x < 120; ++x)
    for (let y = 30; y > 8; --y)
    {
        let clear = true;
        for (let dx = -2; dx <= 2; ++dx) for (let dy = -3; dy <= 3; ++dy)
            LJS.tileCollisionGetData(vec2(x + .5 + dx, y + .5 + dy)) && (clear = false);
        if (clear) return vec2(x + .5, y + .5);
    }
}

// the player driven for a frame with its input set
function drive(moveInput, holdingJump, wasHoldingJump=false)
{
    const p = Game.player;
    p.update = function()
    {
        this.moveInput = moveInput; this.holdingJump = holdingJump; this.wasHoldingJump = wasHoldingJump;
        GameCharacter.Character.prototype.update.call(this);
    };
    LJS.engineStep(1);
    return p;
}

test('falling in open air with no sideways speed is no wall: a direction and a jump give no jump', ()=>
{
    const spot = openAir(), p = Game.player;
    for (const side of [1, -1])
    {
        p.pos = spot.copy(); p.velocity = vec2(0, -.05);
        drive(vec2(side, 0), true);
        assert.equal(p.climbingWall, 0, 'no wall ' + side);
        assert.ok(p.velocity.y < 0, 'still falling ' + p.velocity.y);
    }
});

test('falling against a solid tile is a wall, and its jump a wall jump', ()=>
{
    const p = Game.player, fg = GameLevel.foregroundTileLayer;
    // a wall: a solid cell with open air to its left, two cells up
    let at;
    for (let x = 5; x < GameLevel.levelSize.x - 5 && !at; ++x)
    for (let y = 5; y < GameLevel.levelSize.y - 5 && !at; ++y)
        if (LJS.tileCollisionGetData(vec2(x + .5, y + .5)) > 0 && LJS.tileCollisionGetData(vec2(x + .5, y + 1.5)) > 0 &&
            !LJS.tileCollisionGetData(vec2(x - .5, y + .5)) && !LJS.tileCollisionGetData(vec2(x - .5, y + 1.5)) &&
            !LJS.tileCollisionGetData(vec2(x - .5, y - .5)))
            at = vec2(x - p.size.x / 2 - .01, y + 1);
    assert.ok(at, 'a wall in the level');
    p.pos = at.copy(); p.velocity = vec2(0, -.05);
    drive(vec2(1, 0), false);
    assert.equal(p.climbingWall, 1);
    drive(vec2(1, 0), true);
    assert.ok(p.velocity.y > .2, 'a wall jump ' + p.velocity.y);
    assert.ok(fg); // the level's foreground layer is the collision layer
});

test('the player can not walk off the level\'s left edge', ()=>
{
    const p = Game.player;
    p.pos = vec2(1.5, GameLevel.playerStartPos.y); p.velocity = vec2();
    for (let i = 0; i < 120; ++i) drive(vec2(-1, 0), false);
    assert.ok(p.pos.x > 0, 'inside the level ' + p.pos.x);
    assert.ok(!p.isDead(), 'and alive');
});

test('the level\'s edge walls are no wall to climb: holding toward one with jump held goes no higher', ()=>
{
    const p = Game.player;
    for (const side of [-1, 1])
    {
        const x = side < 0 ? 1.5 : GameLevel.levelSize.x - 1.5;
        p.pos = vec2(x, GameLevel.playerStartPos.y); p.velocity = vec2();
        // on the ground first, then held against the edge with jump held, as long as a player might
        for (let i = 0; i < 60; ++i) drive(vec2(side, 0), false);
        const ground = p.pos.y;
        let top = ground;
        for (let i = 0; i < 600; ++i)
        {
            drive(vec2(side, 0), true, i > 0);
            assert.equal(p.climbingWall, 0, 'no wall at the edge ' + side);
            top = Math.max(top, p.pos.y);
        }
        assert.ok(top < ground + 6, 'one jump high, not a climb: ' + (top - ground));
    }
});
