// materials: a brick wall and floor bumped by a normal map made in
// code, a polished ball reflecting the sky, and a tower whose windows
// glow from an emissive map, under a light that circles them

let light, bumped = [], shiny, normalMap;

// bricks with mortar between them and a few round dents, a height at
// each pixel of a 256 by 256 map, 8 bricks across and 16 rows
function brickHeight(x, y)
{
    const row = y >> 4, bx = (x + (row & 1)*16) & 31, by = y & 15;
    const mortar = bx < 2 || by < 2 ? 0 : 1;
    const dx = (x & 63) - 40, dy = (y & 63) - 24;
    const dent = max(0, 1 - hypot(dx, dy)/9);
    return mortar - dent*dent*.5;
}

// the tower's windows, a few lit, on a canvas as the emissive map
function windowTexture()
{
    const context = createCanvasContext(64);
    context.fillStyle = hsl(0,0,0).toString();
    context.fillRect(0, 0, 64, 64);
    const random = new RandomGenerator(3);
    for (let y = 4; y < 64; y += 12)
    for (let x = 6; x < 64; x += 14)
    {
        if (random.float() < .4)
            continue;
        context.fillStyle = hsl(.12, 1, random.float(.4, .7)).toString();
        context.fillRect(x, y, 8, 7);
    }
    return new TextureInfo(context.canvas);
}

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.62,.5,.35), hsl(.07,.6,.6), hsl(.6,.2,.1), .3);
    render3D.sunDirection = vec3(-.4,.6,.5);
    render3D.sunColor = hsl(.08,.5,.35);
    new CameraControl3D(vec3(0,2,0), 16, .4, .003);

    normalMap = normalMapFromHeight(vec2(256), brickHeight, 3);
    const stone = hsl(.05,.35,.55);
    const floor = new EngineObject3D(vec3(), buildGrid(vec2(16), 1),
        undefined, stone);
    const wall = new EngineObject3D(vec3(0,3,-4), render3D.boxMesh,
        undefined, stone);
    wall.scale3D = vec3(12,6,1);
    for (const o of bumped = [floor, wall])
    {
        o.normalMap = normalMap;
        o.specular = .3;
    }

    // polished: a sharp highlight and the sky in it, most at the edges
    shiny = new EngineObject3D(vec3(-3,1.5,0), render3D.sphereMesh,
        undefined, hsl(.6,.3,.15));
    shiny.scale3D = vec3(3);
    shiny.specular = 1;
    shiny.shininess = 100;
    shiny.reflectivity = .4;

    const tower = new EngineObject3D(vec3(3,2.5,0), render3D.boxMesh,
        undefined, hsl(.6,.1,.3));
    tower.scale3D = vec3(2,5,2);
    tower.emissiveMap = windowTexture();
    tower.emissiveMapColor = hsl(.1,1,.6);

    light = new Light3D(vec3(), 10, hsl(.55,1,.7), 2);
}

function gameUpdate()
{
    light.pos3D = vec3(cos(time)*5, 2.5, sin(time)*5 + 1);
    if (keyWasPressed('KeyN'))
        for (const o of bumped)
            o.normalMap = o.normalMap ? undefined : normalMap;
    if (keyWasPressed('KeyR'))
        shiny.reflectivity = shiny.reflectivity ? 0 : .4;
}

function gameRenderPost()
{
    const text = 'N: normal maps   R: reflection';
    drawTextScreen(text, vec2(mainCanvasSize.x/2, 40), 30);
}
