/**
 * Shuffle an array and pick the first n elements.
 */
export function shufflePick<T>(arr: T[], n: number): T[] {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, n);
}

export function randInRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

/** Bilinear sample from the height_data grid */
export function sampleElevation(
	x: number,
	y: number,
	hdata: number[][],
	bounds: { left: number; right: number; bottom: number; top: number },
): number | null {
	const rows = hdata.length;
	const cols = hdata[0].length;
	if (!rows || !cols) return null;
	const tx = (x - bounds.left) / (bounds.right - bounds.left);
	const ty = (y - bounds.bottom) / (bounds.top - bounds.bottom);
	const fc = tx * (cols - 1);
	const fr = (1 - ty) * (rows - 1);
	const c0 = Math.floor(fc);
	const c1 = Math.min(c0 + 1, cols - 1);
	const r0 = Math.floor(fr);
	const r1 = Math.min(r0 + 1, rows - 1);
	if (r0 < 0 || r0 >= rows || c0 < 0 || c0 >= cols) return null;
	const fracC = fc - c0;
	const fracR = fr - r0;
	const h00 = hdata[r0][c0];
	const h10 = hdata[r0][c1];
	const h01 = hdata[r1][c0];
	const h11 = hdata[r1][c1];
	const top = h00 + (h10 - h00) * fracC;
	const bottom = h01 + (h11 - h01) * fracC;
	return top + (bottom - top) * fracR;
}
