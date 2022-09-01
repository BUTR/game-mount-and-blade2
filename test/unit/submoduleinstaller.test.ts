import path from 'path';
import { GAME_ID } from '../../src/common';
import { installSubModules } from '../../src/installers/submoduleinstaller';

jest.mock(`@butr/blmodulemanagernative/dist/module/lib`, async () => import(`@butr/blmodulemanagernative/dist/main/lib`));
jest.mock(`@butr/blmodulemanagernative/dist/module/lib/types`, async () => import(`@butr/blmodulemanagernative/dist/main/lib/types`));

describe(`submoduleinstaller`, () => {
  test(`no instructions when wrong game id`, async () => {
    const expected = { instructions: [] };
    const result = await installSubModules([``], ``);
    expect(expected).toEqual(result);
  });

  test(`no instructions when wrong wrong Modules folder`, async () => {
    const expected = { instructions: [] };
    const result = await installSubModules([`sdfw${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });

  test(`no instructions when correct without SubModule.xml`, async () => {
    const expected = { instructions: [] };
    const result = await installSubModules([`Modules${path.sep}Module`], GAME_ID);
    expect(expected).toEqual(result);
  });
});
