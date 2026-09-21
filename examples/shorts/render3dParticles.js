let fountain;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.3,.1), hsl(0,.3,.2), hsl(0,0,.1));
    render3D.ambientColor = hsl(.6,.1,.3);
    new CameraControl3D(vec3(0,2,0), 14, .3, .002);

    // floor
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1, hsl(.6,.1,.3)));

    // fire
    new ParticleEmitter3D(
        vec3(-4,1,0),                      // pos
        3, 0,                              // emitSize, emitTime
        40, .3, undefined,                 // rate, cone, tileInfo
        hsl(.1,1,.5,.5), hsl(.15,1,.7,.5), // colorStartA, colorStartB
        hsl(0,1,.5,0), hsl(0,1,.3,0),      // colorEndA, colorEndB
        1, 2, 0,                           // time, sizeStart, sizeEnd
        .1, .96, 0,                        // speed, damping, gravity
        .3, .3, true                       // fade, randomness, additive
    );

    // smoke
    new ParticleEmitter3D(
        vec3(-4,2,0),                      // pos
        2, 0,                              // emitSize, emitTime
        6, .2, undefined,                  // rate, cone, tileInfo
        hsl(0,0,.5,.3), hsl(0,0,.2,.3),    // colorStartA, colorStartB
        hsl(0,0,.5,0), hsl(0,0,.2,0),      // colorEndA, colorEndB
        3, 1.5, 4,                         // time, sizeStart, sizeEnd
        0, .98, .001,                      // speed, damping, gravity
        .5, .2                             // fade, randomness
    );

    // sparks, each one a ribbon along its last .15 seconds
    const sparks = new ParticleEmitter3D(
        vec3(4,.5,0),                      // pos
        0, 0,                              // emitSize, emitTime
        300, PI, tile(0,16),               // rate, cone, tileInfo
        hsl(.2,1,.8), hsl(.1,1,.7),        // colorStartA, colorStartB
        hsl(0,1,.5,0), hsl(0,1,.5,0),      // colorEndA, colorEndB
        1, .3, .1,                         // time, sizeStart, sizeEnd
        .2, .98, -.005,                    // speed, damping, gravity
        .2, .3, true                       // fade, randomness, additive
    );
    sparks.trailTime = .15;

    // fountain, emits along its local +Y so rotation3D aims it
    fountain = new ParticleEmitter3D(
        vec3(0,.5,4),                      // pos
        0, 0,                              // emitSize, emitTime
        200, .15, undefined,               // rate, cone, tileInfo
        hsl(.6,1,.6,.8), hsl(.7,1,1,.8),   // colorStartA, colorStartB
        hsl(.6,1,.6,0), hsl(.7,1,1,0),     // colorEndA, colorEndB
        1, .2, .4,                         // time, sizeStart, sizeEnd
        .25, 1, -.008,                     // speed, damping, gravity
        .1, .1                             // fade, randomness
    );
}

function gameUpdate()
{
    // sway the fountain
    fountain.rotation3D.z = sin(time)*.5;
}
