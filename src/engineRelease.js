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
let debugKeysAlways = false;
let debugTweakables = false;
let debugClearCount = 0;
const debug = 0;
const debugOverlay = 0;
const debugPhysics = 0;
const debugParticles = 0;
const debugRaycast = 0;
const debugGamepads = 0;
const debugSound = 0;
const debugPointSize = .5;

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
function setDebugOverlay(){}
function debugVideoCaptureIsActive(){ return false; }
function debugVideoCaptureStart (){}
function debugVideoCaptureStop  (){}
function debugProtectConstant(o){ return o; }

// the tweakables and the level editor are debug only
function tweak(){}
function tweakButton(){}
function tweakDivider(){}
function tweakEngineDefaults(){}
class LevelEditor
{
    constructor() { this.paletteTiles = this.use3D = this.tool = undefined; }
    get isOpen() { return false; }
    get is3D() { return false; }
    get edit2D() { return undefined; }
    get edit3D() { return undefined; }
    open(){} close(){} addKey(){} addButton(){} addTool(){}
    onTile(){} onRestart(){} onPlayFrom(){} onOpen(){} onClose(){} onUpdate(){} onDraw(){} onPanel(){}
    onSave(){ return false; }
}
let levelEditor = new LevelEditor;
function setLevelEditor(editor){ levelEditor = editor; }
function editorMapRestore(map){ return map; }
function editorMapLoaded(){}
function editorJSONFetched(){}
function editorPreRender(){}
function editorObjectMade(){}

// the input capture of the free camera and the 3D editor
function inputCaptureHides(){ return false; }
function inputCaptureMouse(){}
function inputLockExit(){}

// the 3D debug draws are debug only too
function debugBox3D(){}
function debugSphere3D(){}
function debugLine3D(){}
function debugPoint3D(){}
function render3DRenderDebug(){}

// the free camera and the 3D level editor are debug only
function editor3DCameraBegin(){}
function editor3DCameraEnd(){}
function editor3DLevelLoaded(){}
function editor3DObjectMade(){}
