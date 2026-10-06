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

let debugWatermark = false;
let debugKey = '';
let debugKeysAlways = false;
let debugTweakables = false;
const debug = false;
const debugOverlay = false;
const debugPhysics = false;
const debugParticles = false;
const debugRaycast = false;
const debugGamepads = false;
const debugSound = false;
const debugPointSize = .5;

// debug commands are automatically removed from the final build
function ASSERT          (){}
function LOG             (){}
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
function debugScreenshot (){}
function debugShowErrors(){}
function setDebugOverlay(){}
function debugProtectConstant(o){ return Object.freeze(o); } // a color constant stays as it is, in release too

// the tweakables and the level editor are debug only
function tweak(){}
function tweakButton(){}
function tweakDivider(){}
function tweakEngineDefaults(){}
// the 2D editor's edit functions in a release build, which has no editor: there is nothing to edit and nothing
// changes, and a game that calls them needs no guard; edit3D stays undefined, as it is with no 3D plugins
const editorEdit2DRelease =
{
    map: undefined, layer: undefined, hover: undefined, get objects() { return []; }, get selection() { return new Set; },
    paint(){ return false; }, changeObjects(){ return false; }, strokeEnd(){}, strokeCancel(){}, bulk(){},
    undo(){ return false; }, toJSON(){ return ''; },
};
class LevelEditor
{
    constructor()
    {
        this.paletteTiles = this.use3D = this.tool = undefined;
        this.keys = {}, this.buttons = [], this.tools = {};
    }
    get isOpen() { return false; }
    get is3D() { return false; }
    get edit2D() { return editorEdit2DRelease; }
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
