/**
 * LittleJS glTF Plugin
 * - Loads glTF 2.0 models: a .gltf with its .bin and images beside it, or a .glb with everything in one file
 * - A model comes back as parts, one Mesh per primitive of every node placed by the node tree, each with its
 *   material's color and base color texture, plus everything combined into one Mesh
 * - Geometry: positions, normals, uvs, vertex colors and indices, and skins, the four strongest joints of a vertex
 *   of up to eight; morph targets are not read
 * - Animations play through the GLTFObject that createObject makes: parts that move, turn and scale, like doors,
 *   wheels and propellers, and skinned characters, their meshes bent by their joints each frame; play takes a
 *   blend time to cross-fade from one animation to the next
 * - Materials give a base color and texture and whether they blend; glass made with KHR_materials_transmission blends too,
 *   and a KHR_materials_unlit material comes in emissive, its own color with no shading
 * - A material's normal map and emissive map load too, with its normal scale and emissive factor, read at the base
 *   color texture's uvs; roughness, metalness and occlusion maps are not loaded
 * - The base color texture reads the uv set its texCoord names, moved by KHR_texture_transform as gltfpack and
 *   Blender write it
 * - An OPAQUE material, the default, ignores its texture's alpha as the format says: a texture only such materials
 *   use loads with its alpha set to 1, so the 3D pass cuts no holes in it; MASK always cuts at half, alphaCutoff
 *   is not read
 * - Material and vertex colors are linear in glTF and are converted to sRGB at load, the space textures are in
 * - glTF and LittleJS agree on the axes, y up and -z forward, on counter clockwise triangles and on uvs running down
 * - Requires the Render3D plugin
 * @namespace GLTF
 * @example
 * const model = await loadGLTF('ship.glb');   // in an async gameInit
 * const ship = model.createObject(vec3(0, 1, 0)); // an object with a child per part, textures and all
 * ship.play('fly');                            // and its animation, by name or number
 * ship.play('land', false, 1, .3);             // then another, cross-faded over .3 seconds
 * new EngineObject3D(vec3(), model.mesh);      // or the whole thing as one mesh, still
 */

'use strict';

///////////////////////////////////////////////////////////////////////////////
/**
 * GLTFPart - One primitive of a model, placed where its node put it
 * @memberof GLTF
 */
class GLTFPart
{
    /** Make a part, as the loader does for each primitive
     *  @param {string} name @param {Mesh} mesh @param {Color} color @param {TextureInfo|undefined} textureInfo @param {boolean} transparent */
    constructor(name, mesh, color, textureInfo, transparent)
    {
        /** @property {string} - The node's name, or its mesh's */
        this.name = name;
        /** @property {Mesh} - The geometry in model space, the node transforms applied, with the vertex colors the file had;
         *  a node resting at scale 0 is applied at scale 1 there, so an animation can grow it from nothing */
        this.mesh = mesh;
        /** @property {Color} - The material's base color, to draw the mesh tinted with */
        this.color = color;
        /** @property {TextureInfo|undefined} - The material's base color texture, undefined without one or without WebGL
         *  @type {TextureInfo|undefined} */
        this.textureInfo = textureInfo;
        /** @property {boolean} - The material blends or is glass, so the part belongs in the transparent stage */
        this.transparent = transparent;
        /** @property {boolean} - Its texture's sampler asks for nearest filtering, hard edged pixels, as pixel art
         *  and voxel tools export; the object createObject makes draws it pixelated */
        this.pixelated = false;
        /** @property {number} - The node it came from, which an animation moves it with */
        this.node = 0;
        /** @property {boolean} - The material is unlit (KHR_materials_unlit), its own color with no shading; the object
         *  createObject makes draws it with emissive 1 */
        this.unlit = false;
        /** @property {TextureInfo|undefined} - The material's normal map, drawn with the base color texture's uvs
         *  @type {TextureInfo|undefined} */
        this.normalMap = undefined;
        /** @property {number} - The normal map's strength, its scale in the file */
        this.normalScale = 1;
        /** @property {TextureInfo|undefined} - The material's emissive map, or a white texture when it has an
         *  emissiveFactor and no texture, so it glows all over
         *  @type {TextureInfo|undefined} */
        this.emissiveMap = undefined;
        /** @property {Color} - The emissiveFactor, which multiplies the emissive map */
        this.emissiveMapColor = WHITE;
        /** @property {GLTFSkin|undefined} - For a skinned mesh, what bends it: mesh is its resting pose, and the
         *  object createObject makes bends a copy of its own to each pose
         *  @type {GLTFSkin|undefined} */
        this.skin = undefined;
        // which of the file's vertices each of the mesh's is, when flat normals split them, for a skin
        /** @type {Array<number>|undefined} */
        this.vertexSource = undefined;
    }
}

/**
 * What bends a skinned part: its joints, the nodes that move it, their inverse bind matrices, and for each vertex
 * of its mesh four joints and four weights, with the place and normal each pose bends from
 * @typedef {Object} GLTFSkin
 * @property {Array<number>} joints - The joints, as node numbers
 * @property {Array<Matrix4>} inverseBind - Each joint's inverse bind matrix
 * @property {Uint16Array} vertexJoints - Four joints a vertex, as places in joints
 * @property {Float32Array} vertexWeights - Four weights a vertex, summing to 1
 * @property {Float32Array} bindPoints - Each vertex's place as stored, x y z
 * @property {Float32Array} bindNormals - Each vertex's normal as stored, x y z
 * @memberof GLTF
 */

/**
 * GLTFAnimation - One animation of a model: keys that move, turn and scale its nodes over time
 * - Play it through the GLTFObject that model.createObject makes
 * @memberof GLTF
 */
class GLTFAnimation
{
    /** Make an animation from its channels, as the loader does
     *  @param {string} name @param {Array<Object>} channels */
    constructor(name, channels)
    {
        /** @property {string} - Its name in the file, or 'animation' and its number when it has none */
        this.name = name;
        /** @property {Array<Object>} - What it moves: for each, a node, which of its translation, rotation or scale,
         *  the key times and values, and how to go between keys, LINEAR, STEP or CUBICSPLINE
         *  @type {Array<Object>} */
        this.channels = channels;
        /** @property {number} - Length in seconds, the time of its last key
         *  @type {number} */
        this.duration = channels.reduce((d, c)=> max(d, c.times[c.times.length - 1] || 0), 0);
    }
}

/**
 * GLTFModel - A loaded model: its parts, and everything as one mesh
 * @memberof GLTF
 */
class GLTFModel
{
    /** Make a model from its parts, as the loader does
     *  @param {Array<GLTFPart>} parts @param {Array<GLTFAnimation>} [animations] @param {Object} [nodeTree] */
    constructor(parts, animations=[], nodeTree)
    {
        /** @property {Array<GLTFPart>} - One per primitive of every node that has a mesh */
        this.parts = parts;
        /** @property {Array<GLTFAnimation>} - The animations, play one through createObject's GLTFObject
         *  @type {Array<GLTFAnimation>} */
        this.animations = animations;
        this.nodeTree = nodeTree;             // each node's parent and resting place, for animation
        this.modelMatrix = new Matrix4;       // what center, fit and transform did to the parts, animation works through it
        /** @property {Mesh} - Every part combined, each tinted with its material color; the texture is textureInfo,
         *  and blending and unlit stay with the parts, which createObject draws */
        this.mesh = new Mesh;
        for (const part of parts) // a part baked at scale 1 from a node resting at 0 goes in as it rests
            this.mesh.combine(part.mesh, !part.skin && nodeTree?.restPose?.[part.node] || RENDER3D_IDENTITY, part.color);
        // the one texture every part uses, when they all do; a part without one has no uvs into it, so a model
        // that mixes plain and textured parts, or uses several textures, is drawn through createObject instead
        const textures = new Set(parts.map(p=> p.textureInfo));
        /** @property {TextureInfo|undefined} - The texture to draw mesh with, when every part uses the same one
         *  @type {TextureInfo|undefined} */
        this.textureInfo = textures.size === 1 ? textures.values().next().value : undefined;
        /** @type {{min: Vector3, max: Vector3}|undefined} */
        this.bounds = undefined; // the box around every part, kept once measured, see getBounds
    }

