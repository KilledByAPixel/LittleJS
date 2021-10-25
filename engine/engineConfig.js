/*
    LittleJS Engine Configuration
*/

///////////////////////////////////////////////////////////////////////////////
// display settings

const maxWidth = 1920, maxHeight = 1200; // up to 1080p and 16:10
let defaultFont = 'arial';               // font used for text rendering
let fixedWidth = 0, fixedHeight = 0;     // use native resolution
let fixedFitToWindow = 1;                // stretch canvas to fit window
//const fixedWidth = 1280, fixedHeight = 720;  // 720p
//const fixedWidth = 1920, fixedHeight = 1080; // 1080p
//const fixedWidth = 128,  fixedHeight = 128;  // PICO-8
//const fixedWidth = 240,  fixedHeight = 136;  // TIC-80

///////////////////////////////////////////////////////////////////////////////
// tile sheet settings

const defaultTileSize = vec2(16); // default size of tiles in pixels
const tileBleedShrinkFix = .3;    // prevent tile bleeding from neighbors
let pixelated = 1;                // use crisp pixels for pixel art

///////////////////////////////////////////////////////////////////////////////
// webgl config

const glEnable = 1; // can run without gl (texured coloring will be disabled)
let glOverlay = 0;  // fix slow rendering in some browsers by not compositing the WebGL canvas

///////////////////////////////////////////////////////////////////////////////
// object config

const defaultObjectSize = vec2(.999);  // size of objecs, tiny bit less then 1 to fit in holes
const defaultObjectMass = 1;           // how heavy are objects for collison calcuations
const defaultObjectDamping = .99;      // how much to slow velocity by each frame 0-1
const defaultObjectAngleDamping = .99; // how much to slow angular velocity each frame 0-1
const defaultObjectElasticity = 0;     // how much to bounce 0-1
const defaultObjectFriction = .8;      // how much to slow when touching 0-1
const maxObjectSpeed = 1;              // camp max speed to avoid fast objects missing collisions

///////////////////////////////////////////////////////////////////////////////
// input config

const gamepadsEnable = 1;              // should gamepads be allowed
const touchInputEnable = 1;            // touch input is routed to mouse
const copyGamepadDirectionToStick = 1; // allow players to use dpad as analog stick
const copyWASDToDpad = 1;              // allow players to use WASD as direction keys

///////////////////////////////////////////////////////////////////////////////
// audio config

const soundEnable = 1;        // all audio can be disabled
let audioVolume = .5;         // volume for sound, music and speech
const defaultSoundRange = 30; // range where sound no longer plays
const defaultSoundTaper = .7; // what range percent to start tapering off sound 0-1

///////////////////////////////////////////////////////////////////////////////
// medals config

const medalDisplayTime = 5;       // how long to show medals
const medalDisplaySlideTime = .5; // how quick to slide on/off medals
const medalDisplayWidth = 640;    // width of medal display
const medalDisplayHeight = 99;    // height of medal display
const medalDisplayIconSize = 80;  // size of icon in medal display