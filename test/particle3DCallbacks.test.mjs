import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParticleEmitter3D, Render3DPlugin, vec3 } from '../dist/littlejs.esm.js';

// a Particle3D callback sees a view of the particle, and what it changes is written back to the particle

new Render3DPlugin;

test('a create callback that sets a particle\'s lifeTime and age keeps them', ()=>
{
    const e = new ParticleEmitter3D(vec3());
    e.emitRate = 0, e.particleTime = 10;
    e.particleCreateCallback = (particle)=> { particle.lifeTime = .5; particle.age = .25; };
    e.emitParticle();
    assert.equal(e.particleData[16], .5, 'its lifeTime');
    assert.equal(e.particleData[17], .25, 'its age');
    e.destroy();
});

test('an update callback that ages a particle to the end of its life ends it', ()=>
{
    const e = new ParticleEmitter3D(vec3());
    e.emitRate = 0, e.particleTime = 10;
    e.emitParticle();
    const seen = [];
    e.particleUpdateCallback = (particle)=> { seen.push(particle.age); particle.age = particle.lifeTime; };
    e.update();
    e.update();
    assert.equal(seen.length, 1, 'it is gone by the next update, not left to live its 10 seconds');
    e.destroy();
});
