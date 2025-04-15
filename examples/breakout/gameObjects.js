/*
    LittleJS Breakout Objects
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////
class PhysicsObject extends EngineObject
{
    constructor(pos, size, tileInfo, angle, color)
    {
        super(pos, size, tileInfo, angle, color);
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }
}

///////////////////////////////////////////////////////////////////////////////
class Wall extends PhysicsObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, new Color(0,0,0,0));
    }
}

///////////////////////////////////////////////////////////////////////////////
class Paddle extends PhysicsObject
{
    constructor(pos)
    {
        super(pos, vec2(5,.5));
    }

    update()
    {
        // control with gamepad or mouse
        this.pos.x = isUsingGamepad ? this.pos.x + gamepadStick(0).x : mousePos.x;

        // keep paddle in bounds of level
        this.pos.x = clamp(this.pos.x, this.size.x/2, levelSize.x - this.size.x/2);
    }
}

///////////////////////////////////////////////////////////////////////////////
class Brick extends PhysicsObject 
{
    constructor(pos)
    {
        super(pos, vec2(2,1), tile(1, vec2(32,16)), 0, randColor());
        ++brickCount;
    }

    collideWithObject(o)              
    {
        // destroy brick when hit with ball
        this.destroy();
        ++score;
        --brickCount;
        sound_break.play(this.pos);

        // make explosion effect
        const color1 = this.color;
        const color2 = color1.lerp(hsl(), .5);
        new ParticleEmitter(
            this.pos, 0,                          // pos, angle
            this.size, .1, 200, PI,               // emitSize, emitTime, emitRate, emitCone
            tile(0, 16),                          // tileIndex, tileSize
            color1, color2,                       // colorStartA, colorStartB
            color1.scale(1,0), color2.scale(1,0), // colorEndA, colorEndB
            .3, .8, .3, .05, .05,// time, sizeStart, sizeEnd, speed, angleSpeed
            .99, .95, .4, PI,    // damp, angleDamp, gravity, cone
            .1, .8, 0, 1         // fade, randomness, collide, additive
        );

        // set ball trail color
        if (o.trailEffect)
        {
            o.trailEffect.colorStartA = this.color; 
            o.trailEffect.colorStartB = this.color.lerp(hsl(), .5);
        }
        
        return 1;
    }
}

///////////////////////////////////////////////////////////////////////////////
class Ball extends PhysicsObject 
{
    constructor(pos)
    {
        super(pos, vec2(.5), tile(0));

        // make a bouncy ball
        this.velocity = vec2(0, -.1);
        this.elasticity = 1;
        this.mass = 1;
        
        // attach a trail effect
        const color = hsl(0,0,.2);
        this.trailEffect = new ParticleEmitter(
            this.pos, 0,                          // pos, angle
            this.size, 0, 80, PI,                 // emitSize, emitTime, emitRate, emitCone
            tile(0, 16),                          // tileIndex, tileSize
            color, color,                         // colorStartA, colorStartB
            color.scale(0), color.scale(0),       // colorEndA, colorEndB
            2, .4, 1, .001, .05,// time, sizeStart, sizeEnd, speed, angleSpeed
            .99, .95, 0, PI,    // damp, angleDamp, gravity, cone
            .1, .5, 0, 1        // fade, randomness, collide, additive
        );
        this.addChild(this.trailEffect);
    }

    update()
    {
        if (this.pos.y < -1)
        {
            // destroy ball if it goes below the level
            ball = 0;
            this.destroy();
        }

        // update physics
        super.update();
    }

    collideWithObject(o)              
    {
        // prevent colliding with paddle if moving upwards
        if (o == paddle && this.velocity.y > 0)
            return false;

        if (o == paddle)
        {
            // put english on the ball when it collides with paddle
            this.velocity = this.velocity.rotate(.2 * (o.pos.x - this.pos.x));
            this.velocity.y = max(-this.velocity.y, .2);

            // speed up
            const speed = min(1.04*this.velocity.length(), .5);
            this.velocity = this.velocity.normalize(speed);
            sound_bounce.play(this.pos, 1, speed*2);
            
            return false; // prevent default collision code
        }
        
        return true;
    }
}