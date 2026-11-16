// Web Serial talks to a paired HC-05 outgoing COM port on supported desktop browsers.
// Fingerprint extraction and template storage happen on the attached optical sensor.
const BAUD = 9600;
let port = null;
let reader = null;
let writer = null;
let reading = false;
let pending = null;
let sequence = 0;
let onDisconnect = () => {};
let onStatus = () => {};
let buffer = '';

function rejectPending(reason) {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.reject(new Error(reason));
  pending = null;
}
function processLine(line) {
  const message = line.trim();
  if (!message) return;
  onStatus(message);
  if (!pending) return;
  const parts = message.split(/\s+/);
  // Every protocol response includes a request nonce as the final field.
  if (parts[parts.length - 1] !== String(pending.nonce)) return;
  clearTimeout(pending.timer);
  const active = pending;
  pending = null;
  if (parts[0] === active.ok && (active.slot == null || parts[1] === String(active.slot))) {
    active.resolve(message);
  } else if (parts[0].endsWith('_FAIL') || parts[0] === 'ERROR') {
    active.reject(new Error(`Sensor replied: ${message}`));
  } else {
    active.reject(new Error(`Unexpected sensor response: ${message}`));
  }
}
async function readLoop() {
  reading = true;
  const attachedPort = port;
  const decoder = new TextDecoder();
  try {
    while (port?.readable) {
      reader = port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            processLine(buffer.slice(0, index));
            buffer = buffer.slice(index + 1);
          }
          if (buffer.length > 1024) buffer = ''; // avoid unbounded buffer
        }
      } finally { reader.releaseLock(); reader = null; }
      break;
    }
  } catch (e) {
    onStatus(`Serial disconnected: ${e.message}`);
  } finally {
    reading = false;
    rejectPending('Serial connection closed.');
    if (port === attachedPort) {
      port = null;
      try { writer?.releaseLock(); } catch {}
      writer = null;
    }
    onDisconnect();
  }
}
export function serialSupported() { return Boolean(window.isSecureContext && navigator.serial); }
export function isConnected() { return Boolean(port && writer); }
export async function connectSerial(callbacks = {}) {
  if (!serialSupported()) throw new Error('HC-05 serial requires HTTPS/localhost and desktop Chrome or Edge with Web Serial support.');
  if (port) throw new Error('Serial already connected.');
  const selected = await navigator.serial.requestPort();
  await selected.open({ baudRate: BAUD });
  if (!selected.writable || !selected.readable) { await selected.close(); throw new Error('Selected COM port must be readable and writable.'); }
  port = selected;
  onDisconnect = callbacks.onDisconnect || (() => {});
  onStatus = callbacks.onStatus || (() => {});
  writer = port.writable.getWriter();
  void readLoop();
  // Validate this is the correct device by roundtrip, not just an open COM port.
  try {
    const reply = await command('PING', [], 'PONG', 6000);
    if (!reply.includes('SENSOR_OK')) throw new Error('Fingerprint sensor not detected by Arduino.');
  }
  catch (e) { await disconnectSerial(); throw new Error(`Port opened but Arduino did not respond. Check pairing, sensor sketch, and 9600 baud. ${e.message}`); }
  return selected.getInfo();
}
export async function disconnectSerial() {
  const old = port;
  if (!old) return;
  port = null;
  rejectPending('Port disconnected.');
  try { await reader?.cancel(); } catch {}
  // Give readLoop a chance to release the readable lock.
  for (let i = 0; reading && i < 20; i++) await new Promise(r => setTimeout(r, 20));
  const w = writer; writer = null;
  try { w?.releaseLock(); } catch {}
  try { await old.close(); } catch {}
  onDisconnect();
}
async function command(verb, args, ok, timeout = 20000, slot = null) {
  if (!writer || !port) throw new Error('Connect the paired HC-05 COM port first.');
  if (pending) throw new Error('Another Arduino command is running.');
  const nonce = ++sequence;
  const request = [verb, ...args, nonce].join(' ') + '\n';
  // Make pending visible before writing, so an immediate response is never lost.
  const promise = new Promise((resolve, reject) => {
    pending = { nonce, ok, slot, resolve, reject, timer: setTimeout(() => rejectPending('Sensor operation timed out. Please check the hardware.'), timeout) };
  });
  try { await writer.write(new TextEncoder().encode(request)); }
  catch (err) { rejectPending(`Could not send serial command: ${err.message}`); }
  return promise;
}
export function enrollFingerprint(slot) { return command('ENROLL', [slot], 'ENROLL_OK', 80000, slot); }
export function verifyFingerprint(slot) { return command('VERIFY', [slot], 'VERIFY_OK', 25000, slot); }
export function deleteFingerprint(slot) { return command('DELETE', [slot], 'DELETE_OK', 15000, slot); }
export function setDemoLed(approved) { return command('RESULT', [approved ? 'PASS' : 'FAIL'], 'RESULT_OK', 6000); }
export function resetDemoLed() { return command('RESET', [], 'RESET_OK', 6000); }
