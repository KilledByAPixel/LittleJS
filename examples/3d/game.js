/*
    LittleJS 3D Example
    - A tour of the 3D plugin in one scene
    - Terrain from a height map, shadows, fog and a sky
    - Meshes built from shapes, an instanced forest, sprites and 3D text
    - Point lights, particles, a trail, bloom and 3D sound
    - Roll the ball with the arrow keys, jump with space, and collect the orbs
*/

'use strict';

// pull in edges to prevent bleeding from neighboring tiles
setTileDefaultBleed(.5);

const terrainSize = 90, terrainHeight = 14, orbCount = 8;
const soundCollect = new Sound([,,,.02,,.5,,3,,-50,40,,.05]);
const soundEngine = new Sound([,0,80,.01,,.1,2,5,,,,,,.5,,,,,,,-100]);
const soundJump = new Sound([.5,,140,,,,,.5,12]);
let terrain, player, title;

///////////////////////////////////////////////////////////////////////////////
// the player rolls over the terrain with a trail behind it

class Player extends EngineObject3D
{
    constructor()
    {
        super(vec3(0,0,6), buildSphere(2));
        this.pos3D.y = terrain.getHeight(this.pos3D) + 1; // start on the ground
        this.color = hsl(.55,.8,.6);
        this.specular = .5;
        this.speed = vec3();
        this.speedY = 0;
        this.groundTimer = new Timer;
        this.addChild(new Light3D(vec3(0,1,0), 10, hsl(.55,1,.7)));
        const trailColor = hsl(0,0,.7,.4);
        this.addChild(new Trail3D(vec3(0,-.8,0), 1, .5, undefined,
            trailColor, trailColor.withAlpha(0), true));
    }
    update()
    {
        // arrow keys push it along the ground, forward is -Z
        const move = keyDirection();
        const push = vec3(move.x, 0, -move.y).scale(.02);
        this.speed = this.speed.add(push).scale(.94);
        this.pos3D = this.pos3D.add(this.speed);

        // stay on the island
        const limit = terrainSize/2 - 4;
        this.pos3D.x = clamp(this.pos3D.x, -limit, limit);
        this.pos3D.z = clamp(this.pos3D.z, -limit, limit);

        // space jumps when on the ground recently enough
        const ground = terrain.getHeight(this.pos3D) + 1;
        if (this.pos3D.y < ground + .1)
            this.groundTimer.set(.1);
        if (this.groundTimer.active() && keyWasPressed('Space'))
        {
            this.groundTimer.unset();
            this.speedY = .35;
            soundJump.play();
        }
        this.speedY -= .015;
        this.pos3D.y = max(ground, this.pos3D.y + this.speedY);
        if (this.pos3D.y == ground)
            this.speedY = 0;

        // engine sound loops, playing faster and louder with speed
        const speed = this.speed.length();
        if (!this.engineLoop?.isPlaying())
            this.engineLoop = render3D.playSoundLoop(soundEngine, this.pos3D);
        this.engineLoop?.setRate(1 + speed*2);
        this.engineLoop?.setVolume(min(speed*4, .3));
    }
}

///////////////////////////////////////////////////////////////////////////////
// orbs to collect, each one a light with a burst when it is taken

class Orb extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, render3D.sphereMesh);
        this.scale3D = vec3(1.4);
        this.color = hsl(rand(),1,.6);
        this.unlit = true; // make it appear bright
        this.angleVelocity3D = vec3(.01,.02,0);
        this.addChild(new Light3D(vec3(), 12, this.color));
    }
    update()
    {
        // bob in place until the player reaches it
        const bob = sin(time*2 + this.pos3D.x)*.3;
        this.pos3D.y = terrain.getHeight(this.pos3D) + 2 + bob;
        if (this.pos3D.distance(player.pos3D) > 2.5)
            return;

        new ParticleEmitter3D(
            this.pos3D.copy(),                    // pos
            1, .1,                                // emitSize, emitTime
            250, PI, undefined,                   // rate, cone, tileInfo
            this.color, WHITE,                    // colorStartA, colorStartB
            this.color.withAlpha(0), CLEAR_WHITE, // colorEndA, colorEndB
            1, .6, 0,                             // time, sizeStart, sizeEnd
            .3, .95, -.01,                        // speed, damping, gravity
            .1, .4, true                          // fade, randomness, additive
        );
        render3D.playSound(soundCollect, this.pos3D);
        this.destroy();
    }
}

// a random spot on the island, clear of the middle where the player starts
function randomGroundPos()
{
    return vec3(rand(20, terrainSize/2 - 6), 0, 0).rotateY(rand(2*PI));
}

///////////////////////////////////////////////////////////////////////////////

