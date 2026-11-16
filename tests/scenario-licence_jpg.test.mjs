import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicence,MAX_LICENCE_BYTES} from '../server/licences.js';
test('licence jpg',()=>{
 const file={buffer:Buffer.from([255, 216, 255, 224, 116, 101, 115, 116, 100, 97, 116, 97]),mimetype:'image/jpeg'};
 assert.ok(validateLicence(file));
});
