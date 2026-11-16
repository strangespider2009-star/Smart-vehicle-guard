import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('proof missing',()=>{assert.equal(recentlyVerifiedMobile({},'a',120),false);});
