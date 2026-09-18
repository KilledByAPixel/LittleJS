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
        this.life -= .01;
        if (this.life <= 0)
            this.destroy();
    }
    render3D()
    {
        // fire is an additive glow that fades as it rises, smoke is an alpha blended puff that grows
        render3D.additive = this.additive;
        if (this.additive)
            render3D.drawSoftDisc(this.pos3D, .8, hsl(.08 * this.life, 1, .5, this.life * .4), undefined, 8);
        else
            render3D.drawSoftDisc(this.pos3D, .8 + (1 - this.life) * 1.5, rgb(.5, .5, .55, this.life * .4), undefined, 8);
        render3D.additive = false;
    }
}

let orbit = 0;

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.05, .05, .1), rgb(.2, .1, .1), rgb(.05, .05, .05));
    render3D.ambientColor = rgb(.2, .2, .25);
    render3D.lightDirection = vec3(.3, -1, .5).normalize();

    // a floor and pillars around the fire, puffs pass in front of and behind them
    new EngineObject3D(vec3(), buildGrid(20, 20, 1, 1, rgb(.2, .2, .22)));
    const pillar = buildCylinder(.5, 4, 8);
    for (let i = 0; i < 4; ++i)
    {
        const a = i / 4 * 2 * PI + PI / 4;
        new EngineObject3D(vec3(sin(a) * 3, 2, cos(a) * 3), pillar, rgb(.5, .45, .4));
    }
}

function gameUpdate()
{
    // one puff of each kind per frame from the fire pit
    new Puff(vec3(rand(-.5, .5), .2, rand(-.5, .5)), true);
    new Puff(vec3(rand(-.5, .5), .2, rand(-.5, .5)), false);

    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .003;
    render3D.camera.orbit(vec3(0, 1.5, 0), 10, orbit, .3);
}

function gameRenderPost()
{
    drawTextScreen('3D blending - additive fire and alpha smoke sorted together, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
