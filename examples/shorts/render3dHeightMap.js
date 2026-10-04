const terrainSize = vec2(50), terrainHeight = 12, terrainSamples = 48;
let terrain, ball;

class Ball extends EngineObject3D
{
    constructor()
    {
        super(vec3(), render3D.sphereMesh);
        this.color = hsl(0,.8,.5);
        this.softShadow = 2;
    }
    update()
    {
        // roll downhill along the ground normal
        const p = this.pos3D;
        const normal = terrain.getNormal(p);
        const push = vec3(normal.x, 0, normal.z).scale(.02);
        this.velocity3D = this.velocity3D.add(push).scale(.99);
        p.y = terrain.getHeight(p) + .5;
    }
}

function makeTerrainImages(size)
{
    // paint height and color maps
    const heightContext = createCanvasContext(size);
    const colorContext = createCanvasContext(size);
    for (let y = size; y--;)
    for (let x = size; x--;)
    {
        // rolling hills from noise, rising toward the edges
        const edge = hypot(x/size - .5, y/size - .5)*1.5;
        const n1 = noise2D(x/12, y/12)*.5;
        const n2 = noise2D(x/5, y/5)*.15;
        const h = clamp(n1 + n2 - .15 + edge*edge);
        heightContext.fillStyle = hsl(0,0,h).toString();
        heightContext.fillRect(x, y, 1, 1);

        // grass low, rock high, snow on top
        const grass = hsl(.3,.5,.3 + h*.3);
        const rock = hsl(.1,.3,.4);
        const snow = hsl(0,0,.9);
        colorContext.fillStyle = (h<.5 ? grass : h<.7 ? rock : snow).toString();
        colorContext.fillRect(x, y, 1, 1);
    }
    return [heightContext.canvas, colorContext.canvas];
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.7,.6), hsl(.6,.6,.9));
    render3D.setFog(20, 60);
    render3D.sunDirection = vec3(.4,1,.5);
    render3D.smoothShading = true;
    new CameraControl3D(vec3(0,3,0), 35, .5, .002);

    // terrain from the two images
    const [heights, colors] = makeTerrainImages(terrainSamples);
    terrain = new HeightMap(heights, terrainSize, terrainHeight, colors);

    // trees on the grass, a trunk and a cone welded into one mesh
    const trunk = buildCylinder(.5, 2, 5), top = buildCone(3, 3.5, 6);
    const tree = new Mesh()
        .combine(trunk, vec3(0,1,0), hsl(.1,.6,.3))
        .combine(top, vec3(0,3.25,0), hsl(.3,.5,.3));
    for (let i = 80; i--;)
    {
        const x = rand(-22,22), z = rand(-22,22), y = terrain.getHeight(x, z);
        if (y < terrainHeight/2) // grass is below half height
            new EngineObject3D(vec3(x,y,z), tree);
    }

    // soft shadows follow the ground
    ball = new Ball;
    render3D.softShadowHeight = terrain;
}

function gameUpdate()
{
    if (keyWasPressed('Space')) // space toggles shading
    {
        render3D.smoothShading = !render3D.smoothShading;
        terrain.smooth = render3D.smoothShading;
        terrain.rebuild();
    }
    if (mouseWasPressed(2)) // right click moves the ball
    {
        const ray = render3D.screenToRay(mousePosScreen);
        const distance = terrain.raycast(ray);
        if (distance)
        {
            ball.pos3D = ray.getPosition(distance);
            ball.velocity3D = vec3();
        }
    }
}

function gameRenderPost()
{
    const text = 'right click: move the ball / space: toggle shading';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30, BLACK);
}

/* info
Terrain made from two small images painted in code: one says how high
the ground is and the other what color it is. Trees stand on the grass
and a red ball rolls downhill. Right click the terrain to put the ball
there, and press space to switch between smooth and flat shading. Drag
to turn the camera and roll the wheel to zoom.

## How it works
A `HeightMap` is a grid of heights from 0 to 1 that draws itself as
terrain and can be asked how high the ground is at any point.

### The two images
`makeTerrainImages` paints two canvases of 48 by 48 pixels, one pixel
for each point of the grid. `createCanvasContext(size)` makes an
offscreen canvas and returns its 2D context.

- The height `h` is two layers of `noise2D`, wide hills and small bumps,
  plus `edge*edge`, which grows away from the middle so the map's rim
  rises. `noise2D` returns 0 to 1 and changes smoothly from one point to
  the next. `clamp` keeps `h` from 0 to 1.
- The height image gets the gray `hsl(0,0,h)`. A `HeightMap` reads the
  red channel of an image as the height.
- The color image gets grass below .5, rock below .7 and snow above.

### The terrain
`new HeightMap(heights, mapSize, height, colors)` builds the terrain: 50
units along x and z, centered on the origin, and 12 units tall where the
image is white. Each pixel is one vertex, so 48 pixels a side make 47
cells a side. In place of the images it also takes arrays of rows.

### Trees
One tree mesh is made with `combine(mesh, pos, color)`, which appends a
mesh, moved and tinted, to the one it is called on: a thin cylinder for
the trunk and a cone on top. The loop tries 80 random places and asks
`terrain.getHeight(x, z)` for the ground there. A tree is made only
where that is below half the terrain's height, which is where the grass
is. Every tree is an `EngineObject3D` using the same mesh.

### The ball
`getNormal(pos)` is the direction straight out of the ground, so on a
slope it leans downhill. The ball adds the level part of it, scaled by
.02, to its `velocity3D` every frame, then keeps 99% of the speed so it
does not build up for ever. The engine moves it by `velocity3D`, and the
last line sets its height to the ground's plus .5, the ball's radius.

`softShadow = 2` draws a soft disc under the ball, and
`render3D.softShadowHeight = terrain` has that disc follow the ground.

### gameUpdate
`smooth` is part of the terrain's mesh, so space sets `terrain.smooth`
and calls `rebuild()` to make the mesh again.

`mouseWasPressed(2)` is the right button. `render3D.screenToRay` turns
the mouse's screen position into a ray from the camera, and
`terrain.raycast(ray)` returns how far along it the ground is, or
`undefined` for a miss. `ray.getPosition(distance)` is that point.

## Try it
- Set `terrainHeight` to `25` for steep mountains.
- Set `terrainSamples` to `16` to see the grid the terrain is made of.
- Change `h<.7` to `h<.55` for more snow.
- Change `.scale(.02)` to `.scale(.1)` and the ball rolls much faster.
- Bring the fog in with `render3D.setFog(5, 30);` and zoom in: the fog
  is then total 30 units from the camera, nearer than the map's middle.

## See also
3D Racing Game drives on a height map, and 3D Plugin in the full
examples is an island made of one. 3D Voxels is the other kind of
level. Objects with collision stand on a `HeightMap` without any code:
see `collideLevel` on `EngineObject3D`.
*/
