/*
 * LittleJS 3D Object Plugin
 * - EngineObject3D, an EngineObject with a 3D transform and a mesh, its collision and its level collision
 * - InstancedMesh3D, one mesh drawn many times in one call, and Light3D and DirectionalLight3D
 * - Goes after the Render3D Mesh plugin, everything here is part of the Render3D namespace
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////

/**
 * EngineObject3D - An EngineObject with a 3D transform and a mesh
 * - Set pos3D, rotation3D and scale3D instead of the 2D pos, size and angle
 * - Gets update, children, timers, destroy and renderOrder from EngineObject
 * - velocity3D is added to pos3D each frame, slowed by damping, and render3D.gravity pulls it once it has a mass
 * - Objects face -Z, the same way the camera does, so lookAt turns them to face a point
 * - The 2D pos and velocity are still there but nothing draws them
 * - These inherited fields are 2D only and do nothing here: angle, angleVelocity, additiveColor, drawSize and mirror;
 *   damping, angleDamping, clampSpeed, friction and groundObject work as in 2D, on velocity3D and angleVelocity3D
 * - The inherited shader works here as in 2D, and with emissive at 1 its snippet does its own lighting
 * - Set sync2D for a 2D game with 3D looks, pos and angle then drive pos3D and rotation3D,
 *   which is the one way those 2D fields reach a 3D object
 * - setCollision takes the same flags as in 2D, but the solid collision happens in 3D against size3D
 * - The solid box turns with rotation3D, so a turned wall or a ramp collides as it looks; resting on one no steeper
 *   than groundAngle stands there
 * - Its tile and raycast halves are 2D only so they default off here, and a child sits solid collision out
 * - A sync2D object collides in 2D instead, which needs the 2D size set as well as size3D
 * - setMesh swaps the mesh and frees the old one, for text and terrain that get built again
 * - addChild attaches the 3D transform, and pos3D becomes an offset from the parent; attach keeps the child where
 *   it is and works the offset out, and removeChild leaves it where it was in the world
 * - The 2D offset arguments of addChild do nothing here, set the child's pos3D
 * @extends EngineObject
 * @memberof Render3D
 * @example
 * class Spinner extends EngineObject3D
 * {
 *     constructor(pos) { super(pos, buildBox(), undefined, RED); }
 *     update() { this.rotation3D.y += .02; }
 * }
 */
class EngineObject3D extends EngineObject
{
    /** Create a 3D object and add it to the object list
     *  @param {Vector3} [pos3D] - World space position
     *  @param {Mesh} [mesh] - Mesh to draw, undefined draws nothing
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture, mesh uvs map across the tile; a whole TextureInfo becomes
     *    the tile that covers it
     *  @param {Color} [color] - Tint */
    constructor(pos3D=vec3(), mesh, tileInfo, color=WHITE)
    {
        ASSERT(!tileInfo || tileInfo instanceof TileInfo || tileInfo instanceof TextureInfo,
            'tileInfo must be a TileInfo or TextureInfo, it comes before color');
        // a whole texture is stored as the tile that covers it, with no padding or bleed to trim
        // the edges, so this is always a TileInfo like the 2D one and the object stays an EngineObject
        if (tileInfo instanceof TextureInfo)
            render3DWholeTiles.add(tileInfo = new TileInfo(vec2(), tileInfo.size, tileInfo, 0, 0));
        // the 2D pos starts where the object is, so turning on sync2D keeps it there
        super(vec2(pos3D.x, pos3D.y), vec2(), tileInfo, 0, color);
        ASSERT(isVector3(pos3D), 'pos3D must be a vec3');
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        this.mass = 0; // static: no 2D physics, and no 3D gravity until a mass is set

        /** @property {Vector3} - World space position, local to the parent when attached to an EngineObject3D */
        this.pos3D = pos3D.copy();
        /** @property {Vector3} - Rotation vec3(pitch, yaw, roll) in radians, local to the parent when attached to an
         *  EngineObject3D */
        this.rotation3D = vec3();
        /** @property {Vector3} - Scale, local to the parent when attached to an EngineObject3D */
        this.scale3D = vec3(1);
        /** @property {Vector3} - Added to pos3D each frame by the engine before update, like the 2D velocity, no super
         *  call needed; damping and render3D.gravity act on it once the object has a mass */
        this.velocity3D = vec3();
        /** @property {Vector3} - Added to rotation3D each frame by the engine before update, slowed by angleDamping */
        this.angleVelocity3D = vec3();
        /** @property {Mesh|undefined} - Mesh to draw
         *  @type {Mesh|undefined} */
        this.mesh = mesh;
        /** @property {Vector3} - Size for solid collision and the collect and callback helpers, and of the sprite when
         *  there is a tileInfo and no mesh; starts at the size of the mesh's box, or 1 with no mesh, and setMesh leaves
         *  it as it is; the box is centered on pos3D, so center() a mesh whose origin is not its middle, like a model
         *  standing on its feet, or set size3D; scale3D and any parent's scale grow it, so drawing and picking agree */
        // a shared mesh measured since it last changed is not walked again for each object made from it
        const bounds = mesh && mesh.points.length ? !mesh.dirty && mesh.bounds || mesh.getBounds() : undefined;
        this.size3D = bounds ? bounds.max.subtract(bounds.min) : vec3(1);
        /** @property {number} - Diameter of a soft shadow drawn under the object on render3D.softShadowHeight, 0 for
         *  none; scale3D and a parent's scale grow it, so set it once for the unscaled object */
        this.softShadow = 0;
        /** @property {boolean} - A sprite stands on world up instead of tilting toward the camera */
        this.upright = false;
        /** @property {boolean} - Keep this object's texture pixels hard edged, for pixel art that should not blur or bleed */
        this.pixelated = false;
        /** @property {boolean} - Copy the 2D pos and angle into pos3D and rotation3D each frame, for 2D games with 3D
         *  looks; set mass to use 2D physics, and pos3D.z stays yours to set or move with velocity3D.z */
        this.sync2D = false;
        /** @property {boolean} - Draw in the transparent stage, blended and sorted far to near with depth writes off;
         *  on for a sprite */
        this.transparent = !mesh && !!tileInfo;
        /** @property {boolean} - Additive blending, in the transparent stage */
        this.additive = false;
        /** @property {number} - How much it lights itself: 0 is lit as normal, 1 is its own color with no shading, for
         *  lamps and glowing things, between is partly self lit, and above 1 is brighter than its color, for bloom */
        this.emissive = 0;
        /** @property {number} - Strength of the highlight where the sun and the Light3D objects reflect, 0 is none and
         *  1 adds a light's full color at its brightest; shininess sets its size */
        this.specular = 0;
        /** @property {number} - The highlight's exponent, how small and sharp it is: 4 is broad like rubber, 16 the
         *  default, 100 sharp like polished metal; shows only with specular above 0 */
        this.shininess = 16;
        /** @property {TextureInfo|undefined} - A normal map that bends the surface at each texel so it catches the
         *  light like bumps and grooves, green pointing up the image as OpenGL and glTF have it; read at the color
         *  texture's coordinates, see normalMapFromHeight to make one in code
         *  @type {TextureInfo|undefined} */
        this.normalMap = undefined;
        /** @property {number} - How strongly the normal map bends the surface, 0 turns it off, as glTF's scale */
        this.normalScale = 1;
        /** @property {number} - How much it reflects the sky, 0 none and 1 a mirror of it; the edges seen at a
         *  glancing angle reflect more either way, as water and glass do */
        this.reflectivity = 0;
        /** @property {TextureInfo|undefined} - A texture of where it glows, added on top of the lit surface so it
         *  shows in the dark, like lit windows; read at the color texture's coordinates
         *  @type {TextureInfo|undefined} */
        this.emissiveMap = undefined;
        /** @property {Color} - Multiplies the emissive map, as glTF's emissiveFactor */
        this.emissiveMapColor = WHITE;
        /** @property {CubeMap|undefined} - What it reflects in place of render3D.environment, as a mirror captures
         *  the scene from its own middle
         *  @type {CubeMap|undefined} */
        this.environment = undefined;
        /** @property {boolean} - Draw into the shadow map when render3D.shadows is on; sprites and cut out textures
         *  cast their outline, an object faded below half its alpha casts nothing, a see through one casts only when
         *  textured, and additive objects never cast */
        this.castShadow = true;
        /** @property {boolean} - Collide as the sphere that fits size3D instead of as the size3D box, so it rolls
         *  around corners */
        this.collideAsSphere3D = false;
        /** @property {number} - The steepest slope it stands on, in radians from level, PI/4 by default: resting on
         *  a solid within this of flat sets groundObject and holds it still, steeper it slides down */
        this.groundAngle = PI / 4;
        /** @property {boolean} - Darkened by the shadow map when render3D.shadows is on */
        this.receiveShadow = true;
        /** @property {boolean|undefined} - Draw this object over the 2D scene, undefined uses render3D.renderAfter2D
         *  @type {boolean|undefined} */
        this.renderAfter2D = undefined;
        /** @property {Matrix4|undefined} - The transform from its parent, used in place of pos3D, rotation3D and
         *  scale3D when set, for one they cannot hold like a glTF pose with shear; read every frame it is set
         *  @type {Matrix4|undefined} */
        this.localMatrix = undefined;
        // the world transform, kept up to date by render3DObjectMatrix; getMatrix returns a copy
        this.worldMatrix = new Matrix4;
        this.matrixBuilt = new Float64Array(9).fill(NaN); // the position, rotation and scale it was built from
        this.matrixVersion = 0;          // counts the rebuilds, so a child knows when its parent's changed
        /** @type {EngineObject3D|undefined} */
        this.matrixParent = undefined;   // the parent it was built under, and that parent's version then
        this.matrixParentVersion = 0;
        this.movePass = engineObjectsUpdateCount; // the engine pass a child last moved in, so a refresh is not a step
    }

