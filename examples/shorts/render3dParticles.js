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

    // a fountain: splash kept going, its settings replaced by the options;
    // it emits along its local +Y so rotation3D aims it
    fountain = particleEffect3D('splash', vec3(0,.5,3), {scale: 2,
        emitTime: 0, emitRate: 200, emitConeAngle: .15, emitSize: 0,
        speed: .125, gravity: -.004, particleTime: 1});
}

function gameUpdate()
{
    // sway the fountain
    fountain.rotation3D.z = sin(time)*.5;
}
