/*
    LittleJS Breakout Objects
*/

'use strict';

// import module
import * as LJS from '../../dist/littlejs.esm.js';
const {tile, vec2, hsl} = LJS;

///////////////////////////////////////////////////////////////////////////////
// track score and number of bricks left
let score, brickCount, levelSize;
function reset(_levelSize)
{
    levelSize = _levelSize;
    score = brickCount = 0; 
}
export { score, brickCount, reset };

///////////////////////////////////////////////////////////////////////////////
// sound effects
const sound_start  = new LJS.Sound([,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04]);
const sound_break  = new LJS.Sound([,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01]);
const sound_bounce = new LJS.Sound([,,1e3,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);

///////////////////////////////////////////////////////////////////////////////
export class PhysicsObject extends LJS.EngineObject
{
    constructor(pos, size, tileInfo, angle, color)
    {
        super(pos, size, tileInfo, angle, color);
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Wall extends PhysicsObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, hsl(0,0,0));
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Paddle extends PhysicsObject
{
    constructor(pos)
    {
        super(pos, vec2(5,.5));
    }

    update()
    {
        // control with gamepad or mouse
        this.pos.x = LJS.isUsingGamepad ? this.pos.x + LJS.gamepadStick(0).x : LJS.mousePos.x;

        // keep paddle in bounds of level
        this.pos.x = LJS.clamp(this.pos.x, this.size.x/2, levelSize.x - this.size.x/2);
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Brick extends PhysicsObject 
{
    constructor(pos)
    {
        super(pos, vec2(2,1), tile(1, vec2(32,16)), 0, LJS.randColor());
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
        new LJS.ParticleEmitter(
            this.pos, 0,                          // pos, angle
            this.size, .1, 200, 3.14,             // emitSize, emitTime, emitRate, emitCone
            tile(0, 16),                          // tileIndex, tileSize
            color1, color2,                       // colorStartA, colorStartB
            color1.scale(1,0), color2.scale(1,0), // colorEndA, colorEndB
            .3, .8, .3, .05, .05,// time, sizeStart, sizeEnd, speed, angleSpeed
            .99, .95, .4, 3.14,  // damp, angleDamp, gravity, cone
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
export class Ball extends PhysicsObject 
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
        this.trailEffect = new LJS.ParticleEmitter(
            this.pos, 0,                          // pos, angle
            this.size, 0, 80, 3.14,               // emitSize, emitTime, emitRate, emitCone
            tile(0, 16),                          // tileIndex, tileSize
            color, color,                         // colorStartA, colorStartB
            color.scale(0), color.scale(0),       // colorEndA, colorEndB
            2, .4, 1, .001, .05,// time, sizeStart, sizeEnd, speed, angleSpeed
            .99, .95, 0, 3.14,  // damp, angleDamp, gravity, cone
            .1, .5, 0, 1        // fade, randomness, collide, additive
        );
        this.addChild(this.trailEffect);
        sound_start.play(this.pos);
    }

    collideWithObject(o)              
    {
        // prevent colliding with paddle if moving upwards
        const isPaddle = o instanceof Paddle;
        if (isPaddle && this.velocity.y > 0)
            return false;

        if (isPaddle)
        {
            // put english on the ball when it collides with paddle
            this.velocity = this.velocity.rotate(.2 * (o.pos.x - this.pos.x));
            this.velocity.y = LJS.max(-this.velocity.y, .2);

            // speed up
            const speed = LJS.min(1.04*this.velocity.length(), .5);
            this.velocity = this.velocity.normalize(speed);
            sound_bounce.play(this.pos, 1, speed*2);
            
            return false; // prevent default collision code
        }
        
        return true;
    }
}