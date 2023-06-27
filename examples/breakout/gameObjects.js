/*
    LittleJS Breakout Objects
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
class Paddle extends EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(5,.5));

        // set to collide
        this.setCollision();
        this.mass = 0;
    }

    update()
    {
        if (isUsingGamepad)
        {
            // control with gamepad
            this.pos.x += gamepadStick(0).x;
        }
        else
        {
            // move to mouse
            this.pos.x = mousePos.x;
        }
        this.pos.x = clamp(this.pos.x, this.size.x/2, levelSize.x - this.size.x/2);
        super.update();
    }
}

///////////////////////////////////////////////////////////////////////////////
class Brick extends EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(2,1), 1, vec2(32,16), 0, randColor());

        // set to collide
        this.setCollision();
        this.mass = 0;
        ++brickCount;
    }

    collideWithObject(o)              
    {
        // destroy brick when hit with ball
        this.destroy();
        ++score;
        --brickCount;
        sound_break.play(this.pos);

        const color1 = this.color;
        const color2 = color1.lerp(new Color, .5);
        new ParticleEmitter(
            this.pos, 0,                          // emitPos, emitAngle
            this.size, .1, 200, PI,               // emitSize, emitTime, emitRate, emiteCone
            0, vec2(16),                          // tileIndex, tileSize
            color1, color2,                       // colorStartA, colorStartB
            color1.scale(1,0), color2.scale(1,0), // colorEndA, colorEndB
            .2, .5, 1, .05, .05,// time, sizeStart, sizeEnd, speed, angleSpeed
            .99, .95, .4, PI,   // damping, angleDamping, gravityScale, cone
            .1, .5, 0, 1        // fadeRate, randomness, collide, additive
        );
        
        return 1;
    }
}

///////////////////////////////////////////////////////////////////////////////
class Ball extends EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(.5), 0);

        // make a bouncy ball
        this.setCollision();
        this.velocity = vec2(randSign(), -1).scale(.1);
        this.elasticity = 1;
        this.damping = 1;
    }

    update()
    {
        if (this.pos.y < 0)
        {
            // destroy ball if it goes below the level
            ball = 0;
            this.destroy();
        }

        // bounce on sides and top
        const nextPos = this.pos.x + this.velocity.x;
        if (nextPos - this.size.x/2 < 0 || nextPos + this.size.x/2 > levelSize.x)
        {
            this.velocity.x *= -1;
            this.bounce();
        }
        if (this.pos.y + this.velocity.y > levelSize.y)
        {
            this.velocity.y *= -1;
            this.bounce();
        }

        // update physics
        super.update();
    }

    collideWithObject(o)              
    {
        if (o == paddle && this.velocity.y < 0)
        {
            // put english on the ball when it collides with paddle
            this.velocity = this.velocity.rotate(.2 * (this.pos.x - o.pos.x));
            this.velocity.y = max(-this.velocity.y, .2);
            this.bounce();
            return 0;
        }
        return 1;
    }

    bounce()
    {
        // speed up
        const speed = min(1.05*this.velocity.length(), .5);
        this.velocity = this.velocity.normalize(speed);

        // scale bounce sound pitch by speed
        sound_bounce.play(this.pos, 1, speed);
    }
}