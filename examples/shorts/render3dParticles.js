let fountain;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.3,.1), hsl(0,.3,.2), hsl(0,0,.1));
    render3D.ambientColor = hsl(.6,.1,.3);
    new CameraControl3D(vec3(0,2,0), 14, .3, .002);

    // floor
    new EngineObject3D(vec3(), buildGrid(vec2(20), 1, hsl(.6,.1,.4)));

    // built-in effects, the same ones 2D games use, one line each
    particleEffect3D('fire', vec3(-5,1,0), {scale: 3});
    particleEffect3D('smoke', vec3(-5,3,0), {scale: 2});
    particleEffect3D('sparks', vec3(5,2,0), {scale: 3});

    // an emitter made by hand, a fountain; it emits along its local +Y
    // so rotation3D aims it
    fountain = new ParticleEmitter3D(
        vec3(0,.5,3),                      // pos
        0, 0,                              // emitSize, emitTime
        200, .15, undefined,               // rate, cone, tileInfo
        hsl(.6,1,.6,.8), hsl(0,0,1,.8),    // colorStartA, colorStartB
        hsl(.6,1,.6,0), hsl(0,0,1,0),      // colorEndA, colorEndB
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
