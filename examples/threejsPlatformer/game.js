/*
    LittleJS Three.js Platformer Example
    - A tiny 3D platformer driven entirely by LittleJS game logic
    - LittleJS XY is the ground plane and z is height above the ground
    - LittleJS handles input, physics, and collision on the ground plane
    - Objects track zPos and zVelocity for jumping with manual gravity
    - Three.js renders the whole world with a fixed offset chase camera
    - The LittleJS canvas on top only draws HUD text
    - Controls: arrows or WASD to run, space to jump
*/

'use strict';

// import LittleJS module and three.js
import * as LJS from '../../dist/littlejs.esm.js';
import * as THREE from 'three';
const {vec2} = LJS;

// disable LittleJS WebGL so the 2D canvas is only used for HUD text
// must be called before engineInit so the WebGL canvas is never created
// note: LittleJS then renders with Canvas2D, not the high-sprite-count path
LJS.setGLEnable(false);

// platforming constants
const zGravity = .012;     // fall acceleration per update
const jumpVelocity = .22;  // takeoff speed
const groundEpsilon = .01; // tolerance for standing on a surface

// game globals
let player;
const platforms = [];
let coinsCollected = 0, coinsTotal = 0;

///////////////////////////////////////////////////////////////////////////////
// three.js rendering layer

let renderer, scene, camera;
const cameraOffset = new THREE.Vector3(0, -9, 6); // fixed follow offset
const cameraLerp = .1; // camera smoothing per frame

function threeInit()
{
    // create the renderer and insert its canvas behind the LittleJS canvas
    renderer = new THREE.WebGLRenderer({antialias: true});
    LJS.mainCanvas.parentElement.insertBefore(renderer.domElement, LJS.mainCanvas);

    // sky, fog, and lights
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x66aaee);
    scene.fog = new THREE.Fog(0x66aaee, 40, 90);
    camera = new THREE.PerspectiveCamera(60, 1, .1, 200);
    camera.up.set(0, 0, 1); // littlejs z is up
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(2, 1, 4);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x668866));

    // ground plane with a grid on top
    const groundMaterial = new THREE.MeshStandardMaterial({color: 0x55aa55});
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(300, 300), groundMaterial));
    const grid = new THREE.GridHelper(300, 150, 0x448844, 0x448844);
    grid.rotation.x = Math.PI/2; // rotate from XZ onto the XY ground plane
    grid.position.z = .01;       // sit just above the ground to avoid z-fighting
    scene.add(grid);
}

function threeRender()
{
    // keep renderer size and css in sync with the LittleJS canvas
    const size = LJS.mainCanvasSize;
    const threeCanvas = renderer.domElement;
    if (threeCanvas.width != size.x || threeCanvas.height != size.y)
    {
        renderer.setSize(size.x, size.y, false);
        camera.aspect = size.x / size.y;
        camera.updateProjectionMatrix();
    }
    if (threeCanvas.style.cssText != LJS.mainCanvas.style.cssText)
        threeCanvas.style.cssText = LJS.mainCanvas.style.cssText;

    // aim at the player and render
    camera.lookAt(player.pos.x, player.pos.y, player.zPos + 1);
    renderer.render(scene, camera);
}

///////////////////////////////////////////////////////////////////////////////
// engine objects that drive three.js meshes

class MeshObject3D extends LJS.EngineObject
{
    constructor(pos, size, mesh, zPos=0)
    {
        super(pos, size);
        this.mesh = mesh;
        this.meshZOffset = 0;  // lift for meshes with centered pivots
        this.zPos = zPos;      // height of the object base above the ground
        this.zVelocity = 0;    // vertical speed for jumping and falling
        scene.add(mesh);
        this.syncMesh();
    }
    update()
    {
        super.update();
        this.syncMesh();
    }
    getGroundHeight()
    {
        // highest platform top under this object that is at or below its feet
        let groundHeight = 0;
        for (const platform of platforms)
        {
            if (platform.height > this.zPos + groundEpsilon)
                continue; // top is above our feet, sides handled by 2d collision
            if (platform.height < groundHeight)
                continue; // already found something higher
            // check if this object is inside the platform footprint
            const delta = this.pos.subtract(platform.pos);
            if (Math.abs(delta.x) < platform.size.x/2 && Math.abs(delta.y) < platform.size.y/2)
                groundHeight = platform.height;
        }
        return groundHeight;
    }
    applyZGravity()
    {
        // fall and land on the ground or a platform top
        const groundHeight = this.getGroundHeight();
        this.zVelocity -= zGravity;
        this.zPos += this.zVelocity;
        if (this.zPos <= groundHeight && this.zVelocity <= 0)
        {
            this.zPos = groundHeight;
            this.zVelocity = 0;
        }
    }
    isOnGround()
    {
        return this.zVelocity <= 0 && this.zPos <= this.getGroundHeight() + groundEpsilon;
    }
    syncMesh()
    {
        // copy the 2D physics transform and height to the 3D mesh
        this.mesh.position.set(this.pos.x, this.pos.y, this.zPos + this.meshZOffset);
        this.mesh.rotation.z = -this.angle; // littlejs angles are clockwise
    }
    render()
    {
        // the mesh is this object's visual, skip the default 2D rect
    }
    destroy(immediate)
    {
        if (this.destroyed) return;
        scene.remove(this.mesh);
        // note: a real game should also dispose the mesh geometry and material
        super.destroy(immediate);
    }
}

