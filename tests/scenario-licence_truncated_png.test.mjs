import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence truncated png',()=>{
 const file={buffer:Buffer.from([137,80,78]),mimetype:'image/png'};
 assert.throws(()=>validateLicence(file));
});
