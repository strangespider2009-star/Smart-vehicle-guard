import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('proof wrong driver',()=>{const s={mobileProof:{driverId:'a',at:100}};assert.equal(consumeMobileProof(s,'b',120),false);});
