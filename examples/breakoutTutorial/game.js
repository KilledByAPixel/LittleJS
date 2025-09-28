/*
    Little JS Breakout Tutorial
    - Shows how to make a simple breakout game
    - Includes sound and particles
    - Control with mouse or touch
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
const {vec2, rgb} = LJS;

///////////////////////////////////////////////////////////////////////////////

// globals
const levelSize = vec2(38, 20); // size of play area
let score = 0; // start score at 0
let ball; // keep track of ball object
let paddle; // keep track of player paddle

// sound effects
const sound_bounce = new LJS.Sound([,,1e3,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06], 0);
const sound_break  = new LJS.Sound([,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01], 0);
const sound_start  = new LJS.Sound([,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04]);

///////////////////////////////////////////////////////////////////////////////

class Paddle extends LJS.EngineObject
{
    constructor()
    {
        super(vec2(0,1), vec2(6,.5)); // set object position and size
        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
    }

    update()
    {
        this.pos.x = LJS.mousePos.x; // move paddle to mouse
        
        // clamp paddle to level size
        this.pos.x = LJS.clamp(this.pos.x, this.size.x/2, levelSize.x - this.size.x/2);
    }
}

class Ball extends LJS.EngineObject 
{
    constructor(pos)
    {
        super(pos, vec2(.5)); // set object position and size

        this.velocity = vec2(-.1, -.1); // give ball some movement
        this.setCollision(); // make object collide
        this.restitution = 1; // make object bounce
    }
    collideWithObject(o)              
    {
        // prevent colliding with paddle if moving upwards
        if (o == paddle && this.velocity.y > 0)
            return false;

        // speed up
        const speed = LJS.min(1.04*this.velocity.length(), .5);
        this.velocity = this.velocity.normalize(speed);

        // play bounce sound with pitch scaled by speed
        sound_bounce.play(this.pos, 1, speed);

        if (o == paddle)
        {
            // control bounce angle when ball collides with paddle
            const deltaX = o.pos.x - this.pos.x;
            this.velocity = this.velocity.rotate(.3 * deltaX);
            
            // make sure ball is moving upwards with a minimum speed
            this.velocity.y = LJS.max(-this.velocity.y, .2);
            
            // prevent default collision code
            return false;
        }

        return true; // allow object to collide
    }
}

class Wall extends LJS.EngineObject
{
    constructor(pos, size)
    {
        super(pos, size); // set object position and size

        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
        this.color = rgb(0,0,0,0); // make object invisible
    }
}

class Brick extends LJS.EngineObject
{
    constructor(pos, size)
    {
        super(pos, size);

        this.setCollision(); // make object collide
        this.mass = 0; // make object have static physics
        this.color = LJS.randColor(); // give brick a random color
    }

    collideWithObject(o)              
    {
        this.destroy(); // destroy block when hit
        sound_break.play(this.pos); // play brick break sound
        ++score; // award a point for each brick broke

        // create explosion effect
        const color = this.color;
        new LJS.ParticleEmitter(
            this.pos, 0,             // pos, angle
            this.size, .1, 200, 3.14,// emitSize, emitTime, emitRate, emitCone
            undefined,               // tileInfo
            color, color,                       // colorStartA, colorStartB
            color.scale(1,0), color.scale(1,0), // colorEndA, colorEndB
            .2, .5, 1, .1, .1,  // time, sizeStart, sizeEnd, speed, angleSpeed
            .99, .95, .4, 3.14, // damp, angleDamp, gravity, cone
            .1, .5, false, true // fade, randomness, collide, additive
        );

        return true; // allow object to collide
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    // setup camera and canvas
    LJS.setCameraPos(levelSize.scale(.5));   // center camera in level
    LJS.setCanvasFixedSize(vec2(1280, 720)); // use a 720p fixed size canvas
    
    // create bricks
    for (let x=2;  x<=levelSize.x-2; x+=2)
    for (let y=12; y<=levelSize.y-2; y+=1)
        new Brick(vec2(x,y), vec2(2,1)); // create a brick

    // create player paddle
    paddle = new Paddle;

    // create walls
    new Wall(vec2(-.5,levelSize.y/2),            vec2(1,100)) // top
    new Wall(vec2(levelSize.x+.5,levelSize.y/2), vec2(1,100)) // left
    new Wall(vec2(levelSize.x/2,levelSize.y+.5), vec2(100,1)) // right
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    if (ball && ball.pos.y < -1) // if ball is below level
    {
        // destroy old ball
        ball.destroy();
        ball = 0;
    }
    if (!ball && LJS.mouseWasPressed(0))
    {
        // spawn new ball if there is no ball and left mouse pressed
        ball = new Ball(LJS.cameraPos); // create a ball
        sound_start.play(); // play start sound
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{
}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    LJS.drawRect(LJS.cameraPos, vec2(100), rgb(.5,.5,.5)); // draw background
    LJS.drawRect(LJS.cameraPos, levelSize, rgb(.1,.1,.1)); // draw level boundary
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    LJS.drawTextScreen("Score " + score, vec2(LJS.mainCanvasSize.x/2, 70), 50); // show score
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);