let title, light;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.shadows = true;
    render3D.ambientColor = hsl(.6,.2,.3);
    render3D.smoothShading = true;
    new CameraControl3D(vec3(0,2,0), 18, .3, .002); // drag orbits, wheel zooms

    // a checkerboard floor for the shadows to land on
    const checker = (x, z)=> hsl(.6, .1, (x+z)&1 ? .5 : .4);
    new EngineObject3D(vec3(), buildGrid(vec2(30), 15, checker));

    // the title, extruded from the engine font
    title = new EngineObject3D(vec3(0,4,-2), buildText3D('LITTLEJS 3D', 2, 1));
    title.color = hsl(.1,1,.6);
    title.specular = 1;

    // a cube and a sphere from the shared meshes, sized with scale3D
    const cube = new EngineObject3D(vec3(-5,1.5,3), render3D.boxMesh);
    cube.scale3D = vec3(3);
    cube.color = hsl(.55,.8,.6);
    cube.angleVelocity3D = vec3(0, .01, 0);
    const ball = new EngineObject3D(vec3(5,1.5,3), render3D.sphereMesh);
    ball.scale3D = vec3(3);
    ball.color = hsl(.95,.8,.6);
    ball.specular = .5;

    // a point light that circles the scene, with a glowing bulb to show it
    light = new Light3D(vec3(), 12, hsl(.1,1,.6), 2);
    const bulb = new EngineObject3D(vec3(), render3D.sphereMesh);
    bulb.scale3D = vec3(.5);
    bulb.color = hsl(.1,1,.7);
    bulb.emissive = 1;
    bulb.castShadow = false;
    light.addChild(bulb);
}

function gameUpdate()
{
    title.rotation3D = vec3(0, sin(time)*.3, 0); // sway to catch the light
    light.pos3D = vec3(8, 3, 0).rotateY(time);
}
