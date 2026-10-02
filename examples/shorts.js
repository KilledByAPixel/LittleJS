class ExampleInfo
{
    constructor(name, filename, description='', largeExample=false, tags='', info='')
    {
        // the write-up for the info box: a short keeps its own in a /* info block at the end of its file,
        // a full example, which is a folder, has it here
        this.info = info;
        if (filename && !largeExample)
            filename = 'shorts/' + filename;
        this.name = name;
        this.filename = filename;
        this.description = description;
        this.largeExample = largeExample;
        this.tags = tags;
        this.isHeading = !filename;
        this.text = this.name;
        if (this.description)
            this.text += ' - ' + this.description;
        this.selectText = this.text;
        if (this.tags)
            this.selectText += ' (' + this.tags + ')';
    }
}

// the info box's write-up for each full example, by its folder: markdown, as in a short's /* info block
const fullExampleInfo =
{
starter: `
The project to copy when you start a game of your own. One page loads
the engine with a script tag, and \`game.js\` has the game functions that
\`engineInit\` is given, each with a little in it.

Move the mouse and the sparks follow it, bouncing off the tiles. Click
to play a sound, change the sparks' colors and unlock a medal. The mouse
wheel zooms.

## What it shows
- A level built from a map of text into a \`TileCollisionLayer\`
- A built-in particle effect, \`particleEffect('sparks', ...)\`, with
  some of its settings replaced
- A \`Sound\` made from ZzFX parameters, and a \`Medal\`
- Drawing in the world in \`gameRender\`, and text over everything in
  \`gameRenderPost\`

The folder also has a build script that packs the game into a zip.`,

breakout: `
A complete small game: break every brick with the ball. Click to launch
a ball and move the paddle with the mouse, a touch or a gamepad. R
starts again.

## What it shows
- A game written as ES modules that import the engine,
  \`import * as LJS from 'littlejs.esm.js'\`, split into a game file and
  an objects file
- Paddle, ball, bricks and walls as \`EngineObject\` classes with
  collision, as in the Pong Game short
- Sounds and particles when a brick breaks
- A post processing effect over the whole screen
- A score drawn with the engine's image font

## See also
Pong Game is the same idea in a few lines, and Post Effects shows the
built in screen effects.`,

platformer: `
A platforming game to build on: run, jump, shoot and throw grenades
through a level with crates, enemies and ground that can be destroyed.

## Controls
- Arrow keys move and jump, or a gamepad
- Z or the left mouse button shoots, C or the middle button throws a
  grenade, X or the right button dodges
- The mouse wheel zooms, R restarts the level
- T drops a crate at the mouse, E an enemy, and M moves the player there

## What it shows
- A level loaded from a Tiled JSON file into tile layers, with the
  objects it places
- A player and enemies built on one character class, with platforming
  physics and controls
- Destructible tiles, particles, sounds and a parallax background
- The level editor: press Escape, then 0, to edit the level and play it

## See also
The Platformer Game and Level Editor shorts are small versions of two
parts of this.`,

puzzle: `
A match three puzzle: drag a tile onto its neighbor to swap them, and
three or more in a row are cleared. R starts a new board.

## What it shows
- A board kept as an array, with the swaps and falls timed by \`Timer\`
- A tile sheet of high resolution art
- Tiles that fall into place, and particles where they clear
- The best score kept in local storage
- Mouse and touch handled by the same code

## See also
Sliding Puzzle is a smaller game on a grid, and Save / Load shows how
data is kept.`,

box2d: `
The Box2D physics plugin in several scenes. Up and down arrows change
the scene and R restarts it. Drag an object with the left mouse button,
hold Z or the middle button to drop more, and X or the right button
makes an explosion.

## What it shows
- Every type of shape and joint
- Callbacks when contacts begin and end
- Raycasts and queries for what is at a point
- Collision filtering, which says what collides with what
- Box2D bodies as LittleJS objects

## See also
The Box2D shorts each take one of these on its own: Box2D Demo, Box2D
Car, Box2D Pool and Box2D Tile Layer.`,

htmlMenu: `
A menu made of plain HTML over the game canvas. M opens it, and the
game is paused while it shows.

## What it shows
- HTML elements placed over the canvas and shown or hidden by the game
- Several kinds of input in it, buttons and a slider among them
- \`setPaused\` to hold the game while the menu is open

Use this way when a game's menus are forms and text, which HTML does
well. For a menu drawn by the engine itself, see UI System Plugin Demo.`,

uiSystem: `
A menu made with the UI system plugin, drawn by the engine on the game
canvas. M shows and hides it, and the game is paused while it shows.

## What it shows
- Buttons, text, checkboxes, sliders and more, as \`UIObject\` classes
  placed under a root object
- A modal window that asks for confirmation
- Moving through the menu with the keyboard or a gamepad as well as the
  mouse

## See also
The UI System, UI Layout and UI Tile Slice shorts each show one part.`,

'3d': `
A tour of the 3D plugin in one scene: an island to roll a ball around.
Arrow keys roll the ball, space jumps, and the orbs are there to
collect. F switches to a free camera to look around.

## What it shows
- Terrain from a height map, with shadows, fog and a sky
- Meshes built from shapes, a forest drawn with instancing, sprites and
  text in 3D
- Point lights, particles, a trail, bloom and sound placed in 3D

## See also
The shorts under LittleJS 3D take these one at a time, starting with 3D
Basics.`,

threejs: `
A small 3D platformer drawn by three.js, with LittleJS running the
game. Arrow keys or WASD run and space jumps.

## What it shows
- The three.js plugin: LittleJS does the input, physics and collision,
  and three.js draws the scene
- The 2D world as the ground plane, x and y, with each object keeping a
  height and a vertical speed of its own for jumping
- The LittleJS canvas on top, drawing only the text

Use this when a game needs what three.js has. The engine's own 3D
plugin, shown in 3D Plugin, needs no other library.`,
};

