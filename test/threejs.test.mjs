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

test('a ThreeJSObject child has its mesh where the child is after the update, not a frame behind', async () =>
{
    const { engineObjectsUpdate } = await import('../dist/littlejs.esm.js');
    const scene = threeJS.scene;
    threeJS.scene = { add() {}, remove() {} }; // headless has no three.js scene, a stand in holds the meshes
    const mesh = ()=> ({ position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: {} });
    try
    {
        const parent = new ThreeJSObject(vec2(), vec2(1), mesh());
        const child = new ThreeJSObject(vec2(), vec2(1), mesh());
        parent.addChild(child, vec2(2, 0));
        parent.mass = 0;
        parent.velocity = vec2(1, 0);
        parent.damping = 1;
        engineObjectsUpdate();
        assert.equal(parent.pos.x, 1);
        assert.equal(child.pos.x, 3, 'the child followed its parent');
        assert.equal(child.mesh.position.x, 3, 'and so did its mesh, this frame');
        assert.equal(parent.mesh.position.x, 1);
        parent.destroy();
        engineObjectsUpdate();
    }
    finally { threeJS.scene = scene; }
});
