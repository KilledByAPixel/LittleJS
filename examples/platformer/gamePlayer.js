/*
    LittleJS Platformer Example - Player
    - Extends character class
    - Uses chracter physics system
    - Player can jump, shoot, roll, and throw grenades
    - Supports keyboard, mouse, and gamepad controlls
    - Keeps track of player deaths
*/

'use strict';

class Player extends Character
{
    update() 
    {
        // player controls
        this.holdingJump   = keyIsDown('ArrowUp') || gamepadIsDown(0);
        this.holdingShoot  = !isUsingGamepad && mouseIsDown(0) || keyIsDown('KeyZ') || gamepadIsDown(2);
        this.pressingThrow = mouseIsDown(1) || keyIsDown('KeyC') || gamepadIsDown(1);
        this.pressedDodge  = mouseIsDown(2) || keyIsDown('KeyX') || gamepadIsDown(3);

        // movement control
        this.moveInput = isUsingGamepad ? gamepadStick(0) : 
            vec2(keyIsDown('ArrowRight') - keyIsDown('ArrowLeft'), keyIsDown('ArrowUp') - keyIsDown('ArrowDown'));

        super.update();
    }

    kill()
    {
        ++deaths;
        super.kill();
    }
}