import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectSerial, disconnectSerial, enrollFingerprint, verifyFingerprint,
  deleteFingerprint, resetDemoLed, setDemoLed, isConnected
} from '../src/serial.js';
import { compareDescriptors } from '../src/face.js';

function fakeDevice() {
  let controller;
  const sent = [];
  const storedSlots = new Set();
  const encoder = new TextEncoder();
  const readable = new ReadableStream({ start(c) { controller = c; } });
  const writable = new WritableStream({
    write(bytes) {
      for (const request of new TextDecoder().decode(bytes).trim().split('\n')) {
        const [verb, first, second] = request.trim().split(' ');
        sent.push(request.trim());
        const emit = message => queueMicrotask(() => controller.enqueue(encoder.encode(message + '\n')));
        if (verb === 'PING') emit(`PONG SENSOR_OK ${first}`);
        else if (verb === 'ENROLL') { storedSlots.add(Number(first)); emit(`ENROLL_OK ${first} ${second}`); }
        else if (verb === 'VERIFY') emit(storedSlots.has(Number(first)) && Number(first) === 3 ? `VERIFY_OK ${first} ${second}` : `VERIFY_FAIL ${first} WRONG_PERSON ${second}`);
        else if (verb === 'DELETE') { storedSlots.delete(Number(first)); emit(`DELETE_OK ${first} ${second}`); }
        else if (verb === 'RESULT') emit(`RESULT_OK ${first} ${second}`);
        else if (verb === 'RESET') emit(`RESET_OK ${first}`);
      }
    }
  });
  const port = { readable, writable, async open({ baudRate }) { assert.equal(baudRate, 9600); }, async close() {}, getInfo() { return { test: true }; } };
  return { port, sent };
}

test('face descriptor comparison identifies nonmatching sample', () => {
  const personA = Array(128).fill(0);
  const personB = Array(128).fill(0.12);
  assert.equal(compareDescriptors(personA, personA).matched, true);
  assert.equal(compareDescriptors(personA, personB).matched, false);
  assert.throws(() => compareDescriptors([1, 2], [3, 4]));
});

test('Web Serial protocol completes fingerprint enrollment, verification, failure and LED commands', async () => {
  const device = fakeDevice();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serial: { requestPort: async () => device.port } } });
  globalThis.window = { isSecureContext: true };
  try {
    await connectSerial();
    assert.equal(isConnected(), true);
    await enrollFingerprint(3);
    assert.match(await verifyFingerprint(3), /^VERIFY_OK 3 /);
    await assert.rejects(() => verifyFingerprint(5), /WRONG_PERSON/);
    assert.match(await setDemoLed(false), /RESULT_OK FAIL/);
    assert.match(await setDemoLed(true), /RESULT_OK PASS/);
    await resetDemoLed();
    await deleteFingerprint(3);
    await assert.rejects(() => verifyFingerprint(3), /WRONG_PERSON/);
    assert.ok(device.sent.some(x => x.startsWith('ENROLL 3 ')));
    assert.ok(device.sent.some(x => x.startsWith('RESULT PASS ')));
  } finally {
    await disconnectSerial();
    delete globalThis.window;
  }
  assert.equal(isConnected(), false);
});
