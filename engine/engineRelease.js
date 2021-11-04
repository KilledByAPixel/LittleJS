/*
    LittleJS - Release build include file
    - This file is used for release builds in place of engineDebug.js
    - Debug functionality will be disabled to lower size and increase performance
*/

'use strict';

const debug = 0;
const showWatermark = 0;
const godMode = 0;
const debugOverlay = 0;
const debugPhysics = 0;
const debugParticles = 0;
const debugRaycast = 0;
const debugGamepads = 0;
const debugMedals = 0;

// debug commands are automatically removed from the final build
const ASSERT          = ()=> {}
const debugInit       = ()=> {}
const debugUpdate     = ()=> {}
const debugRender     = ()=> {}
const debugRect       = ()=> {}
const debugCircle     = ()=> {}
const debugPoint      = ()=> {}
const debugLine       = ()=> {}
const debugAABB       = ()=> {}
const debugText       = ()=> {}
const debugClear      = ()=> {}
const debugSaveCanvas = ()=> {}