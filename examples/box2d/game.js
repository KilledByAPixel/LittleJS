/*
    Little JS Box2d Demo
    - Demonstrates how to use Box2D with LittleJS
    - Several scenes to demonstrate Box2D features
    - Every type of shape and joint
    - Contact begin and end callbacks
    - Raycasting and querying
    - Collision filtering
    - User Interaction
*/

'use strict';

// show the LittleJS splash screen
setShowSplashScreen(true);
//box2dDebug = 1; // enable box2d debug draw

// game variables
const maxScenes = 10;
let scene = 0;
let sceneName;
let groundObject;
let mouseJoint;
let car;

///////////////////////////////////////////////////////////////////////////////
function gameInit()
{
    loadScene(scene);
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // scale canvas to fit based on 1080p
    cameraScale = mainCanvasSize.y * 48 / 1080;

    // mouse controls
    if (mouseWasPressed(0))
    {
        // grab object
        sound_click.play(mousePos);
        const object = box2dPointCast(mousePos);
        if (object)
            mouseJoint = box2dCreateMouseJoint(object, groundObject, mousePos);
    }
    if (mouseWasReleased(0))
    {
        // release object
        sound_click.play(mousePos, 1, .5);
        if (mouseJoint)
        {
            box2dDestroyJoint(mouseJoint);
            mouseJoint = 0;
        }
    }
    if (mouseWasPressed(1) || keyWasPressed('KeyZ'))
        spawnRandomObject(mousePos);
    if (mouseWasPressed(2) || keyWasPressed('KeyX'))
        explosion(mousePos);
    if (mouseJoint)
        mouseJoint.SetTarget(mousePos.getBox2d());

    if (keyWasPressed('KeyR'))
        loadScene(scene); // reset scene
    if (keyWasPressed('ArrowUp') || keyWasPressed('ArrowDown'))
    {
        // change scene
        scene += keyWasPressed('ArrowUp') ? 1 : -1;
        scene = mod(scene, maxScenes);
        loadScene(scene);
    }

    if (car)
    {
        // update car control
        const input = keyIsDown('ArrowLeft') - keyIsDown('ArrowRight');
        car.applyMotorInput(input);
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost()
{

}

///////////////////////////////////////////////////////////////////////////////
function gameRender()
{
    // draw a grey square in the background without using webgl
    drawRect(vec2(20,8), vec2(100), hsl(0,0,.8), 0, 0);

    if (scene == 5)
    {
        // raycast test
        const count = 100;
        const distance = 10;
        for (let i=count;i--;)
        {
            const start = mousePos;
            const end = mousePos.add(vec2(distance,0).rotate(i/count*PI*2));
            const result = box2dRaycast(start, end);
            const color = result ? hsl(0,1,.5,.5) : hsl(.5,1,.5,.5);
            drawLine(start, result ? result.point : end, .1, color);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
function gameRenderPost()
{
    // draw to overlay canvas for hud rendering
    const pos = vec2(mainCanvasSize.x/2, 50);
    drawText('LittleJS Box2D Demo', 80, 80);
    drawText(sceneName, 60, 100);
    if (scene == 0)
    {
        drawText('Mouse Left = Grab');
        drawText('Mouse Middle or Z = Spawn');
        drawText('Mouse Right or X = Explode');
        drawText('Arrows Up/Down = Change Scene');
    }
    if (scene == 3)
    {
        drawText('Right = Accelerate');
        drawText('Left = Reverse');
    }

    function drawText(text, size=40, gap=50)
    { drawTextScreen(text, pos, size, WHITE, size*.1); pos.y += gap; }
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine with Box2D

box2dEngineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);