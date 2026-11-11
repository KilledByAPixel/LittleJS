import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shader, setShader, EngineObject, EngineObject3D, vec2, vec3, engineObjects, RED, Matrix4 } from '../dist/littlejs.esm.js';
import { loadEngine } from './vmEngine.mjs';

const code = 'void mainImage(out vec4 c, vec2 uv){c=texture(iChannel0,uv);}';

test('a Shader keeps its snippet and has no programs until a renderer compiles them', () =>
{
    const shader = new Shader(code);
    assert.equal(shader.fragmentCode, code);
    assert.equal(shader.program, undefined);
    assert.equal(shader.program3D, undefined);
});

test('a Shader needs a snippet that defines mainImage', () =>
{
    assert.throws(()=> new Shader());
    assert.throws(()=> new Shader('void main(){}'));
});

const vertexCode = 'void mainVertex(inout vec3 pos, inout vec3 normal){pos.y+=1.;}';

test('a Shader takes vertex code for 3D, with fragment code or alone', () =>
{
    const both = new Shader(code, vertexCode);
    assert.equal(both.fragmentCode, code);
    assert.equal(both.vertexCode, vertexCode);
    assert.equal(both.shadowProgram3D, undefined);
    const alone = new Shader('', vertexCode);
    assert.equal(alone.fragmentCode, '');
    assert.equal(new Shader(code).vertexCode, '');
});

test('vertex code must define mainVertex, and a Shader needs one snippet or the other', () =>
{
    assert.throws(()=> new Shader(code, 'void main(){}'));
    assert.throws(()=> new Shader('', ''));
});

test('setShader takes a Shader or nothing, not the snippet itself', () =>
{
    const shader = new Shader(code);
    setShader(shader);
    setShader();
    assert.throws(()=> setShader(code));
    assert.throws(()=> setShader({}));
});

test('setShader takes null as no shader, like undefined, with no assert', () =>
{
    setShader(null);
    setShader(); // and no assert on the way
});

test('objects start with no shader, 3D objects included', () =>
{
    assert.equal(new EngineObject(vec2()).shader, undefined);
    assert.equal(new EngineObject3D(vec3()).shader, undefined);
    for (const o of engineObjects) o.destroy();
    engineObjects.length = 0;
});

test('uniforms take their GLSL type from their first value, and keep it', () =>
{
    const shader = new Shader(code, '', {a: 1, b: true, c: vec2(1, 2), d: vec3(1, 2, 3), e: RED, f: [1, 2, 3, 4],
        g: new Array(9).fill(0), h: new Matrix4});
    assert.deepEqual(shader.uniformTypes, {a: 'float', b: 'bool', c: 'vec2', d: 'vec3', e: 'vec4', f: 'vec4',
        g: 'mat3', h: 'mat4'});
    const version = shader.uniformsVersion;
    shader.setUniform('a', 2);
    shader.setUniform('d', vec3(4, 5, 6));
    assert.equal(shader.uniformsVersion, version + 2);
    assert.deepEqual([...shader.uniformValues.d], [4, 5, 6]);
    assert.throws(()=> shader.setUniform('a', vec2()), 'the kind stays');
    assert.throws(()=> shader.setUniform('missing', 1), 'only uniforms it was made with');
    assert.throws(()=> new Shader(code, '', {'bad name': 1}));
    assert.throws(()=> new Shader(code, '', {text: 'red'}));
});

test('a vector given is copied, so changing it after does not change the shader', () =>
{
    const color = vec3(1, 2, 3), shader = new Shader(code, '', {color});
    color.x = 9;
    assert.equal(shader.uniformValues.color[0], 1);
});

test('a uniform is declared only in the snippets that name it', () =>
{
    const { run } = loadEngine();
    const [fragment, vertex] = JSON.parse(run(`
        const shader = new Shader('void mainImage(out vec4 c, vec2 uv) { c = tint; }',
            'void mainVertex(inout vec3 pos, inout vec3 normal) { pos.y += lift; }', {tint: RED, lift: 1});
        JSON.stringify([glUniformDeclarations(shader, shader.fragmentCode), glUniformDeclarations(shader, shader.vertexCode)])
    `));
    assert.equal(fragment, 'uniform vec4 tint;');
    assert.equal(vertex, 'uniform float lift;', "the vertex stage's own tint is left alone");
});
