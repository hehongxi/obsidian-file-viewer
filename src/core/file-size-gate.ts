import { TFile } from "obsidian";

/**
 * Preview tiers based on file size.
 * - full:     < 10MB — complete load
 * - paged:    10–50MB — paginated / virtualized
 * - sample:   50–200MB — first 1MB + metadata
 * - metadata: > 200MB — metadata only (name, size, mtime)
 */
export type PreviewTier = "full" | "paged" | "sample" | "metadata";

export class FileSizeGate {
	/** Thresholds in bytes. */
	static readonly FULL_PREVIEW = 10 * 1024 * 1024; // 10 MB
	static readonly PAGED_PREVIEW = 50 * 1024 * 1024; // 50 MB
	static readonly SAMPLE_PREVIEW = 200 * 1024 * 1024; // 200 MB

	/**
	 * Classify a file into a preview tier based on its size.
	 * If `stat()` fails or size is unavailable, defaults to "full" (safe fallback).
	 */
	static async getPreviewTier(file: TFile): Promise<PreviewTier> {
		try {
			const stat = await file.vault.adapter.stat(file.path);
			if (!stat || stat.size === undefined || stat.size === null) {
				return "full";
			}

			if (stat.size < FileSizeGate.FULL_PREVIEW) return "full";
			if (stat.size < FileSizeGate.PAGED_PREVIEW) return "paged";
			if (stat.size < FileSizeGate.SAMPLE_PREVIEW) return "sample";
			return "metadata";
		} catch {
			// If stat fails (e.g. file deleted during scan), default to full.
			return "full";
		}
	}

	/**
	 * Sync variant — uses a pre-fetched stat object.
	 * Useful inside batch scans where you already have stat data.
	 */
	static getPreviewTierFromStat(stat: { size?: number } | null): PreviewTier {
		if (!stat || stat.size === undefined || stat.size === null) {
			return "full";
		}
		if (stat.size < FileSizeGate.FULL_PREVIEW) return "full";
		if (stat.size < FileSizeGate.PAGED_PREVIEW) return "paged";
		if (stat.size < FileSizeGate.SAMPLE_PREVIEW) return "sample";
		return "metadata";
	}
}
