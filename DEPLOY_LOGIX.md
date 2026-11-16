# LOGIX — Publish to GitHub and deploy to Render

This package is prepared for a **repository** named `Smart-vehicle-guard` under your GitHub account. The exact final deployment URL is assigned by Render only after a service is created and successfully deployed. Do **not** assume a URL is live before testing it.

## 1. Create the repository

1. Sign in to GitHub and open https://github.com/new.
2. Set repository owner to your account and name to **Smart-vehicle-guard**.
3. Choose private or public, and create the **empty** repository **without** a README, license or .gitignore (those files are supplied here).
4. On your computer extract `SMART_VEHICLE_GUARD_COMPLETE.zip` and open a terminal **inside** the extracted `LOGIX` folder.

## 2. Push the source

Run the following, replacing `<your-github-username>` only if you are using a different GitHub account:

```bash
git init
git add .
git commit -m "Initial LOGIX educational biometric LED demonstration"
git branch -M main
git remote add origin https://github.com/strangespider2009-star/Smart-vehicle-guard.git
git push -u origin main
```

For a repository already initialized locally, use `git remote -v` to inspect existing remotes before adding a new one. The archive does not contain `.git` history, secrets, node_modules, or built assets.

## 3. Render: deploy one Web Service, not a Static Site

1. Go to https://dashboard.render.com/ and authorize the GitHub repo if prompted.
2. Use **New > Blueprint**, select `Smart-vehicle-guard`, and Render will read `render.yaml`. Inspect the new service and accept the requested configuration.
3. Or use **New > Web Service** and manually choose repository `Smart-vehicle-guard`, branch `main`, runtime `Node`, build command `npm install && npm run check && npm run build`, and start command `npm start`. Use environment variables `NODE_ENV=production` and `SESSION_SECRET` set to a long random string if not deploying the Blueprint.
4. Wait for the deploy dashboard to report **Live**. Read both build and runtime logs.
5. Open the **exact** service URL shown by Render. Do not guess it from the service name.
6. Confirm `https://<YOUR-RENDER-URL>/api/health` returns JSON with `"ok":true`, then open the homepage, register a demo owner, and test `GET /api/me`.
7. In browser Developer Tools, confirm model manifests from `/models/` load with HTTP 200 before using the camera.

### On Render (important limits)

- The backend and frontend share an origin. The UI calls relative `/api` URLs; no public `VITE_API_URL` is needed.
- The app is a **demonstration** with a JSON file on the instance and Express's default in-memory session store. On free or nonpersistent instances, data and login sessions can disappear after restart or redeploy. Do not enroll sensitive real profiles or rely on the app as a production identity system.
- The Render server does **not** access your local HC-05 or fingerprint sensor. Web Serial runs **in your own Chrome/Edge desktop browser**, on a computer paired to the HC-05 serial COM port. HTTPS is required, and mobile browsers may not support it.
- The hardware demo runs LEDs only. Never connect the sketch to a real vehicle ignition, lock, steering or brakes.

## 4. Verify the complete demo locally with real hardware

See `README.md` for the actual setup of the demonstration Arduino sketch, optional R307/AS608 fingerprint sensor, HC-05 pairing and serial communication. Fingerprint enrollment and verification requires a physical sensor, proper electrical connections, and a supported browser; a website cannot read a laptop/phone fingerprint scanner itself.

When testing, ensure:
- Wrong face => rejected identity match and red demonstration LED when the failure is sent.
- Correct face and correct fingerprint, and all approved demo conditions => green demonstration LED.
- Wrong fingerprint, missing sensor, serial disconnect or timeout => never represent authentication as successful.

## 5. Testing and deployment limitations

The source files and unit tests can be checked with `npm run check`. A full React/Vite production build needs the npm registry to install dependencies and must be verified in your own environment or Render build logs. The project is not a production biometric security system: face descriptors are stored locally, no liveness detection is provided, and server decisions rely on client-supplied results. Those are explicit design limitations.


## New driver licence and phone passkeys

Phone passkey verification uses WebAuthn. In Render Environment, set `WEBAUTHN_ORIGIN` to your exact new public HTTPS origin (e.g., `https://your-service.onrender.com`). This must match the URL used to access the app in the mobile browser. The mobile OS can use fingerprint, face, PIN or lock screen; the website cannot tell which. The demo licence upload is stored on the ephemeral instance and restricted to the owner; use demonstration/sample documents, never genuine driving licences. See `MOBILE_PASSKEY_AND_LICENCE.md`.
