import test from 'node:test';
import assert from 'node:assert/strict';
import {startFlow, consumeFlow, consumeMobileProof, recentlyVerifiedMobile} from '../server/passkey-proof.js';
test('flow future',()=>{const s={};startFlow(s,'authenticate','a','challenge');s.passkeyFlow.started += 121000;assert.throws(()=>consumeFlow(s,'authenticate','a'));});
