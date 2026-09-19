let orbit = 0, fountain;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.05,.05,.1), rgb(.2,.1,.1), rgb(.05,.05,.05));
    render3D.ambientColor = rgb(.25,.25,.3);
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1, rgb(.2,.2,.22)));

    // fire
    new ParticleEmitter3D(
        vec3(-4,.2,0),                    // pos
        .6, 0, 40, .3, undefined,         // emitSize, emitTime, rate, cone, tileInfo
        rgb(1,.9,.3,.5), rgb(1,.5,0,.5),  // colorStartA, colorStartB
        rgb(1,0,0,0), rgb(.5,0,0,0),      // colorEndA, colorEndB
        1, .8, 2, .05, .96,               // time, sizeStart, sizeEnd, speed, damping
        0, .3, .3, true                   // gravity, fade, randomness, additive
    );

    // smoke
    new ParticleEmitter3D(
        vec3(-4,2.5,0),                   // pos
        .8, 0, 6, .2, undefined,          // emitSize, emitTime, rate, cone, tileInfo
        rgb(.5,.5,.55,.3), rgb(.3,.3,.35,.3), // colorStartA, colorStartB
        rgb(.4,.4,.45,0), rgb(.4,.4,.45,0),   // colorEndA, colorEndB
        3, 1.5, 4, .03, .98,              // time, sizeStart, sizeEnd, speed, damping
        0, .5, .2                         // gravity, fade, randomness
    );

    // sparks, each one a ribbon along its last .15 seconds
    const sparks = new ParticleEmitter3D(
        vec3(4,.5,0),                     // pos
        0, 0, 40, PI, tile(0,16),         // emitSize, emitTime, rate, cone, tileInfo
        rgb(1,1,.6), rgb(1,.8,.4),        // colorStartA, colorStartB
        rgb(1,.5,0,0), rgb(1,.5,0,0),     // colorEndA, colorEndB
        1.5, .3, .1, .2, .98,             // time, sizeStart, sizeEnd, speed, damping
        -.006, .2, .3, true               // gravity, fade, randomness, additive
    );
    sparks.trailTime = .15;

    // fountain, emits along its local +Y so rotation3D aims it
    fountain = new ParticleEmitter3D(
        vec3(0,.5,4),                     // pos
        0, 0, 120, .15, undefined,        // emitSize, emitTime, rate, cone, tileInfo
        rgb(.5,.7,1,.8), rgb(.8,.9,1,.8), // colorStartA, colorStartB
        rgb(.5,.7,1,0), rgb(.5,.7,1,0),   // colorEndA, colorEndB
        1.5, .25, .1, .25, 1,             // time, sizeStart, sizeEnd, speed, damping
        -.008, .1, .1                     // gravity, fade, randomness
    );
}

function gameUpdate()
{
    fountain.rotation3D.z = sin(time)*.5;
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,2,0), 14, orbit, .3);
}

function gameRenderPost()
{
    const text = '3D Particles\nfire, smoke, sparks and a fountain, drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
