let fountain;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.3,.1), hsl(0,.3,.2), hsl(0,0,.1));
    render3D.ambientColor = hsl(.6,.1,.3);
    new CameraControl3D(vec3(0,2,0), 14, .3, .002);

    // floor
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1, hsl(.6,.1,.2)));

    // fire
    new ParticleEmitter3D(
        vec3(-4,.2,0),                      // pos
        .6, 0, 40, .3, undefined,           // emitSize, emitTime, rate, cone, tileInfo
        hsl(.1,1,.7,.5), hsl(.1,1,.5,.5),   // colorStartA, colorStartB
        hsl(0,1,.5,0), hsl(0,1,.3,0),       // colorEndA, colorEndB
        1, .8, 2, .05, .96,                 // time, sizeStart, sizeEnd, speed, damping
        0, .3, .3, true                     // gravity, fade, randomness, additive
    );

    // smoke
    new ParticleEmitter3D(
        vec3(-4,2.5,0),                     // pos
        .8, 0, 6, .2, undefined,            // emitSize, emitTime, rate, cone, tileInfo
        hsl(.6,.1,.5,.3), hsl(.6,.1,.3,.3), // colorStartA, colorStartB
        hsl(.6,.1,.4,0), hsl(.6,.1,.4,0),   // colorEndA, colorEndB
        3, 1.5, 4, .03, .98,                // time, sizeStart, sizeEnd, speed, damping
        0, .5, .2                           // gravity, fade, randomness
    );

    // sparks, each one a ribbon along its last .15 seconds
    const sparks = new ParticleEmitter3D(
        vec3(4,.5,0),                       // pos
        0, 0, 40, PI, tile(0,16),           // emitSize, emitTime, rate, cone, tileInfo
        hsl(.2,1,.8), hsl(.1,1,.7),         // colorStartA, colorStartB
        hsl(.1,1,.5,0), hsl(.1,1,.5,0),     // colorEndA, colorEndB
        1.5, .3, .1, .2, .98,               // time, sizeStart, sizeEnd, speed, damping
        -.006, .2, .3, true                 // gravity, fade, randomness, additive
    );
    sparks.trailTime = .15;

    // fountain, emits along its local +Y so rotation3D aims it
    fountain = new ParticleEmitter3D(
        vec3(0,.5,4),                       // pos
        0, 0, 120, .15, undefined,          // emitSize, emitTime, rate, cone, tileInfo
        hsl(.6,1,.8,.8), hsl(.6,1,.9,.8),   // colorStartA, colorStartB
        hsl(.6,1,.8,0), hsl(.6,1,.8,0),     // colorEndA, colorEndB
        1.5, .25, .1, .25, 1,               // time, sizeStart, sizeEnd, speed, damping
        -.008, .1, .1                       // gravity, fade, randomness
    );
}

function gameUpdate()
{
    // sway the fountain
    fountain.rotation3D.z = sin(time)*.5;
}