    /** Move by the 3D velocities and push out of solids, called automatically each frame before update, like the 2D physics
     *  - update runs once every object has moved and collided, so bounce off anything else there, it lands before the draw
     *  - Override this and call super to change how the object moves itself
     *  - A sync2D object runs the 2D physics as well, and collides there instead */
    updatePhysics()
    {
        // a sync2D object collides in 2D, which measures the 2D size, and that starts at zero on a 3D object
        ASSERT(!this.sync2D || !this.collideSolidObjects || (this.size.x && this.size.y),
            'a sync2D object collides in 2D, so give it a 2D size as well as a size3D', this.size);
        if (this.sync2D)
            super.updatePhysics();
        ASSERT(isNumber(this.groundAngle) && this.groundAngle >= 0 && this.groundAngle < PI / 2,
            'groundAngle must be 0 to less than PI/2, a slope from level', this.groundAngle);
        // what it stands on is found again each frame, by the level and by the solids it rests on; a sync2D
        // object's is the 2D physics'
        const ground = this.groundObject;
        this.sync2D || (this.groundObject = undefined);
        if (this.clampSpeed && !this.sync2D && (this.collideSolidObjects || this.collideLevel && this.mass))
        {
            // each axis within objectMaxSpeed, as in 2D, which with the push back to the side it came from keeps a fast
            // object out of a solid thinner than its move, as long as it is not turned; only for what collides,
            // anything else moves as fast as it is told
            const v = this.velocity3D, s = objectMaxSpeed;
            v.x = clamp(v.x, -s, s), v.y = clamp(v.y, -s, s), v.z = clamp(v.z, -s, s);
        }
        // a moving object keeps out of the level, the height maps and voxel maps, from where it was before it moved,
        // and a solid it hits sends it back to the side it came from
        const oldPos = (this.collideLevel || this.collideSolidObjects) && this.mass && !this.sync2D ?
            this.pos3D.copy() : undefined;
        render3DMove(this);
        if (ground && this.mass && !this.sync2D)
        {
            // sliding on what it stood on slows by friction, the less grippy of the two, relative to that one's own
            // speed so a moving platform carries it, as in 2D
            const friction = max(this.friction, ground.friction), v = this.velocity3D;
            const moving = ground instanceof EngineObject3D ? ground.velocity3D : undefined;
            const gx = moving?.x ?? 0, gz = moving?.z ?? 0;
            v.x = gx + (v.x - gx) * friction, v.z = gz + (v.z - gz) * friction;
        }
        oldPos && this.collideLevel && render3DCollideLevel(this, oldPos, ground);
        // the engine only runs this for objects that own where they are, a child rides along with its parent
        if (this.collideSolidObjects && !this.sync2D)
            render3DCollideSolid(this, oldPos);
    }

    /** Move a child by its own velocities, bring a sync2D object's pos3D up to its 2D pos, then update the children,
     *  called automatically each frame
     *  @param {boolean} [updateChildren] - Also update the children's transforms */
    updateTransforms(updateChildren=true)
    {
        if (!paused)
        {
            // a child is never given updatePhysics, so it moves here, as an offset from its parent: once per
            // engine pass, since addChild, attach and a game bring the transforms up to date too
            if (this.parent && this.movePass !== engineObjectsUpdateCount)
            {
                this.movePass = engineObjectsUpdateCount;
                render3DMove(this);
            }
        }

        // placed from its parent first, so a sync2D object copies where it is now, then its children from it
        super.updateTransforms(false);
        if (!paused && this.sync2D)
            this.pos3D.x = this.pos.x, this.pos3D.y = this.pos.y, this.rotation3D.z = -this.angle;
        if (updateChildren)
            for (const child of this.children)
                child.updateTransforms();
    }

    /** Set how this object collides, the same flags as in 2D
     *  - Solid collision happens in 3D here, against size3D boxes or spheres; a child sits it out
     *  - The boxes turn with rotation3D, against height maps and voxel maps an object is still its upright box
     *  - A sync2D object collides in 2D instead, against the 2D size, so set that as well as size3D
     *  @param {boolean} [collideSolidObjects] - Take part in solid collision
     *  @param {boolean} [isSolid] - Block other objects, a pair where neither one blocks passes through;
     *    blocking needs collideSolidObjects, so isSolid on its own is not allowed
     *  @param {boolean} [collideLevel] - Collide with the level, the height maps and voxel maps, or the 2D tile layers
     *    for a sync2D object
     *  @param {boolean} [collideRaycast] - Raycasts, 2D only; 3D has render3D.pick and engineObjectsRaycast3D */
    setCollision(collideSolidObjects=true, isSolid=true, collideLevel=true, collideRaycast=false)
    { super.setCollision(collideSolidObjects, isSolid, collideLevel, collideRaycast); }

    /** Called by a VoxelMap to ask whether a block stops this object, a hook to let one through or react to it
     *  @param {number} type - The block's type, 1 to 255
     *  @param {Vector3} cell - The block's cell in the map
     *  @return {boolean} - true to be stopped by it, every block stops it by default */
    collideWithVoxel(type, cell) { return true; }

    /** Returns the world position
     *  @return {Vector3} */
    getWorldPos3D() { return render3DObjectMatrix(this).getTranslation(); }

    /** Returns the direction the object faces, its -Z axis in the world
     *  @return {Vector3} */
    getForward3D() { return render3DAxis(render3DObjectMatrix(this).m, 8).normalize(-1); }

    /** Returns the object's right axis in the world
     *  @return {Vector3} */
    getRight3D() { return render3DAxis(render3DObjectMatrix(this).m, 0).normalize(); }

    /** Returns the object's up axis in the world
     *  @return {Vector3} */
    getUp3D() { return render3DAxis(render3DObjectMatrix(this).m, 4).normalize(); }

    /** Returns a copy of the object's world transform, the parent's included when attached to an EngineObject3D
     *  - The object keeps its matrix and rebuilds it only when its position, rotation or scale changed, so this is
     *    cheap to call
     *  @return {Matrix4} */
    getMatrix() { return render3DObjectMatrix(this).copy(); }

    /** How rough the surface is, 0 a mirror to 1 matte, as glTF and three.js's MeshStandardMaterial have it: another
     *  way to set shininess, which is what is kept, shininess = 2 / roughness^4 - 2 and at least 1; it sets both the
     *  highlight and how blurred a reflection is; read back it is the same up to about .9, above which shininess is 1
     *  and it reads .9
     *  @return {number} */
    get roughness() { return (2 / (this.shininess + 2)) ** .25; }
    set roughness(roughness)
    {
        ASSERT(isNumber(roughness) && roughness >= 0, 'roughness must be a number, 0 or more', roughness);
        this.shininess = max(1, 2 / max(roughness, 1e-3) ** 4 - 2); // none is a mirror, still a finite number
    }

    /** Turn the object so its -Z axis points at a world space target, sets pitch and yaw and clears roll
     *  @param {Vector3} target */
    lookAt(target)
    {
        // rotation3D is local to the parent, so a child has to aim at the target from the parent's point of view
        const parent = this.parent instanceof EngineObject3D ? this.parent : undefined;
        const local = parent ? parent.getMatrix().invert().transformPoint(target) : target;
        this.rotation3D = render3DLookRotation(local.subtract(this.pos3D), this.rotation3D);
    }

    /** Attaches a child, its pos3D, rotation3D and scale3D taken as the offset from this one; returns child for chaining
     *  - The 2D offset arguments do nothing for an EngineObject3D child, set its pos3D
     *  @param {EngineObject} child
     *  @param {Vector2} [localPos]
     *  @param {number} [localAngle]
     *  @return {EngineObject} The child object attached */
    addChild(child, localPos, localAngle)
    {
        // addChild brings the child's transform up to date, which is not a step: it already moved this pass as
        // a root, or moves in the next one, so it must not move by its velocity again here
        if (child instanceof EngineObject3D)
            child.movePass = engineObjectsUpdateCount;
        return super.addChild(child, localPos, localAngle);
    }

