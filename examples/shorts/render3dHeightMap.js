let terrain, terrainMesh, ball, orbit = 0;

class Ball extends EngineObject3D
{
    constructor()
    {
        super(vec3(), buildSphere(1, 12, 6, true), undefined, RED);
    }
    update()
    {
        // roll downhill, reset when it leaves the edge
        const p = this.pos3D;
        const slopeX = terrain.getHeight(p.x + .5, p.z) - terrain.getHeight(p.x - .5, p.z);
        const slopeZ = terrain.getHeight(p.x, p.z + .5) - terrain.getHeight(p.x, p.z - .5);
        this.velocity3D = this.velocity3D.add(vec3(-slopeX, 0, -slopeZ).scale(.01)).scale(.99);
        p.y = terrain.getHeight(p.x, p.z) + .5;
        this.rotation3D.x += this.velocity3D.z*2;
        this.rotation3D.z -= this.velocity3D.x*2;
        if (abs(p.x) > 24 || abs(p.z) > 24)
            this.pos3D = vec3(rand(-10,10), 0, rand(-10,10)), this.velocity3D = vec3();
    }
}

// paint a height map and a color map, standing in for an artist's images
function makeTerrainImages(size)
{
    const heightCanvas = new OffscreenCanvas(size, size), colorCanvas = new OffscreenCanvas(size, size);
    const heightContext = heightCanvas.getContext('2d'), colorContext = colorCanvas.getContext('2d');
    for (let y = 0; y < size; ++y)
    for (let x = 0; x < size; ++x)
    {
        // rolling hills from two octaves of noise, rising toward the edges
        const edge = hypot(x/size - .5, y/size - .5)*1.5;
        const h = clamp(noise2D(x/12, y/12)*.5 + noise2D(x/5, y/5)*.15 - .15 + edge*edge);
        heightContext.fillStyle = hsl(0,0,h);
        heightContext.fillRect(x, y, 1, 1);

        // grass low, rock high, snow on top
        colorContext.fillStyle = h < .5 ? hsl(.3,.5,.3 + h*.3) : h < .75 ? hsl(.08,.3,.4) : hsl(0,0,.9);
        colorContext.fillRect(x, y, 1, 1);
    }
    return [heightCanvas, colorCanvas];
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(rgb(.3,.5,.9), rgb(.8,.9,1));
    render3D.fogStart = 20;
    render3D.fogEnd = 60;
    render3D.lightDirection = vec3(-.4,-1,-.5).normalize();
    setRender3DSmoothShading(true);

    // 48x48 samples over 50 units, 12 tall, drawn from the callback so it can be rebuilt
    const [heightImage, colorImage] = makeTerrainImages(48);
    terrain = new HeightMap(heightImage, vec2(50), 12, colorImage);
    terrainMesh = terrain.buildMesh();
    render3D.onRenderOpaque = ()=> terrainMesh.render();

    // trees on the grass, a trunk and a cone welded into one mesh
    const tree = new Mesh()
        .combine(buildCylinder(.5, 2, 5), Matrix4.translation(vec3(0,1,0)), rgb(.4,.25,.1))
        .combine(buildCone(3, 3.5, 6), Matrix4.translation(vec3(0,3.25,0)), hsl(.35,.5,.25));
    for (let i = 0; i < 80; ++i)
    {
        const x = rand(-22,22), z = rand(-22,22), y = terrain.getHeight(x, z);
        if (y < 5)
            new EngineObject3D(vec3(x,y,z), tree).rotation3D.y = rand(2*PI);
    }

    // the ball's shadow follows the ground
    ball = new Ball;
    render3D.onRenderTransparent = ()=> render3D.drawShadow(ball.pos3D, 2, (x, z)=> terrain.getHeight(x, z));
}

function gameUpdate()
{
    // space toggles shading, right click drops the ball where the mouse hits the ground
    if (keyWasPressed('Space'))
    {
        setRender3DSmoothShading(!render3DSmoothShading);
        terrainMesh.dispose();
        terrainMesh = terrain.buildMesh();
    }
    if (mouseWasPressed(2))
    {
        const ray = render3D.screenToRay(mousePosScreen);
        const t = terrain.raycast(ray.origin, ray.direction);
        if (t !== undefined)
            ball.pos3D = ray.origin.add(ray.direction.scale(t)), ball.velocity3D = vec3();
    }

    // drag to orbit
    orbit += mouseIsDown(0) ? -mouseDeltaScreen.x*.01 : .002;
    render3D.camera.orbit(vec3(0,3,0), 35, orbit, .45);
}

function gameRenderPost()
{
    const text = '3D Height Map\nright click: drop the ball, space: shading, drag: orbit';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 50), 24);
}
