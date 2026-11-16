import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence html',()=>{
 const file={buffer:Buffer.from('<html>'),mimetype:'text/html'};
 assert.throws(()=>validateLicence(file));
});