    /** The box around every part, measured once and again after transform, so change the model through that
     *  @return {{min: Vector3, max: Vector3}} */
    getBounds()
    {
        const bounds = this.bounds ||= this.mesh.getBounds();
        return { min: bounds.min.copy(), max: bounds.max.copy() }; // a copy, so a change to it leaves the model's
    }

    /** Move every part so the center of the model's bounds is on the origin, like Mesh.center
     *  @return {GLTFModel} */
    center()
    {
        const bounds = this.getBounds();
        return this.transform(bounds.min.add(bounds.max).scale(-.5));
    }

    /** Scale every part evenly so the model's largest extent is a size, like Mesh.fit, for models of unknown units
     *  @param {number} [size]
     *  @return {GLTFModel} */
    fit(size=1)
    {
        const bounds = this.getBounds(), extent = bounds.max.subtract(bounds.min);
        return this.transform(Matrix4.scaling(vec3(size / (max(extent.x, extent.y, extent.z) || 1))));
    }

    /** Move, turn or scale every part and the combined mesh together
     *  @param {Matrix4|Vector3} matrix - Transform, or just an offset to move by
     *  @return {GLTFModel} */
    transform(matrix)
    {
        matrix = render3DMatrix(matrix);
        for (const part of this.parts)
            part.mesh.transform(matrix);
        this.mesh.transform(matrix);
        this.bounds = undefined; // measured again when next asked for
        this.modelMatrix = matrix.copy().multiply(this.modelMatrix);
        return this;
    }

    /** Find an animation by name or number
     *  @param {string|number|GLTFAnimation} animation
     *  @return {GLTFAnimation|undefined} */
    getAnimation(animation)
    {
        return animation instanceof GLTFAnimation ? animation : isNumber(animation) ? this.animations[animation]
            : this.animations.find(a=> a.name === animation);
    }

    /** How far each part has moved from its resting place at a time in an animation, one matrix per part
     *  - createObject's GLTFObject calls this as it plays, a game only needs it to pose something by hand
     *  @param {GLTFAnimation} animation
     *  @param {number} time - Seconds into it
     *  @return {Array<Matrix4>} */
    getPose(animation, time)
    {
        if (!this.nodeTree) return this.parts.map(()=> new Matrix4);
        return this.partPoses(gltfNodeWorlds(this.nodeTree, gltfPoseNodes(this.nodeTree, animation, time)));
    }

    // each part's move from where it rests, with each node's place in the model from worldOf, through what center
    // and fit did: modelMatrix * now * rest inverse * modelMatrix inverse; a skinned part is posed by its joints
    // and stays where it is
    partPoses(worldOf)
    {
        const tree = this.nodeTree, model = this.modelMatrix, modelInverse = model.copy().invert();
        return this.parts.map(part=> part.skin ? new Matrix4 :
            model.copy().multiply(worldOf(part.node)).multiply(tree.restInverse[part.node]).multiply(modelInverse));
    }

    /** Free the GPU buffers of every part's mesh and of the combined mesh, and the textures, for a model that is
     *  done with, like a level's models when the next level loads
     *  - Destroy the objects createObject made from it first; a mesh drawn again only uploads again, but a freed
     *    texture is gone */
    dispose()
    {
        for (const part of this.parts)
            part.mesh.dispose();
        this.mesh.dispose();
        for (const textureInfo of new Set(this.parts.flatMap(p=> [p.textureInfo, p.normalMap, p.emissiveMap])))
            textureInfo !== gltfWhiteTextureInfo && textureInfo?.destroyWebGLTexture(); // the white one is shared
    }

    /** Make an object at a position with a child per part, so each keeps its own texture, color and blending, and
     *  the model's animations can play on it; the way to show a model with windows or other see through parts,
     *  which the combined mesh draws solid, or one that moves
     *  @param {Vector3} [pos3D]
     *  @return {GLTFObject} - The root, move and turn it and the parts follow */
    createObject(pos3D=vec3()) { return new GLTFObject(this, pos3D); }
}

///////////////////////////////////////////////////////////////////////////////
/**
 * GLTFObject - A model as an object with a child per part, which plays the model's animations
 * - model.createObject makes one; move, turn and scale it like any EngineObject3D and the parts follow
 * - play starts an animation by name or number, and the object moves its parts each frame as it runs
 * - The parts' meshes stay where they rest, an animation moves the child objects that draw them
 * @extends EngineObject3D
 * @memberof GLTF
 * @example
 * const door = model.createObject(vec3(0, 0, 5));
 * door.play('open', false); // once, holding the last pose
 */
class GLTFObject extends EngineObject3D
{
    /** Make the object and its parts, model.createObject is the usual way
     *  @param {GLTFModel} model
     *  @param {Vector3} [pos3D] */
    constructor(model, pos3D=vec3())
    {
        super(pos3D);
        // the size of the whole model, as an object made from model.mesh would have, measured once for the model
        const bounds = model.mesh.points.length ? model.getBounds() : undefined;
        if (bounds)
            this.size3D = bounds.max.subtract(bounds.min);
        /** @property {GLTFModel} - The model it shows */
        this.model = model;
        /** @property {GLTFAnimation|undefined} - The animation playing, or the last one, undefined for none
         *  @type {GLTFAnimation|undefined} */
        this.animation = undefined;
        /** @property {number} - Seconds into the animation */
        this.animationTime = 0;
        /** @property {number} - How fast it plays, 1 is as made, negative plays it backward */
        this.animationSpeed = 1;
        /** @property {boolean} - Start again at the end, or stop there and hold the last pose */
        this.animationLoop = true;
        /** @property {boolean} - Whether it is moving through the animation now */
        this.animationPlaying = false;
        // what a cross-fade comes from: an animation going on as it was, or a pose held, and how far it is
        /** @type {{animation?: GLTFAnimation, time?: number, speed?: number, loop?: boolean, nodes?: Map<number, Object>}|undefined} */
        this.blendFrom = undefined;
        this.blendTime = 0;
        this.blendElapsed = 0;
        // each node's values and place in the model as last posed, for a fade from here and for getJointMatrix, and
        // whether that pose was a mix, as a fade stopped part way holds it
        /** @type {Map<number, Object>|undefined} */
        this.poseNodes = undefined;
        this.poseMixed = false;
        /** @type {(function(number): Matrix4)|undefined} */
        this.poseWorldOf = undefined;
        /** @property {Array<EngineObject3D>} - The child that draws each of the model's parts, in the order of
         *  model.parts, which an animation poses; one destroyed or taken off the object is left alone
         *  @type {Array<EngineObject3D>} */
        this.parts = [];
        for (const part of model.parts)
        {
            // a skinned part bends a mesh of its own, so objects of one model each hold their own pose
            const o = new EngineObject3D(vec3(), part.skin ? gltfSkinMeshCopy(part.mesh) : part.mesh, part.textureInfo, part.color);
            o.transparent = part.transparent;
            o.pixelated = part.pixelated;
            o.emissive = part.unlit ? 1 : 0;
            o.normalMap = part.normalMap, o.normalScale = part.normalScale;
            o.emissiveMap = part.emissiveMap, o.emissiveMapColor = part.emissiveMapColor.copy(); // its own, as color is
            const rest = !part.skin && model.nodeTree?.restPose?.[part.node];
            if (rest)
            {
                // baked at scale 1 from a node resting at 0, it starts as it rests, where a pose would put it
                const modelMatrix = model.modelMatrix, m = modelMatrix.copy().multiply(rest).multiply(modelMatrix.copy().invert());
                o.localMatrix = m; // whole, as a pose is
                o.pos3D = m.getTranslation();
                o.rotation3D = m.getRotation();
                o.scale3D = m.getScale();
            }
            this.addChild(o);
            this.parts.push(o);
        }
    }

