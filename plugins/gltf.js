/**
 * LittleJS glTF Plugin
 * - Loads glTF 2.0 models: a .gltf with its .bin and images beside it, or a .glb with everything in one file
 * - A model comes back as parts, one Mesh per primitive of every node placed by the node tree, each with its
 *   material's color and base color texture, plus everything combined into one Mesh
 * - Static geometry only: positions, normals, uvs, vertex colors and indices; skins, animations and morph targets are not read
 * - Materials give a base color and texture and whether they blend; glass made with KHR_materials_transmission blends too
 * - glTF and LittleJS agree on the axes, y up and -z forward, on counter clockwise triangles and on uvs running down
 * - Requires the Render3D plugin
 * @namespace GLTF
 * @example
 * const model = await loadGLTF('ship.glb');   // in an async gameInit
 * model.createObject(vec3(0, 1, 0));           // an object with a child per part, textures and all
 * new EngineObject3D(vec3(), model.mesh);      // or the whole thing as one mesh
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
        /** @property {Mesh} - The geometry in model space, the node transforms applied, with the vertex colors the file had */
        this.mesh = mesh;
        /** @property {Color} - The material's base color, to draw the mesh tinted with */
        this.color = color;
        /** @property {TextureInfo|undefined} - The material's base color texture, undefined without one or without WebGL
         *  @type {TextureInfo|undefined} */
        this.textureInfo = textureInfo;
        /** @property {boolean} - The material blends or is glass, so the part belongs in the transparent stage */
        this.transparent = transparent;
    }
}

/**
 * GLTFModel - A loaded model: its parts, and everything as one mesh
 * @memberof GLTF
 */
class GLTFModel
{
    /** @param {Array<GLTFPart>} parts */
    constructor(parts)
    {
        /** @property {Array<GLTFPart>} - One per primitive of every node that has a mesh */
        this.parts = parts;
        /** @property {Mesh} - Every part combined, each tinted with its material color; the texture is textureInfo */
        this.mesh = new Mesh;
        for (const part of parts)
            this.mesh.combine(part.mesh, RENDER3D_IDENTITY, part.color);
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
        for (const part of this.parts)
            part.mesh.transform(matrix);
        this.mesh.transform(matrix);
        return this;
    }

    /** Make an object at a position with a child per part, so each keeps its own texture, color and blending;
     *  the way to show a model with windows or other see through parts, which the combined mesh draws solid
     *  @param {Vector3} [pos3D]
     *  @return {EngineObject3D} - The root, move and turn it and the parts follow */
    createObject(pos3D=vec3())
    {
        const root = new EngineObject3D(pos3D);
        for (const part of this.parts)
        {
            const o = new EngineObject3D(vec3(), part.mesh, part.textureInfo, part.color);
            o.transparent = part.transparent;
            root.addChild(o);
        }
        return root;
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Load a glTF or GLB model, the .bin and images of a .gltf from beside it
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

    // the textures, decoded together first; none without WebGL, and a failed image only logs
    const textures = await Promise.all((json.textures || []).map(async (texture)=>
    {
        if (!glContext || typeof createImageBitmap == 'undefined') return;
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
            return new TextureInfo(await createImageBitmap(blob), true, sampler.wrapS !== 33071); // CLAMP_TO_EDGE
        }
        catch (e) { LOG('glTF image not loaded', e); }
    }));

