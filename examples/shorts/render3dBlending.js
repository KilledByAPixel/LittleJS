// Render3D plugin: alpha smoke and additive fire in one scene, the transparent stage sorts them far to near

class Puff extends EngineObject3D
{
    constructor(pos, additive)
    {
        super(pos);
        this.transparent = true;
        this.additive = additive;
        this.velocity3D = vec3(rand(-.02, .02), rand(.03, .06), rand(-.02, .02));
        this.life = 1;
    }
    update()
    {
        this.pos3D = this.pos3D.add(this.velocity3D);
        this.life -= .01;
        if (this.life <= 0)
            this.destroy();
    }
    render3D()
    {
        // fire is an additive glow, smoke is an alpha blended soft disc, both face the camera
        render3D.additive = this.additive;
        const size = 1 + (1 - this.life) * 2;
        const color = this.additive ? hsl(.08 * this.life, 1, .5, this.life) : rgb(.3, .3, .35, this.life * .5);
        render3D.drawSoftDisc(this.pos3D, render3D.cameraForward.scale(-1), size, color);
        render3D.additive = false;
    }
}

let floorMesh, pillarMesh, orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.sky = buildSky(rgb(.05, .05, .1), rgb(.2, .1, .1), rgb(.05, .05, .05));
    render3D.ambientColor = rgb(.2, .2, .25);
    render3D.lightDirection = vec3(.3, -1, .5).normalize();
    floorMesh = buildGrid(20, 20, 1, 1, undefined, ()=> rgb(.2, .2, .22));
    pillarMesh = buildLathe([[.6, 0], [.5, 4]], 8);
    for (let i = 0; i < 4; ++i)
    {
        // pillars around the fire, sprites in front of and behind them show the sorting
        const a = i / 4 * 2 * PI + PI / 4;
        new EngineObject3D(vec3(Math.sin(a) * 3, 0, Math.cos(a) * 3), pillarMesh, rgb(.5, .45, .4));
    }
    render3D.onRender = ()=> floorMesh.render();
}

function gameUpdate()
{
    // one puff of each kind per frame from the fire pit
    new Puff(vec3(rand(-.5, .5), .2, rand(-.5, .5)), true);
    new Puff(vec3(rand(-.5, .5), .2, rand(-.5, .5)), false);

    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .003;
    render3D.camera.pos = vec3(Math.sin(orbit) * 9, 4, Math.cos(orbit) * 9);
    render3D.camera.lookAt(vec3(0, 1.5, 0));
}

function gameRenderPost()
{
    drawTextScreen('3D blending - additive fire and alpha smoke sorted together, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