    /** Destroy the object and its parts, and free the meshes its skinned parts bend, which are its own
     *  @param {boolean} [immediate] */
    destroy(immediate)
    {
        if (this.destroyed) return;
        this.parts.forEach((o, i)=> this.model.parts[i]?.skin && o.mesh?.dispose());
        super.destroy(immediate);
    }

    /** Play an animation from its start, at once or cross-faded from the pose it is in
     *  - A play with a blend of the animation already playing goes on with it, so state code may call it each
     *    frame; without a blend it starts the animation again
     *  @param {string|number|GLTFAnimation} [animation] - Its name, its number in model.animations, or itself
     *  @param {boolean} [loop] - Start again at the end, or stop there
     *  @param {number} [speed] - 1 is as made, negative plays it backward from its end
     *  @param {number} [blend] - Seconds to cross-fade from the pose it is in, 0 to switch at once; the animation
     *    it comes from goes on through the fade, and a fade started during another fades from the mix there */
    play(animation=0, loop=true, speed=1, blend=0)
    {
        const found = this.model.getAnimation(animation);
        ASSERT(found, 'the model has no animation ' + animation, this.model.animations.map(a=> a.name));
        if (!found) return;
        if (blend > 0 && found === this.animation && this.animationPlaying)
        {
            this.animationLoop = loop, this.animationSpeed = speed;
            return;
        }
        const fading = this.blendFrom;
        this.blendFrom = undefined;
        if (blend > 0)
        {
            // from the animation playing, going on as it was, or from the pose held, a fade's mix included
            const from = this.animation && !fading && !this.poseMixed ? {animation: this.animation, time: this.animationTime,
                speed: this.animationPlaying ? this.animationSpeed : 0, loop: this.animationLoop} : undefined;
            this.blendFrom = from || {nodes: this.poseNodes || new Map};
            this.blendTime = blend;
            this.blendElapsed = 0;
        }
        this.animation = found;
        this.animationLoop = loop;
        this.animationSpeed = speed;
        this.animationPlaying = true;
        this.setAnimationTime(speed < 0 ? found.duration : 0);
    }

    /** Stop the animation where it is, the parts hold that pose; a cross-fade going on stops too, holding the mix */
    stop() { this.animationPlaying = false; this.blendFrom = undefined; }

    /** Put the parts where the animation has them at a time, playing or not
     *  @param {number} time - Seconds into the animation */
    setAnimationTime(time)
    {
        this.animationTime = time;
        const model = this.model, tree = model.nodeTree;
        if (!this.animation || !tree) return;

        // each node's values now, mixed with what a fade comes from by how far it is, eased in and out
        let nodes = gltfPoseNodes(tree, this.animation, time);
        const from = this.blendFrom;
        if (from)
        {
            const fromNodes = from.nodes || gltfPoseNodes(tree, from.animation, from.time);
            nodes = gltfPoseBlend(tree, fromNodes, nodes, smoothStep(clamp(this.blendElapsed / this.blendTime)));
        }
        const worldOf = gltfNodeWorlds(tree, nodes);
        this.poseNodes = nodes, this.poseWorldOf = worldOf, this.poseMixed = !!from;

        // its own list of the part objects, so a child removed or added does not hand a part another's pose
        const pose = model.partPoses(worldOf), parts = this.parts;
        for (let i = 0; i < pose.length && i < parts.length; ++i)
        {
            const o = parts[i], m = pose[i], skin = model.parts[i].skin;
            if (o.destroyed || o.parent !== this) continue;
            if (skin)
            {
                gltfSkinApply(skin, worldOf, model.modelMatrix, o.mesh); // bent by its joints, where it is
                continue;
            }
            // drawn with the whole pose, which a parent's uneven scale can shear, the parts kept for what reads them
            o.localMatrix = m;
            o.pos3D = m.getTranslation();
            o.rotation3D = m.getRotation();
            o.scale3D = m.getScale();
        }
    }

    /** Move through the animation, and a cross-fade into it, called automatically each frame */
    update()
    {
        super.update();
        const animation = this.animation, from = this.blendFrom;
        if (!animation || !this.animationPlaying && !from) return;
        let t = this.animationTime;
        if (this.animationPlaying)
        {
            t = gltfAnimationStep(animation, t, this.animationSpeed, this.animationLoop);
            if (!this.animationLoop && (t >= animation.duration || t <= 0))
                this.animationPlaying = false; // the end, or the start when playing backward: hold the last pose there
        }
        if (from)
        {
            this.blendElapsed += timeDelta;
            if (from.animation) // what it fades from goes on as it was
                from.time = gltfAnimationStep(from.animation, from.time, from.speed, from.loop);
        }
        this.setAnimationTime(t);
        if (from && this.blendElapsed >= this.blendTime)
            this.blendFrom = undefined; // faded all the way, the pose just set is the animation's own
    }

