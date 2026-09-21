// dodge the tumbling boxes as long as you can, they come faster and faster
const arenaSize = 40, playerStart = vec3(0,1.3,0);
const soundHit = new Sound([,,,.01,.1,.2,4,,,,,,,,,.5]);
let player, trail, scoreObject, boxMesh;
let roundStart = 0, shown, best = 0, spawnTimer = new Timer(1);

class Player extends EngineObject3D
{
    constructor()
    {
        super(playerStart, buildCapsule(1.4, 2.6));
        this.color = hsl(.5,.8,.6);
        this.specular = .6;
        this.cullBackFaces = true;
        this.size3D = vec3(1.6);
        this.setCollision();
        this.collideAsSphere3D = true;
    }
    update()
    {
        // arrow keys move on the ground, forward is -Z
        const move = keyDirection();
        this.velocity3D = vec3(move.x, 0, -move.y).clampLength(.3);

        // stay in the arena and lean into the move
        const limit = arenaSize/2 - 2;
        this.pos3D.x = clamp(this.pos3D.x, -limit, limit);
        this.pos3D.z = clamp(this.pos3D.z, -limit, limit);
        const v = this.velocity3D;
        this.rotation3D = vec3(-v.z, 0, -v.x).scale(1.5);
    }
    collideWithObject()
    {
        // a box got the player, so end the round; nothing to push apart
        endRound();
        return false;
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
        this.velocity3D = player.pos3D.subtract(pos).normalize(rand(.1,.2));
        this.velocity3D.y = rand(.1,.2);
        this.angleVelocity3D = randVector3(.1);
        this.cullBackFaces = true;
        this.setCollision(true, false); // boxes pass through each other
    }
    update()
    {
        // bounce off the ground
        if (this.pos3D.y < 1)
        {
            this.pos3D.y = 1;
            this.velocity3D.y = abs(this.velocity3D.y)*.7;
        }
        if (this.pos3D.length() > arenaSize)
            this.destroy();
    }
}

function buildScoreText()
{
    // whole seconds survived this round
    shown = floor(time - roundStart);
    const text = `TIME ${shown}\nBEST ${best}`;
    scoreObject.setMesh(buildText3D(text, 2, .6));
}

function endRound()
{
    // a burst of debris, then start over
    new ParticleEmitter3D(
        player.pos3D.copy(),           // pos
        1, .1,                         // emitSize, emitTime
        600, PI, undefined,            // rate, cone, tileInfo
        hsl(.1,1,.8), hsl(0,1,.5),     // colorStartA, colorStartB
        hsl(.1,1,.5,0), hsl(0,1,.5,0), // colorEndA, colorEndB
        1, 1.5, 0,                     // time, sizeStart, sizeEnd
        .4, .95, -.02,                 // speed, damping, gravity
        .1, .5, true                   // fade, randomness, additive
    );
    render3D.playSound(soundHit, player.pos3D, 2);
    best = max(best, floor(time - roundStart));
    roundStart = time;
    buildScoreText();
    engineObjects.forEach(o=> o instanceof Box && o.destroy());
    player.pos3D = playerStart.copy();
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

    // checkered ground, the player with a trail and light, and the 3D score
    const checker = (x, z)=> hsl(.3, .4, (x+z)/2&1 ? .4 : .3);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize), 20, checker));
    boxMesh = buildBox();
    player = new Player;
    trail = new Trail3D(vec3(0,-1,0), .4, .6, undefined,
        hsl(.5,1,.7,.5), hsl(.5,1,.7,0), true);
    player.addChild(trail);
    player.addChild(new Light3D(vec3(0,3,0), 12, hsl(.15,1,.6)));
    scoreObject = new EngineObject3D(vec3(0,5,-arenaSize/2));
    scoreObject.color = hsl(.15,1,.6);
    scoreObject.specular = .5;
    scoreObject.rotation3D.x = -.4; // lean back into the light
    buildScoreText();
}

function gameUpdate()
{
    // boxes come in from a random edge, more often the longer you last
    const t = time - roundStart;
    if (spawnTimer.elapsed())
    {
        spawnTimer.set(rand(.4,.8) / (1 + t/20));
        const pos = vec3(arenaSize/2 + 2, rand(1,6)).rotateY(rand(2*PI));
        new Box(pos);
    }

    // the 3D time is rebuilt only when the second changes
    if (floor(t) != shown)
        buildScoreText();
}

function gameUpdatePost()
{
    // the shadows and the camera follow the player, after it has moved
    render3D.shadowCenter = player.pos3D;
    render3D.camera.follow(player.pos3D.add(vec3(0,1,0)), vec3(0,9,16), .1);
}

function gameRenderPost()
{
    drawTextScreen('arrow keys: dodge',
        vec2(mainCanvasSize.x/2, mainCanvasSize.y - 30), 30);
}