    /** Attaches a child without moving it: its pos3D, rotation3D and scale3D become what they have to be under this
     *  parent to keep its world transform, where addChild takes them as the offset; returns child for chaining
     *  - A parent scaled unevenly and a child turned under it make a shear, which those three values cannot hold,
     *    so the child comes out as close as they can get; a uniform scale is exact
     *  @param {EngineObject} child
     *  @return {EngineObject} The child object attached */
    attach(child)
    {
        if (!(child instanceof EngineObject3D))
            return super.attach(child); // a 2D child only has the 2D transform to keep
        child.parent?.removeChild(child); // keeps its world values, so its own matrix is its world matrix
        const local = render3DObjectMatrix(this).copy().invert().multiply(render3DObjectMatrix(child));
        super.attach(child);
        child.pos3D = local.getTranslation();
        child.rotation3D = local.getRotation();
        child.scale3D = local.getScale();
        if (child.localMatrix)
            child.localMatrix = local; // a matrix given whole stays whole, shear and all
        return child;
    }

    /** Removes a child from this one, it stays where it is in the world: its pos3D, rotation3D and scale3D become
     *  its world values, with the same shear caveat as attach; a child being destroyed is let go as it is
     *  @param {EngineObject} child */
    removeChild(child)
    {
        if (child instanceof EngineObject3D && !child.destroyed)
            render3DTakeWorld(child, render3DObjectMatrix(child));
        super.removeChild(child);
    }

    /** Draw a different mesh and free the GPU buffer of the one it replaces
     *  - For a mesh built again when something changes, like a score, a rebuilt terrain or a loaded model
     *  - A mesh another object is still drawing is left alone, since builders are often shared
     *  - Freeing one held somewhere else only costs it an upload, the points it was built from stay
     *  @param {Mesh} [mesh] - The mesh to draw from now on, undefined to draw nothing
     *  @return {Mesh|undefined} - The mesh passed in */
    setMesh(mesh)
    {
        ASSERT(!mesh || mesh instanceof Mesh, 'mesh must be a Mesh or undefined');
        const old = this.mesh;
        this.mesh = mesh;
        // nothing to free and nothing to look for when it was never uploaded
        if (old && old !== mesh && old.buffer && !engineObjects.some(o=> /** @type {EngineObject3D} */ (o).mesh === old))
            old.dispose();
        return mesh;
    }

    /** 2D rendering is skipped, the mesh is drawn by render3D during the 3D pass */
    render() {}

    /** Draw the object in 3D, called by the 3D pass with the draw state set from this object's flags, draws the mesh by default
     *  @return {void} */
    render3D()
    {
        // an opaque draw comes out solid however low its alpha is, so a fade with no flag looks like nothing happened
        ASSERT(this.transparent || this.additive || this.color.a >= 1,
            'an object that fades needs its transparent flag, an opaque draw ignores the color alpha', this.color);
        // the matrix the object keeps, rebuilt only when it moved, the same one for the shadow pass and the main pass
        const matrix = render3DObjectMatrix(this);
        if (this.mesh)
            render3D.drawMesh(this.mesh, matrix, this.tileInfo, this.color);
        else if (this.tileInfo)
        {
            // a sprite, at the world size the collect, pick and solid collision helpers measure it at
            const m = matrix.m, size = render3DWorldSize(this, m);
            render3D.drawBillboard(vec3(m[12], m[13], m[14]), vec2(size.x, size.y), this.tileInfo, this.color,
                this.rotation3D.z, this.upright);
        }
    }
}

// the draw settings an object hands to the parts it draws through, each with its default: a glTF model's parts, an
// attached prefab's, a voxel map's see through blocks
const RENDER3D_PART_SETTINGS = {emissive: 0, additive: false, specular: 0, shininess: 16, reflectivity: 0,
    normalMap: undefined, normalScale: 1, emissiveMap: undefined, emissiveMapColor: WHITE, receiveShadow: true,
    castShadow: true, pixelated: false, shader: undefined, environment: undefined, renderAfter2D: undefined,
    renderOrder: 0};

// make a part draw with its owner's settings: each reads the owner's where the owner set it away from the default, and
// the part's own otherwise, so a model's unlit or rough part keeps what its file gave it; read each time, so a setting
// changed later is seen, before the stage is chosen too
function render3DShareSettings(part, owner)
{
    for (const name in RENDER3D_PART_SETTINGS)
    {
        let own = part[name];
        const unset = RENDER3D_PART_SETTINGS[name];
        Object.defineProperty(part, name, {get: ()=> owner[name] !== unset ? owner[name] : own,
            set: (value)=> { own = value; }, configurable: true, enumerable: true});
    }
}

// make an object's own transform a world one, for an object leaving its parent: its position, rotation and scale
// from the world matrix, and a matrix given whole, shear and all
function render3DTakeWorld(o, world)
{
    o.pos3D = world.getTranslation();
    o.rotation3D = world.getRotation();
    o.scale3D = world.getScale();
    if (o.localMatrix)
        o.localMatrix = world.copy();
}

// an object's world matrix, the one it keeps: rebuilt only when its position, rotation or scale changed since the
// last build, or its parent's matrix did, so an object that stands still costs nine compares a frame instead of
// the trig and a new matrix; the matrix returned is the object's own, read it and never change it
const render3DLocalMatrix = new Matrix4;
function render3DObjectMatrix(o)
{
    const parent = o.parent instanceof EngineObject3D ? o.parent : undefined;
    const parentMatrix = parent && render3DObjectMatrix(parent); // the parent first, so its version is current
    const p = o.pos3D, r = o.rotation3D, s = o.scale3D, k = o.matrixBuilt, local = o.localMatrix;
    if (local)
    {
        // a matrix given whole is taken as it is each time, it can change in place
        if (parent)
        {
            o.worldMatrix.m.set(parentMatrix.m);
            o.worldMatrix.multiply(local);
            o.matrixParentVersion = parent.matrixVersion;
        }
        else
            o.worldMatrix.m.set(local.m);
        k[0] = NaN; // built from the matrix, so going back to pos3D builds again
        o.matrixParent = parent;
        ++o.matrixVersion;
    }
    else if (k[0] !== p.x || k[1] !== p.y || k[2] !== p.z || k[3] !== r.x || k[4] !== r.y || k[5] !== r.z
        || k[6] !== s.x || k[7] !== s.y || k[8] !== s.z || o.matrixParent !== parent
        || parent && o.matrixParentVersion !== parent.matrixVersion)
    {
        k[0] = p.x, k[1] = p.y, k[2] = p.z, k[3] = r.x, k[4] = r.y, k[5] = r.z, k[6] = s.x, k[7] = s.y, k[8] = s.z;
        if (parent)
        {
            // the parent's world matrix times the local one
            buildMatrix(p, r, s, render3DLocalMatrix);
            o.worldMatrix.m.set(parentMatrix.m);
            o.worldMatrix.multiply(render3DLocalMatrix);
            o.matrixParentVersion = parent.matrixVersion;
        }
        else
            buildMatrix(p, r, s, o.worldMatrix);
        o.matrixParent = parent;
        ++o.matrixVersion;
    }
    return o.worldMatrix;
}

// move an object by its 3D velocities, each slowed by its damping, an object with mass falling with render3D.gravity
function render3DMove(o)
{
    // the vectors change in place, as the 2D object's do: this runs for every object every frame
    // a sync2D object's damping is the 2D physics', its 3D velocities are its own to set
    const p = o.pos3D, v = o.velocity3D, r = o.rotation3D, a = o.angleVelocity3D;
    const d = o.sync2D ? 1 : o.damping, e = o.sync2D ? 1 : o.angleDamping;
    // damped first and gravity added after, the order EngineObject.updatePhysics uses,
    // so the same mass, damping and gravity fall the same way in both
    v.x *= d, v.y *= d, v.z *= d;
    if (o.mass && !o.sync2D) // a 2D driven object gets the 2D gravity instead
    {
        const g = render3D.gravity, s = o.gravityScale;
        v.x += g.x * s, v.y += g.y * s, v.z += g.z * s;
    }
    p.x += v.x, p.y += v.y, p.z += v.z;
    r.x += a.x *= e, r.y += a.y *= e, r.z += a.z *= e;
}

// keep an object that moved out of the level's solid geometry, clearing what it stood on for the level to set again
// ground is what it stood on last frame, which a height map keeps it on going down a slope
function render3DCollideLevel(o, oldPos, ground)
{
    for (const level of render3DLevel)
        level.destroyed || level.levelCollide3D(o, oldPos, level === ground);
}

