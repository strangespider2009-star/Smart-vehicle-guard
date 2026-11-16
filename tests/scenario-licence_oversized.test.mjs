import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence oversized',()=>{
 const file={buffer:Buffer.alloc(MAX_LICENCE_BYTES+1,0),mimetype:'image/png'};
 assert.throws(()=>validateLicence(file));
});
