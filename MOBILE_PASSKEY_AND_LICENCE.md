# Phone passkey and demo driving-licence upload

This is a supplement to the original LOGIX LED-only demonstration. The original external fingerprint hardware and face verification screens are preserved.

## Phone user verification (WebAuthn)

1. Use **HTTPS** at the Render deployed URL, or localhost, from a mobile browser that supports platform passkeys.
2. Sign in as the owner; add a driver record.
3. On **Enrollment**, select the driver and choose **Register phone passkey**. Accept the OS prompt to enroll a credential associated with that demo driver.
4. On **Verification**, select the same driver, verify the face, then choose **Verify with phone**. A new WebAuthn assertion is checked on the server, associated with that driver's stored credential, and usable once for a demo decision within two minutes.
5. **Evaluate & send LED result**. Without HC-05 connected, the website displays only an on-screen result. If HC-05 is connected, it sends the demonstration LED result as before.

**IMPORTANT:** The phone OS may use fingerprint, face unlock, PIN or screen lock; a website **cannot require or observe fingerprint specifically**. Any person who can unlock an enrolled authenticator may satisfy its user verification. Registration associates a credential to a *selected demo record*, not proof of that person's real identity. For actual fingerprint-only matching, retain the optical fingerprint sensor.

**Production configuration**: Set `WEBAUTHN_ORIGIN` to the exact deployed HTTPS origin, e.g. `https://your-service.onrender.com`, without a trailing path, on the **Render server**. Alternatively Render generally supplies `RENDER_EXTERNAL_URL`. If you move domains, enroll new passkeys for the new relying party. Use the same origin for website and API.

**Storage limitation**: Credentials are stored as public keys in the existing demonstration JSON database. On ephemeral Render instances they can vanish on redeploy; sessions use an in-memory store. This is not a production authentication service.

## Driving licence

The Add Driver form accepts an **optional demo licence** PDF, PNG or JPEG up to 2MB. The server checks file signatures and stores it privately outside `dist` with a random name. Only the authenticated owner may download the document via `/api/drivers/:id/licence`. Removing a driver deletes its document. Storage is ephemeral on free Render services.

**Privacy:** Don't upload real driving licence documents or sensitive personal ID to this classroom demonstration; use synthetic sample documents. Real identity records need stronger data protection, retention policies, access controls, a persistent private storage system, and legal review.

## Existing features untouched

All existing routes for owners, vehicles, driver approvals, external optical fingerprint enrollment/verification, face matching, Arduino HC-05 LED-only feedback, history, and overall layout remain in place. The final access check distinguishes sensor and server-verified phone passkey methods, so a phone assertion cannot be replaced by a fabricated boolean alone.