// where a solid object is in the world and what it collides as: the sphere that fits size3D, or the size3D box,
// each grown by the object's scale
// only objects that own where they are take part, so pos3D is already world space, and however the object is
// turned its axes come out as long as its scale makes them; building the transform to read that back off it
// costs six trig calls and a matrix for every pair tested, which is the whole cost of a crowded scene
function render3DSolidShape(o)
{
    ASSERT(!o.parent, 'a child rides along with its parent, it has no world pos3D of its own to collide with');
    const s = o.size3D, k = o.scale3D;
    const kx = abs(k.x), ky = abs(k.y), kz = abs(k.z);
    if (o.collideAsSphere3D)
        return {pos: o.pos3D.copy(), radius: max(s.x, s.y, s.z) / 2 * max(kx, ky, kz)};
    // a turned box has its axes, a solid is never a child so its rotation is the world's; an upright one has none, and
    // neither does a sprite, whose rotation turns how it faces the camera, not its box
    const axes = !render3DIsSprite(o) && isTurned3D(o.rotation3D) ? render3DSolidAxes(o) : undefined;
    return {pos: o.pos3D.copy(), size: vec3(s.x * kx, s.y * ky, s.z * kz), axes};
}

// a turned solid's three axes, worked out when its rotation changes and kept until then, so the pairs it is tested
// against each frame do not each work them out again
const render3DSolidAxesCache = new WeakMap;
function render3DSolidAxes(o)
{
    const r = o.rotation3D, kept = render3DSolidAxesCache.get(o);
    if (kept && kept.x === r.x && kept.y === r.y && kept.z === r.z)
        return kept.axes;
    const axes = boxAxes3D(r);
    render3DSolidAxesCache.set(o, {x: r.x, y: r.y, z: r.z, axes});
    return axes;
}

// how far a solid shape can reach from its own center, for a quick reject before the exact test
// it has to be the shape's own radius, or a wider one: a box reaches to its corner, and a sphere
// takes the largest scale the same way render3DSolidShape does, or the reject would skip real touches
function render3DSolidReach(o)
{
    const s = o.size3D, k = o.scale3D;
    const kx = abs(k.x), ky = abs(k.y), kz = abs(k.z);
    if (o.collideAsSphere3D)
        return max(s.x, s.y, s.z) / 2 * max(kx, ky, kz);
    return hypot(s.x * kx, s.y * ky, s.z * kz) / 2;
}

// what it takes to move shape a clear of shape b, whichever pair of shapes they are, or undefined for no touch
function render3DSolidPush(a, b)
{
    // a turned box is tested by its kept axes, the upright pairs as they always were
    const sphereBox = (sphere, box)=> box.axes ? collideSphereOrientedBox3D(sphere.pos, sphere.radius, box.pos,
        box.size, box.axes) : collideSphereBox(sphere.pos, sphere.radius, box.pos, box.size);
    if (!a.size) // a is a sphere
        return b.size ? sphereBox(a, b) : collideSphereSphere(a.pos, a.radius, b.pos, b.radius);
    if (!b.size) // only b is, so push b out of a and turn it around
    {
        const push = sphereBox(b, a);
        return push && push.scale(-1);
    }
    return a.axes || b.axes ? collideOrientedBoxes3D(a.pos, a.size, a.axes ?? BOX_WORLD_AXES, b.pos, b.size,
        b.axes ?? BOX_WORLD_AXES) : collideBoxBox3D(a.pos, a.size, b.pos, b.size);
}

// whether a touching pair resolves: both hear about it, and the answer is kept for the frame, so a pair met again as
// one object is settled after being pushed is not asked twice; each object's own turn asks again, as it always has
function render3DCollideAsk(a, b, push, useKept=true)
{
    const kept = useKept ? engineObjectsCollidePairAnswer(a, b) : undefined;
    if (kept !== undefined) return kept;
    const resolveA = a.collideWithObject(b, push), resolveB = b.collideWithObject(a, push.scale(-1));
    const resolve = !!(resolveA && resolveB);
    engineObjectsCollidePairAdd(a, b, resolve);
    engineObjectsCollidePairAdd(b, a, resolve);
    return resolve;
}

// push an object pushed by another out of the solids that do not move, mass 0, back to the side it was pushed from;
// they take the touch as any pair does, so a one way platform still lets it through
function render3DSettleFixed(o, from)
{
    if (o.destroyed || !o.collideSolidObjects) return;
    let shape = render3DSolidShape(o);
    const reachO = render3DSolidReach(o);
    for (const b of engineObjectsCollide)
    {
        if (b === o || b.mass || !b.isSolid || b.destroyed || !(b instanceof EngineObject3D) || b.parent || b.sync2D)
            continue;
        const p = shape.pos, q = b.pos3D, reach = reachO + render3DSolidReach(b);
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        if (dx*dx + dy*dy + dz*dz > reach*reach) continue;
        const shapeB = render3DSolidShape(b);
        let push = render3DSolidPush(shape, shapeB);
        if (!push || !render3DCollideAsk(o, b, push)) continue;
        if (push.dot(shape.pos.subtract(from)) > 0)
            push = render3DSolidPushBack(shape, shapeB, from) ?? push;
        o.pos3D = o.pos3D.add(push);
        shape = render3DSolidShape(o);
        const normal = push.normalize();
        if (o.velocity3D.dot(normal) < 0)
            o.velocity3D = o.velocity3D.reflect(normal, o.restitution);
    }
}

// what moves shape a back clear of shape b to the side it came from: along an axis it was clear of b on before it
// moved, the least of those, as 2D resolves it from where the object was; undefined when it overlapped on every axis
// before too, or a box is turned, which keeps the least push
function render3DSolidPushBack(a, b, from)
{
    if (a.axes || b.axes) return;
    const half = (shape)=> shape.size ? shape.size.scale(.5) : vec3(shape.radius);
    const halfA = half(a), halfB = half(b);
    let axis, amount = Infinity, side = 0;
    for (const k of ['x', 'y', 'z'])
    {
        const reach = halfA[k] + halfB[k], was = from[k] - b.pos[k];
        // it overlapped on this axis before it moved as well; one resting against it touches, which is clear, give or
        // take the rounding of the push that put it there
        if (abs(was) < reach - 1e-6) continue;
        const s = sign(was), need = reach - s * (a.pos[k] - b.pos[k]);
        if (need > 0 && need < amount)
            axis = k, amount = need, side = s;
    }
    if (!axis) return;
    const push = vec3();
    push[axis] = side * amount;
    return push;
}

// a sprite, a tile with no mesh, which faces the camera however it is turned
const render3DIsSprite = (o)=> !o.mesh && !!o.tileInfo;

// whether a push leaves a box by one of its faces, along one of its axes, not by an edge or a corner; a sphere has
// no face to stand on
function render3DOnFace(push, shape)
{
    if (!shape.size) return false;
    const n = push.normalize(), axes = shape.axes ?? BOX_WORLD_AXES;
    return max(abs(n.dot(axes[0])), abs(n.dot(axes[1])), abs(n.dot(axes[2]))) > 1 - 1e-6;
}

