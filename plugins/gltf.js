/**
 * LittleJS glTF Plugin
 * - Loads glTF 2.0 models: a .gltf with its .bin and images beside it, or a .glb with everything in one file
 * - A model comes back as parts, one Mesh per primitive of every node placed by the node tree, each with its
 *   material's color and base color texture, plus everything combined into one Mesh
 * - Geometry: positions, normals, uvs, vertex colors and indices; skins and morph targets are not read
 * - Node animations play: parts that move, turn and scale, like doors, wheels and propellers, through the
 *   GLTFObject that createObject makes; a skinned character's walk is not read
 * - Materials give a base color and texture and whether they blend; glass made with KHR_materials_transmission blends too,
 *   and a KHR_materials_unlit material comes in emissive, its own color with no shading
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
    /** @param {string} name @param {Mesh} mesh @param {Color} color @param {TextureInfo|undefined} textureInfo @param {boolean} transparent */
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
    }
}

/**
 * GLTFAnimation - One animation of a model: keys that move, turn and scale its nodes over time
 * - Play it through the GLTFObject that model.createObject makes
 * @memberof GLTF
 */
class GLTFAnimation
{
    /** @param {string} name @param {Array<Object>} channels */
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
    /** @param {Array<GLTFPart>} parts @param {Array<GLTFAnimation>} [animations] @param {Object} [nodeTree] */
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
            this.mesh.combine(part.mesh, nodeTree?.restPose?.[part.node] || RENDER3D_IDENTITY, part.color);
        // the one texture every part uses, when they all do; a part without one has no uvs into it, so a model
        // that mixes plain and textured parts, or uses several textures, is drawn through createObject instead
        const textures = new Set(parts.map(p=> p.textureInfo));
        /** @property {TextureInfo|undefined} - The texture to draw mesh with, when every part uses the same one
         *  @type {TextureInfo|undefined} */
        this.textureInfo = textures.size === 1 ? textures.values().next().value : undefined;
    }

    /** The box around every part
     *  @return {{min: Vector3, max: Vector3}} */
    getBounds() { return this.mesh.getBounds(); }

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
        const tree = this.nodeTree;
        if (!tree) return this.parts.map(()=> new Matrix4);

        // the nodes the animation moves get its values at this time, every other node keeps its own
        const moved = new Map;
        for (const channel of animation.channels)
        {
            let node = moved.get(channel.node);
            node || moved.set(channel.node, node = gltfNodeTRS(tree.nodes[channel.node]));
            gltfSample(channel, time, node[channel.path]);
        }

        // then each node's place in the model through its parents, and each part's move from where it rests,
        // through what center and fit did: modelMatrix * now * rest inverse * modelMatrix inverse
        const world = [];
        const worldOf = (i)=>
        {
            if (world[i]) return world[i];
            const local = gltfNodeMatrix(moved.get(i) || tree.nodes[i]), parent = tree.parents[i];
            return world[i] = parent === undefined ? local : worldOf(parent).copy().multiply(local);
        };
        const model = this.modelMatrix, modelInverse = model.copy().invert();
        return this.parts.map(part=> model.copy().multiply(worldOf(part.node)).multiply(tree.restInverse[part.node]).multiply(modelInverse));
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
        for (const textureInfo of new Set(this.parts.map(p=> p.textureInfo)))
            textureInfo?.destroyWebGLTexture();
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
        // the size of the whole model, as an object made from model.mesh would have
        const mesh = model.mesh, bounds = mesh.points.length ? !mesh.dirty && mesh.bounds || mesh.getBounds() : undefined;
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
        /** @property {Array<EngineObject3D>} - The child that draws each of the model's parts, in the order of
         *  model.parts, which an animation poses; one destroyed or taken off the object is left alone
         *  @type {Array<EngineObject3D>} */
        this.parts = [];
        for (const part of model.parts)
        {
            const o = new EngineObject3D(vec3(), part.mesh, part.textureInfo, part.color);
            o.transparent = part.transparent;
            o.pixelated = part.pixelated;
            o.emissive = part.unlit ? 1 : 0;
            const rest = model.nodeTree?.restPose?.[part.node];
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

    /** Play an animation from its start
     *  @param {string|number|GLTFAnimation} [animation] - Its name, its number in model.animations, or itself
     *  @param {boolean} [loop] - Start again at the end, or stop there
     *  @param {number} [speed] - 1 is as made, negative plays it backward from its end */
    play(animation=0, loop=true, speed=1)
    {
        const found = this.model.getAnimation(animation);
        ASSERT(found, 'the model has no animation ' + animation, this.model.animations.map(a=> a.name));
        if (!found) return;
        this.animation = found;
        this.animationLoop = loop;
        this.animationSpeed = speed;
        this.animationPlaying = true;
        this.setAnimationTime(speed < 0 ? found.duration : 0);
    }

    /** Stop the animation where it is, the parts hold that pose */
    stop() { this.animationPlaying = false; }

    /** Put the parts where the animation has them at a time, playing or not
     *  @param {number} time - Seconds into the animation */
    setAnimationTime(time)
    {
        this.animationTime = time;
        if (!this.animation) return;
        // its own list of the part objects, so a child removed or added does not hand a part another's pose
        const pose = this.model.getPose(this.animation, time), parts = this.parts;
        for (let i = 0; i < pose.length && i < parts.length; ++i)
        {
            const o = parts[i], m = pose[i];
            if (o.destroyed || o.parent !== this) continue;
            // drawn with the whole pose, which a parent's uneven scale can shear, the parts kept for what reads them
            o.localMatrix = m;
            o.pos3D = m.getTranslation();
            o.rotation3D = m.getRotation();
            o.scale3D = m.getScale();
        }
    }

    /** Move through the animation, called automatically each frame */
    update()
    {
        super.update();
        const animation = this.animation;
        if (!this.animationPlaying || !animation) return;
        const duration = animation.duration;
        let t = this.animationTime + timeDelta * this.animationSpeed;
        if (this.animationLoop)
            t = duration ? mod(t, duration) : 0;
        else if (t >= duration || t <= 0)
        {
            // the end, or the start when playing backward: hold the last pose there
            t = clamp(t, 0, duration);
            this.animationPlaying = false;
        }
        this.setAnimationTime(t);
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
    return parseGLTF(await response.arrayBuffer(), url.slice(0, url.lastIndexOf('/') + 1));
}

/** Parse a model from GLB bytes or glTF JSON, fetching the buffers and images it refers to
 *  @param {ArrayBuffer|Object|string} data - GLB bytes, or the glTF JSON as bytes, text or an object
 *  @param {string} [baseUrl] - Where the .bin and image files are, with its trailing slash; loadGLTF passes the file's folder
 *  @return {Promise<GLTFModel>}
 *  @memberof GLTF */
async function parseGLTF(data, baseUrl='')
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

    // the buffers: the GLB's own, a data uri, or a file beside the model
    const buffers = await Promise.all((json.buffers || []).map((buffer, i)=>
    {
        if (!buffer.uri)
        {
            ASSERT(glbBuffer && !i, 'a buffer without a uri is the GLB chunk, and only the first can be');
            return glbBuffer;
        }
        return gltfFetch(buffer.uri, baseUrl).then(r=> r.arrayBuffer());
    }));

    // the textures, decoded together first; none without WebGL, and a failed image only logs; only the base color
    // textures are drawn with, so the normal, roughness and other maps are not loaded at all
    const baseColorTextures = new Set((json.materials || []).map(m=> m.pbrMetallicRoughness?.baseColorTexture?.index));
    const opaqueTextures = gltfOpaqueTextures(json);
    const textures = await Promise.all((json.textures || []).map(async (texture, index)=>
    {
        if (!glContext || typeof createImageBitmap == 'undefined' || !baseColorTextures.has(index)) return;
        try
        {
            // a WebP or AVIF image is named by its extension, the browser decodes those like any other
            const source = texture.source ?? texture.extensions?.EXT_texture_webp?.source ?? texture.extensions?.EXT_texture_avif?.source;
            const image = json.images[source], sampler = json.samplers?.[texture.sampler] || {};
            let blob;
            if (image.uri)
                blob = await gltfFetch(image.uri, baseUrl).then(r=> r.blob());
            else
            {
                const view = json.bufferViews[image.bufferView];
                blob = new Blob([new Uint8Array(buffers[view.buffer], view.byteOffset || 0, view.byteLength)], {type: image.mimeType});
            }
            // an OPAQUE material ignores its texture's alpha, which the 3D pass would cut holes by, so a texture only
            // those use has it set to 1; decoded as stored for that, and a jpeg has no alpha to set
            const opaque = opaqueTextures.has(index) && blob.type !== 'image/jpeg';
            const bitmap = opaque ? await createImageBitmap(blob, {premultiplyAlpha: 'none'}).then(gltfOpaqueImage) : await createImageBitmap(blob);
            return new TextureInfo(bitmap, true, sampler.wrapS !== 33071); // CLAMP_TO_EDGE
        }
        catch (e) { LOG('glTF image not loaded', e); }
    }));

    // the parts: the scene's nodes walked with their transforms, every primitive of a node's mesh placed by it;
    // each node's parent and resting place are kept, so an animation can move a part from where it rests
    const parts = [], parents = [], restInverse = [], restPose = [];
    const visit = (index, parentMatrix, parentIndex, parentRest)=>
    {
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
            for (const primitive of mesh.primitives)
            {
                const part = gltfPart(json, buffers, textures, primitive, matrix, node.name || mesh.name || 'part ' + parts.length);
                if (!part) continue;
                part.node = index;
                parts.push(part);
            }
        }
        for (const child of node.children || [])
            visit(child, matrix, index, rest);
    };
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
    const animations = (json.animations || []).map((animation, i)=> new GLTFAnimation(animation.name || 'animation ' + i,
        animation.channels.filter(c=> c.target.node !== undefined && ['translation', 'rotation', 'scale'].includes(c.target.path)
            && !json.nodes[c.target.node].matrix).map(c=>
        {
            const sampler = animation.samplers[c.sampler];
            return {node: c.target.node, path: c.target.path, interpolation: sampler.interpolation || 'LINEAR',
                times: gltfAccessor(json, buffers, sampler.input).data, values: gltfAccessor(json, buffers, sampler.output).data,
                components: c.target.path === 'rotation' ? 4 : 3};
        })));
    return new GLTFModel(parts, animations, {nodes: json.nodes, parents, restInverse, restPose});
}

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
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer(), bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const data = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data); // row 0 is the image's first row, as uploaded
    gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
    gl.bindTexture(gl.TEXTURE_2D, glActiveTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
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
function gltfFetch(uri, baseUrl)
{
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
        if (!r.ok) throw new Error('glTF file not found: ' + url);
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
    const out = new Float32Array(a.count * components);
    if (view)
    {
        const buffer = buffers[view.buffer], offset = (view.byteOffset || 0) + (a.byteOffset || 0);
        const stride = view.byteStride || components * size;
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
            out[i] /= scale;
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
    normals || mesh.computeNormals(false); // flat when the file gives none, as the format says
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
    part.unlit = !!material.extensions?.KHR_materials_unlit;
    return part;
}

// a glTF color factor or vertex color is linear, where the renderer works in sRGB like the textures, so it is
// brought across at load or a mid gray material would come out nearly black; 0 and 1 stay exact
function gltfSRGB(c)
{ return c <= .0031308 ? c * 12.92 : c >= 1 ? c : 1.055 * c ** (1 / 2.4) - .055; }
