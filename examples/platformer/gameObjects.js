/*
    LittleJS Platformer Example - Objects
    - Base GameObject class for objects with health
    - Crate object collides with player, can be destroyed
    - Weapon is held and fires bullets with some settings
    - Bullet is the projectile launched by a weapon
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameEffects from './gameEffects.js';
import * as Game from './game.js';
const {vec2, hsl, rgb, Timer} = LJS;

export class GameObject extends LJS.EngineObject 
{
    constructor(pos, size, tileInfo, angle)
    {
        super(pos, size, tileInfo, angle);
        this.health = 0;
        this.isGameObject = 1;
        this.damageTimer = new Timer;
    }

    update()
    {
        // flash white when damaged
        let brightness = 0;
        if (!this.isDead() && this.damageTimer.isSet())
            brightness = .5*LJS.percent(this.damageTimer, .15, 0);
        this.additiveColor = hsl(0,0,brightness,0);

        // kill if below level
        if (!this.isDead() && this.pos.y < -9)
            this.kill();
    }

    damage(damage, damagingObject)
    {
        LJS.ASSERT(damage >= 0);
        if (this.isDead())
            return 0;
        
        // set damage timer;
        this.damageTimer.set();
        for (const child of this.children)
            child.damageTimer && child.damageTimer.set();

        // apply damage and kill if necessary
        const newHealth = LJS.max(this.health - damage, 0);
        if (!newHealth)
            this.kill(damagingObject);

        // set new health and return amount damaged
        return this.health - (this.health = newHealth);
    }

    isDead()                { return !this.health; }
    kill(damagingObject)    { this.destroy(); }
}

///////////////////////////////////////////////////////////////////////////////

export class Crate extends GameObject 
{
    constructor(pos) 
    { 
        super(pos, vec2(.999), Game.spriteAtlas.crate, (LJS.randInt(4))*LJS.PI/2);

        this.color = hsl(LJS.rand(),1,.8);
        this.health = 5;

        // make it a solid object for collision
        this.setCollision();
    }

    kill()
    {
        if (this.destroyed)
            return;

        GameEffects.sound_destroyObject.play(this.pos);
        GameEffects.makeDebris(this.pos, this.color, 30);
        this.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

export class Coin extends LJS.EngineObject 
{
    constructor(pos) 
    { 
        super(pos, vec2(1), Game.spriteAtlas.coin);
        this.color = hsl(.15,1,.5);
        this.mass = 0;
    }

    render()
    {
        // side of coin
        LJS.drawTile(this.pos, vec2(.1, .6), 0, this.color);

        // make it appear to spin
        const t = LJS.time+this.pos.x/4+this.pos.y/4;
        const spinSize = vec2(.5+.5*LJS.sin(t*2*LJS.PI), 1);
        if (spinSize.x > .1)
        LJS.drawTile(this.pos, spinSize, this.tileInfo, this.color);
    }

    update()
    {
        if (!Game.player)
            return;

        // check if player in range
        const d = this.pos.distanceSquared(Game.player.pos);
        if (d > .5)
            return; 
        
        // award points and destroy
        Game.addToScore();
        GameEffects.sound_score.play(this.pos);
        this.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

export class Enemy extends GameObject 
{
    constructor(pos) 
    { 
        super(pos, vec2(.9,.9), Game.spriteAtlas.enemy);

        this.drawSize = vec2(1);
        this.color = hsl(LJS.rand(), 1, .7);
        this.health = 5;
        this.bounceTime = new Timer(LJS.rand(1e3));
        this.setCollision(true, false);
    }

    update()
    {
        super.update();
        
        if (!Game.player)
            return;

        // jump around randomly
        if (this.groundObject && LJS.rand() < .01 && this.pos.distance(Game.player.pos) < 20)
            this.velocity = vec2(LJS.rand(.1,-.1), LJS.rand(.4,.2));

        // damage player if touching
        if (this.isOverlappingObject(Game.player))
            Game.player.damage(1, this);
    }

    kill()
    {
        if (this.destroyed)
            return;

        Game.addToScore();
        GameEffects.sound_score.play(this.pos);
        GameEffects.makeDebris(this.pos, this.color);
        this.destroy();
    }
       
    render()
    {
        // bounce by changing size
        const bounceTime = this.bounceTime*6;
        this.drawSize = vec2(1-.1*LJS.sin(bounceTime), 1+.1*LJS.sin(bounceTime));

        // make bottom flush
        let bodyPos = this.pos;
        bodyPos = bodyPos.add(vec2(0,(this.drawSize.y-this.size.y)/2));
        LJS.drawTile(bodyPos, this.drawSize, this.tileInfo, this.color, this.angle, this.mirror, this.additiveColor);
    }
}

///////////////////////////////////////////////////////////////////////////////

export class Grenade extends GameObject
{
    constructor(pos) 
    {
        super(pos, vec2(.2), Game.spriteAtlas.grenade);

        this.beepTimer = new Timer(1);
        this.restitution   = .3;
        this.friction     = .9;
        this.angleDamping = .96;
        this.renderOrder  = 1e8;
        this.setCollision(true,false);
    }

    update()
    {
        super.update();

        if (this.getAliveTime() > 3)
        {
            GameEffects.explosion(this.pos);
            this.destroy();
        }
        else if (this.beepTimer.elapsed())
        {
            GameEffects.sound_grenade.play(this.pos)
            this.beepTimer.set(1);
        }
    }
       
    render()
    {
        LJS.drawTile(this.pos, vec2(.5), this.tileInfo, this.color, this.angle);

        // draw additive flash exploding
        LJS.setBlendMode(true);
        const flash = LJS.cos(this.getAliveTime()*2*LJS.PI);
        LJS.drawTile(this.pos, vec2(2), Game.spriteAtlas.circle, hsl(0,1,.5,.2-.2*flash));
        LJS.setBlendMode(false);
    }
}

///////////////////////////////////////////////////////////////////////////////

export class Weapon extends LJS.EngineObject 
{
    constructor(pos) 
    { 
        super(pos, vec2(.6), Game.spriteAtlas.gun);

        // weapon settings
        this.fireRate      = 8;
        this.bulletSpeed   = .5;
        this.bulletSpread  = .1;
        this.damage        = 1;

        // prepare to fire
        this.fireTimeBuffer = this.localAngle = 0;
        this.recoilTimer = new Timer;

        // shell effect
        this.addChild(this.shellEmitter = new LJS.ParticleEmitter(
            vec2(), 0, 0, 0, 0, .1,  // pos, angle, size, time, rate, cone
            0,                       // tileInfo
            rgb(1,.8,.5), rgb(.9,.7,.5), // colorStartA, colorStartB
            rgb(1,.8,.5), rgb(.9,.7,.5), // colorEndA, colorEndB
            3, .1, .1, .15, .1, // time, sizeStart, sizeEnd, speed, angleSpeed
            1, .95, 1, 0, 0,    // damp, angleDamp, gravity, particleCone, fade
            .1, 1               // randomness, collide
        ), vec2(.1,0), -.8);
        this.shellEmitter.restitution = .5;
        this.shellEmitter.particleDestroyCallback = GameEffects.persistentParticleDestroyCallback;
    }

    update()
    {
        // update recoil
        if (this.recoilTimer.active())
            this.localAngle = LJS.lerp(this.localAngle, 0, this.recoilTimer.getPercent());

        this.mirror = this.parent.mirror;
        this.fireTimeBuffer += LJS.timeDelta;
        if (this.triggerIsDown)
        {
            // try to fire
            for (; this.fireTimeBuffer > 0; this.fireTimeBuffer -= 1/this.fireRate)
            {
                // create bullet
                GameEffects.sound_shoot.play(this.pos);
                this.localAngle = -LJS.rand(.2,.25);
                this.recoilTimer.set(.1);
                const direction = vec2(this.bulletSpeed*this.getMirrorSign(), 0);
                const velocity = direction.rotate(LJS.rand(-1,1)*this.bulletSpread);
                new Bullet(this.pos, this.parent, velocity, this.damage);

                // spawn shell particle
                this.shellEmitter.emitParticle();
            }
        }
        else
            this.fireTimeBuffer = LJS.min(this.fireTimeBuffer, 0);
    }
}

///////////////////////////////////////////////////////////////////////////////

export class Bullet extends LJS.EngineObject 
{
    constructor(pos, attacker, velocity, damage) 
    { 
        super(pos, vec2());
        this.color = rgb(1,1,0);
        this.velocity = velocity;
        this.attacker = attacker;
        this.damage = damage;
        this.damping = 1;
        this.gravityScale = 0;
        this.renderOrder = 100;
        this.drawSize = vec2(.2,.5);
        this.range = 5;
        this.setCollision(1,0);
    }

    update()
    {
        // check if hit someone
        LJS.engineObjectsCallback(this.pos, this.size, (o)=>
        {
            if (o.isGameObject)
                this.collideWithObject(o)
        });

        this.angle = this.velocity.angle();
        this.range -= this.getSpeed();
        if (this.range < 0)
        {
            new LJS.ParticleEmitter(
                this.pos, 0, .2, .1, 50, 3.14, Game.spriteAtlas.circle, // pos, emit info, tileInfo
                rgb(1,1,.1), rgb(1,1,1),   // colorStartA, colorStartB
                rgb(1,1,.1,0), rgb(1,1,1,0), // colorEndA, colorEndB
                .1, .5, .1, .05, 0, // particleTime, sizeStart, sizeEnd, speed, angleSpeed
                1, 1, .5, 3.14, .1, // damping, angleDamping, gravityScale, cone, fadeRate, 
                .5, 0, 1            // randomness, collide, additive, randomColorLinear
            );

            this.destroy();
        }
    }
    
    collideWithObject(o)
    {
        if (o.isGameObject && o != this.attacker)
        {
            o.damage(this.damage, this);
            o.applyForce(this.velocity.scale(.1));
        }
    
        this.kill();
        return true; 
    }

    collideWithTile(data, pos)
    {
        if (data <= 0)
            return false;
            
        GameEffects.destroyTile(pos);
        this.kill();
        return true; 
    }

    kill()
    {
        if (this.destroyed)
            return;
        this.destroy();

        // spark effects
        const emitter = new LJS.ParticleEmitter(
            this.pos, 0, 0, .1, 100, .5, // pos, angle, size, time, rate, cone
            0,                           // tileInfo
            rgb(1,1,0), rgb(1,0,0), // colorStartA, colorStartB
            rgb(1,1,0), rgb(1,0,0), // colorEndA, colorEndB
            .2, .2, 0, .1, .1,  // time, sizeStart, sizeEnd, speed, angleSpeed
            1, 1, .5, 3.14, .1, // damp, angleDamp, gravityScale, particleCone, fade, 
            .5, 1, 1            // randomness, collide, additive
        );
        emitter.trailScale = 1;
        emitter.restitution = .3;
        emitter.angle = this.velocity.angle() + LJS.PI;
    }
}