// push a solid object out of the solids before it in the engine's list of them, so each pair is resolved once:
// the ones after it update later and test against it then, and an object that is not in the list yet, because it
// turned collision on this frame, tests them all itself and is not tested back
// one pair per test is half the work of the 2D solver, which tests both directions; the difference only shows
// when a collideWithObject destroys some third object, whose own turn then finds the pair already gone
function render3DCollideSolid(a, from)
{
    let shapeA = render3DSolidShape(a);
    const reachA = render3DSolidReach(a);
    for (const b of engineObjectsCollide)
    {
        if (b === a) break;
        // a child is part of its parent
        if (b.destroyed || !(b instanceof EngineObject3D) || b.parent || b.sync2D) continue;
        if (!a.isSolid && !b.isSolid) continue; // neither one blocks, so they pass through each other

        // the pairs nowhere near each other are almost all of them in a scene of any size, so
        // settle those with one distance check instead of building a shape for each
        const p = shapeA.pos, q = b.pos3D, reach = reachA + render3DSolidReach(b);
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        if (dx*dx + dy*dy + dz*dz > reach*reach)
            continue;

        const shapeB = render3DSolidShape(b);
        let push = render3DSolidPush(shapeA, shapeB);
        if (!push) continue;
        // a push the way it was moving sends it on out the far side, past the middle of what it hit, as a fast
        // object would go through a thin wall; it goes back to the side it came from, as in 2D
        if (from && push.dot(shapeA.pos.subtract(from)) > 0)
            push = render3DSolidPushBack(shapeA, shapeB, from) ?? push;

        // both objects hear about it, and either one can take the touch over
        if (!render3DCollideAsk(a, b, push, false)) continue;

        // standing: resting on a box's face within the upper one's groundAngle of level holds it there, the push
        // turned straight up, as far as it takes to leave the surface, so it does not creep down a ramp; only what
        // moves stands, and a sphere, an edge or a corner is nothing to stand on, what rests there rolls off
        const lengthSquared = push.lengthSquared(), up = push.y / lengthSquared ** .5;
        const aStands = up > 0 && a.mass && up >= cos(a.groundAngle) && render3DOnFace(push, shapeB);
        const bStands = up < 0 && b.mass && -up >= cos(b.groundAngle) && render3DOnFace(push, shapeA);
        if (aStands || bStands)
        {
            aStands ? a.groundObject = b : b.groundObject = a;
            if (push.x || push.z) // one straight up already is used as it is
                push = vec3(0, lengthSquared / push.y, 0);
        }

        // heavier objects move less, mass 0 stays put; then bounce apart when moving toward each other
        const total = a.mass + b.mass;
        const weightA = !a.mass ? 0 : !b.mass ? 1 : b.mass / total;
        const weightB = !b.mass ? 0 : !a.mass ? 1 : a.mass / total;
        const bFrom = weightB ? b.pos3D.copy() : undefined;
        const aFrom = a.pos3D.copy();
        a.pos3D = a.pos3D.add(push.scale(weightA));
        b.pos3D = b.pos3D.subtract(push.scale(weightB));
        if (weightA && weightB)
        {
            // a met the solids before it in the list already, the fixed ones among them, so a push from something
            // that moves is settled against those now, and b takes what a could not move, as if a were fixed
            const pushed = a.pos3D.copy();
            render3DSettleFixed(a, aFrom);
            b.pos3D = b.pos3D.add(a.pos3D.subtract(pushed));
        }
        if (weightA)
            shapeA = render3DSolidShape(a); // it moved, so the next solid must be tested against where it is now
        // b had its turn already, so a push into a wall is settled against the fixed solids now, or it would end the
        // frame in the wall, and a hard enough shove would carry it through
        bFrom && render3DSettleFixed(b, bFrom);
        // mass 0 keeps its velocity too, so a moving platform keeps moving, and what hits it bounces by its own
        // restitution as it would off a static wall
        const normal = push.normalize();
        if (weightA && a.velocity3D.dot(normal) < 0)
            a.velocity3D = a.velocity3D.reflect(normal, a.restitution);
        if (weightB && b.velocity3D.dot(normal) > 0)
            b.velocity3D = b.velocity3D.reflect(normal, b.restitution);
    }
}

/**
 * Collect the EngineObject3D objects whose boxes overlap a sphere or a box, the 3D twin of engineObjectsCollect
 * - Each object is its size3D box at its world position, turned as it is turned; lights, emitters and trails have no
 *   size and are never collected
 * @param {Vector3} pos - Center of the area
 * @param {Vector3|number} size - Diameter of a sphere if a number, 0 for a point, full size of a box if a Vector3
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @param {boolean} [testCenters] - Test only each object's center, a little faster, and ignores object sizes
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsCollect3D(pos, size, objects=engineObjects, testCenters=false)
{
    // a size of 0 is a point, tested against each box, since a sphere of no size could never hit
    const radiusSquared = typeof size === 'number' && size > 0 ? (size/2)**2 : undefined;
    const box = radiusSquared ? undefined : typeof size === 'number' ? vec3() : render3DSize3(size);
    const collected = [];
    for (const o of objects)
    {
        if (!(o instanceof EngineObject3D) || o.destroyed) continue;
        // the box in world space, scaled by the object and its parents
        const m = render3DObjectMatrix(o).m, s = o.size3D;
        if (!(s.x || s.y || s.z)) continue;
        const center = vec3(m[12], m[13], m[14]);
        const worldSize = testCenters ? vec3() : render3DWorldSize(o, m);
        // a turned box is tested as turned, its axes read off the matrix, its columns with the scale taken out
        const turned = !testCenters && !render3DIsSprite(o) && (m[1] || m[2] || m[4] || m[6] || m[8] || m[9]);
        const axis = (i)=> vec3(m[i], m[i+1], m[i+2]).normalize();
        let axes = turned ? [axis(0), axis(4), axis(8)] : undefined;
        if (axes && (abs(axes[0].dot(axes[1])) > 1e-6 || abs(axes[0].dot(axes[2])) > 1e-6 ||
            abs(axes[1].dot(axes[2])) > 1e-6))
        {
            // a turned child of an unevenly scaled parent is sheared, its edges no longer square, which the box
            // tests do not take; the upright box around it stands in, which may take a little more but never misses
            const e = axes.map((a, i)=> a.scale(i ? i > 1 ? worldSize.z / 2 : worldSize.y / 2 : worldSize.x / 2));
            const reach = (c)=> 2 * (abs(e[0][c]) + abs(e[1][c]) + abs(e[2][c]));
            worldSize.set(reach('x'), reach('y'), reach('z'));
            axes = undefined;
        }
        let hit;
        if (box && axes)
            hit = !!collideOrientedBoxes3D(pos, box, BOX_WORLD_AXES, center, worldSize, axes);
        else if (box)
            hit = isOverlapping3D(pos, box, center, worldSize);
        else if (axes)
            hit = !!collideSphereOrientedBox3D(pos, radiusSquared ** .5, center, worldSize, axes);
        else
        {
            // a sphere against the nearest point of the box
            const dx = max(abs(pos.x - center.x) - worldSize.x/2, 0);
            const dy = max(abs(pos.y - center.y) - worldSize.y/2, 0);
            const dz = max(abs(pos.z - center.z) - worldSize.z/2, 0);
            hit = dx*dx + dy*dy + dz*dz < radiusSquared;
        }
        hit && collected.push(o);
    }
    return collected;
}

// how far along a ray an object is hit, or undefined for a miss; a mesh is hit on its triangles, in its own space,
// and a sprite as the quad it draws
const render3DRaycastCenter = vec3();
function render3DRaycastObject(ray, o)
{
    if (o.destroyed || !(o instanceof EngineObject3D)) return;
    // a height map or voxel map is hit on its surface, not its box
    if (o instanceof HeightMap || o instanceof VoxelMap) return o.levelRaycast3D(ray);
    if (!(o.mesh || o.tileInfo)) return;
    if (o instanceof InstancedMesh3D) return; // its instances are not objects, and its one sphere is not a thing to hit
    const matrix = render3DObjectMatrix(o), mesh = o.mesh;
    if (!mesh) return render3DRaycastSprite(ray, o, matrix);
    // a mesh that changed since it was measured is measured again, an upload may not have come yet
    const radius = (mesh.dirty || !mesh.radius ? mesh.computeRadius() : mesh.radius) * render3DMaxStretch(matrix.m);
    if (!(radius > 0)) return; // nothing to hit
    // its place read from the matrix into a vector kept for this, a pick tests every object and most miss
    const m = matrix.m, center = render3DRaycastCenter.set(m[12], m[13], m[14]);
    const distance = raycastSphere(ray, center, radius);
    if (distance === undefined) return;

    // the sphere and then the box in the mesh's own space are quick rejects, and a ray that meets the box is tested
    // against the triangles; the direction is not made unit length, so the distance holds in the world;
    // a mesh flattened to nothing on an axis has no inverse, it is hit as a disc like a sprite
    if (!matrix.determinant()) return render3DRaycastDisc(ray, center, radius);
    const inverse = matrix.copy().invert(), bounds = mesh.bounds || mesh.getBounds();
    const local = new Ray3D(inverse.transformPoint(ray.origin), inverse.transformDirection(ray.direction));
    const hit = raycastBox(local, bounds.min.add(bounds.max).scale(.5), bounds.max.subtract(bounds.min));
    if (hit === undefined || !ray.direction.lengthSquared())
        return hit; // a ray of no length is where it starts, inside the box
    return render3DRaycastMesh(local, mesh);
}

// how far along a ray, in the mesh's own space, its nearest triangle is hit, or undefined: the triangles that face
// the ray as the pass draws them, clockwise from the front, and the back faces too of a doubleSided mesh; a strip's
// triangle i is (i-2, i-1, i), the odd ones read the other way, and a join between its pieces has no area and is
// never hit; nothing is kept between calls, so a mesh that changed is hit as it is now
function render3DRaycastMesh(ray, mesh)
{
    const points = mesh.points, indices = mesh.indices, both = mesh.doubleSided;
    const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
    const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    const count = indices ? indices.length / 3 | 0 : points.length - 2;
    let nearest;
    for (let i = 0; i < count; ++i)
    {
        // the corners clockwise from the front: an indexed list is written the other way round
        let a, b, c;
        if (indices)
            a = points[indices[i*3]], b = points[indices[i*3+2]], c = points[indices[i*3+1]];
        else
            a = points[i & 1 ? i + 1 : i], b = points[i & 1 ? i : i + 1], c = points[i + 2];

        // Moller and Trumbore: the determinant is the ray along the face's normal, below zero from the front
        const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
        const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (both ? !det : !(det < 0)) continue;
        const sx = ox - a.x, sy = oy - a.y, sz = oz - a.z;
        const u = (sx * hx + sy * hy + sz * hz) / det;
        if (!(u >= 0 && u <= 1)) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) / det;
        if (!(v >= 0 && u + v <= 1)) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) / det;
        if (t >= 0 && !(t >= nearest))
            nearest = t;
    }
    return nearest;
}

// a sprite is the quad drawBillboard draws, its size3D grown by the x and y scale as the draw does, facing the camera
// as it was last drawn; where the ray meets its plane, inside its half axes
function render3DRaycastSprite(ray, o, matrix)
{
    const center = matrix.getTranslation(), worldSize = render3DWorldSize(o, matrix.m), size = vec2(worldSize.x, worldSize.y);
    if (!(size.x > 0 && size.y > 0)) return; // nothing to hit
    if (!ray.direction.lengthSquared()) // a ray of no length is where it starts
        return render3DRaycastDisc(ray, center, hypot(size.x, size.y) / 2);
    const a = render3DBillboardAxes(size, o.rotation3D.z, o.upright);
    const right = vec3(a[0], a[1], a[2]), up = vec3(a[3], a[4], a[5]);
    const t = raycastPlane(ray, center, right.cross(up));
    if (t === undefined) return; // behind, or seen edge on
    const p = ray.getPosition(t).subtract(center);
    return abs(p.dot(right)) <= right.lengthSquared() && abs(p.dot(up)) <= up.lengthSquared() ? t : undefined;
}

// a mesh flattened to nothing, or a sprite for a ray of no length: a disc facing the ray at its center's depth
function render3DRaycastDisc(ray, center, radius)
{
    const d = ray.direction, oc = center.subtract(ray.origin), dd = d.dot(d);
    const t = dd ? oc.dot(d) / dd : 0; // its depth along the ray, in the ray's own units
    return t >= 0 && oc.subtract(d.scale(t)).lengthSquared() <= radius*radius ? t : undefined;
}

/**
 * Collect every EngineObject3D a ray passes through, nearest first, the 3D twin of engineObjectsRaycast
 * - The ray has no end, so everything along it counts however far away it is
 * - Use render3D.pick for the nearest one on its own, with the distance to it
 * @param {Ray3D} ray - From render3D.screenToRay, or any ray
 * @param {Array<EngineObject>} [objects] - Defaults to every object; only those with a mesh or a sprite count
 * @return {Array<EngineObject3D>}
 * @memberof Render3D
 */
