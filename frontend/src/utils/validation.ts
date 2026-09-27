import type { ScanItem } from '../types/scan'

/** 定编校核要求主用扫描件达到的最低分辨率（含 400dpi）。 */
export const PRIMARY_SCAN_MIN_DPI = 400

/**
 * 定编校核不通过的原因。
 * - no-primary：尚未标记主用扫描件
 * - low-resolution：主用件分辨率不足 400dpi
 * - damaged：主用件质量为破损
 */
export type PrimaryIssue = 'no-primary' | 'low-resolution' | 'damaged'

export interface PrimaryCheckResult {
  primary?: ScanItem
  issues: PrimaryIssue[]
  qualified: boolean
}

/** 主用件未达标时，按固定口径拼出哪一件、哪一项未达到要求。 */
export function describePrimaryIssue(primary: ScanItem | undefined, issues: PrimaryIssue[]): string {
  if (issues.includes('no-primary') || !primary) {
    return '尚未标记主用扫描件，无法定编。'
  }
  const reasons: string[] = []
  if (issues.includes('low-resolution')) {
    reasons.push(`分辨率 ${primary.resolutionDpi}dpi 不足 ${PRIMARY_SCAN_MIN_DPI}dpi`)
  }
  if (issues.includes('damaged')) {
    reasons.push('图像质量为破损')
  }
  return `主用件「${primary.fileName}」未达到定编要求：${reasons.join('，')}。`
}

/** 取某件扫描件不满足定编要求的原因；合格时返回空数组。 */
export function getScanIssues(scan: ScanItem | undefined): PrimaryIssue[] {
  if (!scan) {
    return ['no-primary']
  }
  const issues: PrimaryIssue[] = []
  if (scan.resolutionDpi < PRIMARY_SCAN_MIN_DPI) {
    issues.push('low-resolution')
  }
  if (scan.quality === '破损') {
    issues.push('damaged')
  }
  return issues
}

/** 定编校核：主用件分辨率不低于 400dpi 且质量非破损才算合格。 */
export function checkPrimaryScan(scans: ScanItem[]): PrimaryCheckResult {
  const primary = scans.find((scan) => scan.isPrimary)
  const issues = getScanIssues(primary)
  return {
    ...(primary ? { primary } : {}),
    issues,
    qualified: issues.length === 0,
  }
}
