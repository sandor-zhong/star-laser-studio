import test from 'node:test';
import assert from 'node:assert/strict';
import { drawLaserContact, getLaserParticles } from './laser-effects.js';

function recordingContext() {
  const calls = [], gradients = [];
  const target = { calls, gradients };
  const methods = ['save', 'restore', 'translate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'arc', 'fill', 'stroke'];
  for (const name of methods) target[name] = (...args) => calls.push({ name, args, fillStyle: target.fillStyle, globalAlpha: target.globalAlpha, lineWidth: target.lineWidth, shadowBlur: target.shadowBlur });
  for (const name of ['createLinearGradient', 'createRadialGradient']) {
    target[name] = (...args) => {
      const gradient = { kind: name, args, stops: [], addColorStop(offset, color) { this.stops.push({ offset, color }); } };
      gradients.push(gradient);return gradient;
    };
  }
  return target;
}
const contact = { tip: { x: 210, y: 80 }, impact: { x: 235, y: 230 }, active: true, time: 3.7 };

test('inactive, paused and invalid contacts do not touch the canvas', () => {
  for (const options of [{}, { ...contact, active: false }, { ...contact, paused: true }, { ...contact, impact: null }, { ...contact, tip: { x: NaN, y: 2 } }, { ...contact, scale: 0 }]) {
    const ctx = recordingContext();drawLaserContact(ctx, options);
    assert.deepEqual(ctx.calls, []);assert.deepEqual(ctx.gradients, []);
  }
});

test('spark flights are deterministic, bounded and move with production time', () => {
  assert.deepEqual(getLaserParticles(8.2), getLaserParticles(8.2));
  assert.notDeepEqual(getLaserParticles(8.2), getLaserParticles(8.21));
  for (const time of [-100, 0, .001, 8.2, 600, NaN, Infinity]) {
    const particles = getLaserParticles(time);assert.equal(particles.length, 28);
    assert.ok(particles.filter(particle => particle.y < 0).length >= 15, 'the main shower must fan upwards');
    for (const particle of particles) {
      assert.ok(Object.values(particle).every(Number.isFinite));
      assert.ok(particle.x >= 0 && particle.x <= 200);
      assert.ok(particle.y >= -200 && particle.y <= 90);
      assert.ok(particle.alpha > 0 && particle.alpha <= 1);
      assert.ok(particle.width >= .7 && particle.width <= 1.8);
      assert.ok(particle.age >= 0 && particle.age < 1);
    }
  }
});

test('white contact nucleus is opaque and painted above beam, sparks and smoke', () => {
  const ctx = recordingContext();drawLaserContact(ctx, contact);
  assert.equal(ctx.calls[0].name, 'save');assert.equal(ctx.calls.at(-1).name, 'restore');
  assert.deepEqual(ctx.calls.find(call => call.name === 'translate').args, [235, 230]);
  const paints = ctx.calls.filter(call => call.name === 'fill' || call.name === 'stroke');
  assert.equal(paints.at(-1).name, 'fill');assert.equal(paints.at(-1).fillStyle, '#ffffff');
  assert.equal(paints.at(-1).globalAlpha, 1);
  assert.equal(paints.at(-1).shadowBlur, 0, 'warm spark bloom must not tint the white nucleus');
  const nucleus = ctx.calls.filter(call => call.name === 'arc').at(-1);
  assert.ok(nucleus.args[2] >= 3 && nucleus.args[2] <= 5);
  assert.equal(ctx.calls.filter(call => call.name === 'bezierCurveTo').length, 6, 'three light smoke wisps');
  assert.equal(paints.filter(call => call.name === 'stroke').length, 34, 'three wisps, three beam layers and 28 spark streaks');
  const glow = ctx.gradients.find(gradient => gradient.kind === 'createRadialGradient');
  assert.ok(glow.args.at(-1) >= 32 && glow.args.at(-1) <= 42);
  const sparks = paints.filter(call => call.name === 'stroke' && call.shadowBlur > 0);
  assert.equal(sparks.length, 28);
  assert.ok(sparks.every(call => call.shadowBlur >= 2 && call.shadowBlur <= 3));
  assert.ok(sparks.every(call => call.lineWidth >= .7 * 1.35 && call.lineWidth <= 1.8 * 1.35));
});

test('beam endpoints respect the same impact translation and scale as particles', () => {
  const ctx = recordingContext();drawLaserContact(ctx, { ...contact, scale: 2 });
  assert.deepEqual(ctx.calls.find(call => call.name === 'scale').args, [2, 2]);
  const beamStarts = ctx.calls.filter(call => call.name === 'moveTo' && call.args[0] === -12.5 && call.args[1] === -75);
  assert.equal(beamStarts.length, 3);
});
