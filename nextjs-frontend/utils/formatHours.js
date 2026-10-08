export function formatHours(hours) {
  if (hours === null || hours === undefined) return 0;
  const num = Number(hours);
  if (isNaN(num)) return 0;
  return parseFloat(num.toFixed(2));
}
