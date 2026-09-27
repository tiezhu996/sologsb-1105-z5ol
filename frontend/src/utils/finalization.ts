import type { ScanItem } from '../types/scan'

/** 定编校核：主用扫描件分辨率不得低于 400dpi。 */
export const MIN_PRIMARY_DPI = 400

export interface PrimaryScanIssue {
  scan: ScanItem
  reasons: string[]
}

/**
 * 定编校核：主用件分辨率不足 400dpi 或图像质量为破损时，
 * 图幅不能保持已编状态。返回 null 表示主用件达标。
 */
export function checkPrimaryScan(scan: ScanItem | undefined): PrimaryScanIssue | null {
  if (!scan) {
    return null
  }
  const reasons: string[] = []
  if (scan.resolutionDpi < MIN_PRIMARY_DPI) {
    reasons.push(`分辨率 ${scan.resolutionDpi}dpi 不足 ${MIN_PRIMARY_DPI}dpi`)
  }
  if (scan.quality === '破损') {
    reasons.push('图像质量为破损')
  }
  return reasons.length > 0 ? { scan, reasons } : null
}
