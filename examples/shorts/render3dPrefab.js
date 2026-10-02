// the 3D level editor as a prefab maker: the level here is the prefab, a
// little tower. Build with Box, Sphere, Cylinder and Light, then Save
// writes a file a game adds with level3DLoadPrefab and places as many
// times as it likes. Escape leaves the editor to look around

const color = (h, s, l)=> hsl(h, s, l).toString(false);

// a prefab is a level: objects about its own origin, the ground at 0
const prefab = {littlejs3D: 1, objects: [
    {id: 1, type: 'Box', pos: [0, 1, 0], scale: [2, 2, 2],
        properties: {color: color(.08, .3, .6)}},
    {id: 2, type: 'Cylinder', pos: [0, 2.4, 0], scale: [2.6, .8, 2.6],
        properties: {color: color(0, .5, .4)}},
    {id: 3, type: 'Sphere', pos: [0, 3.2, 0], scale: [.8, .8, .8],
        properties: {color: color(.15, .9, .6)}},
]};

function gameInit()
{
    new Render3DPlugin;
    render3D.setSky(hsl(.6,.5,.4), hsl(.6,.5,.8));
    render3D.shadows = true;
    render3D.sunDirection = vec3(-.4, 1, .6);

    // the ground is the game's own, not a part of the prefab
    const ground = new EngineObject3D(vec3(0, -.5, 0), render3D.boxMesh,
        undefined, hsl(.3,.3,.4));
    ground.scale3D = vec3(60, 1, 60);

    level3DLoad(prefab);
    new CameraControl3D(vec3(0, 2, 0), 14, .5, .003);
    render3D.camera.pos = vec3(0, 6, 12);
    render3D.camera.lookAt(vec3(0, 1.5, 0));
    levelEditor.open();
}
