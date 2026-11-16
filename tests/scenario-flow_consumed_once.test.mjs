import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('flow consumed once',()=>{const s={};startFlow(s,'register','a','challenge');assert.equal(consumeFlow(s,'register','a'),'challenge');assert.throws(()=>consumeFlow(s,'register','a'));});
