/*
    LittleJS with Three.js Example
    - Renders a Three.js 3D scene on a canvas behind the LittleJS canvas
    - LittleJS WebGL is disabled so Three.js owns the only WebGL context
    - LittleJS draws 2D shapes, particles, and HUD text with Canvas2D on top
    - Cameras are synced so 1 LittleJS world unit = 1 Three.js unit at z=0
*/

'use strict';

// import LittleJS module and three.js
import * as LJS from '../../dist/littlejs.esm.js';
import * as THREE from 'three';
const {vec2, hsl} = LJS;

// disable LittleJS WebGL so the 2D canvas is the only LittleJS canvas
// must be called before engineInit so the WebGL canvas is never created
LJS.setGLEnable(false);

///////////////////////////////////////////////////////////////////////////////
// three.js rendering layer

let renderer, scene, camera;
const cameraFOV = 60; // vertical field of view in degrees

function threeInit()
{
    // create the renderer and insert its canvas behind the LittleJS canvas
    renderer = new THREE.WebGLRenderer({antialias: true});
    LJS.mainCanvas.parentElement.insertBefore(renderer.domElement, LJS.mainCanvas);

    // basic scene with lights and fog
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x102030);
    scene.fog = new THREE.Fog(0x102030, 30, 90);
    camera = new THREE.PerspectiveCamera(cameraFOV, 1, .1, 100);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(1, 2, 3);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x806040));

    // grid to make depth visible, rotated from XZ onto the XY plane
    const grid = new THREE.GridHelper(200, 100, 0x00aaff, 0x004488);
    grid.rotation.x = Math.PI/2;
    grid.position.z = -10;
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
    threeCanvas.style.cssText = LJS.mainCanvas.style.cssText;

    // sync the three.js camera to the LittleJS camera
    // distance is set so the z=0 plane matches LittleJS world space exactly
    const halfHeight = size.y / 2 / LJS.cameraScale;
    const distance = halfHeight / Math.tan(cameraFOV/2 * Math.PI/180);
    camera.position.set(LJS.cameraPos.x, LJS.cameraPos.y, distance);
    camera.rotation.z = -LJS.cameraAngle; // littlejs angles are clockwise
    renderer.render(scene, camera);
}

///////////////////////////////////////////////////////////////////////////////
// game hooks

let testCube;

function gameInit()
{
    threeInit();

    // spinning test cube at the world origin, z=0
    const material = new THREE.MeshStandardMaterial({color: 0x00ff88});
    testCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    scene.add(testCube);

    LJS.setCameraScale(48);
}

function gameUpdate()
{
    // spin the cube to show the 3D scene is live
    testCube.rotation.x += LJS.timeDelta;
    testCube.rotation.y += LJS.timeDelta;
}

function gameUpdatePost()
{
}

function gameRender()
{
    // render the three.js scene behind the 2D canvas
    threeRender();

    // 2D box drawn at the same world position as the cube to prove alignment
    LJS.drawRect(vec2(0, 0), vec2(1), hsl(0, 0, 1, .2));
}

function gameRenderPost()
{
    LJS.drawTextScreen('LittleJS + Three.js', vec2(LJS.mainCanvasSize.x/2, 40), 30);
}

///////////////////////////////////////////////////////////////////////////////
// startup LittleJS engine

LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
