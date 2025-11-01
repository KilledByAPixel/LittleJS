/**
 * LittleJS - Release Mode
 * - This file is used for release builds in place of engineDebug.js
 * - Debug functionality is disabled to reduce size and increase performance
 */

'use strict';

let debugWatermark = 0;
let debugKey = '';
const debug = 0;
const debugOverlay = 0;
const debugPhysics = 0;
const debugParticles = 0;
const debugRaycast = 0;
const debugGamepads = 0;
const debugMedals = 0;

// debug commands are automatically removed from the final build
function ASSERT          (){}
function LOG             (){}
function debugInit       (){}
function debugUpdate     (){}
function debugRender     (){}
function debugRenderPost (){}
function debugRect       (){}
function debugPoly       (){}
function debugCircle     (){}
function debugPoint      (){}
function debugLine       (){}
function debugOverlap    (){}
function debugText       (){}
function debugClear      (){}
function debugScreenshot (){}
function debugShowErrors(){}
function debugVideoCaptureIsActive(){ return false; }
function debugVideoCaptureStart (){}
function debugVideoCaptureStop  (){}
function debugVideoCaptureUpdate(){}
function debugProtectConstant(o){ return o; }