import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('flow wrong kind',()=>{const s={};startFlow(s,'register','a','challenge');assert.throws(()=>consumeFlow(s,'authenticate','a'));});
