import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMode, saveMode, MODE_STORAGE_KEY, type SimulationMode } from '../src/mode-preference.ts';

test('mode preference restores each supported mode and only writes its own storage key', () => {
  const values = new Map<string,string>([['other-setting','keep']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string,value: string) => { values.set(key,value); } };
  assert.equal(loadMode(storage),'basic');
  for (const mode of ['fixture','surfaces','basic'] as SimulationMode[]) {
    saveMode(mode,storage);
    assert.equal(loadMode(storage),mode);
    assert.equal(values.get(MODE_STORAGE_KEY),mode);
    assert.equal(values.get('other-setting'),'keep');
    assert.equal(values.size,2);
  }
});

test('missing, obsolete or invalid stored modes fall back to Basic', () => {
  for (const value of [null,'','Fixture','unknown','{"mode":"fixture"}']) {
    assert.equal(loadMode({getItem:()=>value,setItem:()=>{throw new Error('Read should not write');}}),'basic');
  }
});

test('unavailable or blocked storage cannot prevent the app from starting or switching mode', () => {
  const blocked = {getItem:():string|null=>{throw new Error('Blocked');},setItem:()=>{throw new Error('Quota');}};
  assert.equal(loadMode(blocked),'basic');
  assert.doesNotThrow(()=>saveMode('surfaces',blocked));
});
