/*
    LittleJS - The Tiny JavaScript Game Engine That Can
    MIT License - Copyright 2019 Frank Force
*/
/*
    LittleJS - Build include file
    By Frank Force 2021

    This file is used for release builds in place of engineDebug.js
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
const debugClear      = ()=> {}
const debugSaveCanvas = ()=> {}