    /** A node's matrix in the world as the model is posed now, by its name in the file, to hang something on a
     *  joint, a sword on a hand or a hat on a head; undefined when the model has no node of that name
     *  @param {string} name
     *  @return {Matrix4|undefined} */
    getJointMatrix(name)
    {
        const tree = this.model.nodeTree, index = tree?.nodes?.findIndex(node=> node.name === name) ?? -1;
        if (index < 0) return;
        const worldOf = this.poseWorldOf || gltfNodeWorlds(tree, new Map);
        return this.getMatrix().multiply(this.model.modelMatrix).multiply(worldOf(index));
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Load a glTF or GLB model, the .bin and images of a .gltf from beside it
 *  - A texture only OPAQUE materials use loads with its alpha set to 1, so the 3D pass cuts no holes in it
 *  @param {string} url
 *  @return {Promise<GLTFModel>}
 *  @memberof GLTF */
async function loadGLTF(url)
{
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('loadGLTF failed: ' + url);
    // the files beside it are beside where it came from, after any redirect; a blob or data url has nothing
    // beside it, and a model in one is whole, or parsed with parseGLTF and a base of its own
    const from = response.url || url;
    let base = '';
    if (!/^(blob|data):/i.test(from))
        base = response.url ? new URL('.', from).href : from.slice(0, from.lastIndexOf('/') + 1);
    const data = await response.arrayBuffer();
    try { return await parseGLTF(data, base); }
    catch (e)
    {
        // which file, and a web page, as a dev server sends for a mistyped path, said as one
        const page = loadIsWebPage(String.fromCharCode(...new Uint8Array(data, 0, min(data.byteLength, 64))));
        throw new Error('loadGLTF ' + url + (page ? ' is a web page, so the path may be wrong' : ': ' + e.message));
    }
}

/** Parse a model from GLB bytes or glTF JSON, fetching the buffers and images it refers to
 *  - A .gltf names its .bin and image files, which are fetched from baseUrl, or found among files: what a game
 *    has in hand, like the files dropped on the page, by their paths in the drop; with files, baseUrl is the
 *    .gltf's own folder among them ('' or 'models/house/'), its names are read from there, and a name found nowhere
 *    there is taken by its file name alone only when one file of the drop has it; only an http, https or blob uri
 *    is fetched then
 *  - A file the model needs that is not found is named in the error, and an image that can not be read is named in
 *    a warning and left out
 *  @param {ArrayBuffer|Object|string} data - GLB bytes, or the glTF JSON as bytes, text or an object
 *  @param {string} [baseUrl] - Where the .bin and image files are, with its trailing slash; loadGLTF passes the file's folder
 *  @param {Map<string, Blob>} [files] - The files it refers to, by their paths, in place of fetching them
 *  @return {Promise<GLTFModel>}
 *  @example
 *  // the files of a drop, a .gltf with its .bin and textures, by their names
 *  const files = new Map([...dataTransfer.files].map((file)=> [file.name, file]));
 *  const gltf = [...files.values()].find((file)=> file.name.endsWith('.gltf'));
 *  const model = await parseGLTF(await gltf.text(), '', files);
 *  @memberof GLTF */
async function parseGLTF(data, baseUrl='', files)
{
    let json = data, glbBuffer;
    if (data instanceof ArrayBuffer)
    {
        const view = new DataView(data);
        if (data.byteLength >= 12 && view.getUint32(0, true) === 0x46546C67) // 'glTF', the binary container
        {
            if (view.getUint32(4, true) !== 2)
                throw new Error('only GLB version 2 is read');
            for (let offset = 12; offset + 8 <= data.byteLength;)
            {
                const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
                const chunk = data.slice(offset + 8, offset + 8 + length);
                if (type === 0x4E4F534A) json = new TextDecoder().decode(chunk); // JSON
                else if (type === 0x004E4942) glbBuffer = chunk;                  // BIN
                offset += 8 + length;
            }
        }
        else
            json = new TextDecoder().decode(data);
    }
    if (typeof json == 'string')
        json = JSON.parse(json);
    if (!json.asset || !String(json.asset.version).startsWith('2'))
        throw new Error('only glTF 2.0 is read'); // a file problem, not a code one, so it throws in every build
    // compressed geometry has no plain accessors to read; the other extensions add to what is here, and can be left out
    for (const name of json.extensionsRequired || [])
        if (name === 'KHR_draco_mesh_compression' || name === 'EXT_meshopt_compression')
            throw new Error(`glTF with ${name} is not read, export it uncompressed`);
        else if (name === 'KHR_texture_basisu')
            throw new Error('glTF with KHR_texture_basisu textures is not read, export them as png or jpeg');
    // one that only may use them has other images to fall back on, or none: said, since it loads with them left out
    if (json.extensionsUsed?.includes('KHR_texture_basisu') && !json.extensionsRequired?.includes('KHR_texture_basisu'))
        console.warn('glTF: KHR_texture_basisu textures are not read and are left out, export them as png or jpeg');

    // the buffers: the GLB's own, a data uri, or a file beside the model
    const buffers = await Promise.all((json.buffers || []).map((buffer, i)=>
    {
        if (!buffer.uri)
        {
            ASSERT(glbBuffer && !i, 'a buffer without a uri is the GLB chunk, and only the first can be');
            return glbBuffer;
        }
        return gltfFetch(buffer.uri, baseUrl, files).then(r=> r.arrayBuffer());
    }));

    // the textures, decoded together first; none without WebGL, and a failed image only logs; the base color, normal
    // and emissive textures are drawn with, the roughness and occlusion maps are not loaded at all
    const usedTextures = new Set((json.materials || []).flatMap(m=> [m.pbrMetallicRoughness?.baseColorTexture?.index,
        m.normalTexture?.index, m.emissiveTexture?.index]));
    const normalTextures = new Set((json.materials || []).map(m=> m.normalTexture?.index));
    const opaqueTextures = gltfOpaqueTextures(json);
    const textures = await Promise.all((json.textures || []).map(async (texture, index)=>
    {
        if (!glContext || typeof createImageBitmap == 'undefined' || !usedTextures.has(index)) return;
        try
        {
            // a WebP or AVIF image is named by its extension, the browser decodes those like any other
            const source = texture.source ?? texture.extensions?.EXT_texture_webp?.source ?? texture.extensions?.EXT_texture_avif?.source;
            const image = json.images[source], sampler = json.samplers?.[texture.sampler] || {};
            let blob;
            if (image.uri)
                blob = await gltfFetch(image.uri, baseUrl, files).then(r=> r.blob());
            else
            {
                const view = json.bufferViews[image.bufferView];
                blob = new Blob([new Uint8Array(buffers[view.buffer], view.byteOffset || 0, view.byteLength)], {type: image.mimeType});
            }
            // an OPAQUE material ignores its texture's alpha, which the 3D pass would cut holes by, so a texture only
            // those use has it set to 1; decoded as stored for that, and a jpeg has no alpha to set
            const opaque = opaqueTextures.has(index) && blob.type !== 'image/jpeg';
            // a normal map is directions, not colors, so it is decoded as stored; one a material also uses as a
            // color, an odd file, is decoded that way too
            const bitmap = normalTextures.has(index) ?
                await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'}) :
                opaque ? await createImageBitmap(blob, {premultiplyAlpha: 'none'}).then(gltfOpaqueImage) : await createImageBitmap(blob);
            // REPEAT by default, and hard edged only when its sampler says NEAREST, not as the game's tiles are
            return new TextureInfo(bitmap, true, [sampler.wrapS ?? 10497, sampler.wrapT ?? 10497], sampler.magFilter === 9728);
        }
        catch (e) { console.warn('glTF image not loaded, left out: ' + (e?.message || e)); }
    }));

    // the parts: the scene's nodes walked with their transforms, every primitive of a node's mesh placed by it;
    // each node's parent and resting place are kept, so an animation can move a part from where it rests
    const parts = [], parents = [], restInverse = [], restPose = [], visited = new Set;
    // every node's parent from the children lists, so a joint outside the scene's nodes keeps its own; the walk
    // below sets them again for the nodes it reaches
    (json.nodes || []).forEach((node, i)=> (node.children || []).forEach((child)=> parents[child] ??= i));
    const visit = (index, parentMatrix, parentIndex, parentRest)=>
    {
        // nodes are trees, so one reached again is a cycle or a node with two parents, a file problem
        if (visited.has(index))
            throw new Error('glTF node ' + index + ' is reached twice, nodes must form trees');
        visited.add(index);
        const node = json.nodes[index], local = gltfNodeMatrix(node);
        let matrix = parentMatrix ? parentMatrix.copy().multiply(local) : local;
        let rest = parentRest && parentRest.copy().multiply(local); // where it rests, when that is not where it is baked
        if (!node.matrix && node.scale?.includes(0))
        {
            // resting at scale 0, like a pop in exported at its first frame, would bake its parts onto a point and
            // leave no inverse to pose them from; it and its children are baked at scale 1 on that axis instead,
            // and a pose takes them back to 0, or up from there as an animation says
            rest ||= matrix;
            const unscaled = gltfNodeMatrix({...node, scale: node.scale.map(s=> s || 1)});
            matrix = parentMatrix ? parentMatrix.copy().multiply(unscaled) : unscaled;
        }
        parents[index] = parentIndex;
        restInverse[index] = matrix.copy().invert();
        if (rest)
            restPose[index] = rest.copy().multiply(restInverse[index]); // from where it is baked to where it rests
        if (node.mesh !== undefined)
        {
            const mesh = json.meshes[node.mesh];
            // a skinned mesh is placed by its joints and not by its node, as the format says, so it is read as stored
            const skin = node.skin !== undefined ? json.skins?.[node.skin] : undefined;
            for (const primitive of mesh.primitives)
            {
                const skinned = skin?.joints?.length && primitive.attributes.JOINTS_0 !== undefined &&
                    primitive.attributes.WEIGHTS_0 !== undefined;
                const part = gltfPart(json, buffers, textures, primitive, skinned ? new Matrix4 : matrix,
                    node.name || mesh.name || 'part ' + parts.length);
                if (!part) continue;
                part.node = index;
                if (skinned)
                    part.skin = gltfSkin(json, buffers, skin, primitive, part);
                parts.push(part);
            }
        }
        for (const child of node.children || [])
            visit(child, matrix, index, rest);
    };
    let animations;
    try
    {
        const scene = json.scenes?.[json.scene ?? 0];
        if (scene)
            (scene.nodes || []).forEach(i=> visit(i)); // a scene may be empty
        else if (json.nodes)
        {
            // no scene: every node that is not another's child is a root
            const children = new Set(json.nodes.flatMap(n=> n.children || []));
            json.nodes.forEach((n, i)=> children.has(i) || visit(i));
        }

        // the animations: each channel that moves a node's translation, rotation or scale, with its keys; morph
        // weights are not read, and a node given as a matrix cannot be animated, the format says
        animations = (json.animations || []).map((animation, i)=> new GLTFAnimation(animation.name || 'animation ' + i,
            animation.channels.filter(c=> c.target.node !== undefined &&
                ['translation', 'rotation', 'scale'].includes(c.target.path) && !json.nodes[c.target.node].matrix).map(c=>
            {
                const sampler = animation.samplers[c.sampler];
                return {node: c.target.node, path: c.target.path, interpolation: sampler.interpolation || 'LINEAR',
                    times: gltfAccessor(json, buffers, sampler.input).data,
                    values: gltfAccessor(json, buffers, sampler.output).data,
                    components: c.target.path === 'rotation' ? 4 : 3};
            })));
    }
    catch (error)
    {
        // a file that fails partway leaves no model to dispose, so the textures it made go now
        for (const texture of textures)
            texture?.destroyWebGLTexture();
        throw error;
    }

    // a texture none of the parts draws with, another scene's, goes now too, since dispose finds them by the parts
    const used = new Set(parts.flatMap(p=> [p.textureInfo, p.normalMap, p.emissiveMap]));
    for (const texture of textures)
        texture && !used.has(texture) && texture.destroyWebGLTexture();
    // a skinned part rests as its joints place it, with nothing moved
    const nodeTree = {nodes: json.nodes, parents, restInverse, restPose}, restWorlds = gltfNodeWorlds(nodeTree, new Map);
    for (const part of parts)
        part.skin && gltfSkinApply(part.skin, restWorlds, RENDER3D_IDENTITY, part.mesh);
    return new GLTFModel(parts, animations, nodeTree);
}

// the values of each node an animation moves at a time, a Map of node to its translation, rotation and scale;
// every other node keeps its own
function gltfPoseNodes(tree, animation, time)
{
    const moved = new Map;
    for (const channel of animation.channels)
    {
        let node = moved.get(channel.node);
        node || moved.set(channel.node, node = gltfNodeTRS(tree.nodes[channel.node]));
        gltfSample(channel, time, node[channel.path]);
    }
    return moved;
}

// two such sets of node values mixed by a weight, 0 all a, 1 all b: places and scales in a line, turns the short
// way round; a node only one moves has its own values in the other
function gltfPoseBlend(tree, a, b, weight)
{
    const mixed = new Map, lerp3 = (p, q)=> p.map((v, i)=> v + (q[i] - v) * weight);
    for (const node of new Set([...a.keys(), ...b.keys()]))
    {
        const p = a.get(node) || gltfNodeTRS(tree.nodes[node]), q = b.get(node) || gltfNodeTRS(tree.nodes[node]);
        mixed.set(node, {translation: lerp3(p.translation, q.translation), scale: lerp3(p.scale, q.scale),
            rotation: gltfSlerp(p.rotation, q.rotation, weight)});
    }
    return mixed;
}

// the turn between two quaternions, x y z w, a part of the way along the short way round
function gltfSlerp(a, b, t)
{
    let dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3], sign = 1;
    if (dot < 0)
        dot = -dot, sign = -1; // the same turn the other way round is shorter
    let wa = 1 - t, wb = t * sign;
    if (dot < .9995)
    {
        // along the arc; nearly the same turn is done in a line, where the arc's sine goes to nothing
        const angle = Math.acos(dot), s = sin(angle);
        wa = sin(wa * angle) / s, wb = sin(t * angle) / s * sign;
    }
    const out = a.map((v, i)=> v * wa + b[i] * wb), l = hypot(...out) || 1;
    return out.map(v=> v / l);
}

// each node's place in the model through its parents, with the values in moved for the nodes there, kept as found
function gltfNodeWorlds(tree, moved)
{
    const world = [];
    const worldOf = (i)=>
    {
        if (world[i]) return world[i];
        const local = gltfNodeMatrix(moved.get(i) || tree.nodes[i]), parent = tree.parents[i];
        return world[i] = parent === undefined ? local : worldOf(parent).copy().multiply(local);
    };
    return worldOf;
}

// an animation's time a frame on, at a speed, around again when it loops, held at its ends when it does not
function gltfAnimationStep(animation, time, speed, loop)
{
    const duration = animation.duration, t = time + timeDelta * speed;
    return loop ? duration ? mod(t, duration) : 0 : clamp(t, 0, duration);
}

// a skinned primitive's skin: its joints, the nodes that bend it, their inverse bind matrices, and for each vertex
// of the part's mesh four joints, as places in that list, and four weights made to sum to 1, with its place and
// normal as stored, which each pose bends from; a mesh split for flat normals maps its corners to the file's
function gltfSkin(json, buffers, skin, primitive, part)
{
    const joints = skin.joints, mesh = part.mesh, count = mesh.points.length;
    const bind = skin.inverseBindMatrices !== undefined ? gltfAccessor(json, buffers, skin.inverseBindMatrices).data : undefined;
    const inverseBind = joints.map((_, j)=> bind ? new Matrix4(bind.subarray(j * 16, j * 16 + 16)) : new Matrix4);
    // a second set of four, as rigs from many tools have, is read too, and each vertex keeps its four strongest
    const attributes = primitive.attributes, read = (name)=> gltfAccessor(json, buffers, attributes[name]).data;
    const sets = [[read('JOINTS_0'), read('WEIGHTS_0')]];
    attributes.JOINTS_1 !== undefined && attributes.WEIGHTS_1 !== undefined && sets.push([read('JOINTS_1'), read('WEIGHTS_1')]);
    const vertexJoints = new Uint16Array(count * 4), vertexWeights = new Float32Array(count * 4);
    const bindPoints = new Float32Array(count * 3), bindNormals = new Float32Array(count * 3);
    for (let v = 0; v < count; ++v)
    {
        const from = part.vertexSource ? part.vertexSource[v] : v, influences = [];
        for (const [fileJoints, fileWeights] of sets)
            for (let k = 0; k < 4; ++k)
                influences.push([fileJoints[from * 4 + k], fileWeights[from * 4 + k]]);
        sets.length > 1 && influences.sort((a, b)=> b[1] - a[1]); // the strongest four first
        let total = 0;
        for (let k = 0; k < 4; ++k)
            total += influences[k][1];
        for (let k = 0; k < 4; ++k)
        {
            const [joint, weight] = influences[k];
            vertexJoints[v * 4 + k] = joint < joints.length ? joint : 0;
            vertexWeights[v * 4 + k] = total ? weight / total : k ? 0 : 1;
        }
        const p = mesh.points[v], n = mesh.normals[v];
        bindPoints.set([p.x, p.y, p.z], v * 3);
        bindNormals.set([n.x, n.y, n.z], v * 3);
        // vectors of its own, as each pose writes into them, where a flat normal is shared by a face's corners
        mesh.points[v] = p.copy(), mesh.normals[v] = n.copy();
    }
    return {joints, inverseBind, vertexJoints, vertexWeights, bindPoints, bindNormals};
}

// a skinned part's mesh copied with vectors of its own for an object to bend, its upload rewriting only the values
function gltfSkinMeshCopy(mesh)
{
    const copy = new Mesh;
    copy.points = mesh.points.map(p=> p.copy());
    copy.normals = mesh.normals.map(n=> n.copy());
    copy.uvs = mesh.uvs.slice();
    copy.colors = mesh.colors.slice();
    copy.indices = mesh.indices && mesh.indices.slice();
    copy.doubleSided = mesh.doubleSided;
    copy.dynamicDraw = true;
    return copy;
}

// bend a skinned mesh to a pose: each vertex its stored place moved by its four joints, weighted, and its normal by
// their normal matrices, each joint's matrix modelMatrix * its place now * its inverse bind; written into the
// mesh's own vectors, so a pose makes nothing for each vertex, and once an upload has laid the mesh out for the GPU
// into that data too, with the radius and box the upload would measure, so it sends the data as it is
function gltfSkinApply(skin, worldOf, modelMatrix, mesh)
{
    // each joint's point matrix, 12 numbers, then its normal matrix, 9, in one array the skin keeps
    const jointCount = skin.joints.length, M = skin.jointMatrices ||= new Float32Array(jointCount * 21);
    const m = gltfSkinScratch[0], n = gltfSkinScratch[1];
    for (let j = 0; j < jointCount; ++j)
    {
        m.m.set(modelMatrix.m);
        m.multiply(worldOf(skin.joints[j])).multiply(skin.inverseBind[j]);
        n.m.set(m.m);
        n.invert().transpose();
        const a = m.m, b = n.m, o = j * 21;
        M[o]    = a[0], M[o+1]  = a[1], M[o+2]  = a[2],  M[o+3]  = a[4], M[o+4]  = a[5], M[o+5]  = a[6];
        M[o+6]  = a[8], M[o+7]  = a[9], M[o+8]  = a[10], M[o+9]  = a[12], M[o+10] = a[13], M[o+11] = a[14];
        M[o+12] = b[0], M[o+13] = b[1], M[o+14] = b[2],  M[o+15] = b[4], M[o+16] = b[5], M[o+17] = b[6];
        M[o+18] = b[8], M[o+19] = b[9], M[o+20] = b[10];
    }
    const {vertexJoints, vertexWeights, bindPoints, bindNormals} = skin, points = mesh.points, normals = mesh.normals;
    // an indexed mesh's GPU vertex j is its point j, as upload lays it out
    const layout = mesh.vertexLayout, count = points.length;
    const floats = layout && mesh.indices && layout.pointCount === count ? new Float32Array(layout.data) : undefined;
    let r = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = 0; v < count; ++v)
    {
        const v3 = v*3, v4 = v*4, px = bindPoints[v3], py = bindPoints[v3+1], pz = bindPoints[v3+2];
        const qx = bindNormals[v3], qy = bindNormals[v3+1], qz = bindNormals[v3+2];
        let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < 4; ++k)
        {
            const w = vertexWeights[v4+k];
            if (!w) continue;
            const o = vertexJoints[v4+k] * 21;
            x += w * (M[o]*px + M[o+3]*py + M[o+6]*pz + M[o+9]);
            y += w * (M[o+1]*px + M[o+4]*py + M[o+7]*pz + M[o+10]);
            z += w * (M[o+2]*px + M[o+5]*py + M[o+8]*pz + M[o+11]);
            nx += w * (M[o+12]*qx + M[o+15]*qy + M[o+18]*qz);
            ny += w * (M[o+13]*qx + M[o+16]*qy + M[o+19]*qz);
            nz += w * (M[o+14]*qx + M[o+17]*qy + M[o+20]*qz);
        }
        const p = points[v], normal = normals[v], l = (nx*nx + ny*ny + nz*nz) ** .5 || 1;
        p.x = x, p.y = y, p.z = z;
        normal.x = nx / l, normal.y = ny / l, normal.z = nz / l;
        if (!floats) continue;
        const at = v * RENDER3D_VERTEX_FLOATS;
        floats[at]   = x,        floats[at+1] = y,        floats[at+2] = z;
        floats[at+3] = normal.x, floats[at+4] = normal.y, floats[at+5] = normal.z;
        r = max(r, x*x + y*y + z*z);
        x0 = min(x0, x), y0 = min(y0, y), z0 = min(z0, z);
        x1 = max(x1, x), y1 = max(y1, y), z1 = max(z1, z);
    }
    if (floats)
    {
        mesh.radius = r ** .5;
        mesh.bounds = count ? {min: vec3(x0, y0, z0), max: vec3(x1, y1, z1)} : {min: vec3(), max: vec3()};
        mesh.vertexDataPacked = true;
    }
    mesh.dirty = true;
}
const gltfSkinScratch = [new Matrix4, new Matrix4]; // a joint's matrix and its normal matrix, as it is worked out

