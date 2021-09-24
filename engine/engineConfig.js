/*
    LittleJS Engine Configuration
*/

const engineName = 'LittleJS';
const engineVersion = 'v0.74';
const defaultFont = 'arial'; // font used for text rendering
const FPS = 60, timeDelta = 1/FPS; // engine uses a fixed time step

///////////////////////////////////////////////////////////////////////////////
// screen settings

const maxWidth = 1920, maxHeight = 1200; // up to 1080p and 16:10
let fixedWidth = 0, fixedHeight = 0; // use native resolution
//const fixedWidth = 1280, fixedHeight = 720;  // 720p
//const fixedWidth = 1920, fixedHeight = 1080; // 1080p
//const fixedWidth = 128,  fixedHeight = 128;  // PICO-8
//const fixedWidth = 240,  fixedHeight = 136;  // TIC-80

// tile sheet settings
const defaultTileSize = vec2(16); // default size of tiles in pixels
const tileBleedShrinkFix = .3;    // prevent tile bleeding from neighbors
const pixelated = 1;              // use crisp pixels for pixel art

///////////////////////////////////////////////////////////////////////////////
// webgl config
const glEnable = 1;     // can run without gl (texured coloring will be disabled)

///////////////////////////////////////////////////////////////////////////////
// object config
const defaultObjectSize = vec2(.99);
const defaultObjectMass = 1;
const defaultObjectDamping = .99;
const defaultObjectAngleDamping = .99;
const defaultObjectElasticity = 0;
const defaultObjectFriction = .8;
const maxObjectSpeed = 1;

///////////////////////////////////////////////////////////////////////////////
// input config

const gamepadsEnable = 1;
const touchInputEnable = 1;
const copyGamepadDirectionToStick = 1;
const copyWASDToDpad = 1;

///////////////////////////////////////////////////////////////////////////////
// audio config

const soundEnable = 1;       // all audio can be disabled
const defaultSoundRange = 15;// distance where taper starts
const soundTaperPecent = .5; // extra range added for sound taper
let audioVolume = .3;        // volume for sound, music and speech