const arenaSize = 40;
const soundHit = new Sound([.5,,420,.02,,.3,,3,,-90,-50,,.1]);
let player, trail, scoreObject, shown, best = 0;
let roundTimer = new Timer(0), spawnTimer = new Timer(1);

class Player extends EngineObject3D
{
    constructor()
    {
        super(vec3(0,1.3,0), buildCapsule(1.4, 2.6));
        this.color = hsl(0,1,.6);
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
        super(pos, render3D.boxMesh);
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
    // an explosion, then start over
    particleEffect3D('explosion', player.pos3D, {scale: 2});
    render3D.playSound(soundHit, player.pos3D, 2);
    best = max(best, floor(roundTimer.get()));
    roundTimer.set();
    buildScoreText();
    engineObjects.forEach(o=> o instanceof Box && o.destroy());
    trail.clear();
    spawnTimer.set(2); // a moment to breathe
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.6,.5), hsl(.6,.4,.8), hsl(.1,.3,.4));
    render3D.setFog(30, 80);
    render3D.ambientColor = hsl(.6,.1,.3);
    render3D.shadows = true;
    render3D.shadowCenter = vec3();
    render3D.shadowRange = arenaSize*1.5;
    render3D.gravity.y = -.01;

    // make checkered ground
    const checker = (x, z)=> hsl(.5, .2, (x+z)/2&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(arenaSize), 20, checker));

    // create the player with a trail and light
    player = new Player;
    trail = new Trail3D(vec3(0,-1,0), .4, .6, undefined,
        hsl(.5,1,.7,.5), hsl(.5,1,.7,0), true);
    player.addChild(trail);
    player.addChild(new Light3D(vec3(0,3,0), 15, hsl(.15,1,.6)));

    // make the score display
    scoreObject = new EngineObject3D(vec3(0,5,-arenaSize/2));
    scoreObject.color = hsl(.15,1,.7);
    scoreObject.rotation3D.x = -.5;
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
    render3D.camera.follow(followPos, vec3(0,9,16));
}

/* info
Dodge the tumbling boxes as long as you can. The arrow keys move the
red capsule around the arena, boxes fly in from every side more and
more often, and one touch ends the round. The sign at the back shows
the seconds survived and the best so far.

## How it works
The game is two classes, a few functions and the engine's 3D physics:
objects move by `velocity3D`, gravity pulls the ones with a mass, and
the engine tells an object when it touches another.

### Player
- The mesh is `buildCapsule(1.4, 2.6)`, a diameter and a total height.
  It is centered on its position, so y is 1.3 to stand it on the ground.
- The body that collides is not the mesh. `size3D = vec3(1)` with
  `collideAsSphere3D` makes it a sphere one unit across, smaller than
  the capsule, which forgives a near miss. `setCollision()` turns
  collision on.
- `keyDirection()` returns a `Vector2` from the arrow keys, x for left
  and right and y for up and down. The ground is the x and z plane and
  up on the screen is away from the camera, toward negative z, so the
  move is `vec3(move.x, 0, -move.y)`. `clampLength(.3)` keeps the speed
  at .3 units a frame, also on a diagonal.
- `velocity3D` is added to `pos3D` by the engine each frame. `clamp`
  then holds x and z inside the arena.
- `rotation3D` is pitch, yaw and roll. Setting pitch from the z speed
  and roll from the x speed leans the capsule the way it moves.
- `collideWithObject` is called by the engine when a box touches the
  player, and it ends the round.

### Box
A box uses the shared `render3D.boxMesh` at `scale3D = vec3(2)`, which
scales its collision box too.

- `mass = 1` makes it fall. A 3D object starts with a mass of 0, which
  gravity does not pull.
- Its velocity is the direction from where it starts to where the
  player is now, `normalize(length)` giving it a length of .1 to .2
  units a frame. `angleVelocity3D` makes it tumble.
- `setCollision(true, false)` is collide with solid objects, but do not
  be solid. Two objects that are both not solid pass through each
  other, so boxes ignore boxes and still hit the solid player.
- `update` bounces it: below a height of 1, half its size, it is put
  back and its upward speed is made positive and cut to 80%. A box more
  than `arenaSize` from the middle is destroyed.

### Timers and the sign
`new Timer(0)` is a timer that elapsed just now, and its `get()` is the
seconds since then, so `roundTimer` is the round's clock. `spawnTimer`
counts down to the next box. When it has `elapsed()`, it is set again
to .4 to .8 seconds divided by `1 + t/20`, so boxes come twice as often
after 20 seconds. A box starts 22 units out, 1 to 6 units up, turned to
a random side with `rotateY`.

The sign is an object with no mesh at first. `buildScoreText` makes a
mesh of the text with `buildText3D(text, size, depth)` and `setMesh`
swaps it in and frees the old one. That is only done when the whole
second changes.

### endRound
`particleEffect3D('explosion', pos, {scale: 2})` plays a built in
effect, and `render3D.playSound` plays the sound at a place in the
world, quieter with distance from the camera. The boxes are destroyed,
the trail is cleared and the next box waits 2 seconds.

### The scene
- `setSky` takes a third color here, for straight down, and `setFog`
  fades the distance into the horizon color.
- `shadowCenter` and `shadowRange` fix the shadowed area on the arena
  and make it 1.5 times as wide, in place of following the camera.
- `render3D.gravity.y = -.01` is added to a falling object's velocity
  every frame.
- `Trail3D(pos3D, lifeTime, width, tileInfo, color, colorEnd, additive)`
  is a ribbon through where it has been. As a child of the player, one
  unit below its center, it follows the feet. A `Light3D` child lights
  the ground around the player.
- `gameUpdatePost` runs after the objects have moved, so the camera is
  set from the player's new position. `camera.follow(target, offset)`
  puts the camera at the target plus the offset and looks at it.

## Try it
- Move faster: `clampLength(.3)` to `clampLength(.5)`.
- Twice as many boxes: `rand(.4,.8)` to `rand(.2,.4)`.
- Weak gravity, so boxes float in: `-.01` to `-.003`.
- Look almost straight down: `vec3(0,9,16)` to `vec3(0,25,1)`.

## See also
3D Collision shows solid objects and bouncing on their own, 3D Trails
and 3D Particles the effects, and 3D Text the sign. 3D Racing Game also
uses a chase camera. Look up `EngineObject3D` for `setCollision`,
`size3D` and `collideAsSphere3D`.
*/
