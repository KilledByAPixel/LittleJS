/*
    LittleJS Breakout Objects
*/

'use strict';

///////////////////////////////////////////////////////////////////////////////

class Paddle extends EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(8,1));

        // set to collide
        this.setCollision(1,1);
        this.mass = 0;
    }

    update()
    {
        // move to mouse
        this.pos.x = clamp(mousePos.x, levelSize.x - this.size.x/2, this.size.x/2);
    }
}

///////////////////////////////////////////////////////////////////////////////

class Block extends EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(4,2), 1, vec2(32,16), 0, randColor());

        // set to collide
        this.setCollision(1,1);
        this.mass = 0;
    }

    collideWithObject(o)              
    {
        // destroy block when hit with ball
        this.destroy();
        ++score;
        zzfx(...[,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01]);

        const color = this.color;
        new ParticleEmitter(
            this.pos, this.size, .1, 1e3, PI, // pos, emitSize, emitTime, emitRate, emiteCone
            0, vec2(16),              // tileIndex, tileSize
            this.color, this.color, // colorStartA, colorStartB
            this.color.scale(1,0), this.color.scale(1,0), // colorEndA, colorEndB
            .2, .4, .4, .1, .05,  // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            .99, .95, .4, PI, .1, // damping, angleDamping, gravityScale, particleCone, fadeRate, 
            1, 0, 1               // randomness, collide, additive, randomColorLinear, renderOrder
        );
        
        return 1;
    }
}

///////////////////////////////////////////////////////////////////////////////

class Ball extends EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(1), 0);

        // make a bouncy ball
        this.setCollision(1);
        this.velocity = vec2(randSign(), -1).scale(.2);
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
            this.velocity.y = max(abs(this.velocity.y), .2);
            this.bounce();
            return 0;
        }
        return 1;
    }

    bounce()
    {
        // speed up
        const speed = min(1.1*this.velocity.length(), 1);
        this.velocity = this.velocity.normalize(speed);
        zzfx(...[,,this.velocity.length()*1e3,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);
    }
}