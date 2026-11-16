import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDemoAccess} from '../server/rules.js';
const driver = { id: 'driver-1', vehicleId: 'vehicle-1', licenceExpiry: '2099-12-31', approved: true, fingerprintEnrolled: true, devicePasskeys: [{id:'demo-credential'}] };
const vehicle = { id: 'vehicle-1' };
const yes = {driver,vehicle,faceMatched:true,fingerprintMatched:true};

test('sensor fingerprint failed', () => {
  const result = evaluateDemoAccess({...yes,...{ fingerprintMatched:false }}, new Date('2026-11-16'));
  assert.equal(result.accessGranted, false);
});
