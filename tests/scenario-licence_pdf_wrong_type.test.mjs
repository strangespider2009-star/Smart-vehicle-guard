import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence pdf wrong type',()=>{
 const file={buffer:Buffer.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 101, 120, 97, 109, 112, 108, 101, 32, 116, 101, 115, 116, 32, 102, 105, 108, 101]),mimetype:'image/png'};
 assert.throws(()=>validateLicence(file));
});
