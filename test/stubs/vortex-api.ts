/**
 * Stub of "@nexusmods/vortex-api" for tests. The real package has no runtime, Vortex provides it.
 * Every name the packages import must exist here, or the import fails to link.
 * Modules build selectors and classes from the API at load time, so each member answers any
 * property with a no-op function. A test that needs real behavior sets it on the member
 */

const anyMember = <T extends object>(overrides: T = {} as T): T =>
  new Proxy(overrides, {
    get: (target, property) =>
      property in target
        ? target[property as keyof T]
        : function stub(): undefined {
            return undefined;
          },
  });

/** Matches the way Vortex matches a collection rule to a mod in the cases the tests use: by mod id */
const testModReference = (
  mod: { id: string } | undefined,
  reference: { id?: string; idHint?: string },
): boolean =>
  mod !== undefined && (reference.id === mod.id || reference.idHint === mod.id);

export const util = anyMember({ testModReference });
export const actions = anyMember();
export const selectors = anyMember();
export const fs = anyMember();
export const tooltip = anyMember();
export const types = {};
export const log = (): void => undefined;
export const Icon = undefined;
export const MainContext = undefined;
export const EmptyPlaceholder = undefined;
export const ToolbarIcon = undefined;
export const Toggle = undefined;
export const More = undefined;
export const MainPage = undefined;
export const FlexLayout = undefined;
