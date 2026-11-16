// A passkey uses platform verification (fingerprint, face, PIN or screen lock).
// Websites cannot inspect or require the particular modality.
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { post } from './api.js';

export function mobilePasskeysSupported() {
  return Boolean(window.isSecureContext && window.PublicKeyCredential);
}
export async function registerPhonePasskey(driverId) {
  if (!mobilePasskeysSupported()) throw new Error('Use a secure HTTPS browser that supports passkeys.');
  const base = `/api/drivers/${encodeURIComponent(driverId)}/passkey`;
  const optionsJSON = await post(`${base}/register-options`, {});
  const credential = await startRegistration({ optionsJSON });
  const result = await post(`${base}/register-verify`, credential);
  if (!result.verified) throw new Error('The server did not verify your passkey registration.');
  return result;
}
export async function verifyPhonePasskey(driverId) {
  if (!mobilePasskeysSupported()) throw new Error('Use a secure HTTPS browser that supports passkeys.');
  const base = `/api/drivers/${encodeURIComponent(driverId)}/passkey`;
  const optionsJSON = await post(`${base}/auth-options`, {});
  const credential = await startAuthentication({ optionsJSON });
  const result = await post(`${base}/auth-verify`, credential);
  if (!result.verified) throw new Error('The server did not verify your phone passkey.');
  return result;
}
