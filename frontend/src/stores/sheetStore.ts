import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ScanItem } from '../types/scan'
import type { Sheet, SheetStatus } from '../types/sheet'
import { createId, db, plain } from '../utils/db'
import { checkPrimaryScan, type PrimaryScanIssue } from '../utils/finalization'
import { sortByYear } from '../utils/scale'

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
      await applyFinalizationCheck(scan.sheetId)
    }
    return scan
  }

  async function setPrimaryScan(scanId: string): Promise<PrimaryScanIssue | null> {
    const target = allScans.value.find((scan) => scan.id === scanId)
    if (!target) {
      return null
    }
    await db.scans.where('sheetId').equals(target.sheetId).modify({ isPrimary: false })
    await db.scans.update(scanId, { isPrimary: true })
    allScans.value = allScans.value.map((scan) => {
      if (scan.sheetId !== target.sheetId) {
        return scan
      }
      return { ...scan, isPrimary: scan.id === scanId }
    })
    return applyFinalizationCheck(target.sheetId)
  }

  async function updateSheetStatus(sheetId: string, status: SheetStatus): Promise<void> {
    await db.sheets.update(sheetId, { status })
    sheets.value = sheets.value.map((sheet) => (sheet.id === sheetId ? { ...sheet, status } : sheet))
    if (currentSheet.value?.id === sheetId) {
      currentSheet.value = { ...currentSheet.value, status }
    }
  }

  /**
   * 定编校核：主用件不达标时把已编图幅退回待核。
   * 返回校核结果，页面据此写明哪一件未达要求。
   */
  async function applyFinalizationCheck(sheetId: string): Promise<PrimaryScanIssue | null> {
    const sheet = sheets.value.find((item) => item.id === sheetId)
    const primary = allScans.value.find((scan) => scan.sheetId === sheetId && scan.isPrimary)
    const issue = checkPrimaryScan(primary)
    if (issue && sheet?.status === '已编') {
      await updateSheetStatus(sheetId, '待核')
    }
    return issue
  }

  /** 重新定编：待核图幅换回合格主用件后恢复已编。 */
  async function finalizeSheet(sheetId: string): Promise<boolean> {
    await init()
    const sheet = sheets.value.find((item) => item.id === sheetId)
    if (!sheet || sheet.status !== '待核') {
      return false
    }
    const primary = allScans.value.find((scan) => scan.sheetId === sheetId && scan.isPrimary)
    if (!primary || checkPrimaryScan(primary)) {
      return false
    }
    await updateSheetStatus(sheetId, '已编')
    return true
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
    finalizeSheet,
    getSheetById,
    getSheetByCode,
    getScansForSheet,
  }
})
