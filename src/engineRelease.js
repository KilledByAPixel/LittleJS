/**
 * LittleJS - Release Mode
 * - Replaces engineDebug.js in production builds
 * - All debug functions are stubbed out as no-ops
 * - Removes ASSERT and LOG calls to reduce file size
 * - Disables debug overlay, watermark, and visualizations
 * - Improves performance by eliminating debug overhead
 * - Significantly reduces final bundle size
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