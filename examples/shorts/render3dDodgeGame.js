// dodge the tumbling boxes with the arrow keys
const arenaSize = 40;
const soundNearMiss = new Sound([,,900,,.02,.08,1,1.5,,,,,,,,,,.5]);
const soundHit = new Sound([,,120,.05,.2,.4,4,2,,,,,,5]);
let player, playerLight, scoreObject, boxMesh;
let score = 0, best = 0, spawnTimer = new Timer(1);

class Player extends EngineObject3D
{
    constructor()
    {
        super(vec3(0,1.3,0), buildCapsule(1.4, 2.6), undefined, hsl(.55,.8,.6));
        this.specular = .6;
        this.cullBackFaces = true;
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
        this.rotation3D = vec3(-this.velocity3D.z, 0, -this.velocity3D.x).scale(1.5);
    }
}

class Box extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, boxMesh, undefined, hsl(rand(), .7, .5));
        this.velocity3D = player.pos3D.subtract(pos).normalize(rand(.12,.22));
        this.velocity3D.y = rand(.1,.2);
        this.angleVelocity3D = randVector3(.1);
        this.cullBackFaces = true;
    }
    update()
    {
        // fall and bounce off the ground
        this.velocity3D.y -= .01;
        if (this.pos3D.y < 1)
        {
            this.pos3D.y = 1;
            this.velocity3D.y = abs(this.velocity3D.y)*.7;
        }

        // a hit ends the round, a near miss scores once
        if (collideSphereBox(player.pos3D, .8, this.pos3D, vec3(2)))
            endRound();
        else if (!this.missed && player.pos3D.distance(this.pos3D) < 3)
        {
            this.missed = true;
            ++score;
            render3D.playSound(soundNearMiss, this.pos3D);
            buildScoreText();
        }
        if (this.pos3D.length() > arenaSize)
            this.destroy();
    }
}

function buildScoreText()
{
    scoreObject.mesh?.dispose();
    scoreObject.mesh = buildText3D('SCORE ' + score + '\nBEST ' + best, 2, .6);
}

function endRound()
{
    // a burst of debris, then start over
    new ParticleEmitter3D(
        player.pos3D.copy(),              // pos
        1, .1, 600, PI, undefined,        // emitSize, emitTime, rate, cone, tileInfo
        hsl(.12,1,.8), hsl(0,1,.5),       // colorStartA, colorStartB
        hsl(.1,1,.5,0), hsl(0,1,.5,0),    // colorEndA, colorEndB
        1, 1.5, 0, .4, .95,               // time, sizeStart, sizeEnd, speed, damping
        -.02, .1, .5, true                // gravity, fade, randomness, additive
    );
    render3D.playSound(soundHit, player.pos3D, 2);
    best = max(best, score);
    score = 0;
    buildScoreText();
    engineObjects.forEach(o=> o instanceof Box && o.destroy());
    player.pos3D = vec3(0,1.3,0);
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.6,.5), hsl(.55,.4,.75), hsl(.1,.3,.4));
    render3D.fogStart = 30;
    render3D.fogEnd = 80;
    render3D.ambientColor = rgb(.35,.35,.45);
    render3D.lightDirection = vec3(.4,-1,.3).normalize();
    render3D.shadows = true;

    // checkered ground, the player with a trail and a light, and the score in lit 3D text
    const checker = (x, z)=> (floor(x/2) + floor(z/2)) & 1 ? hsl(.3,.4,.42) : hsl(.3,.4,.3);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize), 20, checker));
    boxMesh = buildBox(2);
    player = new Player;
    const trail = new Trail3D(vec3(0,-1,0), .4, .6, undefined, hsl(.55,1,.7,.5), hsl(.55,1,.7,0), true);
    player.addChild(trail);
    playerLight = new Light3D(vec3(), 12, hsl(.15,1,.6));
    scoreObject = new EngineObject3D(vec3(0,5,-arenaSize/2), undefined, undefined, hsl(.15,1,.6));
    scoreObject.specular = .5;
    scoreObject.rotation3D.x = -.4; // lean back into the light
    buildScoreText();
}

function gameUpdate()
{
    // boxes come in from a random edge
    if (spawnTimer.elapsed())
    {
        spawnTimer.set(rand(.25,.6));
        const angle = rand(2*PI), r = arenaSize/2 + 2;
        new Box(vec3(sin(angle)*r, rand(1,6), cos(angle)*r));
    }

    // the light, the shadows and the camera follow the player
    playerLight.pos3D = player.pos3D.add(vec3(0,3,0));
    render3D.shadowCenter = player.pos3D;
    render3D.camera.follow(player.pos3D.add(vec3(0,1,0)), vec3(0,9,16), .1);
}

function gameRenderPost()
{
    drawTextScreen('arrow keys: dodge', vec2(mainCanvasSize.x/2, mainCanvasSize.y - 30), 24);
}
