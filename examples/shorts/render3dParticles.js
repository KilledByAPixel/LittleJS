let orbit = 0, fountain;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.05, .05, .1), rgb(.2, .1, .1), rgb(.05, .05, .05));
    render3D.ambientColor = rgb(.25, .25, .3);
    new EngineObject3D(vec3(), buildGrid(20, 20, 1, 1, rgb(.2, .2, .22)));

    // fire: additive, up, yellow to transparent red
    new ParticleEmitter3D(vec3(-4, .2, 0), .6, 0, 40, .3, undefined,
        rgb(1, .9, .3, .5), rgb(1, .5, 0, .5), rgb(1, 0, 0, 0), rgb(.5, 0, 0, 0),
        1, .8, 2, .05, .96, 0, .3, .3, true);

    // smoke above the fire: alpha, slow, grey puffs that grow
    new ParticleEmitter3D(vec3(-4, 2.5, 0), .8, 0, 6, .2, undefined,
        rgb(.5, .5, .55, .3), rgb(.3, .3, .35, .3), rgb(.4, .4, .45, 0), rgb(.4, .4, .45, 0),
        3, 1.5, 4, .03, .98, 0, .5, .2);

    // sparks: fast, gravity, every direction, textured with a tile from the sheet
    new ParticleEmitter3D(vec3(4, .5, 0), 0, 0, 40, PI, tile(3, 16),
        rgb(1, 1, .6), rgb(1, .8, .4), rgb(1, .5, 0, 0), rgb(1, .5, 0, 0),
        1.5, .3, .1, .2, .98, -.006, .2, .3, true);

    // a fountain that tilts with the camera: emits along its local +Y, so rotation3D aims it
    fountain = new ParticleEmitter3D(vec3(0, .5, 4), 0, 0, 120, .15, undefined,
        rgb(.5, .7, 1, .8), rgb(.8, .9, 1, .8), rgb(.5, .7, 1, 0), rgb(.5, .7, 1, 0),
        1.5, .25, .1, .25, 1, -.008, .1, .1);
}

function gameUpdate()
{
    fountain.rotation3D.z = sin(time) * .5;
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .002;
    render3D.camera.orbit(vec3(0, 2, 0), 14, orbit, .3);
}

function gameRenderPost()
{
    drawTextScreen('3D particles - fire, smoke, sparks and a fountain, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
