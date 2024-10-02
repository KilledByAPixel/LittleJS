/** 
 * LittleJS - Release Mode
 * - This file is used for release builds in place of engineDebug.js
 * - Debug functionality is disabled to reduce size and increase performance
 */

'use strict';

let showWatermark = 0;
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
function debugInit       (){}
function debugUpdate     (){}
function debugRender     (){}
function debugRect       (){}
function debugPoly       (){}
function debugCircle     (){}
function debugPoint      (){}
function debugLine       (){}
function debugOverlap    (){}
function debugText       (){}
function debugClear      (){}
function debugSaveCanvas (){}
function debugSaveText   (){}
function debugSaveDataURL(){}