// a node's translation, rotation and scale as arrays to animate, copies so the file's stay as they rest
function gltfNodeTRS(node)
{
    return {translation: [...(node.translation || [0, 0, 0])], rotation: [...(node.rotation || [0, 0, 0, 1])],
        scale: [...(node.scale || [1, 1, 1])]};
}

// the base color textures that only OPAQUE materials use, the default mode, which the format says ignores alpha;
// one a MASK or BLEND material also uses keeps its alpha for that
function gltfOpaqueTextures(json)
{
    const opaque = new Set, cut = new Set;
    for (const material of json.materials || [])
    {
        const index = material.pbrMetallicRoughness?.baseColorTexture?.index;
        if (index !== undefined)
            (!material.alphaMode || material.alphaMode === 'OPAQUE' ? opaque : cut).add(index);
    }
    for (const index of cut)
        opaque.delete(index);
    return opaque;
}

// an image decoded without premultiplied alpha, given alpha 1 all over and its colors as they are; read back through
// a framebuffer, since a 2D canvas would multiply the colors by the alpha and lose those under a clear texel
function gltfOpaqueImage(image)
{
    const gl = glContext, {width, height} = image;
    if (gl.isContextLost()) return image; // nothing to read back through, it keeps its alpha
    // the room to read into first: for a huge image it can fail, and must not with the framebuffer bound
    const data = new Uint8ClampedArray(width * height * 4);
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer(), bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try
    {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data); // row 0 is the image's first row, as uploaded
    }
    finally
    {
        // the 2D renderer's own bindings back, whatever happened
        gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
        gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
    }
    for (let i = 3; i < data.length; i += 4)
        data[i] = 255;
    image.close();
    return createImageBitmap(new ImageData(data, width, height));
}