function gameInit()
{
    // the 3D pass draws first, then bloom shades the WebGL canvas
    new Render3DPlugin;
    postProcessBloom(.85, 2, 8); // the brightest things glow, not the 2D text
    render3D.setSky(hsl(.6,.6,.45), hsl(.55,.4,.7), hsl(.35,.3,.4));
    render3D.setFog(40, 130);
    render3D.lightDirection = vec3(.4,-1,.3);
    render3D.ambientColor = hsl(.6,.2,.35);
    render3D.shadows = true;
    render3D.shadowCenter = vec3(); // pinned over the whole island
    render3D.shadowRange = terrainSize*1.5; // it turns with the light
    render3D.shadowMapSize = 2048;
    render3D.smoothShading = true;

    // an island of noise, higher in the middle and sinking at the edges
    const samples = 65, heights = [], colors = [];
    for (let row = 0; row < samples; ++row)
    {
        const heightRow = [], colorRow = [];
        for (let column = 0; column < samples; ++column)
        {
            const x = column/(samples-1) - .5, z = row/(samples-1) - .5;
            const hills = noise2D(x*8, z*8)*.6 + noise2D(x*20, z*20)*.2;
            const height = clamp(hills + .35 - hypot(x, z)*1.6);
            heightRow.push(height);
            const grass = hsl(.3,.5,.25 + height*.4), rock = hsl(.1,.2,.45);
            const water = hsl(.55,.5,.45);
            colorRow.push(height < .12 ? water : grass.lerp(rock, height));
        }
        heights.push(heightRow);
        colors.push(colorRow);
    }
    terrain = new HeightMap(heights, vec2(terrainSize), terrainHeight, colors);
    new EngineObject3D(vec3(), terrain.buildMesh());

    // a forest sharing one mesh, so all of it is a single draw call
    const tree = new Mesh()
        .combine(buildCylinder(.7, 3, 6), vec3(0,1.5,0), hsl(.1,.4,.3))
        .combine(buildCone(4, 5, 7), vec3(0,4.5,0), hsl(.3,.5,.25));
    for (let i = 100; i--;)
    {
        const pos = randomGroundPos();
        pos.y = terrain.getHeight(pos);
        if (pos.y < 2)
            continue;
        const treeObject = new EngineObject3D(pos, tree);
        treeObject.scale3D = vec3(rand(.5,1.5));
        treeObject.cullBackFaces = true;
    }

    // crystals around the island, a cone and its mirror image welded together
    const crystal = new Mesh()
        .combine(buildCone(2.5, 4, 6), vec3(0,2,0))
        .combine(buildCone(2.5, 2, 6), buildMatrix(vec3(0,1,0), vec3(PI,0,0)));
    for (let i = 14; i--;)
    {
        const pos = randomGroundPos();
        pos.y = terrain.getHeight(pos);
        if (pos.y < 2)
            continue;
        const rock = new EngineObject3D(pos, crystal);
        rock.color = hsl(.55 + rand(-.1,.1), .5, .6);
        rock.rotation3D.y = rand(2*PI);
        rock.scale3D = vec3(rand(1,1.8));
        rock.specular = .6;
    }

    // sprites from the tile sheet
    for (let i = 12; i--;)
    {
        const pos = randomGroundPos();
        pos.y = terrain.getHeight(pos) + 1.5;
        if (pos.y < 3)
            continue;
        const sprite = new EngineObject3D(pos, undefined, tile(i%4, 16));
        sprite.color = hsl(i/12,.7,.7);
        sprite.size3D = vec3(3);
        sprite.upright = true;  // stands on the ground
        sprite.pixelated = true; // hard edged pixels
    }

    // title text, extruded from the engine font
    const titleMesh = buildText3D('LITTLEJS 3D', 5, 2);
    title = new EngineObject3D(vec3(0,17,-14), titleMesh);
    title.color = hsl(.1,1,.6);
    title.specular = 1;

    // add cool directional light opposite from the sun
    const fill = new Light3D(vec3(), 1, hsl(.55,.4,.3));
    fill.directional = true;
    fill.lookAt(vec3(0,-.3,-1));

    // spawn the player with the camera already behind it, and orbs to collect
    player = new Player;
    render3D.camera.follow(player.pos3D.add(vec3(0,2,0)), vec3(0,10,18));
    for (let i = orbCount; i--;)
        new Orb(randomGroundPos());
}

function gameUpdatePost()
{
    // the camera follows the player
    render3D.camera.follow(player.pos3D, vec3(0,10,18), .08);

    // sway the title so its sides catch the light
    title.rotation3D.y = sin(time*.3)*.3;
}

function gameRenderPost()
{
    const text = 'arrow keys: roll / space: jump / collect the orbs';
    const pos = vec2(mainCanvasSize.x/2, mainCanvasSize.y - 40);
    drawTextScreen(text, pos, 30, WHITE, 4);
}

engineInit(gameInit, undefined, gameUpdatePost, undefined, gameRenderPost,
    ['tiles.png']);
