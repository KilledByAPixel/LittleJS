/*
    LittleJS 3D Example
    - A tour of the 3D plugin in one scene
    - Terrain from a height map, shadows, fog and a sky
    - Meshes built from shapes, an instanced forest, sprites and 3D text
    - Point lights, particles, a trail, bloom and 3D sound
    - Roll the ball with the arrow keys, jump with space, and collect the orbs
*/

'use strict';

// pull tile edges in slightly so neighbors on the sheet cannot bleed into them
setTileDefaultBleed(.5);

const terrainSize = 90, terrainHeight = 14, orbCount = 8;
const soundCollect = new Sound([,,500,.02,.1,.2,1,1.5,,,200,.05]);
const soundEngine = new Sound([,0,80,.01,.03,.1,3,1.5,,,,,,.6]);
let terrain, player, scoreText, orbMesh, score = 0;

///////////////////////////////////////////////////////////////////////////////
// the player rolls over the terrain with a trail behind it

class Player extends EngineObject3D
{
    constructor()
    {
        super(vec3(0,0,6), buildSphere(2, 16, 8, true));
        this.color = hsl(.55,.8,.6);
        this.specular = .5;
        this.speed = vec3();
        this.speedY = 0;
        this.addChild(new Light3D(vec3(0,1,0), 10, hsl(.55,1,.7)));
        const trailColor = hsl(.55,1,.7,.4), trailFade = trailColor.withAlpha(0);
        this.addChild(new Trail3D(vec3(0,-.8,0), 1, .5, undefined, trailColor, trailFade, true));
    }
    update()
    {
        // arrow keys push it along the ground, forward is -Z
        const move = keyDirection();
        this.speed = this.speed.add(vec3(move.x, 0, -move.y).scale(.02)).scale(.94);
        this.pos3D = this.pos3D.add(this.speed);

        // stay on the island and roll with the slope
        const limit = terrainSize/2 - 4;
        this.pos3D.x = clamp(this.pos3D.x, -limit, limit);
        this.pos3D.z = clamp(this.pos3D.z, -limit, limit);

        // space jumps when it is on the ground, then gravity brings it back
        const ground = terrain.getHeight(this.pos3D.x, this.pos3D.z) + 1;
        const onGround = this.pos3D.y < ground + .1;
        if (onGround && keyWasPressed('Space'))
            this.speedY = .35;
        this.speedY -= .015;
        this.pos3D.y = max(ground, this.pos3D.y + this.speedY);
        if (this.pos3D.y == ground)
            this.speedY = 0;
        this.rotation3D.x += this.speed.z;
        this.rotation3D.z -= this.speed.x;

        // an engine note that rises with speed
        const speed = this.speed.length();
        if (speed > .02 && frame % 6 == 0)
            render3D.playSound(soundEngine, this.pos3D, .3, .8 + speed*3);
    }
}

///////////////////////////////////////////////////////////////////////////////
// orbs to collect, each one a light with a burst when it is taken

class Orb extends EngineObject3D
{
    constructor(pos)
    {
        super(pos, orbMesh);
        this.color = hsl(rand(),1,.6);
        this.unlit = true; // its own bright color, which the bloom picks up
        this.angleVelocity3D = vec3(.01,.02,0);
        this.addChild(new Light3D(vec3(), 12, this.color));
    }
    update()
    {
        // bob in place until the player reaches it
        const bob = sin(time*2 + this.pos3D.x)*.3;
        this.pos3D.y = terrain.getHeight(this.pos3D.x, this.pos3D.z) + 2 + bob;
        if (this.pos3D.distance(player.pos3D) > 2.5)
            return;

        new ParticleEmitter3D(
            this.pos3D.copy(),                // pos
            1, .1, 250, PI, undefined,        // emitSize, emitTime, rate, cone, tileInfo
            this.color, WHITE,                // colorStartA, colorStartB
            this.color.withAlpha(0), WHITE.withAlpha(0), // colorEndA, colorEndB
            1, .6, 0, .3, .95,                // time, sizeStart, sizeEnd, speed, damping
            -.01, .1, .4, true                // gravity, fade, randomness, additive
        );
        render3D.playSound(soundCollect, this.pos3D);
        ++score;
        buildScoreText();
        this.destroy();
        new Orb(randomGroundPos());
    }
}

// a random spot on the island, clear of the middle where the player starts
function randomGroundPos()
{
    return vec3(rand(20, terrainSize/2 - 6), 0, 0).rotateY(rand(2*PI));
}

function buildScoreText()
{
    scoreText.mesh?.dispose(); // the old text is a mesh on the GPU, let it go
    scoreText.mesh = buildText3D('ORBS ' + score, 3, .8);
}

