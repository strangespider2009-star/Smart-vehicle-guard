// Pure short-lived session proof helpers for educational phone user verification.
const CEREMONY_LIFETIME = 120_000;
export function startFlow(session, kind, driverId, challenge) {
  session.passkeyFlow = { kind, driverId, challenge, started: Date.now() };
}
export function consumeFlow(session, kind, driverId) {
  const flow = session.passkeyFlow;
  delete session.passkeyFlow;
  if (!flow || flow.kind !== kind || flow.driverId !== driverId ||
      Date.now() < flow.started || Date.now() - flow.started > CEREMONY_LIFETIME) throw new Error('Passkey request expired. Start again.');
  return flow.challenge;
}
export function recentlyVerifiedMobile(session, driverId, now = Date.now()) {
  const proof = session.mobileProof;
  return Boolean(proof && proof.driverId === driverId && now - proof.at <= CEREMONY_LIFETIME && now >= proof.at);
}
export function consumeMobileProof(session, driverId, now = Date.now()) {
  const ok = recentlyVerifiedMobile(session, driverId, now);
  delete session.mobileProof;
  return ok;
}
