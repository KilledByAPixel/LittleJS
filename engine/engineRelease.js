/*
    LittleJS - Build include file
    By Frank Force 2021

    This file is automatically included first by the build system.
*/


'use strict';

const debug = 0;
const showWatermark = 0;
const godMode = 0;
const debugOverlay = 0;
const debugPhysics = 0;
const debugParticles = 0;
const debugRaycast = 0;
const debugMedals = 0;

// allow debug commands to be removed from the final build
const ASSERT          = ()=> {}
const debugInit       = ()=> {}
const debugUpdate     = ()=> {}
const debugRender     = ()=> {}
const debugRect       = ()=> {}
const debugCircle     = ()=> {}
const debugPoint      = ()=> {}
const debugLine       = ()=> {}
const debugAABB       = ()=> {}
const debugSaveCanvas = ()=> {}