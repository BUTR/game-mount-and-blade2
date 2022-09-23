import path from 'path';
import { GAME_ID } from '../../src/common';
import { testForModules } from '../../src/installers/moduletester';

describe(`moduletester`, () => {
  test(`return not supported when wrong game id`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testForModules([``], ``);
    expect(expected).toEqual(result);
  });

  test(`return not supported when wrong Modules folder`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testForModules([`sdfw${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`return not supported when correct without SubModule.xml`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testForModules([`Modules${path.sep}Module${path.sep}SomeFile.txt`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`return supported when correct with SubModule.xml`, async () => {
    const expected = { supported: true, requiredFiles: [] };
    const result = await testForModules([`Modules${path.sep}Module${path.sep}SomeFile.txt`, `Modules${path.sep}Module${path.sep}SubModule.xml`], GAME_ID);
    expect(expected).toEqual(result);
  });
});
