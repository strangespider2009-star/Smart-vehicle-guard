import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('proof future',()=>{assert.equal(recentlyVerifiedMobile({mobileProof:{driverId:'a',at:150}},'a',120),false);});