function engineObjectsRaycast3D(ray, objects=engineObjects)
{
    const hits = [];
    for (const o of objects)
    {
        const distance = render3DRaycastObject(ray, o);
        if (distance !== undefined) // only a 3D object has a distance
            hits.push({o: /** @type {EngineObject3D} */ (o), distance});
    }
    return hits.sort((a, b)=> a.distance - b.distance).map(hit=> hit.o);
}

/**
 * Call a function for each EngineObject3D whose box overlaps a sphere or a box
 * - An object destroyed by an earlier callback is skipped
 * @param {Vector3} pos - Center of the area
 * @param {Vector3|number} size - Diameter of a sphere if a number, 0 for a point, full size of a box if a Vector3
 * @param {function(EngineObject3D): void} callback
 * @param {Array<EngineObject>} [objects] - Defaults to every object
 * @param {boolean} [testCenters] - Test only each object's center, see engineObjectsCollect3D
 * @memberof Render3D
 */
function engineObjectsCallback3D(pos, size, callback, objects=engineObjects, testCenters=false)
{
    for (const o of engineObjectsCollect3D(pos, size, objects, testCenters))
        o.destroyed || callback(o);
}

///////////////////////////////////////////////////////////////////////////////
/**
 * InstancedMesh3D - Many copies of one mesh drawn as one call, with their transforms kept on the GPU
 * - For big sets that mostly stay put: an instance costs nothing per frame until it changes, so a hundred thousand
 *   trees cost what one tree does; objects and drawMesh batch by themselves too, but rebuild their batch every frame
 * - setTransformAt, setMatrixAt and setColorAt change one instance, and only the changed range uploads before the
 *   next draw; the matrices and the colors are kept apart, so moving instances uploads 64 bytes each
 * - For many instances moving every frame, setTransforms places a run of them from arrays of positions, rotations
 *   and scales in one loop, the fastest way; or write matrixData directly and call markDirtyRange
 * - The instances are in world space; the object's own pos3D, rotation3D and scale3D do not move them
 * - The whole set is culled by one bounding sphere around the origin, worked out when culling reads it, or set by hand
 *   with radius; it casts and receives shadows like any object
 * - The object's flags cover the whole set, one emissive, one tileInfo, one shader; only the colors are per instance
 * - A mirrored instance, one with a negative scale, shows its inside unless the mesh is doubleSided
 * - A transparent set draws in one go in the transparent stage, its instances are not sorted against each other;
 *   the set sorts against other transparent draws by the object's position, so put pos3D at its middle
 * - pick, the raycast and the collect helpers do not see the instances, test them yourself from matrixData
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const forest = new InstancedMesh3D(treeMesh, 1000);
 * for (let i = 0; i < 1000; ++i)
 *     forest.setTransformAt(i, randomGroundPos(), vec3(0, rand(2*PI), 0));
 */
class InstancedMesh3D extends EngineObject3D
{
    /** Create a set of instances of a mesh, each at the origin in the object's color until it is set
     *  @param {Mesh} mesh
     *  @param {number} count - How many instances there is room for, all of them draw until count is lowered
     *  @param {TileInfo|TextureInfo} [tileInfo] - Texture for all of them
     *  @param {Color} [color] - The color they start with */
    constructor(mesh, count, tileInfo, color=WHITE)
    {
        super(vec3(), mesh, tileInfo, color);
        ASSERT(mesh instanceof Mesh, 'an InstancedMesh3D needs a Mesh');
        ASSERT(count >= 1, 'an InstancedMesh3D needs room for at least one instance');
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - How many instances draw, the first ones, up to the count it was made with */
        this.count = count;
        /** @property {number} - How many instances it was made with */
        this.maxCount = count;
        /** @property {Float32Array} - Each instance's matrix, 16 floats, what moving them uploads; edit it directly and
         *  call markDirty for the instances changed */
        this.matrixData = new Float32Array(count * RENDER3D_MATRIX_FLOATS);
        /** @property {Float32Array} - Each instance's color and uv rect, 8 floats, uploaded only when they change; edit
         *  it directly and call markColorDirty for the instances changed */
        this.colorData = new Float32Array(count * RENDER3D_COLOR_FLOATS);
        /** @property {number} - First instance whose matrix uploads before the next draw */
        this.dirtyStart = 0;
        /** @property {number} - One past the last instance whose matrix uploads, nothing when it is not past dirtyStart */
        this.dirtyEnd = count;
        /** @property {number} - First instance whose color uploads before the next draw */
        this.colorDirtyStart = 0;
        /** @property {number} - One past the last instance whose color uploads */
        this.colorDirtyEnd = count;
        // the farthest any instance's position has been from the origin, and the largest scale any has had, both
        // squared, and the instances set since radius last took them in: setting one does no bounds work at all
        this.reachSquared = 0;
        this.scaleSquared = 0;
        this.boundsStart = 0;
        this.boundsEnd = count;
        /** @type {number|undefined} */
        this.fixedRadius = undefined; // a radius set by hand, see radius
        this.buffer = undefined;      // the GPU copy of matrixData
        /** @type {WebGLBuffer|undefined} */
        this.colorBuffer = undefined; // and of colorData
        this.bufferGeneration = -1;   // the context they were made under
        this.uvTileInfo = tileInfo;   // the tile the uv rects were written for
        const uv = render3DGetTileUVs(tileInfo), matrices = this.matrixData, colors = this.colorData;
        for (let i = 0; i < count; ++i)
        {
            matrices.set(RENDER3D_IDENTITY.m, i * RENDER3D_MATRIX_FLOATS);
            const k = i * RENDER3D_COLOR_FLOATS;
            colors[k] = color.r; colors[k+1] = color.g; colors[k+2] = color.b; colors[k+3] = color.a;
            colors[k+4] = uv.x; colors[k+5] = uv.y; colors[k+6] = uv.w; colors[k+7] = uv.h;
        }
    }

