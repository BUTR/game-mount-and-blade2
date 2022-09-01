import path from 'path';
import { GAME_ID } from '../../src/common';
import { testForSubmodules } from '../../src/installers/submoduletester';

describe(`submoduletester`, () => {
  test(`return not supported when wrong game id`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testForSubmodules([``], ``);
    expect(expected).toEqual(result);
  });

  test(`return not supported when wrong Modules folder`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testForSubmodules([`sdfw${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`return not supported when correct without SubModule.xml`, async () => {
    const expected = { supported: false, requiredFiles: [] };
    const result = await testForSubmodules([`Modules${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`return supported when correct with SubModule.xml`, async () => {
    const expected = { supported: true, requiredFiles: [] };
    const result = await testForSubmodules([`Modules${path.sep}Module`, `Modules${path.sep}SubModule.xml`], GAME_ID);
    expect(expected).toEqual(result);
  });
});