    // the parts: the scene's nodes walked with their transforms, every primitive of a node's mesh placed by it
    const parts = [];
    const visit = (index, parentMatrix)=>
    {
        const node = json.nodes[index], local = gltfNodeMatrix(node);
        const matrix = parentMatrix ? parentMatrix.copy().multiply(local) : local;
        if (node.mesh !== undefined)
        {
            const mesh = json.meshes[node.mesh];
            for (const primitive of mesh.primitives)
            {
                const part = gltfPart(json, buffers, textures, primitive, matrix, node.name || mesh.name || 'part ' + parts.length);
                part && parts.push(part);
            }
        }
        for (const child of node.children || [])
            visit(child, matrix);
    };
    const scene = json.scenes?.[json.scene ?? 0];
    if (scene)
        scene.nodes.forEach(i=> visit(i));
    else if (json.nodes)
    {
        // no scene: every node that is not another's child is a root
        const children = new Set(json.nodes.flatMap(n=> n.children || []));
        json.nodes.forEach((n, i)=> children.has(i) || visit(i));
    }
    return new GLTFModel(parts);
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
    return fetch(baseUrl + uri).then(r=>
    {
        if (!r.ok) throw new Error('glTF file not found: ' + baseUrl + uri);
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

// an accessor's values as floats, one row per element, normalized integer types brought to 0 to 1
function gltfAccessor(json, buffers, index)
{
    const a = json.accessors[index], view = json.bufferViews[a.bufferView];
    ASSERT(!a.sparse, 'sparse accessors are not read');
    const components = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[a.type];
    const Type = {5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[a.componentType];
    const buffer = buffers[view.buffer], offset = (view.byteOffset || 0) + (a.byteOffset || 0), size = Type.BYTES_PER_ELEMENT;
    const stride = view.byteStride || components * size;
    const scale = a.normalized ? new Map([[Int8Array, 127], [Uint8Array, 255], [Int16Array, 32767], [Uint16Array, 65535]]).get(Type) || 1 : 1;
    const out = new Float32Array(a.count * components);
    if (stride === components * size)
        out.set(new Type(buffer, offset, a.count * components)); // packed, one view over all of it
    else
        for (let i = 0; i < a.count; ++i) // interleaved with other attributes, an element at each stride
            out.set(new Type(buffer, offset + i * stride, components), i * components);
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
    const uvs = attributes.TEXCOORD_0 !== undefined ? read(attributes.TEXCOORD_0, (d, k)=> vec2(d[k], d[k+1])) : undefined;
    const colors = attributes.COLOR_0 !== undefined ? read(attributes.COLOR_0, (d, k, n)=> rgb(d[k], d[k+1], d[k+2], n > 3 ? d[k+3] : 1)) : undefined;
    let indices = primitive.indices !== undefined ? Array.from(gltfAccessor(json, buffers, primitive.indices).data) : points.map((_, i)=> i);
    if (mode === 5) // a strip: triangle i is the three entries up to i, the odd ones read the other way
        indices = indices.flatMap((_, i, s)=> i < 2 ? [] : i & 1 ? [s[i-1], s[i-2], s[i]] : [s[i-2], s[i-1], s[i]]);
    else if (mode === 6) // a fan around the first entry
        indices = indices.flatMap((_, i, s)=> i < 2 ? [] : [s[0], s[i-1], s[i]]);
    const mesh = new Mesh().addTriangles(points, normals, uvs, colors, indices);
    normals || mesh.computeNormals(false); // flat when the file gives none, as the format says
    mesh.transform(matrix);
    const material = json.materials?.[primitive.material] || {}, pbr = material.pbrMetallicRoughness || {};
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
    mesh.doubleSided = !!material.doubleSided;
    // glass is usually made with transmission, an opaque white material the light passes through, which would
    // draw solid white; it comes in blended instead, a faint tint of its color that lets the rest show through
    // only a blending material reads its alpha, an opaque or masked one is solid whatever the factor says
    const transmission = material.extensions?.KHR_materials_transmission?.transmissionFactor || 0;
    const blend = material.alphaMode === 'BLEND', alpha = (blend ? factor[3] : 1) * (1 - .8 * transmission);
    return new GLTFPart(name, mesh, rgb(factor[0], factor[1], factor[2], alpha),
        pbr.baseColorTexture ? textures[pbr.baseColorTexture.index] : undefined, blend || transmission > 0);
}
