/*
    LittleJS Three.js Side Scroller Example
    - Uses the three.js plugin to render a 3D scene behind the LittleJS canvas
    - Aligned camera mode locks the 3D camera to the 2D camera at z=0
    - LittleJS draws 2D shapes, particles, and HUD text with Canvas2D on top
    - ThreeJSObject shows how LittleJS objects can drive three.js meshes
    - Controls: arrows or WASD to move, mouse wheel to zoom, click for particles
*/

'use strict';

// import LittleJS module and three.js
import * as LJS from '../../../dist/littlejs.esm.js';
import * as THREE from 'three';
const {vec2, hsl} = LJS;

// disable LittleJS WebGL so the 2D canvas is only used for UI and HUD stuff
LJS.setGLEnable(false);

///////////////////////////////////////////////////////////////////////////////
// objects that drive three.js meshes

// a mesh object that tumbles in 3D
class SpinObject extends LJS.ThreeJSObject
{
    constructor(pos, size, mesh, z, spinSpeed=1)
    {
        super(pos, size, mesh, z);
        this.spinSpeed = spinSpeed;
    }
    update()
    {
        super.update();
        this.mesh.rotation.x += this.spinSpeed * LJS.timeDelta;
        this.mesh.rotation.y += this.spinSpeed * LJS.timeDelta;
    }
}

// player object, littlejs physics drives the mesh
class Player extends LJS.ThreeJSObject
{
    constructor(pos)
    {
        const geometry = new THREE.TorusKnotGeometry(.4, .15, 64, 16);
        const material = new THREE.MeshStandardMaterial({color: 0x00ff88, roughness: .3});
        super(pos, vec2(1), new THREE.Mesh(geometry, material));
        this.damping = .9;
    }
    update()
    {
        // accelerate with arrows or wasd
        this.velocity = this.velocity.add(LJS.keyDirection().scale(.02));
        this.mesh.rotation.y += LJS.timeDelta;
        super.update();
    }
}

///////////////////////////////////////////////////////////////////////////////
// game hooks

let player, threeJS;

function gameInit()
{
    // setup the three.js plugin, the camera aligns to the 2D camera by default
    threeJS = new LJS.ThreeJSPlugin(THREE);

    // scene background, fog, and lights
    const scene = threeJS.scene;
    scene.background = new THREE.Color(0x102030);
    scene.fog = new THREE.Fog(0x102030, 30, 100);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(1, 2, 3);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x806040));

    // grid to make depth visible, rotated from XZ onto the XY plane
    const grid = new THREE.GridHelper(200, 100, 0x00aaff, 0x004488);
    grid.rotation.x = Math.PI/2; // rotate from XZ onto the XY plane
    grid.position.z = -10;       // behind the 2D world plane
    scene.add(grid);

    // player at the world origin
    player = new Player(vec2(0, 0));

    // ring of tumbling shapes receding in depth to show perspective parallax
    const geometries = [
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.SphereGeometry(.6, 32, 16),
        new THREE.ConeGeometry(.6, 1.2, 32),
        new THREE.TorusGeometry(.5, .2, 16, 32),
    ];
    for (let i = 0; i < 12; ++i)
    {
        const angle = i / 12 * 2 * Math.PI;
        const pos = vec2(0, 6).rotate(angle);
        const color = new THREE.Color().setHSL(i/12, 1, .5);
        const material = new THREE.MeshStandardMaterial({color, roughness: .5});
        const mesh = new THREE.Mesh(geometries[i%4], material);
        new SpinObject(pos, vec2(1), mesh, -i, LJS.rand(.5, 2));
    }

    LJS.setCameraScale(48);
}

function gameUpdate()
{
    // camera smoothly follows the player
    LJS.setCameraPos(LJS.cameraPos.lerp(player.pos, .1));

    // mouse wheel zooms the shared camera
    if (LJS.mouseWheel)
        LJS.setCameraScale(LJS.clamp(LJS.cameraScale * (1 - LJS.mouseWheel*.1), 16, 128));

    // scale fog with camera distance so depth cueing holds at every zoom
    // the plugin positions the camera during render, so read last frame's distance
    const distance = threeJS.camera.position.z;
    threeJS.scene.fog.near = distance + 10;
    threeJS.scene.fog.far = distance + 70;

    // click for a 2D particle burst, aligned with the 3D world at z=0
    if (LJS.mouseWasPressed(0))
    {
        const color = LJS.randColor();
        new LJS.ParticleEmitter(
            LJS.mousePos, 0,        // emitPos, emitAngle
            .2, .1, 200, Math.PI,   // emitSize, emitTime, rate, cone
            undefined,              // tileInfo
            color, color,           // colorStartA, colorStartB
            color.scale(1,0), color.scale(1,0), // colorEndA, colorEndB
            .5, .3, .1, .1, .05,    // time, sizeStart, sizeEnd, speed, angleSpeed
            .95, 1, 0, Math.PI,     // damping, angleDamping, gravityScale, cone
            .1, .5, false, true     // fadeRate, randomness, collide, additive
        );
    }
}

function gameUpdatePost()
{
}

function gameRender()
{
    // 2D crosshair on the player to prove z=0 world alignment
    const pos = player.pos;
    LJS.drawLine(pos.add(vec2(-.7, 0)), pos.add(vec2(.7, 0)), .05, hsl(0, 0, 1, .5));
    LJS.drawLine(pos.add(vec2(0, -.7)), pos.add(vec2(0, .7)), .05, hsl(0, 0, 1, .5));
}

function gameRenderPost()
{
    // 2D hud text always renders on top
    const pos = vec2(LJS.mainCanvasSize.x/2, 40);
    LJS.drawTextScreen('LittleJS + Three.js — 2D engine over a 3D scene', pos, 30);
    LJS.drawTextScreen('Arrows/WASD move — Wheel zoom — Click for particles', pos.add(vec2(0, 35)), 20);
}

///////////////////////////////////////////////////////////////////////////////
// startup LittleJS engine

LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
