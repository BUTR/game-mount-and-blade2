import everything, { BannerlordModuleManager as OldBannerlordModuleManager } from '@butr/blmodulemanagernative/dist/module/lib';

//@ts-ignore
//const isJest = typeof jest !== undefined;
const isJest = global.expect !== undefined;

export * from '@butr/blmodulemanagernative/dist/module/lib/types';

export type BannerlordModuleManager = Omit<OldBannerlordModuleManager, 'createAsync'>

// Stupid workaround for jest ESM issue
export const createBannerlordModuleManager = async (): Promise<BannerlordModuleManager> => {
    if (isJest) {
        const awaitable: Promise<{ BannerlordModuleManager: typeof OldBannerlordModuleManager }> = everything as any;
        const awaited = await awaitable;
        return awaited.BannerlordModuleManager.createAsync();
    }
    return await OldBannerlordModuleManager.createAsync();
}