const exampleList =
[
    new ExampleInfo('--- BASIC EXAMPLES ---'),
    new ExampleInfo('Hello World', 'helloWorld.js', 'Simple starter example', false, 'beginner, gradient, text, tiles'),
    new ExampleInfo('Empty', 'empty.js', 'Empty example template', false, 'beginner, text'),
    new ExampleInfo('Shapes', 'shapes.js', 'Draw geometric shapes and primitives', false, 'circle, ellipse, rectangle, polygon, lines'),
    new ExampleInfo('Colors', 'colors.js', 'Color manipulation and HSL', false, 'hue, saturation, blending, rectangle'),
    new ExampleInfo('Vectors', 'vectors.js', 'Vector2 math operations', false, 'math, add, rotate, lerp, normalize, reflect'),
    new ExampleInfo('Text', 'text.js', 'Text with outlines, alignment, fonts, rows and screen placement', false, 'drawText, drawTextScreen, font, outline, align, beginner'),
    new ExampleInfo('Random', 'random.js', 'Random numbers, and a seeded generator that repeats', false, 'rand, randInt, randColor, RandomGenerator, seed, dice, beginner'),
    new ExampleInfo('--- RENDERING ---'),
    new ExampleInfo('Texture', 'texture.js', 'Texture display and manipulation', false, 'sprites, loading, tiles'),
    new ExampleInfo('Texture Wrapped', 'textureWrapped.js', 'Textures tiled with wrap counts', false, 'background, pattern, repeat, tile, sprites'),
    new ExampleInfo('Sprite Atlas', 'spriteAtlas.js', 'Sprite atlas and tile rendering', false, 'sheet, frames, tiles'),
    new ExampleInfo('Animation', 'animation.js', 'Sprite animation system', false, 'frames, loop, ping pong, tiles, sprites, SpriteAnimation, SpriteAnimator, clips'),
    new ExampleInfo('Texture Sheet', 'textureSheet.js', 'Pack images into a texture sheet at runtime', false, 'loadSprite, atlas, packing, sprites, frames'),
    new ExampleInfo('Texture Atlas', 'textureAtlas.js', 'Import a pre-packed atlas with named frames', false, 'loadAtlas, packer, animation, sprites'),
    new ExampleInfo('Blending', 'blending.js', 'Additive blending and transparency', false, 'alpha, color, tiles, smooth'),
    new ExampleInfo('Image Font', 'imageFont.js', 'Bitmap fonts, including the built-in one', false, 'text, characters'),
    new ExampleInfo('Particles', 'particles.js', 'Built-in particle effects placed, scaled and moved', false, 'effects, emitter, fire, smoke, sparks, comet, trail, particleEffect'),
    new ExampleInfo('Particle Effects', 'particleEffects.js', 'Every built-in particle effect, one line each', false, 'particles, effects, fire, smoke, explosion, sparks, magic, rain, snow, hue'),
    new ExampleInfo('Particle Options', 'particleOptions.js', 'One effect, and what each option does to it', false, 'particles, effects, options, scale, hue, saturation, tile, burst'),
    new ExampleInfo('Tile Layer', 'tileLayer.js', 'Tile layer rendering system', false, 'level, map, grid, particles'),
    new ExampleInfo('Low Resolution Output', 'lowRes.js', 'Crisp low resolution rendering', false, 'pixelated, retro, canvasFixedSize, pixel art'),
    new ExampleInfo('Clock', 'clock.js', 'Animated analog clock', false, 'time, rotation, lines, rectangle'),
    new ExampleInfo('Starfield', 'starfield.js', 'Animated parallax starfield', false, 'space, movement, depth, rectangle'),
    new ExampleInfo('Noise', 'noise.js', 'Value noise 1D and 2D fields', false, 'generative, procedural, noise1D, noise2D, random'),
    new ExampleInfo('Debug Drawing', 'debugDraw.js', 'Debug drawing system', false, 'debug, circle, line, rectangle'),
    new ExampleInfo('--- AUDIO ---'),
    new ExampleInfo('Sound Effects', 'sound.js', 'ZzFX sound effect generator', false, 'audio, volume, ui'),
    new ExampleInfo('Audio Effects', 'audioEffects.js', 'Filter, reverb, delay, distortion, and compressor', false, 'sound, ui'),
    new ExampleInfo('Music', 'music.js', 'Load, play, pause and stop music', false, 'music, sound, audio, streaming, volume, ui'),
    new ExampleInfo('Speak', 'speak.js', 'Text-to-speech with language, pitch and rate', false, 'audio, voice, tts, ui'),
    new ExampleInfo('Video', 'videoPlayer.js', 'Play, pause and stop a video', false, 'movie, sound, audio, streaming, volume, ui'),
    new ExampleInfo('Piano', 'piano.js', 'Interactive piano keyboard', false, 'music, sound, audio, notes, ui, instrument'),
    new ExampleInfo('Step Sequencer', 'sequencer.js', 'Build a simple music loop', false, 'music, sound, audio, notes, ui, instrument'),
    new ExampleInfo('Music Player', 'musicPlayer.js', 'Music player with seeking and drag and drop', false, 'sound, loading, audio, ui'),
    new ExampleInfo('--- INPUT & TIMERS ---'),
    new ExampleInfo('Input', 'input.js', 'Keyboard, mouse, touch and gamepad input', false, 'input, control'),
    new ExampleInfo('Vibrate', 'vibrate.js', 'Device and gamepad vibration', false, 'haptic, rumble, gamepad, mobile, ui'),
    new ExampleInfo('Camera Mouse Drag', 'cameraDrag.js', 'Drag the camera around with the mouse', false, 'ui, input, control'),
    new ExampleInfo('Timers', 'timers.js', 'Timer objects and UI', false, 'delay, interval, slider'),
    new ExampleInfo('--- PHYSICS & COLLISION ---'),
    new ExampleInfo('Physics', 'physics.js', 'Objects that fall, bounce, slide and float, and a sensor', false, 'gravity, restitution, friction, mass, gravityScale, collideWithObject, sensor, objects'),
    new ExampleInfo('Tile Raycast', 'tileRaycast.js', 'Raycasts against a tile layer', false, 'level, map, grid'),
    new ExampleInfo('Object Raycast', 'objectRaycast.js', 'Raycast against engine objects', false, 'collision, intersect, hit, query'),
    new ExampleInfo('Parent / Child', 'parentChild.js', 'EngineObject transform hierarchy', false, 'addChild, localPos, localAngle, attachment, hierarchy'),
    new ExampleInfo('Maze Generator', 'maze.js', 'Procedural maze generation', false, 'generative, level, tiles, map, grid'),
    new ExampleInfo('Path Finder', 'pathFinder.js', 'A* pathfinding with path smoothing', false, 'ai, navigation, astar, search'),
    new ExampleInfo('--- PLUGINS & UTILITIES ---'),
    new ExampleInfo('Save / Load', 'save.js', 'Persist data to local storage', false, 'localstorage, persistence, readSaveData, writeSaveData'),
    new ExampleInfo('Medals', 'medals.js', 'Achievement system', false, 'unlock, achievements, newgrounds'),
    new ExampleInfo('Tween', 'tween.js', 'Number, Vector2 and Color tweens with easing', false, 'animation, easing, lerp, pingpong, interpolation'),
    new ExampleInfo('Tween Advanced', 'tweenAdvanced.js', 'More tween features: chains, loops, easings, real time', false, 'animation, easing, then, loop, pingpong, bezier, pause, useRealTime'),
    new ExampleInfo('Scenes', 'scenes.js', 'A title, the game and game over, switched with setScene', false, 'scene, state, menu, pause, game over, persistent'),
    new ExampleInfo('Parallax', 'parallax.js', 'Background layers that follow the camera and repeat across the view', false, 'generative, canvas, background, mountains, scrolling, plugin'),
    new ExampleInfo('Nine Slice', 'nineSlice.js', 'Scalable UI panels', false, 'three slice, stretch, corners, text, tiles'),
    new ExampleInfo('Crescent', 'crescent.js', 'Moon phase crescent shapes', false, 'moon, phase, polygon, draw, circle, lunar'),
    new ExampleInfo('UI System', 'uiSystem.js', 'Buttons, sliders and checkboxes', false, 'objects, widgets, interactive'),
    new ExampleInfo('UI Layout', 'uiLayout.js', 'Menus laid out in rows, columns or grids', false, 'grid, menu, layout'),
    new ExampleInfo('UI Tile Slice', 'uiSlice.js', 'UI styled with nine-slice and tile art', false, 'skin, theme, nine slice, three slice, TileSlice, widgets, tiles'),
    new ExampleInfo('WebGL Shader', 'shader.js', 'Full canvas WebGL shader', false, 'webgl, visual, effect'),
    new ExampleInfo('Post Processing', 'postProcess.js', 'Your own shader code over the whole screen', false, 'webgl, visual, effect, shader, custom, wave'),
    new ExampleInfo('Post Effects', 'postEffects.js', 'The built in effects: TV, scanlines, vignette, glow and more', false, 'post process, tv, crt, scanlines, noise, vignette, curve, chromatic, bloom, glow, effect'),
    new ExampleInfo('Object Shaders', 'shaders.js', 'Custom shaders on sprites and draws', false, 'webgl, visual, effect, Shader, setShader'),
    new ExampleInfo('Light System', 'lightSystem.js', 'Soft additive 2D lights', false, 'webgl, visual, lighting, additive, color, glow'),
    new ExampleInfo('Light Shadows', 'lightShadows.js', 'Lights blocked by walls and tinted by glass', false, 'webgl, visual, lighting, shadow, shadows, glass, castShadow, emissive'),
    new ExampleInfo('Tweakables', 'tweakables.js', 'Change values live from a debug panel', false, 'debug, tweak, slider, tuning, panel'),
    new ExampleInfo('Level Editor', 'levelEditor.js', 'Paint a level and place objects, then play it', false, 'debug, editor, tiled, tile layer, objects, level, map'),
    new ExampleInfo('--- BOX2D PHYSICS ---'),
    new ExampleInfo('Box2D Demo', 'box2d.js', 'Box2D physics plugin', false, 'objects, mouse'),
    new ExampleInfo('Box2D Car', 'box2dCar.js', 'Drivable car with Box2D physics', false, 'objects, vehicle, suspension, wheels'),
    new ExampleInfo('Box2D Pool', 'box2dPool.js', 'Pool table game with Box2D physics', false, 'objects, game'),
    new ExampleInfo('Box2D Tile Layer', 'box2dTileLayer.js', 'Tile layer with Box2D physics', false, 'objects, level, map, grid'),
    new ExampleInfo('--- MINI GAMES ---'),
    new ExampleInfo('Pong Game', 'pongGame.js', 'Classic paddle ball bouncing', false, 'objects, collision'),
    new ExampleInfo('Flappy Game', 'flappyGame.js', 'Flappy bird style game', false, 'objects, obstacles'),
    new ExampleInfo('Lander Game', 'landerGame.js', 'Lunar lander style game', false, 'objects, physics'),
    new ExampleInfo('Hill Glide Game', 'hillGlideGame.js', 'Tiny wings style sliding game', false, 'objects, physics, speed'),
    new ExampleInfo('Sliding Puzzle', 'slidingPuzzle.js', '15 tile sliding puzzle', false, 'objects, numbers, ui'),
    new ExampleInfo('Platformer Game', 'platformer.js', 'Jump and run side view', false, 'objects, gravity, level, tiles, camera'),
    new ExampleInfo('Top Down Game', 'topDown.js', 'Top-down style camera', false, 'objects, movement, exploration'),
    new ExampleInfo('Tilted View Game', 'tiltedView.js', 'Pseudo 3D oblique view', false, 'isometric, depth'),
    new ExampleInfo('Space Game', 'spaceGame.js', 'Spaceship shooter with parallax', false, 'objects, weapons, stars, camera, rotation'),
    new ExampleInfo('Grapple Game', 'grappleGame.js', 'One button swinging grapple game', false, 'procedural, trail, camera, rotation'),
    new ExampleInfo('FPS Game', 'raycastingGame.js', 'Pseudo 3D raycasting demo', false, '3D, maze, camera'),
    new ExampleInfo('Ball Track Game', 'ballTrackGame.js', 'Pseudo 3D ball jumping game', false, '3D, procedural, camera, projection'),
    new ExampleInfo('--- LITTLEJS 3D ---'),
    new ExampleInfo('3D Basics', 'render3dBasics.js', 'Text, a cube, a sphere, a light and shadows', false, 'intro, basics, text, light, shadow, camera'),
    new ExampleInfo('3D Shapes', 'render3dShapes.js', 'The shape builders, lit and shadowed', false, 'mesh, sphere, lathe, shading, specular'),
    new ExampleInfo('3D Mesh Operations', 'render3dMeshOps.js', 'Bevels, CSG cuts, mirror and spin', false, 'mesh, bevel, chamfer, csg, subtract, union, intersect, mirror, spin'),
    new ExampleInfo('3D Billboards', 'render3dBillboards.js', 'Tile sprites that always face the camera', false, 'billboard, sprite, soft shadow'),
    new ExampleInfo('3D Height Map', 'render3dHeightMap.js', 'Terrain from height and color images', false, 'terrain, heightmap, raycast'),
    new ExampleInfo('3D Sync 2D', 'render3dSync2D.js', 'A 2D platformer with 2D physics, drawn in 3D', false, 'sync2D, 2D physics, platformer, tile collision, crates'),
    new ExampleInfo('3D Voxels', 'render3dVoxels.js', 'Walk, jump, dig and build in a voxel world', false, 'voxel, blocks, minecraft, first person, jump, VoxelMap'),
    new ExampleInfo('3D Collision', 'render3dCollision.js', 'Solid objects, bouncing and picking', false, 'solid, sphere, box, cylinder, picking'),
    new ExampleInfo('3D First Person', 'render3dFirstPerson.js', 'Walk a maze with mouse look, WASD and a flashlight', false, 'first person, camera, maze, flashlight, spotlight, shadows, night'),
    new ExampleInfo('3D Lens Flare', 'render3dLensFlare.js', 'The sun flares across the screen and hides behind pillars', false, 'lens flare, sun, glow, ghosts, occlusion'),
    new ExampleInfo('3D Lights', 'render3dLights.js', 'Colored point lights and a directional fill', false, 'light, point light, Light3D, DirectionalLight3D'),
    new ExampleInfo('3D Particles', 'render3dParticles.js', 'Fire, smoke, sparks and a fountain', false, 'particles, emitter, additive'),
    new ExampleInfo('3D Water', 'render3dWater.js', 'Rain on a pool, waves from a cellular automaton', false, 'water, waves, ripple, rain, cellular automaton, dynamicDraw, trails, particles'),
    new ExampleInfo('3D Ambient Occlusion', 'render3dAmbientOcclusion.js', 'Creases darkened from the depth texture', false, 'ambient occlusion, ssao, depth, depthTexture, post process, sceneDepth'),
    new ExampleInfo('3D Materials', 'render3dMaterials.js', 'Normal maps, reflections and glowing windows', false, 'material, normal map, bump, shininess, reflection, fresnel, emissive map, normalMapFromHeight'),
    new ExampleInfo('3D Trails', 'render3dTrails.js', 'Trails behind comets and a rippling flag', false, 'trail, ribbon, flag, deform'),
    new ExampleInfo('3D Drawing', 'render3dDraw.js', 'Immediate mode, drawn fresh each frame', false, 'immediate, draw, shadow'),
    new ExampleInfo('3D Text', 'render3dText.js', 'Text and sprites extruded into 3D', false, 'text, font, extrude'),
    new ExampleInfo('3D Layers', 'render3dLayers.js', '3D objects in front of and behind 2D', false, 'layers, align2D, renderAfter2D'),
    new ExampleInfo('3D Mesh', 'render3dMesh.js', 'Load an OBJ or glTF model, or drop one in', false, 'obj, gltf, glb, model, load'),
    new ExampleInfo('3D Textures', 'render3dTextures.js', 'Repeating, wrapped and mipmapped textures', false, 'texture, uv, wrap, mipmap'),
    new ExampleInfo('3D Glow', 'render3dGlow.js', 'Bloom from the post processing plugin', false, 'bloom, post processing, light'),
    new ExampleInfo('3D Instancing', 'render3dInstancing.js', 'Thousands of cubes in one draw call', false, 'instancing, batch, performance, InstancedMesh3D'),
    new ExampleInfo('3D Shaders', 'render3dShaders.js', 'Custom surface and lighting shaders', false, 'shader, Shader, lighting, toon'),
    new ExampleInfo('3D Level Editor', 'render3dLevelEditor.js', 'Place boxes, lights and coins, then walk around', false, 'debug, editor, level, level3DLoad, level3DAddType, handles, snap, free camera'),
    new ExampleInfo('3D Prefab Maker', 'render3dPrefab.js', 'Build a prefab in the level editor and save it for a game to place', false, 'debug, editor, prefab, level3DAddPrefab, level3DLoadPrefab, reuse'),
    new ExampleInfo('3D Dodge Game', 'render3dDodgeGame.js', 'Dodge boxes tumbling in from every side', false, 'chase camera, shadows, sound'),
    new ExampleInfo('3D Racing Game', 'render3dRacingGame.js', 'Race laps around a hilly track', false, 'racing, terrain, chase camera'),
    new ExampleInfo('3D Puzzle Game', 'render3dPuzzleGame.js', 'Sokoban style block pushing puzzle', false, 'orthographic, picking, pads'),
    new ExampleInfo('--- FULL EXAMPLES ---'),
    new ExampleInfo('Starter', 'starter', 'Clean project template', true, 'base, empty, particles', fullExampleInfo['starter']),
    new ExampleInfo('Breakout Game', 'breakout', 'Complete breakout game', true, 'objects, physics, score', fullExampleInfo['breakout']),
    new ExampleInfo('Platforming Game', 'platformer', 'Platformer with level loading', true, 'jump, world, tiles, pixel art, sprites', fullExampleInfo['platformer']),
    new ExampleInfo('Puzzle Game', 'puzzle', 'Match 3 style puzzle game', true, 'match, swap, sprites', fullExampleInfo['puzzle']),
    new ExampleInfo('Box2D Plugin', 'box2d', 'Full Box2D physics demo', true, 'objects, bodies, joints', fullExampleInfo['box2d']),
    new ExampleInfo('HTML Menus', 'htmlMenu', 'HTML UI integration', true, 'web, browser, overlay, button, slider, textbox', fullExampleInfo['htmlMenu']),
    new ExampleInfo('UI System Plugin Demo', 'uiSystem', 'Complete UI system demo', true, 'menu, overlay, button, slider, checkbox', fullExampleInfo['uiSystem']),
    new ExampleInfo('3D Plugin', '3d', 'An island with shadows, lights and bloom', true, 'terrain, heightmap, shadows, lights', fullExampleInfo['3d']),
    new ExampleInfo('Three.js 3D Demo', 'threejs', '3D platformer rendered with Three.js', true, 'camera, mesh, physics', fullExampleInfo['threejs']),
];

