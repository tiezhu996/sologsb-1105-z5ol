import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ScanItem } from '../types/scan'
import type { Sheet, SheetStatus } from '../types/sheet'
import { createId, db, plain } from '../utils/db'
import { sortByYear } from '../utils/scale'
import { checkPrimaryScan } from '../utils/validation'

export type NewSheet = Omit<Sheet, 'id' | 'neighborCodes'> & {
  neighborCodes?: string[]
}
export type NewScanItem = Omit<ScanItem, 'id'>

export const useSheetStore = defineStore('sheet', () => {
  const sheets = ref<Sheet[]>([])
  const allScans = ref<ScanItem[]>([])
  const currentSheet = ref<Sheet | null>(null)
  const loading = ref(false)
  const initialized = ref(false)
  let initialization: Promise<void> | null = null

  const currentScans = computed(() =>
    currentSheet.value
      ? allScans.value.filter((scan) => scan.sheetId === currentSheet.value?.id)
      : [],
  )

  async function init(): Promise<void> {
    if (initialized.value) {
      return
    }
    if (!initialization) {
      loading.value = true
      initialization = Promise.all([db.sheets.toArray(), db.scans.toArray()])
        .then(([sheetRows, scanRows]) => {
          sheets.value = sortByYear(sheetRows).reverse()
          allScans.value = scanRows
          initialized.value = true
        })
        .finally(() => {
          loading.value = false
        })
    }
    await initialization
  }

  async function addSheet(input: NewSheet): Promise<Sheet> {
    await init()
    const sheet: Sheet = {
      ...input,
      id: createId('sheet'),
      neighborCodes: input.neighborCodes ?? [],
    }
    await db.sheets.add(plain(sheet))
    sheets.value = sortByYear([...sheets.value, sheet]).reverse()
    currentSheet.value = sheet
    return sheet
  }

  async function loadSheet(id: string): Promise<void> {
    await init()
    currentSheet.value = sheets.value.find((sheet) => sheet.id === id) ?? (await db.sheets.get(id)) ?? null
  }

  async function addScan(input: NewScanItem): Promise<ScanItem> {
    await init()
    const scan: ScanItem = { ...input, id: createId('scan') }
    if (scan.isPrimary) {
      await db.scans.where('sheetId').equals(scan.sheetId).modify({ isPrimary: false })
      allScans.value = allScans.value.map((item) =>
        item.sheetId === scan.sheetId ? { ...item, isPrimary: false } : item,
      )
    }
    await db.scans.add(plain(scan))
    allScans.value = [...allScans.value, scan]
    if (scan.isPrimary) {
      await applyCatalogReview(scan.sheetId, [scan])
    }
    return scan
  }

  /**
   * 按主用件定编校核口径同步图幅状态：主用件不达标（分辨率不足 400dpi
   * 或质量破损）时，图幅退回「待核」。
   */
  async function applyCatalogReview(sheetId: string, scansOverride?: ScanItem[]): Promise<Sheet | undefined> {
    const { qualified } = checkPrimaryScan(scansOverride ?? getScansForSheet(sheetId))
    if (qualified) {
      return getSheetById(sheetId)
    }
    return updateSheetStatus(sheetId, '待核')
  }

  async function updateSheetStatus(sheetId: string, status: SheetStatus): Promise<Sheet | undefined> {
    const existing = getSheetById(sheetId)
    if (!existing || existing.status === status) {
      return existing
    }
    await db.sheets.update(sheetId, { status })
    const updated = { ...existing, status }
    sheets.value = sheets.value.map((sheet) => (sheet.id === sheetId ? updated : sheet))
    if (currentSheet.value?.id === sheetId) {
      currentSheet.value = updated
    }
    return updated
  }

  /**
   * 把某件扫描件设为主用件，并对新主用件执行定编校核：
   * 分辨率不足 400dpi 或质量破损时，图幅退回「待核」，返回最新图幅。
   */
  async function setPrimaryScan(scanId: string): Promise<Sheet | undefined> {
    const target = allScans.value.find((scan) => scan.id === scanId)
    if (!target) {
      return undefined
    }
    await db.scans.where('sheetId').equals(target.sheetId).modify({ isPrimary: false })
    await db.scans.update(scanId, { isPrimary: true })
    allScans.value = allScans.value.map((scan) => {
      if (scan.sheetId !== target.sheetId) {
        return scan
      }
      return { ...scan, isPrimary: scan.id === scanId }
    })
    return applyCatalogReview(target.sheetId)
  }

  /**
   * 重新定编：换回合格主用件（分辨率不低于 400dpi 且非破损）后，
   * 图幅由「待核」恢复为「已编」。主用件仍不达标时保持「待核」。
   */
  async function recatalogSheet(sheetId: string): Promise<Sheet | undefined> {
    const { qualified } = checkPrimaryScan(getScansForSheet(sheetId))
    if (!qualified) {
      return getSheetById(sheetId)
    }
    return updateSheetStatus(sheetId, '已编')
  }

  function getSheetById(id: string): Sheet | undefined {
    return sheets.value.find((sheet) => sheet.id === id)
  }

  function getSheetByCode(code: string): Sheet | undefined {
    return sheets.value.find((sheet) => sheet.code === code)
  }

  function getScansForSheet(sheetId: string): ScanItem[] {
    return allScans.value
      .filter((scan) => scan.sheetId === sheetId)
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
  }

  return {
    sheets,
    allScans,
    currentSheet,
    currentScans,
    loading,
    initialized,
    init,
    addSheet,
    loadSheet,
    addScan,
    setPrimaryScan,
    recatalogSheet,
    getSheetById,
    getSheetByCode,
    getScansForSheet,
  }
})