    /** Place an instance by its position, rotation and scale, what buildMatrix takes, written straight in with no
     *  matrix made; in world space
     *  @param {number} i
     *  @param {Vector3} [pos]
     *  @param {Vector3} [rotation] - Euler angles in radians
     *  @param {Vector3} [scale] */
    setTransformAt(i, pos, rotation, scale)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        matrix4Compose(this.matrixData, i * RENDER3D_MATRIX_FLOATS, pos, rotation, scale);
        this.markDirty(i);
    }

    /** Place a run of instances from arrays indexed by instance, plain or typed, as a game keeps them: each is placed
     *  as setTransformAt places it, all in one loop with nothing made, the fastest way to move many every frame;
     *  in world space
     *  @param {number} start - First instance
     *  @param {number} count - How many
     *  @param {ArrayLike<number>} x - Positions
     *  @param {ArrayLike<number>} y
     *  @param {ArrayLike<number>} z
     *  @param {ArrayLike<number>} [rx] - Euler angles in radians, all three or none for upright
     *  @param {ArrayLike<number>} [ry]
     *  @param {ArrayLike<number>} [rz]
     *  @param {ArrayLike<number>} [sx] - Scales, all three or none for 1
     *  @param {ArrayLike<number>} [sy]
     *  @param {ArrayLike<number>} [sz] */
    setTransforms(start, count, x, y, z, rx, ry, rz, sx, sy, sz)
    {
        ASSERT(start >= 0 && count >= 0 && start + count <= this.maxCount, 'instance range out of range');
        ASSERT(!rx === !ry && !rx === !rz && !sx === !sy && !sx === !sz, 'rotations and scales come in threes');
        const m = this.matrixData, end = start + count;
        for (let i = start; i < end; ++i)
        {
            // matrix4Compose's expressions, so a run placed here is the same as each placed by setTransformAt
            const k = i * RENDER3D_MATRIX_FLOATS;
            const scaleX = sx ? sx[i] : 1, scaleY = sy ? sy[i] : 1, scaleZ = sz ? sz[i] : 1;
            if (rx)
            {
                const cx = cos(rx[i]), sinX = sin(rx[i]);
                const cy = cos(ry[i]), sinY = sin(ry[i]);
                const cz = cos(rz[i]), sinZ = sin(rz[i]);
                m[k]   = (cy*cz + sinY*sinX*sinZ) * scaleX;  m[k+1] = cx*sinZ * scaleX;
                m[k+2] = (-sinY*cz + cy*sinX*sinZ) * scaleX;
                m[k+4] = (-cy*sinZ + sinY*sinX*cz) * scaleY; m[k+5] = cx*cz * scaleY;
                m[k+6] = (sinY*sinZ + cy*sinX*cz) * scaleY;
                m[k+8] = sinY*cx * scaleZ;                   m[k+9] = -sinX * scaleZ; m[k+10] = cy*cx * scaleZ;
            }
            else
            {
                m[k]   = scaleX; m[k+1] = 0;      m[k+2]  = 0;
                m[k+4] = 0;      m[k+5] = scaleY; m[k+6]  = 0;
                m[k+8] = 0;      m[k+9] = 0;      m[k+10] = scaleZ;
            }
            m[k+3] = m[k+7] = m[k+11] = 0; m[k+15] = 1;
            m[k+12] = x[i], m[k+13] = y[i], m[k+14] = z[i];
        }
        count && this.markDirtyRange(start, end);
    }

    /** Place an instance, in world space
     *  @param {number} i
     *  @param {Matrix4} matrix */
    setMatrixAt(i, matrix)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        const data = this.matrixData, k = i * RENDER3D_MATRIX_FLOATS, m = matrix.m;
        for (let j = 0; j < 16; ++j)
            data[k+j] = m[j]; // for 16 floats a loop beats set's call
        this.markDirty(i);
    }

    /** The matrix of an instance
     *  @param {number} i
     *  @return {Matrix4} */
    getMatrixAt(i)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        const k = i * RENDER3D_MATRIX_FLOATS, matrix = new Matrix4;
        matrix.m.set(this.matrixData.subarray(k, k + 16));
        return matrix;
    }

    /** Color an instance
     *  @param {number} i
     *  @param {Color} color */
    setColorAt(i, color)
    {
        ASSERT(i >= 0 && i < this.maxCount, 'instance index out of range');
        ASSERT(isColor(color), 'color must be a Color');
        const data = this.colorData, k = i * RENDER3D_COLOR_FLOATS;
        data[k] = color.r; data[k+1] = color.g; data[k+2] = color.b; data[k+3] = color.a;
        this.markColorDirty(i);
    }

    /** Note that an instance's matrix changed, so it uploads before the next draw and the bounds take it in when
     *  they are read; setTransformAt and setMatrixAt call this, and so must an edit made straight to matrixData
     *  @param {number} i */
    markDirty(i)
    {
        if (i < this.dirtyStart) this.dirtyStart = i;
        if (i >= this.dirtyEnd) this.dirtyEnd = i + 1;
        if (i < this.boundsStart) this.boundsStart = i;
        if (i >= this.boundsEnd) this.boundsEnd = i + 1;
    }

    /** Note that a run of instances' matrices changed, for code that writes matrixData directly, the lowest level
     *  way to move many: they upload before the next draw and the bounds take them in when they are read
     *  @param {number} start - First instance
     *  @param {number} end - One past the last */
    markDirtyRange(start, end)
    {
        ASSERT(start >= 0 && end <= this.maxCount && start <= end, 'instance range out of range');
        if (start < this.dirtyStart) this.dirtyStart = start;
        if (end > this.dirtyEnd) this.dirtyEnd = end;
        if (start < this.boundsStart) this.boundsStart = start;
        if (end > this.boundsEnd) this.boundsEnd = end;
    }

    /** Note that an instance's color changed, so it uploads before the next draw; setColorAt calls this, and so must
     *  an edit made straight to colorData
     *  @param {number} i */
    markColorDirty(i)
    {
        if (i < this.colorDirtyStart) this.colorDirtyStart = i;
        if (i >= this.colorDirtyEnd) this.colorDirtyEnd = i + 1;
    }

    /** Radius of the sphere around the origin that holds every instance set so far, for culling: the farthest
     *  instance, and the mesh's size at the largest scale; it only grows, and takes in the instances set since it
     *  was last read, so with frustum culling off it is never worked out. Set it to fix the sphere, which a big set
     *  that is culled can use to skip that work, and set it to undefined to go back to the bounds
     *  @return {number} */
    get radius()
    {
        if (this.fixedRadius !== undefined) return this.fixedRadius;
        if (this.boundsEnd > this.boundsStart)
        {
            // the bounds grow to hold where each is now and how big, read back from its matrix, squared
            const d = this.matrixData;
            let reachSquared = this.reachSquared, scaleSquared = this.scaleSquared;
            for (let i = this.boundsStart; i < this.boundsEnd; ++i)
            {
                const k = i * RENDER3D_MATRIX_FLOATS, x = d[k+12], y = d[k+13], z = d[k+14];
                const reach = x*x + y*y + z*z, scale = render3DMaxStretchSquared(d, k);
                if (reach > reachSquared) reachSquared = reach;
                if (scale > scaleSquared) scaleSquared = scale;
            }
            this.reachSquared = reachSquared, this.scaleSquared = scaleSquared;
            this.boundsStart = Infinity, this.boundsEnd = 0;
        }
        const mesh = this.mesh, meshRadius = mesh.radius || mesh.computeRadius(); // the mesh measured once
        return this.reachSquared ** .5 + meshRadius * this.scaleSquared ** .5;
    }
    set radius(radius) { this.fixedRadius = radius; }

    /** Draws every instance as one call, uploading the ones that changed first
     *  @return {void} */
    render3D()
    {
        const r = render3D, gl = glContext, mesh = this.mesh;
        ASSERT(this.count >= 0 && this.count <= this.maxCount, 'count must be within the count it was made with');
        if (r.transparentQueue) // sorted as one thing with the other transparent draws
            return r.queueTransparent(this.getWorldPos3D(), ()=> this.render3D());
        if (!mesh || !this.count || !render3DCanDraw()) return;
        if (r.shadowPass && !r.lighting) return; // unlit things cast no shadow
        render3DMeshUpload(mesh);
        if (!mesh.bufferCount) return;
        if (r.frustumCulling && !render3DSphereVisible(0, 0, 0, this.radius)) return;

        // the uv rect is the object's tile for every instance, rewritten when the tile changes
        if (this.uvTileInfo !== this.tileInfo)
        {
            const uv = render3DGetTileUVs(this.tileInfo), data = this.colorData;
            for (let k = 4; k < data.length; k += RENDER3D_COLOR_FLOATS)
                data[k] = uv.x, data[k+1] = uv.y, data[k+2] = uv.w, data[k+3] = uv.h;
            this.uvTileInfo = this.tileInfo;
            this.colorDirtyStart = 0, this.colorDirtyEnd = this.maxCount;
        }

        // the GPU copies: all of each under a fresh context, otherwise just the changed ranges
        if (!this.buffer || this.bufferGeneration !== r.contextGeneration)
        {
            this.bufferGeneration = r.contextGeneration;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer = gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, this.matrixData, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer = gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, this.colorData, gl.DYNAMIC_DRAW);
        }
        else
        {
            const upload = (buffer, data, floats, start, end)=>
            {
                if (end <= start) return;
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, start * floats * 4, data, start * floats, (end - start) * floats);
            };
            upload(this.buffer, this.matrixData, RENDER3D_MATRIX_FLOATS, this.dirtyStart, this.dirtyEnd);
            upload(this.colorBuffer, this.colorData, RENDER3D_COLOR_FLOATS, this.colorDirtyStart, this.colorDirtyEnd);
        }
        this.dirtyStart = this.colorDirtyStart = Infinity, this.dirtyEnd = this.colorDirtyEnd = 0;

        // one draw under the object's state, the mesh setting the culling as drawMesh does
        r.flush();
        render3DFlushBeforeOverlay(); // as in drawMesh, what was drawn before goes under it
        const cullBackFaces = r.cullBackFaces, tileInfo = this.tileInfo;
        r.cullBackFaces = !mesh.doubleSided;
        render3DDrawInstanced(mesh, this.buffer, this.count, render3DTextureOf(tileInfo), r, this.colorBuffer);
        r.cullBackFaces = cullBackFaces;
    }

    /** Destroy the set and free its GPU buffer
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.buffer && this.bufferGeneration === render3D?.contextGeneration)
            glContext?.deleteBuffer(this.buffer), glContext?.deleteBuffer(this.colorBuffer);
        this.buffer = this.colorBuffer = undefined;
        super.destroy(immediate);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Light3D - A light that is an EngineObject3D, so it can move, follow a parent or be destroyed like anything else
 * - A point light: it lights what is near it and fades out by its radius, DirectionalLight3D shines from far away
 * - A coneAngle makes it a spotlight: it shines along its own forward, turned by rotation3D or by what it is
 *   attached to, inside the cone, fading over the part of it coneSoftness says
 * - The sun, render3D.sunDirection, casts the shadows; a spotlight can cast them in its place, see
 *   render3D.shadowLight; the other lights light and make highlights without one
 * - Only the 8 lights nearest the camera are used each frame
 * - radius is where the light fades out, and it fades fast, so a small radius wants a higher intensity
 * - intensity multiplies the color, above 1 for a light brighter than white
 * - radius is a world distance, so scale3D does not change it
 * - An alpha, an intensity or a radius of 0 switches it off, and a light that is off takes none of those slots
 * - Draws nothing but its glow, when it has one; add a small emissive mesh if the lamp itself should be seen
 * - addFlare gives it a lens flare, see LensFlare3D
 * @extends EngineObject3D
 * @memberof Render3D
 * @example
 * const torch = new Light3D(vec3(0, 3, 0), 10, hsl(.1, 1, .65));
 * torch.addFlare();   // light in the lens when the torch is in view
 */
