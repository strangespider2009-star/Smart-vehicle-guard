import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence png wrong type',()=>{
 const file={buffer:Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 99, 111, 110, 116, 101, 110, 116]),mimetype:'application/pdf'};
 assert.throws(()=>validateLicence(file));
});
