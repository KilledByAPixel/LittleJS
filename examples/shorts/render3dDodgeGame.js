// dodge the tumbling boxes as long as you can
const arenaSize = 40;
const soundHit = new Sound([,,520,.02,,.5,,3,,50,-60,,.1]);
let player, trail, scoreObject, boxMesh, shown, best = 0;
let roundTimer = new Timer(0), spawnTimer = new Timer(1);

class Player extends EngineObject3D
{
    constructor()
    {
        super(vec3(0,1.3,0), buildCapsule(1.4, 2.6));
        this.color = hsl(.5,.8,.6);
        this.specular = .5;
        this.size3D = vec3(1);
        this.collideAsSphere3D = true;
        this.setCollision();
    }
    update()
    {
        // arrow keys move on the ground
        const move = keyDirection();
        this.velocity3D = vec3(move.x, 0, -move.y).clampLength(.3);

        // stay in the arena and lean into the move
        const limit = arenaSize/2 - 2;
        this.pos3D.x = clamp(this.pos3D.x, -limit, limit);
        this.pos3D.z = clamp(this.pos3D.z, -limit, limit);
        const v = this.velocity3D.scale(2);
        this.rotation3D = vec3(v.z, 0, -v.x);
    }
    collideWithObject()
    {
        // a box hit the player, so end the round
        endRound();
    }
}

class Box extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, boxMesh);
        this.color = hsl(rand(),.7,.5);
        this.scale3D = vec3(2); // scales the collision too
        this.mass = 1; // enable gravity
        const playerOffset = player.pos3D.subtract(pos);
        this.velocity3D = playerOffset.normalize(rand(.1,.2));
        this.angleVelocity3D = randVector3(.1);
        this.setCollision(true, false); // boxes ignore each other
    }
    update()
    {
        // bounce off the ground
        if (this.pos3D.y < 1)
        {
            this.pos3D.y = 1;
            this.velocity3D.y = abs(this.velocity3D.y)*.8;
        }
        if (this.pos3D.length() > arenaSize)
            this.destroy();
    }
}

function buildScoreText()
{
    // whole seconds survived this round
    shown = floor(roundTimer.get());
    const text = `TIME ${shown}\nBEST ${best}`;
    scoreObject.setMesh(buildText3D(text, 4, .5));
}

function endRound()
{
    // a burst of debris, then start over
    new ParticleEmitter3D(
        player.pos3D,                  // pos
        1, .1,                         // emitSize, emitTime
        600, PI, undefined,            // rate, cone, tileInfo
        hsl(.1,1,.8), hsl(0,1,.5),     // colorStartA, colorStartB
        hsl(.1,1,.5,0), hsl(0,1,.5,0), // colorEndA, colorEndB
        1, 1.5, 0,                     // time, sizeStart, sizeEnd
        .4, .95, -.02,                 // speed, damping, gravity
        .1, .5, true                   // fade, randomness, additive
    );
    render3D.playSound(soundHit, player.pos3D, 2);
    best = max(best, floor(roundTimer.get()));
    roundTimer.set();
    buildScoreText();
    engineObjects.forEach(o=> o instanceof Box && o.destroy());
    trail.clear();
    spawnTimer.set(1); // a moment to breathe
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.6,.5), hsl(.6,.4,.8), hsl(.1,.3,.4));
    render3D.setFog(30, 80);
    render3D.ambientColor = hsl(.6,.1,.4);
    render3D.lightDirection = vec3(.4,-1,.3);
    render3D.shadows = true;
    render3D.gravity.y = -.01;

    // make checkered ground
    const checker = (x, z)=> hsl(.3, .4, (x+z)/2&1 ? .4 : .3);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize), 20, checker));

    // create the player with a trail and light
    player = new Player;
    trail = new Trail3D(vec3(0,-1,0), .4, .6, undefined,
        hsl(.5,1,.7,.5), hsl(.5,1,.7,0), true);
    player.addChild(trail);
    player.addChild(new Light3D(vec3(0,3,0), 12, hsl(.15,1,.6)));

    // make the score display
    scoreObject = new EngineObject3D(vec3(0,5,-arenaSize/2));
    scoreObject.color = hsl(.15,1,.7);
    scoreObject.rotation3D.x = -.5;

    // create the box mesh
    boxMesh = buildBox();
    buildScoreText();
}

function gameUpdate()
{
    // boxes spawn from a random side with an increasing rate
    const t = roundTimer.get();
    if (spawnTimer.elapsed())
    {
        spawnTimer.set(rand(.4,.8) / (1 + t/20));
        const pos = vec3(arenaSize/2 + 2, rand(1,6)).rotateY(rand(2*PI));
        new Box(pos);
    }

    // 3D time display is rebuilt only when it changes
    if (floor(t) != shown)
        buildScoreText();
}

function gameUpdatePost()
{
    // camera follows the player
    const followPos = player.pos3D.add(vec3(0,1,0));
    render3D.camera.follow(followPos, vec3(0,9,16), .1);
}
