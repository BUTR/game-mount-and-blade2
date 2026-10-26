const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/**
 * A size in the largest unit it fills, like "1.5 MB", whole bytes under a KB
 */
export const formatSize = (bytes: number): string => {
  const format = (value: number, unit: number): string =>
    value.toFixed(unit === 0 ? 0 : 1);
  let value = bytes;
  let unit = 0;
  // Compared as shown, 1023.96 KB is shown as 1.0 MB, not 1024.0 KB
  while (Number(format(value, unit)) >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${format(value, unit)} ${SIZE_UNITS[unit]}`;
};
