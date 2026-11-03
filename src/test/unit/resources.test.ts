import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { physicalResourceKey } from '../../core/resources';

test('same member in different containers remains a distinct physical choice', () => {
  const memberPath = 'sub-01/anat/sub-01_T1w.nii.gz';
  assert.notEqual(physicalResourceKey({ sourceUri: 'file:///a.zip', memberPath }), physicalResourceKey({ sourceUri: 'file:///b.zip', memberPath }));
});
test('remote host is part of physical identity', () => {
  assert.notEqual(physicalResourceKey({ sourceUri: 'vscode-remote://ssh-remote+one/data' }), physicalResourceKey({ sourceUri: 'vscode-remote://ssh-remote+two/data' }));
});
