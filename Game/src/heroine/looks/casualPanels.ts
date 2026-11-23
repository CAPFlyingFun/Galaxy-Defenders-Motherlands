/** Signed distance in leg lengths to the colored side stripe. */
export function panelDistance(region: 'trunk' | 'leg' | 'arm', p: { along: number; turn: number; radius: number }): number {
  if (region === 'arm') return -1;
  const half = region === 'trunk' ? 0.035 : 0.018;
  const across = Math.abs(Math.abs(p.turn) - 90) * Math.PI / 180 * p.radius;
  const from = region === 'trunk' ? 0.1 : 0.05;
  const to = region === 'trunk' ? 0.84 : 0.94;
  return Math.min(half - across, p.along - from, to - p.along);
}