// static box that can be walked into, jumped over, and stood on
class Platform extends MeshObject3D
{
    constructor(pos, size, height, color)
    {
        const geometry = new THREE.BoxGeometry(size.x, size.y, height);
        const material = new THREE.MeshStandardMaterial({color});
        super(pos, size, new THREE.Mesh(geometry, material));
        this.meshZOffset = height/2; // box pivot is centered, rest on the ground
        this.height = height;        // top surface used for landing and walls
        this.mass = 0;               // static object
        this.setCollision();         // solid on the ground plane
        this.syncMesh();
        platforms.push(this);
    }
}

// spinning collectible, destroying it removes the mesh from the scene
class Coin extends MeshObject3D
{
    constructor(pos, zPos)
    {
        // tilt the ring upright inside a group so the spin stays around world z
        const geometry = new THREE.TorusGeometry(.3, .1, 12, 24);
        const material = new THREE.MeshStandardMaterial({color: 0xffcc00});
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = Math.PI/2;
        const group = new THREE.Group();
        group.add(ring);
        super(pos, vec2(.6), group, zPos);
        this.angleVelocity = .03; // spin, syncMesh drives the mesh from angle
        this.angleDamping = 1;    // do not slow down
    }
    update()
    {
        super.update();

        // collect when the player is close on the ground plane and in height
        const playerCenterZ = player.zPos + .4;
        if (this.pos.distance(player.pos) < .9 && Math.abs(this.zPos - playerCenterZ) < .9)
        {
            ++coinsCollected;
            this.destroy();
        }
    }
}

// player cube, littlejs physics moves it and littlejs input controls it
class Player extends MeshObject3D
{
    constructor(pos)
    {
        const geometry = new THREE.BoxGeometry(.8, .8, .8);
        const material = new THREE.MeshStandardMaterial({color: 0xff8822, roughness: .4});
        super(pos, vec2(.8), new THREE.Mesh(geometry, material));
        this.meshZOffset = .4; // box pivot is centered, feet at zPos
        this.damping = .85;    // stop quickly when input is released
        this.setCollision();   // collide with platform sides
    }
    update()
    {
        // run with arrows or wasd
        this.velocity = this.velocity.add(LJS.keyDirection().scale(.015));

        // jump with space when standing on something
        if (LJS.keyWasPressed('Space') && this.isOnGround())
            this.zVelocity = jumpVelocity;

        this.applyZGravity();
        super.update();
    }
    collideWithObject(other)
    {
        // solid walls when below a platform top, pass over when above it
        if (other instanceof Platform)
            return this.zPos < other.height - groundEpsilon;
        return true;
    }
}

///////////////////////////////////////////////////////////////////////////////
// game hooks

function gameInit()
{
    threeInit();

    // player near the front of the scene
    player = new Player(vec2(0, -5));

    // box obstacles, low ones can be jumped onto, the gray one is a wall
    new Platform(vec2(-4,  0), vec2(3, 3), 1,   0xcc5555); // low box
    new Platform(vec2(-4,  4), vec2(3, 2), 2,   0xccaa55); // ledge above it
    new Platform(vec2( 0,  1), vec2(2, 2), .5,  0x55aacc); // first step
    new Platform(vec2( 2,  3), vec2(2, 2), 1,   0xcc55cc); // second step
    new Platform(vec2( 4,  5), vec2(2, 2), 1.5, 0x55cc99); // third step
    new Platform(vec2( 7,  0), vec2(2, 5), 3,   0x888888); // too tall, a wall

    // floating coins placed above the platforms and one on the ground path
    const coinSpots =
    [
        [vec2(-4,  0), 1.8], // above the low box
        [vec2(-4,  4), 2.8], // above the ledge
        [vec2( 0,  1), 1.3], // above the first step
        [vec2( 2,  3), 1.8], // above the second step
        [vec2( 4,  5), 2.3], // above the third step
        [vec2( 0, -2),  .8], // reachable from the ground
    ];
    for (const [pos, zPos] of coinSpots)
    {
        new Coin(pos, zPos);
        ++coinsTotal;
    }

    // start with the camera behind the player
    camera.position.set(player.pos.x, player.pos.y, player.zPos).add(cameraOffset);
}

function gameUpdate()
{
    // fixed offset chase camera, smoothly following the player
    // updated at the fixed 60 fps rate so the feel is refresh rate independent
    const eye = new THREE.Vector3(player.pos.x, player.pos.y, player.zPos).add(cameraOffset);
    camera.position.lerp(eye, cameraLerp);
}

function gameUpdatePost()
{
}

function gameRender()
{
    // render the three.js scene behind the 2D canvas
    threeRender();
}

function gameRenderPost()
{
    // 2D hud text always renders on top
    const pos = vec2(LJS.mainCanvasSize.x/2, 45);
    const done = coinsCollected == coinsTotal ? ' — You got them all!' : '';
    LJS.drawTextScreen(`Coins: ${coinsCollected} / ${coinsTotal}${done}`, pos, 35);
    LJS.drawTextScreen('Arrows/WASD run — Space jump', pos.add(vec2(0, 35)), 20);
}

///////////////////////////////////////////////////////////////////////////////
// startup LittleJS engine

LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