// write a channel's value at a time into out: its keys held before the first and after the last, stepped, straight
// between, or on the curve their tangents make; a rotation goes the short way round and stays a unit quaternion
function gltfSample(channel, time, out)
{
    const {times, values, components: n, interpolation} = channel, last = times.length - 1;
    const cubic = interpolation === 'CUBICSPLINE', stride = cubic ? 3 * n : n, at = cubic ? n : 0; // a cubic key is in, value, out
    // the last key at or before the time, found by halving, since a baked animation has thousands of keys
    let k = 0, high = last;
    while (k < high)
    {
        const mid = k + high + 1 >> 1;
        times[mid] <= time ? k = mid : high = mid - 1;
    }
    if (k >= last || time <= times[0] || interpolation === 'STEP')
    {
        for (let j = 0; j < n; ++j)
            out[j] = values[k * stride + at + j];
        return;
    }
    const dt = times[k + 1] - times[k], t = (time - times[k]) / dt, a = k * stride, b = a + stride;
    if (cubic)
    {
        // hermite between the two values, with the out tangent of the first and the in tangent of the second
        const t2 = t * t, t3 = t2 * t;
        const h00 = 2*t3 - 3*t2 + 1, h10 = t3 - 2*t2 + t, h01 = -2*t3 + 3*t2, h11 = t3 - t2;
        for (let j = 0; j < n; ++j)
            out[j] = h00 * values[a + n + j] + h10 * dt * values[a + 2*n + j] + h01 * values[b + n + j] + h11 * dt * values[b + j];
    }
    else if (n === 4)
    {
        // a rotation turns along the arc between the two, the shorter way round
        let dot = 0;
        for (let j = 0; j < 4; ++j)
            dot += values[a + j] * values[b + j];
        const flip = dot < 0 ? -1 : 1;
        dot *= flip;
        let wa = 1 - t, wb = t * flip;
        if (dot < .9995) // close together the straight line is as good and does not divide by nothing
        {
            const angle = Math.acos(dot), s = sin(angle);
            wa = sin((1 - t) * angle) / s, wb = sin(t * angle) / s * flip;
        }
        for (let j = 0; j < 4; ++j)
            out[j] = wa * values[a + j] + wb * values[b + j];
    }
    else
        for (let j = 0; j < n; ++j)
            out[j] = values[a + j] + (values[b + j] - values[a + j]) * t;
    if (n === 4)
    {
        const l = hypot(out[0], out[1], out[2], out[3]) || 1;
        for (let j = 0; j < 4; ++j)
            out[j] /= l;
    }
}

