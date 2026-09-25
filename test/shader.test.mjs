import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shader, setShader, EngineObject, EngineObject3D, vec2, vec3, engineObjects } from '../dist/littlejs.esm.js';

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
