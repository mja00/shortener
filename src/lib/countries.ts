const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

// CF-IPCountry also sends non-ISO codes like XX (unknown) and T1 (Tor).
export function countryName(code: string): string {
	try {
		return regionNames.of(code) ?? 'Unknown';
	} catch {
		return 'Unknown';
	}
}
