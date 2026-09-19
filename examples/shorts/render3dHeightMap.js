const terrainSize = 50, terrainHeight = 12, terrainSamples = 48;
let terrain, ground, ball, orbit = 0;

class Ball extends EngineObject3D
{
    constructor()
    {
        super(vec3(), buildSphere(1, 12, 6, true));
        this.color = hsl(0,.8,.5);
        this.softShadow = 2;
    }
    update()
    {
        // roll downhill along the ground normal
        const p = this.pos3D;
        const normal = terrain.getNormal(p.x, p.z);
        const push = vec3(normal.x, 0, normal.z).scale(.02);
        this.velocity3D = this.velocity3D.add(push).scale(.99);
        p.y = terrain.getHeight(p.x, p.z) + .5;
    }
}

function makeTerrainImages(size)
{
    // paint a height map and a color map
    const heightCanvas = new OffscreenCanvas(size, size);
    const colorCanvas = new OffscreenCanvas(size, size);
    const heightContext = heightCanvas.getContext('2d');
    const colorContext = colorCanvas.getContext('2d');
    for (let y = size; y--;)
    for (let x = size; x--;)
    {
        // rolling hills from noise, rising toward the edges
        const edge = hypot(x/size - .5, y/size - .5)*1.5;
        const n1 = noise2D(x/12, y/12)*.5;
        const n2 = noise2D(x/5, y/5)*.15;
        const h = clamp(n1 + n2 - .15 + edge*edge);
        heightContext.fillStyle = hsl(0,0,h);
        heightContext.fillRect(x, y, 1, 1);

        // grass low, rock high, snow on top
        const grass = hsl(.3,.5,.3 + h*.3);
        const rock = hsl(.1,.3,.4);
        const snow = hsl(0,0,.9);
        colorContext.fillStyle = h < .5 ? grass : h < .75 ? rock : snow;
        colorContext.fillRect(x, y, 1, 1);
    }
    return [heightCanvas, colorCanvas];
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.7,.6), hsl(.6,.6,.9));
    render3D.setFog(20, 60);
    render3D.lightDirection = vec3(-.4,-1,-.5).normalize();
    setRender3DSmoothShading(true);

    // the terrain from the two images
    const [heightImage, colorImage] = makeTerrainImages(terrainSamples);
    terrain = new HeightMap(heightImage, vec2(terrainSize), terrainHeight, colorImage);
    ground = new EngineObject3D(vec3(), terrain.buildMesh());

    // trees on the grass, a trunk and a cone welded into one mesh
    const trunk = buildCylinder(.5, 2, 5), top = buildCone(3, 3.5, 6);
    const tree = new Mesh()
        .combine(trunk, Matrix4.translation(vec3(0,1,0)), hsl(.1,.6,.3))
        .combine(top, Matrix4.translation(vec3(0,3.25,0)), hsl(.3,.5,.3));
    for (let i = 80; i--;)
    {
        const x = rand(-22,22), z = rand(-22,22), y = terrain.getHeight(x, z);
        if (y < 5)
        {
            const treeObject = new EngineObject3D(vec3(x,y,z), tree);
            treeObject.rotation3D.y = rand(2*PI);
        }
    }

    // soft shadows follow the ground
    ball = new Ball;
    render3D.softShadowHeight = (x, z)=> terrain.getHeight(x, z);
}

function gameUpdate()
{
    // space toggles shading, right click moves the ball
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        ground.mesh = terrain.buildMesh();
    }
    if (mouseWasPressed(2))
    {
        const ray = render3D.screenToRay(mousePosScreen);
        const distance = terrain.raycast(ray.origin, ray.direction);
        if (distance)
        {
            ball.pos3D = ray.origin.add(ray.direction.scale(distance));
            ball.velocity3D = vec3();
        }
    }

    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,3,0), 35, orbit, .5);
}

function gameRenderPost()
{
    const text = 'right click: move the ball / space: toggle shading';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}