class Light3D extends EngineObject3D
{
    /** Create a point light
     *  @param {Vector3} [pos3D] - Where it is
     *  @param {number} [radius] - Distance where the light fades to nothing
     *  @param {Color} [color] - Light color, its alpha fades it
     *  @param {number} [intensity] - Brightness, multiplies the color, above 1 is brighter than white */
    constructor(pos3D=vec3(), radius=5, color=WHITE, intensity=1)
    {
        super(pos3D, undefined, undefined, color);
        ASSERT(radius >= 0, 'light radius cannot be negative, 0 is an off switch like an alpha of 0');
        ASSERT(intensity >= 0, 'light intensity cannot be negative, 0 is an off switch');
        this.size3D = vec3(); // not a solid thing to pick or collect
        /** @property {number} - Distance where the light fades to nothing */
        this.radius = radius;
        /** @property {number} - Brightness, multiplies the color, above 1 is brighter than white */
        this.intensity = intensity;
        /** @property {boolean} - Shine from far away, from its position toward the origin, instead of out from its
         *  position with a falloff; DirectionalLight3D sets it */
        this.directional = false;
        /** @property {number} - Makes it a spotlight: the angle in radians from its forward out to the edge of its
         *  cone, so the beam is twice this across; 0 for a light that shines every way */
        this.coneAngle = 0;
        /** @property {number} - How much of the cone is its fading edge: 0 a hard edge, .2 by default, the outer
         *  fifth, 1 fading all the way from the middle of the beam */
        this.coneSoftness = .2;
        /** @property {number} - Size of a soft hazy glow drawn over the light, like a lamp at night, 0 for none; it
         *  is added onto what is behind it, and what is in front of the light hides it */
        this.glow = 0;
        /** @property {number} - How fast the glow fades from its middle: 1 by default, .5 a wide haze, 2 a tight
         *  bright core */
        this.glowFalloff = 1;
        /** @property {TextureInfo|TileInfo|undefined} - A gel: a picture the light shines through, like a stained glass
         *  window or the leaves of a tree, cast along its cone in its colors, upright as the light looks out, the whole
         *  texture of a TileInfo; only the spotlight that casts the shadows has one, with render3D.shadows on and it
         *  as render3D.shadowLight, and only on what takes its shadows: an object with receiveShadow off is lit
         *  without the gel; its alpha is not read, see through panes are dark
         *  @type {TextureInfo|TileInfo|undefined} */
        this.gel = undefined;
        this.additive = true; // the glow is added on, in the transparent stage; a light with none draws nothing
        /** @type {LensFlare3D|undefined} */
        this.flareObject = undefined;
    }

    /** Give the light a lens flare, made with the arguments of LensFlare3D, in place of the one it had
     *  @param {number} [size] - Scales every part of it
     *  @param {number} [count] - How many ghosts there are, besides the glow at the light
     *  @param {number} [intensity] - How bright it is
     *  @param {number} [saturation] - How colorful the ghosts are
     *  @param {Color} [color] - Tints the flare, with the light's own color
     *  @return {LensFlare3D} - The flare, to change: light.addFlare().shapes = ['hex'] */
    addFlare(size, count, intensity, saturation, color)
    {
        const flare = new LensFlare3D(size, count, intensity, saturation, color);
        this.flare = flare;
        return flare;
    }

    /** The light's lens flare, undefined for none: addFlare makes it, or set a LensFlare3D of your own, and
     *  destroying the flare takes it away
     *  - The flare is the light's: it is attached to the light as its child, so it stays through a scene change
     *    when the light does, and is destroyed with the light or when another takes its place
     *  @type {LensFlare3D|undefined} */
    get flare() { return this.flareObject && !this.flareObject.destroyed ? this.flareObject : undefined; }

    set flare(flare)
    {
        const old = this.flare; // a flare that was destroyed on its own is no flare
        if (flare === old) return;
        old && old.destroy();
        if (flare)
        {
            flare.light = this;
            flare.parent || this.addChild(flare);
        }
        this.flareObject = flare || undefined;
    }

    /** Destroy the light, and its flare with it
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        this.flare = undefined;
        super.destroy(immediate);
    }

    /** Draw the glow, a quad facing the camera with a soft round glow on it, pulled toward the camera by half its
     *  size so a lamp at the light does not cut into it, but never past the camera */
    render3D()
    {
        if (!(this.glow > 0) || this.directional) return;
        const r = render3D, c = this.color, pos = render3DObjectMatrix(this).getTranslation();
        const toCamera = r.camera.pos.subtract(pos), distance = toCamera.length();
        const at = distance ? pos.add(toCamera.scale(min(this.glow, distance) / 2 / distance)) : pos;
        const color = rgb(c.r, c.g, c.b, c.a * min(this.intensity, 1)), texture = engineGlowTexture(this.glowFalloff);
        // a browser that can not make the glow's texture draws no glow, not a plain square
        if (texture || !glContext)
            r.drawBillboard(at, vec2(this.glow), texture, color);
    }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * DirectionalLight3D - A Light3D that shines from far away with no falloff, like sunlight
 * - It shines from its position toward the origin, like a three.js DirectionalLight: only the direction to it
 *   counts, so moving it or its parent swings the light around; parent it to a sun in the sky and it follows
 * - It cannot sit on the origin, since that leaves no direction
 * - It casts no shadow: the sun, render3D.sunDirection, does, or a spotlight set as render3D.shadowLight
 * @extends Light3D
 * @memberof Render3D
 * @example
 * const fill = new DirectionalLight3D(vec3(-1, 1, 1), hsl(.6, .5, .3)); // from the back left and above
 */
class DirectionalLight3D extends Light3D
{
    /** Create a directional light
     *  @param {Vector3} [pos3D] - Where it shines from, toward the origin
     *  @param {Color} [color] - Light color, its alpha fades it
     *  @param {number} [intensity] - Brightness, multiplies the color, above 1 is brighter than white */
    constructor(pos3D=vec3(0, 1, 0), color=WHITE, intensity=1)
    {
        super(pos3D, 0, color, intensity);
        this.directional = true;
    }
}
