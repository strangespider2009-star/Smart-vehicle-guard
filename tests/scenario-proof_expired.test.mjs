import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('proof expired',()=>{assert.equal(recentlyVerifiedMobile({mobileProof:{driverId:'a',at:100}},'a',120101),false);});
