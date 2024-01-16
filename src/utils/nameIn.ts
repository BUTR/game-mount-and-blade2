//const _name_proxy = new Proxy({}, { get(target, key) { return key; } });
//export const nameIn = <T>() => {
//  return _name_proxy as unknown as { [P in keyof T]: P };
//}

const _name_proxy = new Proxy({}, { get(target, key) { return key; } });
export const nameIn = <T>() => {
  return _name_proxy as unknown as NamedPropsOf<{ [P in keyof T]: P }>;
}

// Based on "RemoveIndexSignature" from https://stackoverflow.com/a/77814151/22820
/** Keeps named properties of T, removing index props like `[k:string]: T` */
export type NamedPropsOf<T, P=PropertyKey> = {
  [K in keyof T as (P extends K ? never : (K extends P ? K : never))]: T[K]
};