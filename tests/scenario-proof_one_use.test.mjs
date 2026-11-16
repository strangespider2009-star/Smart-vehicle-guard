import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('proof one use',()=>{const s={mobileProof:{driverId:'a',at:100}};assert.equal(consumeMobileProof(s,'a',120),true);assert.equal(consumeMobileProof(s,'a',120),false);});
