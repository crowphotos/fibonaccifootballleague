export const DEFAULT_SEASON = 2026;

export function getSeason(url, res) {
  const value = url.searchParams.get('season');
  const season = value === null ? DEFAULT_SEASON : Number(value);
  if (!/^\d{4}$/.test(String(season)) || !Number.isInteger(season) || season < 2025 || season > 2100) {
    res.status(400).json({ error: 'season must be a year between 2025 and 2100' });
    return null;
  }
  return season;
}
