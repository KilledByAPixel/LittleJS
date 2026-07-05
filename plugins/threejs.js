/**
 * LittleJS Three.js Plugin
 * - Renders a three.js scene on a canvas behind the LittleJS canvases
 * - The three.js module is passed in by the user, nothing is bundled
 * - Keep canvasClearColor transparent so the 3D scene shows through
 * - Aligned camera mode locks the 3D camera to the LittleJS 2D camera
 * - ThreeJSObject lets LittleJS physics drive a three.js mesh
 * - Call new ThreeJSPlugin(THREE) in gameInit to set up
 * @namespace ThreeJS
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/** Global ThreeJS plugin object
 *  @type {ThreeJSPlugin}
 *  @memberof ThreeJS */
let threeJS;

///////////////////////////////////////////////////////////////////////////////
/**
 * ThreeJS Plugin - Renders a three.js scene behind the LittleJS canvas
 * @example
 * // in gameInit, with three.js loaded by the user
 * new ThreeJSPlugin(THREE);
 * threeJS.scene.add(new THREE.AmbientLight);
 * @memberof ThreeJS
 */
class ThreeJSPlugin
{
    /** Set up the three.js rendering layer, call in gameInit
     *  @param {Object} THREE - The three.js module, supplied by the user
     *  @param {number} [cameraFOV] - Vertical field of view in degrees */
    constructor(THREE, cameraFOV=60)
    {
        ASSERT(!threeJS, 'ThreeJS plugin already initialized');
        threeJS = this;
        if (headlessMode) return;
        ASSERT(mainCanvas, 'ThreeJS plugin must be created after engineInit, call in gameInit');
        ASSERT(THREE && THREE.WebGLRenderer, 'three.js module must be passed in');

        /** @property {Object} - The three.js module passed into the constructor */
        this.THREE = THREE;
        /** @property {Object} - The three.js renderer */
        this.renderer = new THREE.WebGLRenderer({antialias: true});
        /** @property {Object} - The three.js scene, add lights and meshes here */
        this.scene = new THREE.Scene();
        /** @property {Object} - The three.js perspective camera */
        this.camera = new THREE.PerspectiveCamera(cameraFOV, 1, .1, 1e3);
        /** @property {boolean} - Lock the camera to the LittleJS 2D camera so the z=0 plane matches world space */
        this.cameraAlign2D = true;

        // insert the canvas below the engine canvases and match the layout
        const threeCanvas = this.renderer.domElement;
        const rootElement = mainCanvas.parentElement;
        rootElement.insertBefore(threeCanvas, rootElement.firstChild);
        threeCanvas.style.cssText = mainCanvas.style.cssText;

        // render automatically each frame after the engine renders
        engineAddPlugin(undefined, ()=> this.render());
    }

    /** Position the camera so the z=0 plane exactly matches LittleJS world space,
     *  called automatically when cameraAlign2D is set */
    alignCamera2D()
    {
        const halfHeight = mainCanvasSize.y / 2 / cameraScale; // half visible height in world units
        const distance = halfHeight / tan(this.camera.fov/2 * PI/180);
        this.camera.position.set(cameraPos.x, cameraPos.y, distance);
        // reset all axes in case a free camera was used, littlejs angles are clockwise
        this.camera.rotation.set(0, 0, -cameraAngle);
    }

    /** Sync the canvas layout and render the scene, called automatically each frame */
    render()
    {
        if (!this.renderer) return; // headless mode

        // keep renderer size and css in sync with the LittleJS canvas
        const threeCanvas = this.renderer.domElement;
        if (threeCanvas.width != mainCanvasSize.x || threeCanvas.height != mainCanvasSize.y)
        {
            this.renderer.setSize(mainCanvasSize.x, mainCanvasSize.y, false);
            this.camera.aspect = mainCanvasSize.x / mainCanvasSize.y;
            this.camera.updateProjectionMatrix();
        }
        if (threeCanvas.style.cssText != mainCanvas.style.cssText)
            threeCanvas.style.cssText = mainCanvas.style.cssText;

        if (this.cameraAlign2D)
            this.alignCamera2D();
        this.renderer.render(this.scene, this.camera);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * ThreeJS Object - EngineObject that drives a three.js mesh
 * - LittleJS physics moves the object and the mesh follows automatically
 * - Destroying the object removes the mesh from the scene
 * @extends EngineObject
 * @memberof ThreeJS
 */
class ThreeJSObject extends EngineObject
{
    /** Create an engine object that drives a three.js mesh
     *  @param {Vector2} [pos] - World space position
     *  @param {Vector2} [size] - World space size
     *  @param {Object} [mesh] - The three.js object3d to drive
     *  @param {number} [z] - Mesh height above the 2D plane */
    constructor(pos, size, mesh, z=0)
    {
        super(pos, size);
        ASSERT(threeJS, 'ThreeJS plugin must be initialized first');

        /** @property {Object} - The three.js object3d this object drives */
        this.mesh = mesh;
        /** @property {number} - Mesh height above the 2D plane */
        this.z = z;
        if (mesh)
        {
            threeJS.scene.add(mesh);
            this.syncMesh();
        }
    }

    /** Update the object and sync the mesh to its transform */
    update()
    {
        super.update();
        this.syncMesh();
    }

    /** Copy this object's transform to the mesh */
    syncMesh()
    {
        if (!this.mesh) return;
        this.mesh.position.set(this.pos.x, this.pos.y, this.z);
        this.mesh.rotation.z = -this.angle; // littlejs angles are clockwise
    }

    /** The mesh is this object's visual, the default 2D rendering is skipped */
    render() {}

    /** Destroy this object and remove its mesh from the scene
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.destroyed) return;
        // note: frequently destroyed objects should also dispose geometry and material
        this.mesh && threeJS.scene.remove(this.mesh);
        super.destroy(immediate);
    }
}