///////////////////////////////////////////////////////////////////////////////

// global variables
let iframeExample; // iframe of the current loaded example
let inputTimeout;  // timeout to debounce input
let consoleAutoScroll; // allow console to scroll automatically

function initExampleBrowser()
{
    // load the examples into the list
    filterExamples();

    // set the selected example from the URL parameters, or the first one
    const name = new URLSearchParams(window.location.search).get('example');
    selectExampleByName(name) || selectExampleByName(exampleList[1].name);

    // apply responsive layout
    addEventListener('resize', resizeWindow);
    resizeWindow();
}

function resizeWindow()
{
    // tweak layout for touch devices
    const isTouchDevice = window.ontouchstart !== undefined;
    if (isTouchDevice)
        container4.style.display = 'none';
    else
        selectExampleText.style.display = 'none';

    const windowAspect = innerWidth / innerHeight;
    const verticalLayout = windowAspect < 1;
    if (verticalLayout)
    {
        // vertical layout for thin screens
        if (container2.parentNode != container3)
            container3.insertBefore(container2, divCodeOptions);
        // resize iframe to the window
        setFrameSize(innerWidth-35);

        // fix code mirror sizing glitch
        codeMirror && codeMirror.setSize(innerWidth-35, null);
    }
    else
    {
        // horizontal layout for wide screens
        if (container2.parentNode != container1)
            container1.appendChild(container2);

        // show full controls
        container4.style.display = '';

        // resize iframe to fit half the window
        setFrameSize(innerWidth/2);

        // fix code mirror sizing glitch
        codeMirror && codeMirror.setSize(innerWidth/2 - 35, null);
    }

    function setFrameSize(w)
    {
        const aspect = 16 / 9; // HD aspect ratio
        w = w | 0;
        const h = w / aspect | 0;
        iframeContainer.style.width = w + 'px';
        iframeContainer.style.height = h + 'px';

        if (iframeExample)
        {
            // ensure iframe fills container tightly
            iframeExample.style.width = w + 'px';
            iframeExample.style.height = h + 'px';
        }

        // fix code mirror after layout changes
        if (codeMirror)
        {
            // fix glitch with code mirror sizing
            setTimeout(()=>codeMirror.refresh(), 500);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// setting examples

function setExample()
{
    // get the original index if this is a filtered result
    const selectedOption = selectExample.options[selectExample.selectedIndex];
    let exampleIndex = selectedOption && selectedOption.originalIndex ?
        parseInt(selectedOption.originalIndex) :
        selectExample.selectedIndex;

    // make sure we have a valid example
    if (exampleIndex < 0 || exampleIndex >= exampleList.length)
        exampleIndex = 1;  // reset to default
    if (!exampleList[exampleIndex].filename)
        exampleIndex = 1;

    // load the example
    const example = exampleList[exampleIndex];
    exampleInfo.innerText = example.text;
    const filename = 'examples/' + example.filename;
    exampleLink.href = 'https://github.com/KilledByAPixel/LittleJS/tree/main/' + filename;
    exampleLink.innerText = 'View on GitHub: ' + example.filename;

    // update URL parameter
    const url = new URL(window.location);
    url.searchParams.set('example', example.name);
    window.history.replaceState({}, '', url);

    loadFile(example.filename, example.largeExample, example.info || example.description + '.');
}

// each load is numbered: a file that arrives after another example was selected is not shown, so the example
// selected last is the one that shows, whatever order the files come in
// fallbackInfo is what the info box shows for an example with no write-up in its file: a full example's from the
// list, or a line about a short whose write-up is not written yet, so the box is never empty
let loadFileCount = 0;
async function loadFile(filename, largeExample, fallbackInfo='')
{
    const load = ++loadFileCount;
    if (codeMirror)
        codeMirror.setOption('readOnly', largeExample);
    else
        textareaCode.disabled = largeExample;

    // disable buttons in large example mode
    setFrameControlsEnabled(!largeExample);

    if (largeExample)
    {
        setExampleInfo(fallbackInfo);

        // Show message in code view that full examples can't be edited
        const text = 'Code view not available for large examples.';
        setCode(text, filename);
        codeIsJS = false;
        if (codeMirror)
        {
            codeMirror.off('change', codeInput);
            codeMirror.setOption('mode', 'text');
            codeMirror.setValue(text);
        }
        else
            textareaCode.value = text;
        clearTimeout(inputTimeout);
        return;
    }

    try
    {
        const response = await fetch(filename);
        if (!response.ok)
            throw new Error('Could not load file: ' + filename);
        const {code: text, info} = splitExampleInfo(await response.text());
        if (load !== loadFileCount)
            return; // another example was selected while this one loaded
        setExampleInfo(info || fallbackInfo);

        // set the code in both code mirror and textarea
        codeIsJS = true;
        if (codeMirror)
        {
            codeMirror.on('change', codeInput);
            codeMirror.setOption('mode', 'javascript');
            codeMirror.setValue(text);
        }
        else
            textareaCode.value = text;
        clearTimeout(inputTimeout);
        setCode(text);
    }
    catch (error)
    {
        if (load !== loadFileCount)
            return;
        setExampleInfo(fallbackInfo);
        setErrorMessage(error.message);
    }
}

// a short ends with its write-up: a block comment whose first line is /* info, the last thing in the file.
// The editor shows the code without it, and the box under the code shows it. A block that is not last is
// not one, and the file is shown whole
function splitExampleInfo(text)
{
    const match = /(?:^|\n)\/\* info[ \t]*\r?\n([\s\S]*?)\*\/\s*$/.exec(text);
    if (!match || match[1].includes('*/'))
        return {code: text, info: ''};
    const code = text.slice(0, match.index).replace(/\r\n/g, '\n').trimEnd() + '\n';
    return {code, info: match[1].replace(/\r\n/g, '\n').trim()};
}

// the info's markdown as html: headings, paragraphs, lists of one level, code, bold, italic and links.
// Everything is escaped first, so the text shows as written and can add no markup. In code, each name the docs
// have links to its entry, and in See also the name of an example links to the example
function renderExampleInfo(markdown, exampleNames=[], docsLinks)
{
    const escape = (s)=> s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // code that starts with a name, or a chain of them like render3D.pick, links each name the docs have;
    // what follows them, the arguments of a call or an assignment, is left as it is
    const codeLinks = (code)=>
    {
        const match = /^(new\s+|\.)?([A-Za-z_$][\w$]*(?:\.[\w$]+)*)(.*)$/.exec(code);
        if (!docsLinks || !match)
            return code;
        const names = match[2].split('.').map((name)=> docsLinks.has(name) ?
            `<a href="${docsLinks.get(name)}" target="_blank" rel="noopener">${name}</a>` : name);
        return (match[1] || '') + names.join('.') + match[3];
    };
    const inline = (s)=>
    {
        // code spans are set aside first, so nothing inside one is read as markdown
        const spans = [];
        s = escape(s).replace(/`([^`]+)`/g, (m, code)=> '\0' + (spans.push(code) - 1) + '\0');
        // a star opens or closes only against a word's outside, so the stars of a*b and 2 * 3 stay stars
        s = s.replace(/(?<![\w*])\*\*(?=\S)([^*]+)(?<=\S)\*\*(?![\w*])/g, '<b>$1</b>');
        s = s.replace(/(?<![\w*])\*(?=\S)([^*]+)(?<=\S)\*(?![\w*])/g, '<i>$1</i>');
        // a link to another example, ?example=Name, stays in the page; any other opens a new tab
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url)=>
            /^https?:\/\//.test(url) || !url.includes(':') ?
                `<a href="${url}"${url[0] == '?' ? '' : ' target="_blank" rel="noopener"'}>${text}</a>` : m);
        return s.replace(/\0(\d+)\0/g, (m, i)=> '<code>' + codeLinks(spans[i]) + '</code>');
    }

    let html = '', type = '', parts = [];
    const flush = ()=>
    {
        if (type === 'p')
            html += '<p>' + inline(parts.join(' ')) + '</p>';
        else if (type)
            html += `<${type}>` + parts.map((part)=> '<li>' + inline(part) + '</li>').join('') + `</${type}>`;
        type = ''; parts = [];
    }
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; ++i)
    {
        const line = lines[i];
        let match;
        if (line.startsWith('```'))
        {
            flush();
            const code = [];
            while (++i < lines.length && !lines[i].startsWith('```'))
                code.push(lines[i]);
            html += '<pre>' + escape(code.join('\n')) + '</pre>';
        }
        else if (!line.trim())
            flush();
        else if (match = /^(#{1,3}) +(.*)/.exec(line))
        {
            flush();
            const level = match[1].length + 1; // the page's title is the h1
            html += `<h${level}>` + inline(match[2]) + `</h${level}>`;
        }
        else if (match = /^(-|\d+\.) +(.*)/.exec(line))
        {
            const listType = match[1] === '-' ? 'ul' : 'ol';
            if (type !== listType)
                flush();
            type = listType;
            parts.push(match[2]);
        }
        else if (type && type !== 'p' && /^\s/.test(line))
            parts[parts.length-1] += ' ' + line.trim(); // a list item goes on
        else
        {
            if (type !== 'p')
                flush();
            type = 'p';
            parts.push(line.trim());
        }
    }
    flush();

    // from See also on, the name of an example links to it: the longest names first, so Box2D Tile Layer is
    // not read as Tile Layer, in the text only and not in code
    const seeAlso = html.indexOf('<h3>See also</h3>');
    if (seeAlso >= 0 && exampleNames.length)
    {
        const names = [...exampleNames].sort((a, b)=> b.length - a.length)
            .map((name)=> name.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'));
        const pattern = new RegExp(`(^|[^A-Za-z0-9])(${names.join('|')})(?![A-Za-z0-9])`, 'g');
        let inCode = false;
        const linked = html.slice(seeAlso).split(/(<[^>]+>)/).map((part)=>
        {
            if (part[0] == '<')
            {
                part == '<code>' && (inCode = true);
                part == '</code>' && (inCode = false);
                return part;
            }
            return inCode ? part : part.replace(pattern, (m, before, name)=>
                before + `<a href="?example=${encodeURIComponent(name)}">${name}</a>`);
        });
        html = html.slice(0, seeAlso) + linked.join('');
    }
    return html;
}

// the docs' search index as a map from a name to its page and anchor, for the names that mean one thing: a
// name on a namespace page, a function, a global or a class, wins over a class member of the same name, and a
// name two classes share, like pos or update, is left out
function buildDocsLinks(index)
{
    const rows = new Map;
    for (const row of index)
        if (row.k != 'namespace')
            (rows.get(row.n) || rows.set(row.n, []).get(row.n)).push(row);
    const links = new Map;
    for (const [name, list] of rows)
    {
        const top = list.filter((row)=> row.p == row.ns + '.html');
        const row = list.length == 1 ? list[0] : top.length == 1 ? top[0] : undefined;
        row && links.set(name, '../docs/' + row.p + (row.a ? '#' + row.a : ''));
    }
    return links;
}

// that map, from the index the page loaded with the docs' own search.js
const docsLinks = typeof docsSearchIndex == 'object' ? buildDocsLinks(docsSearchIndex) : undefined;

// show an example's info in its box, from its top
function setExampleInfo(info)
{
    exampleInfoBox.innerHTML = renderExampleInfo(info, exampleList.map((example)=> example.name), docsLinks);
    exampleInfoBox.scrollTop = 0;
}

// select an example by its name, as a link in the info box does, and show it: true when there is one
function selectExampleByName(name)
{
    const index = exampleList.findIndex((example)=> example.name === name);
    if (index < 0 || exampleList[index].isHeading)
        return false;

    // a search may have left it out of the list: clear the search and it is back
    const find = ()=> [...selectExample.options].find((option)=> option.originalIndex === index);
    const option = find() || (filterExamples(1), find());
    selectExample.selectedIndex = option.index;
    setExample();
    return true;
}

// go to the example before or after this one, in the list as the search has it, past the headings and around its
// ends, so a phone, where the list is a picker, can go through them by a button
function stepExample(direction)
{
    const options = selectExample.options, count = options.length;
    let i = selectExample.selectedIndex;
    for (let n = count; n--;)
    {
        i = (i + direction + count) % count;
        if (!options[i].disabled)
            break;
    }
    if (!count || options[i].disabled)
        return; // nothing matches the search
    selectExample.selectedIndex = i;
    setExample();
}

function filterExamples(reset=0)
{
    if (reset)
        inputSearch.value = '';

    // clear current options
    selectExample.options.length = 0;

    // filter and add matching examples
    const searchTerm = inputSearch.value.toLowerCase().trim();

    // first pass: find which examples match
    const matchingIndices = [];
    for (let i = 0; i < exampleList.length; i++)
    {
        const example = exampleList[i];
        if (!example.filename)
            continue;

        // Check if search term matches name, description, or tags
        if (example.name.toLowerCase().includes(searchTerm) ||
            example.filename.toLowerCase().includes(searchTerm) ||
            example.description.toLowerCase().includes(searchTerm) ||
            example.tags.toLowerCase().includes(searchTerm))
            matchingIndices.push(i);
    }

    // second pass: add headings and matching examples
    for (let i = 0; i < exampleList.length; i++)
    {
        const example = exampleList[i];
        if (example.isHeading)
        {
            // check if there are any matches between this and the next
            for (let j = i + 1; j < exampleList.length; j++)
            {
                if (exampleList[j].isHeading)
                    break; // hit next heading
                if (matchingIndices.includes(j))
                {
                    // only add heading if there are matches under it
                    const o = new Option(example.text);
                    o.disabled = true;
                    selectExample.add(o);
                    break;
                }
            }
        }
        else if (matchingIndices.includes(i))
        {
            // add matching example
            const o = new Option(example.selectText);
            o.originalIndex = i;
            selectExample.add(o);
        }
    }

    if (!selectExample.options.length)
    {
        // show a message if no matches were found
        const o = new Option(`No examples found matching '${searchTerm}'`);
        o.disabled = true;
        selectExample.add(o);
    }
}

///////////////////////////////////////////////////////////////////////////////
// setting code

function codeInput()
{
    if (!checkboxLiveEdit.checked)
        return;

    // debounce input - get content from code mirror if available, otherwise from textarea
    clearTimeout(inputTimeout);
    const code = codeMirror ? codeMirror.getValue() : textareaCode.value;
    inputTimeout = setTimeout(()=> setCode(code), 500);
}

function restartCode()
{
    // manually restart/run the code regardless of live edit setting
    const code = codeMirror ? codeMirror.getValue() : textareaCode.value;
    setCode(code);
}

function setFrameControlsEnabled(enabled=true)
{
    buttonPause.disabled = !enabled;
    buttonRestart.disabled = !enabled;
    buttonScreenshot.disabled = !enabled;
    buttonFullscreen.disabled = !enabled;
    checkboxWebGL.disabled = !enabled;
}

function setCode(code, filename)
{
    const largeExample = !!filename;
    filename = filename || 'shorts/base.html';

    clearTimeout(inputTimeout);
    if (iframeExample)
        iframeContainer.removeChild(iframeExample);

    unsetErrorMessage();
    unsetConsoleMessage();
    iframeExample = document.createElement('iframe');
    iframeContainer.appendChild(iframeExample);

    iframeExample.onload = ()=>
    {
        if (largeExample)
            return;

        // get the iframe content window and document
        const iframeContent = iframeExample.contentWindow;
        const iframeDocument = iframeContent.document;
        if (!iframeContent.engineInit)
        {
            setErrorMessage(`Failed to load ${filename}`);
            return;
        }

        // intercept errors
        function getErrorLine(stack)
        {
            // try to extract line number from stack trace
            // look for <anonymous> or injectedScript to find user code
            const anonymousMatch = stack?.match(/(<anonymous>|injectedScript):(\d+)/);
            return anonymousMatch ? parseInt(anonymousMatch[2]) : -1;
        }
        iframeContent.onerror = (message, source, lineno, colno, error)=>
        {
            let text = message;
            if (lineno)
                text += ` (Line:${lineno}, Column:${colno})`
            if (error && error.stack)
                text += `\n` + error.stack;
            setErrorMessage(text);
            setErrorLine(lineno);
        }
        iframeContent.onunhandledrejection = (event)=>
        {
            setErrorMessage(event.reason);
            if (event.reason && event.reason.stack)
            {
                const errorLine = getErrorLine(event.reason.stack);
                if (errorLine >= 0)
                    setErrorLine(errorLine);
            }
        };

        // intercept asserts
        const originalAssert = iframeContent.console.assert;
        iframeContent.console.assert = function (condition, ...output)
        {
           if (!condition)
           {
                const stack = (new Error).stack;
                const errorLine = getErrorLine(stack);
                if (errorLine >= 0)
                    setErrorLine(errorLine);

                // format output parameters properly
                const outputMessage = output.length > 0 ? output.map(m => stringifyMessage(m)).join(' ') : '';
                setErrorMessage('Assertion failed!\n' + outputMessage + '\n' + stack);
           }
            originalAssert.apply(this, arguments);
        };

        // intercept console prints
        const originalConsole = iframeContent.console;
        function interceptConsole(method)
        {
            const original = originalConsole[method];
            iframeContent.console[method] = function(...args)
            {
                const message = args.map(m=>stringifyMessage(m)).join('\n');
                setConsoleMessage(message);
                original.apply(originalConsole, args);
            };
        }
        ['log','info','warn','error','debug'].forEach(f=>interceptConsole(f));

        {
            // hook up buttons
            buttonScreenshot.onclick = ()=>
            {
                if (iframeContent.debugScreenshot)
                    iframeContent.debugScreenshot();
            }

            // pause/resume functionality
            buttonPause.onclick = ()=>
            {
                if (!iframeContent.getPaused || !iframeContent.setPaused)
                    return;

                const paused = !iframeContent.getPaused();
                iframeContent.setPaused(paused);
                buttonPause.textContent = paused ? 'Resume' : 'Pause';
            }
            buttonPause.textContent = 'Pause';

            // fullscreen functionality
            buttonFullscreen.onclick = ()=> iframeContent.toggleFullscreen();
        }

        // the tile sheet has a 1 pixel border around each tile, set before the short runs so it can change it
        iframeContent.setTileDefaultPadding(1);

        // create a script element that overrides the default functions
        const overrideScript = iframeDocument.createElement('script');
        iframeDocument.body.appendChild(overrideScript);
        // prepend without a newline so error line numbers stay correct
        overrideScript.text = (checkboxUseStrict.checked ? `'use strict';` : '') + code;

        if (textareaError.style.display === 'block')
            return;

        // start LittleJS engine
        iframeContent.engineInit(iframeContent.gameInit, iframeContent.gameUpdate, iframeContent.gameUpdatePost, iframeContent.gameRender, iframeContent.gameRenderPost, ['tiles.png?'+Date.now()])
        .catch(error =>
        {
            const errorLine = error ? getErrorLine(error.stack) : -1;
            if (errorLine >= 0)
                setErrorLine(errorLine);
            let message = error;
            if (error && error.message)
                message = error.message;
            if (error && error.stack)
                message += '\n' + error.stack;
            setErrorMessage(message);
            throw error;
        })
        .then(()=>
        {
            // setup frame controls
            setFrameControlsEnabled();
            if (iframeContent.glCanEnable())
                iframeContent.setGLEnable(checkboxWebGL.checked);
            else
                checkboxWebGL.disabled = true;
            checkboxWebGL.onchange = ()=> iframeContent.setGLEnable(checkboxWebGL.checked);
        })
    }

    iframeExample.src = filename + '?' + Date.now();
}

///////////////////////////////////////////////////////////////////////////////
// error and console messages

function stringifyMessage(message)
{
    // make sure message is a string
    if (message === null)
        return 'null';
    if (Number.isNaN(message))
        return 'NaN';
    if (message === undefined)
        return 'undefined';
    if (message === 0)
        return '0';
    if (message === false)
        return 'false';
    return message;
}

function setMessage(message, element, clear=true)
{
    message = stringifyMessage(message);
    if (clear || !element.value)
        element.value = message;
    else
        element.value += '\n' + message;
    element.style.display = message ? 'block' : '';

    if (element === textareaConsole)
    {
        const maxConsoleLines = 100;
        const lines = element.value.split('\n');
        if (lines.length > maxConsoleLines)
        {
            // limit max lines, prevents slowdown from too many lines
            const excessLines = lines.length - maxConsoleLines;
            element.value = lines.slice(excessLines).join('\n');
        }

        // auto scroll to bottom only if user hasn't manually scrolled
        if (consoleAutoScroll)
            element.scrollTop = element.scrollHeight;
    }
}

function unsetMessage(element)
{
    element.style.display = '';
    element.value = '';
}

function clearErrorLine()
{
    if (!codeMirror || !errorLineMarker)
        return;
    codeMirror.getDoc().removeLineClass(errorLineMarker, 'background', 'error-line');
}

function setErrorLine(lineNumber)
{
    if (!lineNumber || lineNumber <= 0)
        return;

    if (codeMirror)
    {
        clearErrorLine();
        --lineNumber; // codeMirror uses 0-based line numbers
        errorLineMarker = codeMirror.getDoc().addLineClass(lineNumber, 'background', 'error-line');
    }
}

function setErrorMessage(message)
{
    // prevent overwriting an existing error message
    const errorMessageIsVisible = textareaError.style.display === 'block';
    setFrameControlsEnabled(false);
    if (!errorMessageIsVisible)
        setMessage(message, textareaError);
}
function unsetErrorMessage() { unsetMessage(textareaError); clearErrorLine(); }
function setConsoleMessage(message) { setMessage(message, textareaConsole, false); }
function unsetConsoleMessage() { unsetMessage(textareaConsole); consoleAutoScroll = true; }
function onScrollConsole()
{
    // only auto scroll console is it is scrolled to bottom
    const tolerance = 5; // pixels of tolerance
    consoleAutoScroll = Math.abs(textareaConsole.scrollTop - (textareaConsole.scrollHeight - textareaConsole.clientHeight)) < tolerance;
}
textareaConsole.addEventListener('scroll', onScrollConsole);

///////////////////////////////////////////////////////////////////////////////
// load saved preferences from localStorage
const saveName = 'LittleJSExamples';
let savedTheme;

function readSaveData()
{
    // load saved preferences
    const defaultTheme = 'littlejs';
    const defaultFontSize = '16px';
    const saveDataJSON = localStorage.getItem(saveName);
    const saveData = saveDataJSON ? JSON.parse(saveDataJSON) : {};
    selectTheme.value = savedTheme = saveData.theme ?? defaultTheme;
    selectFontSize.value = saveData.fontSize ?? defaultFontSize;
    checkboxShowInfo.checked = saveData.showInfo ?? true;
    showExampleInfo();
}

// the info box shows while Show Info is checked, and the code has its space while it is not
function showExampleInfo()
{
    exampleInfoBox.style.display = checkboxShowInfo.checked ? '' : 'none';
}
readSaveData();

function writeSaveData()
{
    // Save preferences to localStorage
    const theme = selectTheme.value;
    const fontSize = selectFontSize.value;
    const saveData =
    {
        theme,
        fontSize,
        showInfo: checkboxShowInfo.checked
    };
    const saveDataJSON = JSON.stringify(saveData);
    localStorage.setItem(saveName, saveDataJSON);
}

function resetDefaults()
{
    localStorage.removeItem(saveName);
    readSaveData();
    loadTheme();
}

///////////////////////////////////////////////////////////////////////////////
// setup code mirror

const useCodeMirror = true;
let codeMirror; // code mirror instance
let errorLineMarker; // marker for error line in code mirror
let codeIsJS; // is the current code javascript

const themes =
[
    'littlejs',
    '3024-night',
    'abcdef',
    'ambiance',
    'blackboard',
    'monokai',
    'duotone-light',
    'icecoder',
    'lesser-dark',
    'night',
    'yonce'
];

// load theme and font size
for (const theme of themes)
{
    if (theme != 'littlejs')
        addCodeMirrorElement(`theme/${theme}.min.css`, 'link', 'stylesheet');
    const o = new Option(theme);
    o.selected = theme === savedTheme;
    selectTheme.add(o);
}

if (useCodeMirror)
{
    addCodeMirrorElement('codemirror.min.js', 'script').onload = ()=>
    addCodeMirrorElement('codemirror.min.css', 'link', 'stylesheet').onload = ()=>
    addCodeMirrorElement('addon/edit/matchbrackets.js', 'script').onload = ()=>
    addCodeMirrorElement('mode/javascript/javascript.min.js', 'script').onload = ()=>
    {
        if (codeMirror)
            return; // prevent duplicate initialization

        const textareaCode = document.getElementById('textareaCode');
        codeMirror = CodeMirror.fromTextArea(textareaCode,
        {
            theme: savedTheme,
            indentUnit: 4,
            mode: codeIsJS ? 'javascript' : 'text',
            lineNumbers: true,
            lineWrapping: true,
            matchBrackets: true,
        });
        codeMirror.on('change', codeInput);
        loadTheme();
        resizeWindow(); // fix cursor positioning issue on startup
    }
}

function addCodeMirrorElement(filename, type, rel)
{
    // add element for code mirror
    const e = document.createElement(type);
    e.rel = rel;
    filename = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/' + filename;
    if (type === 'link')
        e.href = filename;
    else
        e.src = filename;
    e.crossOrigin = 'anonymous';
    document.head.appendChild(e);
    return e;
}

function loadTheme()
{
    // Apply the theme and font size
    const theme = selectTheme.value;
    const fontSize = selectFontSize.value;
    textareaCode.style.fontSize = fontSize;
    if (codeMirror)
    {
        codeMirror.getWrapperElement().style.fontSize = fontSize;
        codeMirror.setOption('theme', theme);
    }

    // Save preferences to localStorage
    writeSaveData();
}

///////////////////////////////////////////////////////////////////////////////
// wire up UI event handlers (replacing inline on*= attributes from the HTML)

selectTheme.addEventListener('change', loadTheme);
selectFontSize.addEventListener('change', loadTheme);
checkboxLiveEdit.addEventListener('change', writeSaveData);
checkboxUseStrict.addEventListener('change', restartCode);
checkboxShowInfo.addEventListener('change', ()=>
{
    showExampleInfo();
    writeSaveData();
    codeMirror && codeMirror.refresh(); // the code's height changed
});
exampleInfoBox.addEventListener('click', (e)=>
{
    // a See also link switches the example in the page
    const link = e.target.closest('a[href^="?example="]');
    if (!link)
        return;
    e.preventDefault();
    selectExampleByName(new URL(link.href).searchParams.get('example'));
});
textareaCode.addEventListener('input', codeInput);
inputSearch.addEventListener('input', ()=> filterExamples());
inputSearch.addEventListener('keydown', e=> { if (e.key === 'Escape') filterExamples(1); });
buttonRestart.addEventListener('click', restartCode);
buttonPrev.addEventListener('click', ()=> stepExample(-1));
buttonNext.addEventListener('click', ()=> stepExample(1));
selectExample.addEventListener('change', setExample);

///////////////////////////////////////////////////////////////////////////////

// start up the browser
initExampleBrowser()
