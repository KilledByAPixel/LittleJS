import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threeJS, ThreeJSPlugin, ThreeJSObject, EngineObject, vec2 } from '../dist/littlejs.esm.js';

test('ThreeJS plugin classes are exported from the bundle', () =>
{
    assert.equal(typeof ThreeJSPlugin, 'function');
    assert.equal(typeof ThreeJSObject, 'function');
    assert(ThreeJSObject.prototype instanceof EngineObject);
});

test('ThreeJSPlugin constructs in headless mode and sets the global', () =>
{
    // setup.mjs enables headless mode, so no THREE module or DOM is needed
    assert.equal(threeJS, undefined);
    const plugin = new ThreeJSPlugin;
    assert.equal(threeJS, plugin);
});

test('ThreeJSObject works headless without a mesh', () =>
{
    const o = new ThreeJSObject(vec2(1, 2), vec2(1), undefined, 3);
    assert.equal(o.z, 3);
    assert.equal(o.mesh, undefined);
    o.update();  // syncMesh with no mesh is a no-op
    o.destroy(); // no mesh to remove
    assert(o.destroyed);
});
