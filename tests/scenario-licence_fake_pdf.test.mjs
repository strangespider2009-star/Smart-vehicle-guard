import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence fake pdf',()=>{
 const file={buffer:Buffer.from('PDF file?'),mimetype:'application/pdf'};
 assert.throws(()=>validateLicence(file));
});
