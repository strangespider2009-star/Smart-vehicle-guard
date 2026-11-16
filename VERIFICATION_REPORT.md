# Verification report for ZIP release

Validated during artifact creation:

- JavaScript syntax: `node --check` succeeded for all backend JS, face matching, API, and Web Serial modules.
- JSX: parsed successfully with TypeScript's JSX syntax parser (0 parse diagnostics).
- Automated tests: **10 / 10 passed**, covering the demo decision, mismatched facial descriptor, and mock serial HC-05 enrollment, verification, wrong-person rejection, LED commands and deletion.
- Arduino sketches: checked with `g++ -fsyntax-only` and lightweight stand-in Arduino/Adafruit headers. This is a **syntax-only** check, not a real Arduino library compilation or hardware test.

**Not tested here:** `npm install`, Vite production build, webcam models in a browser, real HC-05 Bluetooth pairing, real optical fingerprint sensor, actual Arduino IDE compilation, Render deployment. This environment cannot download npm dependencies or connect physical devices.

**Required before exhibition:** run `npm install`, `npm run check`, `npm run build`, compile the chosen `.ino` in Arduino IDE with the proper libraries, and perform the manual verification sequence in README.md.

**Boundaries:** This package intentionally controls **LEDs only**. Face recognition lacks liveness/spoof protection and local browser reports are not authenticated hardware proofs. Never use for actual vehicle access control.
