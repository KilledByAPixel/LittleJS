// Render3D plugin: terrain from a height map image with a color image, things standing on it

class Tree extends EngineObject3D
{
    constructor(x, z)
    {
        super(vec3(x, terrain.getHeight(x, z), z));
        // trunk and canopy welded into one mesh
        this.mesh = new Mesh()
            .combine(buildLathe([[.15, 0], [.1, 1]], 5), undefined, rgb(.4, .25, .1))
            .combine(buildLathe([[0, .8], [.8, 1.3], [0, 2.4]], 6), undefined, hsl(.3, .6, rand(.3, .5)));
        this.rotation3D.y = rand(2 * PI);
        this.scale3D = vec3(rand(.8, 1.4));
    }
}

class Ball extends EngineObject3D
{
    constructor()
    {
        super(vec3(), buildSphere(12, 6, true), RED);
        this.scale3D = vec3(.8);
        this.velocity3D = vec3();
    }
    update()
    {
        // roll downhill on the terrain, reset when it leaves
        const p = this.pos3D;
        const slopeX = terrain.getHeight(p.x + .5, p.z) - terrain.getHeight(p.x - .5, p.z);
        const slopeZ = terrain.getHeight(p.x, p.z + .5) - terrain.getHeight(p.x, p.z - .5);
        this.velocity3D = this.velocity3D.add(vec3(-slopeX, 0, -slopeZ).scale(.01)).scale(.99);
        this.pos3D = p.add(this.velocity3D);
        this.pos3D.y = terrain.getHeight(this.pos3D.x, this.pos3D.z) + .4;
        this.rotation3D.x += this.velocity3D.z * 2;
        this.rotation3D.z -= this.velocity3D.x * 2;
        if (abs(this.pos3D.x) > 24 || abs(this.pos3D.z) > 24)
            this.pos3D = vec3(rand(-10, 10), 0, rand(-10, 10)), this.velocity3D = vec3();
    }
}

let terrain, terrainMesh, ball, orbit = 0;

// paint a height map and a color map into canvases, the way an artist's images would arrive
function makeTerrainImages(size)
{
    const heightCanvas = new OffscreenCanvas(size, size), colorCanvas = new OffscreenCanvas(size, size);
    const heightContext = heightCanvas.getContext('2d'), colorContext = colorCanvas.getContext('2d');
    for (let y = 0; y < size; ++y)
    for (let x = 0; x < size; ++x)
    {
        // rolling hills from two octaves of noise, higher toward the edges
        const n = noise2D(x / 12, y / 12) * .6 + noise2D(x / 5, y / 5) * .2;
        const edge = Math.hypot(x / size - .5, y / size - .5) * 1.5;
        const h = clamp(n * .5 + .3 + edge * edge);
        heightContext.fillStyle = hsl(0, 0, h);
        heightContext.fillRect(x, y, 1, 1);
        // grass low, rock high, snow on top
        colorContext.fillStyle = h < .5 ? hsl(.3, .5, .3 + h * .3) : h < .75 ? hsl(.08, .3, .4) : hsl(0, 0, .9);
        colorContext.fillRect(x, y, 1, 1);
    }
    return [heightCanvas, colorCanvas];
}

function gameInit()
{
    new Render3DPlugin;
    render3D.sky = buildSky(rgb(.3, .5, .9), rgb(.8, .9, 1));
    render3D.fogColor = rgb(.8, .9, 1);
    render3D.fogStart = 20;
    render3D.fogEnd = 60;
    render3D.lightDirection = vec3(-.4, -1, -.5).normalize();

    // 48x48 samples over a 50 unit square, 12 units tall
    const [heightImage, colorImage] = makeTerrainImages(48);
    terrain = new HeightMap(heightImage, vec2(50, 50), 12, colorImage);
    terrainMesh = terrain.buildMesh();

    // trees on the grass, standing on the terrain
    for (let i = 0; i < 60; ++i)
    {
        const x = rand(-22, 22), z = rand(-22, 22);
        if (terrain.getHeight(x, z) < 5)
            new Tree(x, z);
    }
    ball = new Ball;

    render3D.onRender = ()=> terrainMesh.render();
    render3D.onRenderTransparent = ()=>
        render3D.drawShadow(ball.pos3D, 1, terrain.getHeight(ball.pos3D.x, ball.pos3D.z));
}

function gameUpdate()
{
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        terrainMesh.dispose();
        terrainMesh = terrain.buildMesh();
    }
    orbit += mouseIsDown(0) ? mouseDeltaScreen.x * .01 : .002;
    render3D.camera.pos = vec3(Math.sin(orbit) * 30, 18, Math.cos(orbit) * 30);
    render3D.camera.lookAt(vec3(0, 3, 0));
}

function gameRenderPost()
{
    const p = render3D.worldToScreen(ball.pos3D.add(vec3(0, 1.5, 0)));
    if (p)
        drawTextScreen('ball', p, 24, WHITE);
    drawTextScreen('Render3D height map - terrain from an image, space toggles shading, drag to orbit', vec2(mainCanvasSize.x / 2, 40), 28);
}