///////////////////////////////////////////////////////////////////////////////

function gameInit()
{
    // the 3D pass draws under the 2D canvas, bloom shaders both
    new Render3DPlugin;
    postProcessBloom(.85, 2, 8); // only the brightest things glow, and not the 2D text
    render3D.setSky(hsl(.6,.6,.45), hsl(.55,.4,.7), hsl(.35,.3,.4));
    render3D.setFog(40, 130);
    render3D.lightDirection = vec3(.4,-1,.3).normalize();
    render3D.ambientColor = hsl(.6,.2,.35);
    render3D.shadows = true;
    render3D.shadowRange = 50;
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
            colorRow.push(height < .12 ? hsl(.55,.5,.45) : grass.lerp(rock, height));
        }
        heights.push(heightRow);
        colors.push(colorRow);
    }
    orbMesh = buildSphere(1.4, 10, 5, true); // one mesh for every orb, so they draw as one batch
    terrain = new HeightMap(heights, vec2(terrainSize), terrainHeight, colors);
    new EngineObject3D(vec3(), terrain.buildMesh(true));

    // a forest sharing one mesh, so all of it is a single draw call
    const tree = new Mesh()
        .combine(buildCylinder(.7, 3, 6), buildMatrix(vec3(0,1.5,0)), hsl(.1,.4,.3))
        .combine(buildCone(4, 5, 7), buildMatrix(vec3(0,4.5,0)), hsl(.3,.5,.25));
    for (let i = 250; i--;)
    {
        const pos = randomGroundPos();
        pos.y = terrain.getHeight(pos.x, pos.z);
        if (pos.y < 2 || pos.y > 9)
            continue;
        const treeObject = new EngineObject3D(pos, tree);
        treeObject.rotation3D.y = rand(2*PI);
        treeObject.scale3D = vec3(rand(.7,1.2));
        treeObject.cullBackFaces = true;
    }

    // crystals around the island, a cone and its mirror image welded together
    const crystal = new Mesh()
        .combine(buildCone(2.5, 4, 6), buildMatrix(vec3(0,2,0)))
        .combine(buildCone(2.5, 2, 6), buildMatrix(vec3(0,1,0), vec3(PI,0,0)));
    for (let i = 14; i--;)
    {
        const pos = randomGroundPos();
        pos.y = terrain.getHeight(pos.x, pos.z);
        if (pos.y < 2)
            continue;
        const rock = new EngineObject3D(pos, crystal);
        rock.color = hsl(.55 + rand(-.1,.1), .5, .6);
        rock.rotation3D.y = rand(2*PI);
        rock.scale3D = vec3(rand(1,1.8));
        rock.specular = .6;
    }

    // sprites from the tile sheet, upright billboards with their pixels kept hard edged
    for (let i = 12; i--;)
    {
        const pos = randomGroundPos();
        pos.y = terrain.getHeight(pos.x, pos.z) + 1.5;
        if (pos.y < 3)
            continue;
        const sprite = new EngineObject3D(pos, undefined, tile(i%4, 16));
        sprite.color = hsl(i/12,.7,.7);
        sprite.size3D = vec3(3);
        sprite.upright = true;  // stands on the ground instead of tilting with the camera
        sprite.pixelated = true; // no blurring or bleeding between tiles on the sheet
    }

    // the title and the score, extruded from the engine font, high enough to clear the hills
    const title = new EngineObject3D(vec3(0,17,-14), buildText3D('LITTLEJS 3D', 5, 1.2));
    title.color = hsl(.12,1,.6);
    title.specular = .4;
    title.angleVelocity3D = vec3(0,.002,0);
    scoreText = new EngineObject3D(vec3(0,12.5,-14));
    scoreText.color = hsl(.55,.3,.95);
    scoreText.specular = .3;
    buildScoreText();

    // the sun is behind everything facing the camera, so a cool fill picks out the front faces
    const fill = new Light3D(vec3(), 1, hsl(.55,.4,.3));
    fill.directional = true;
    fill.lookAt(vec3(0,-.3,-1));

    player = new Player;
    for (let i = orbCount; i--;)
        new Orb(randomGroundPos());
}

function gameUpdatePost()
{
    // the camera and the shadows follow the player, after it has moved
    render3D.camera.follow(player.pos3D.add(vec3(0,2,0)), vec3(0,10,18), .08);
    render3D.shadowCenter = player.pos3D;
}

function gameRenderPost()
{
    const text = 'arrow keys: roll / space: jump / collect the orbs';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, mainCanvasSize.y - 40), 30);
}

engineInit(gameInit, ()=>{}, gameUpdatePost, ()=>{}, gameRenderPost, ['tiles.png']);
