import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { physicalResourceKey } from '../../core/resources';

void test('same member in different containers remains a distinct physical choice', () => {
  const memberPath = 'sub-01/anat/sub-01_T1w.nii.gz';
  assert.notEqual(
    physicalResourceKey({ sourceUri: 'file:///a.zip', memberPath }),
    physicalResourceKey({ sourceUri: 'file:///b.zip', memberPath }),
  );
});
void test('remote host is part of physical identity', () => {
  assert.notEqual(
    physicalResourceKey({ sourceUri: 'vscode-remote://ssh-remote+one/data' }),
    physicalResourceKey({ sourceUri: 'vscode-remote://ssh-remote+two/data' }),
  );
});

void test('changing a member changes selection without changing its container', () => {
  assert.notEqual(
    physicalResourceKey({ sourceUri: 'file:///a.zip', memberPath: 'sub-01/a' }),
    physicalResourceKey({ sourceUri: 'file:///a.zip', memberPath: 'sub-02/a' }),
  );
});

void test('identity is stable regardless of object construction order', () => {
  assert.equal(
    physicalResourceKey({ sourceUri: 'file:///a.zip', memberPath: 'a' }),
    physicalResourceKey({ memberPath: 'a', sourceUri: 'file:///a.zip' }),
  );
});

void test('a container and an empty member path remain distinct resources', () => {
  assert.notEqual(
    physicalResourceKey({ sourceUri: 'file:///a.zip' }),
    physicalResourceKey({ sourceUri: 'file:///a.zip', memberPath: '' }),
  );
});

void test('delimiter-like characters in paths cannot collide with identity fields', () => {
  assert.notEqual(
    physicalResourceKey({ sourceUri: 'file:///a|b', memberPath: 'c' }),
    physicalResourceKey({ sourceUri: 'file:///a', memberPath: 'b|c' }),
  );
});