// fetch a uri beside the model, or decode a data uri without going out
function gltfFetch(uri, baseUrl, files)
{
    // among the files given, by its path from the model's folder, or by its name when only one file has it; a uri
    // of the web is still fetched, and no other kind is
    if (files && !/^(data|https?|blob):/i.test(uri))
    {
        let name = uri.replace(/[?#].*$/, '');
        try { name = decodeURIComponent(name); } catch {}
        // a path with its . and .. steps taken, the same for the keys, which may start with ./ or / or use \
        const clean = (text)=>
        {
            const parts = [];
            for (const part of text.replace(/\\/g, '/').split('/'))
                if (part === '..' ? !parts.pop() : part && part !== '.' && !parts.push(part))
                    return; // above the top of the files
            return parts.join('/');
        };
        const path = clean(baseUrl + name);
        if (path === undefined)
            return Promise.reject(new Error('glTF needs ' + name + ', which is above the files given'));
        const lower = path.toLowerCase(), file = lower.slice(lower.lastIndexOf('/') + 1);
        const byPath = new Map([...files].map(([key, value])=> [clean(key)?.toLowerCase(), value]));
        const found = files.get(path) ?? byPath.get(lower), keys = [...byPath.keys()];
        if (found)
            return Promise.resolve(new Response(found));
        // what is in a folder dropped, not the folder, leaves the folder's own name out of the paths: the longest key
        // the path ends with, a folder and more, as a name alone is only taken when one file has it
        const end = keys.filter((k)=> k?.includes('/') && lower.endsWith('/' + k)).sort((a, b)=> b.length - a.length)[0];
        if (end)
            return Promise.resolve(new Response(byPath.get(end)));
        const named = new Set(keys.filter((k)=> k?.slice(k.lastIndexOf('/') + 1) === file).map((k)=> byPath.get(k)));
        if (named.size === 1)
            return Promise.resolve(new Response([...named][0]));
        return Promise.reject(new Error('glTF needs ' + path + (named.size ? ', and more than one file has its name' :
            ', which is not among the files given')));
    }
    if (uri.startsWith('data:'))
    {
        const comma = uri.indexOf(','), bytes = atob(uri.slice(comma + 1)), data = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; ++i)
            data[i] = bytes.charCodeAt(i);
        return Promise.resolve(new Response(data.buffer, {headers: {'Content-Type': uri.slice(5, uri.indexOf(';'))}}));
    }
    // resolved as a link in the model is, from the model's folder: a leading slash from the site root, a leading
    // // from the page's scheme, ../ up a folder; with no page to start from, a relative folder is only prefixed
    const page = typeof location !== 'undefined' && location.href;
    const base = page ? new URL(baseUrl, page) : /^[a-z][a-z0-9+.-]*:/i.test(baseUrl) ? baseUrl : undefined;
    const url = base ? new URL(uri, base).href : baseUrl + uri;
    return fetch(url).then(r=>
    {
        if (!r.ok) throw new Error('glTF needs ' + uri + ', not found at ' + url);
        return r;
    });
}

// a node's local transform: its matrix, or translation, rotation quaternion and scale composed
function gltfNodeMatrix(node)
{
    if (node.matrix)
        return new Matrix4(node.matrix); // column major, like ours
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1], t = node.translation || [0, 0, 0];
    return new Matrix4([
        (1 - 2*(y*y + z*z)) * sx, 2*(x*y + z*w) * sx,       2*(x*z - y*w) * sx,       0,
        2*(x*y - z*w) * sy,       (1 - 2*(x*x + z*z)) * sy, 2*(y*z + x*w) * sy,       0,
        2*(x*z + y*w) * sz,       2*(y*z - x*w) * sz,       (1 - 2*(x*x + y*y)) * sz, 0,
        t[0], t[1], t[2], 1]);
}

