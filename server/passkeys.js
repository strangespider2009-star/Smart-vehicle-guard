// Driver-associated phone passkeys for educational user verification.
// A successful WebAuthn assertion DOES NOT prove fingerprint modality or legal identity.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';

const CEREMONY_LIFETIME = 120_000;
export function relyingParty() {
  const raw = process.env.WEBAUTHN_ORIGIN || process.env.RENDER_EXTERNAL_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (!raw) throw new Error('Set WEBAUTHN_ORIGIN to the public HTTPS website URL for phone passkeys.');
  const url = new URL(raw);
  if (url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')))
    throw new Error('WEBAUTHN_ORIGIN must be an HTTPS origin, or http://localhost in local development.');
  return { rpID: url.hostname, origin: url.origin };
}
export async function registrationOptions(driver) {
  const { rpID } = relyingParty();
  return generateRegistrationOptions({
    rpName: 'SMART DRIVE GUARD Demo', rpID,
    userName: `demo-driver-${driver.id}`, userDisplayName: driver.name,
    userID: new Uint8Array(Buffer.from(driver.id)), attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required', authenticatorAttachment: 'platform' },
    excludeCredentials: (driver.devicePasskeys || []).map(c => ({ id: c.id, transports: c.transports || [] }))
  });
}
export async function verifyRegistration(body, challenge) {
  const { rpID, origin } = relyingParty();
  const result = await verifyRegistrationResponse({ response: body, expectedChallenge: challenge,
    expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  if (!result.verified || !result.registrationInfo?.credential) throw new Error('Passkey registration was not verified.');
  const cred = result.registrationInfo.credential;
  return { id: cred.id, publicKey: Buffer.from(cred.publicKey).toString('base64'),
    counter: cred.counter, transports: body.response?.transports || [] };
}
export async function authenticationOptions(driver) {
  const { rpID } = relyingParty();
  return generateAuthenticationOptions({ rpID, userVerification: 'required',
    allowCredentials: (driver.devicePasskeys || []).map(c => ({ id: c.id, transports: c.transports || [] })) });
}
export async function verifyAuthentication(body, challenge, stored) {
  const { rpID, origin } = relyingParty();
  const result = await verifyAuthenticationResponse({
    response: body, expectedChallenge: challenge, expectedOrigin: origin,
    expectedRPID: rpID, requireUserVerification: true,
    credential: { id: stored.id, publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
      counter: stored.counter, transports: stored.transports || [] }
  });
  if (!result.verified) throw new Error('Device passkey verification failed.');
  return result.authenticationInfo.newCounter;
}
