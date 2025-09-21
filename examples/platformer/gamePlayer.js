/*
    LittleJS Platformer Example - Player
    - Extends character class
    - Uses character physics system
    - Player can jump, shoot, roll, and throw grenades
    - Supports keyboard, mouse, and gamepad controls
    - Keeps track of player deaths
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameCharacter from './gameCharacter.js';
import * as Game from './game.js';

export class Player extends GameCharacter.Character
{
    update()
    {
        // movement control
        this.moveInput     = LJS.isUsingGamepad ? LJS.gamepadStick(0) : LJS.keyDirection();
        this.holdingJump   = LJS.keyIsDown('ArrowUp') || LJS.gamepadIsDown(0);
        this.holdingShoot  = !LJS.isUsingGamepad && LJS.mouseIsDown(0) || LJS.keyIsDown('KeyZ') || LJS.gamepadIsDown(2);
        this.pressingThrow = LJS.keyIsDown('KeyC') || LJS.mouseIsDown(1) || LJS.gamepadIsDown(1);
        this.pressedDodge  = LJS.keyIsDown('KeyX') || LJS.mouseIsDown(2) || LJS.gamepadIsDown(3);
        super.update();
    }

    kill()
    {
        Game.addToDeaths();
        super.kill();
    }
}