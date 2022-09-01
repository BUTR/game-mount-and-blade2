import path from 'path';
import { GAME_ID } from '../../src/common';
import { testRootMod } from '../../src/installers/rootmodtester';

describe(`rootmodtester`, () => {
  test(`not supported when wrong game id`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testRootMod([``], ``);
    expect(expected).toEqual(result);
  });

  test(`not supported when wrong Modules folder`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testRootMod([`sdfw${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`supported when correct without any folders`, async () => {
    const expected = { supported: true, requiredFiles: [] };
    const result = await testRootMod([`Modules${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`supported when correct with bin folder`, async () => {
    const expected = { supported: true, requiredFiles: [] };
    const result = await testRootMod([`Modules${path.sep}Module`, `Modules${path.sep}Module${path.sep}bin`], GAME_ID);
    expect(expected).toEqual(result);
  });
});
