import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence empty',()=>{
 const file={buffer:Buffer.alloc(0),mimetype:'image/png'};
 assert.throws(()=>validateLicence(file));
});