// an accessor's values as floats, one row per element, normalized integer types brought to 0 to 1; a sparse one
// starts from its bufferView, or from zeros without one, and then has the listed elements replaced
function gltfAccessor(json, buffers, index)
{
    const a = json.accessors[index], view = json.bufferViews?.[a.bufferView];
    const components = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[a.type];
    const types = {5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array};
    const Type = types[a.componentType];
    if (!components || !Type) // a file problem, so it throws in every build
        throw new Error(`glTF accessor of ${a.type} ${a.componentType} is not read`);
    const size = Type.BYTES_PER_ELEMENT;
    const scales = /** @type {Array<[Object, number]>} */ ([[Int8Array, 127], [Uint8Array, 255], [Int16Array, 32767], [Uint16Array, 65535]]);
    const scale = a.normalized ? new Map(scales).get(Type) || 1 : 1;
    // with a buffer under it the count is bounded by the buffer, without one it is all zeros and a sparse few,
    // which no real model makes millions of
    if (!view && !(a.count <= 1 << 20))
        throw new Error('glTF accessor ' + index + ' has no buffer and a count of ' + a.count);
    // its elements must lie in its buffer before so many floats are made for them
    const viewEnd = view && (buffers[view.buffer]?.byteLength ?? 0), stride = view?.byteStride || components * size;
    if (view && !((view.byteOffset || 0) + (a.byteOffset || 0) + (a.count - 1) * stride + components * size <= viewEnd))
        throw new Error('glTF accessor ' + index + ' reaches past its buffer');
    const out = new Float32Array(a.count * components);
    if (view)
    {
        const buffer = buffers[view.buffer], offset = (view.byteOffset || 0) + (a.byteOffset || 0);
        if (stride === components * size)
            out.set(new Type(buffer, offset, a.count * components)); // packed, one view over all of it
        else
            for (let i = 0; i < a.count; ++i) // interleaved with other attributes, an element at each stride
                out.set(new Type(buffer, offset + i * stride, components), i * components);
    }
    const sparse = a.sparse;
    if (sparse)
    {
        // which elements change, and their new values packed in the accessor's own type
        const {indices, values} = sparse, IndexType = types[indices.componentType];
        const indexView = json.bufferViews?.[indices.bufferView], valueView = json.bufferViews?.[values.bufferView];
        if (!IndexType || !indexView || !valueView)
            throw new Error('glTF sparse accessor is missing its indices or values');
        const at = new IndexType(buffers[indexView.buffer], (indexView.byteOffset || 0) + (indices.byteOffset || 0), sparse.count);
        const data = new Type(buffers[valueView.buffer], (valueView.byteOffset || 0) + (values.byteOffset || 0), sparse.count * components);
        for (let i = 0; i < sparse.count; ++i)
            out.set(data.subarray(i * components, (i + 1) * components), at[i] * components);
    }
    if (scale !== 1)
        for (let i = 0; i < out.length; ++i)
            out[i] = max(out[i] / scale, -1); // a signed type's lowest value is -1 too, as the format says
    return {data: out, components, count: a.count};
}

// one primitive as a part: its attributes into a mesh, the indices as triangles, then placed and given its material
function gltfPart(json, buffers, textures, primitive, matrix, name)
{
    const mode = primitive.mode ?? 4; // triangles
    if (mode < 4)
    {
        LOG('glTF points and lines are not drawn:', name);
        return;
    }
    const attributes = primitive.attributes;
    ASSERT(attributes.POSITION !== undefined, 'a glTF primitive needs positions');
    const read = (index, make)=>
    {
        const {data, components, count} = gltfAccessor(json, buffers, index), list = [];
        for (let i = 0; i < count; ++i)
            list.push(make(data, i * components, components));
        return list;
    };
    const points = read(attributes.POSITION, (d, k)=> vec3(d[k], d[k+1], d[k+2]));
    const normals = attributes.NORMAL !== undefined ? read(attributes.NORMAL, (d, k)=> vec3(d[k], d[k+1], d[k+2])) : undefined;
    // the uv set the base color texture names, moved by its KHR_texture_transform once here, offset + rotation * scale
    const material = json.materials?.[primitive.material] || {}, pbr = material.pbrMetallicRoughness || {};
    const textureRef = pbr.baseColorTexture, uvTransform = textureRef?.extensions?.KHR_texture_transform;
    const uvAccessor = attributes['TEXCOORD_' + (uvTransform?.texCoord ?? textureRef?.texCoord ?? 0)];
    const [ox, oy] = uvTransform?.offset || [0, 0], [sx, sy] = uvTransform?.scale || [1, 1], r = uvTransform?.rotation || 0;
    const c = cos(r), s = sin(r);
    const uvs = uvAccessor !== undefined ? read(uvAccessor, (d, k)=>
        vec2(c*sx*d[k] + s*sy*d[k+1] + ox, c*sy*d[k+1] - s*sx*d[k] + oy)) : undefined;
    const colors = attributes.COLOR_0 !== undefined ? read(attributes.COLOR_0, (d, k, n)=>
        rgb(gltfSRGB(d[k]), gltfSRGB(d[k+1]), gltfSRGB(d[k+2]), n > 3 ? d[k+3] : 1)) : undefined;
    let indices = primitive.indices !== undefined ? Array.from(gltfAccessor(json, buffers, primitive.indices).data) : points.map((_, i)=> i);
    if (mode === 5) // a strip: triangle i is the three entries up to i, the odd ones read the other way
        indices = indices.flatMap((_, i, s)=> i < 2 ? [] : i & 1 ? [s[i-1], s[i-2], s[i]] : [s[i-2], s[i-1], s[i]]);
    else if (mode === 6) // a fan around the first entry
        indices = indices.flatMap((_, i, s)=> i < 2 ? [] : [s[0], s[i-1], s[i]]);
    const mesh = new Mesh().addTriangles(points, indices, normals, uvs, colors);
    // flat when the file gives none, as the format says, which gives each corner a vertex of its own: which of the
    // file's each one is, kept for a skin
    const vertexSource = normals ? undefined : mesh.indices.slice();
    normals || mesh.computeNormals(false);
    mesh.transform(matrix);
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
    mesh.doubleSided = !!material.doubleSided;
    // glass is usually made with transmission, an opaque white material the light passes through, which would
    // draw solid white; it comes in blended instead, a faint tint of its color that lets the rest show through
    // only a blending material reads its alpha, an opaque or masked one is solid whatever the factor says
    const transmission = material.extensions?.KHR_materials_transmission?.transmissionFactor || 0;
    const blend = material.alphaMode === 'BLEND', alpha = (blend ? factor[3] : 1) * (1 - .8 * transmission);
    const texture = textureRef && json.textures?.[textureRef.index];
    const part = new GLTFPart(name, mesh, rgb(gltfSRGB(factor[0]), gltfSRGB(factor[1]), gltfSRGB(factor[2]), alpha),
        textureRef ? textures[textureRef.index] : undefined, blend || transmission > 0);
    part.pixelated = json.samplers?.[texture?.sampler]?.magFilter === 9728; // NEAREST
    part.vertexSource = vertexSource;
    part.unlit = !!material.extensions?.KHR_materials_unlit;

    // the normal and emissive maps, read at the base color texture's uvs; the emissive texture is multiplied by the
    // factor, which is black by default as the format says, so a texture alone does not glow; a factor with no
    // texture glows all over
    const normalRef = material.normalTexture, emissiveRef = material.emissiveTexture;
    part.normalMap = normalRef && textures[normalRef.index];
    part.normalScale = normalRef?.scale ?? 1;
    const [er, eg, eb] = material.emissiveFactor || [0, 0, 0];
    if (er || eg || eb)
    {
        // KHR_materials_emissive_strength makes it that many times brighter, emission above 1 in Blender
        const strength = material.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
        part.emissiveMap = emissiveRef ? textures[emissiveRef.index] : gltfWhiteTexture();
        part.emissiveMapColor = rgb(gltfSRGB(er) * strength, gltfSRGB(eg) * strength, gltfSRGB(eb) * strength);
    }
    return part;
}

// a 1 by 1 white texture, the emissive map of a material that glows all over with no texture; made once and never
// freed, like the engine's own white texture, undefined without WebGL
let gltfWhiteTextureInfo;
function gltfWhiteTexture()
{
    if (gltfWhiteTextureInfo || !glContext || !canvasAvailable()) return gltfWhiteTextureInfo;
    const context = createCanvasContext(1);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1, 1);
    return gltfWhiteTextureInfo = new TextureInfo(context.canvas);
}

// a glTF color factor or vertex color is linear, where the renderer works in sRGB like the textures, so it is
// brought across at load or a mid gray material would come out nearly black; 0 and 1 stay exact
function gltfSRGB(c)
{ return c <= .0031308 ? c * 12.92 : c >= 1 ? c : 1.055 * c ** (1 / 2.4) - .055; }
