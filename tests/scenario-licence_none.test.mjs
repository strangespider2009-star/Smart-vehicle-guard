import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence none',()=>{
 const file=null;
 assert.equal(validateLicence(file),null);
});
