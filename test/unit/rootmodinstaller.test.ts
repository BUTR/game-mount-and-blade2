import path from 'path';
import { GAME_ID } from '../../src/common';
import { installRootMod } from '../../src/installers/rootmodinstaller';

describe(`rootmodinstall`, () => {
  test(`no instructions when wrong game id`, async () => {
    const expected = { instructions: [] };
    const result = await installRootMod([``], ``);
    expect(expected).toEqual(result);
  });

  test(`no instructions when wrong wrong Modules folder`, async () => {
    const expected = { instructions: [] };
    const result = await installRootMod([`sdfw${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`no instructions when correct without SubModule.xml`, async () => {
    const expected = { instructions: [] };
    const result = await installRootMod([`Modules${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });
});
