import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { Sheet } from '../types/sheet'
import { useSheetStore } from '../stores/sheetStore'
import { checkPrimaryScan, type PrimaryCheckResult } from '../utils/validation'

export const NEIGHBOR_DIRECTIONS = ['东', '南', '西', '北', '东北', '西南'] as const
export type NeighborDirection = (typeof NEIGHBOR_DIRECTIONS)[number]

export interface NeighborEntry {
  code: string
  direction: NeighborDirection
  sheet?: Sheet
  /** 邻接图主用件的定编校核结果；缺编图幅没有该结果。 */
  primaryCheck?: PrimaryCheckResult
}

export interface NeighborStatus {
  source?: Sheet
  entries: NeighborEntry[]
  missingCodes: string[]
  adjacentCount: number
  /** 馆藏齐备：已建档且主用件通过定编校核（≥400dpi 且非破损）的邻接图。 */
  completeCount: number
  /** 已建档但主用件未通过定编校核、不能计入齐备的邻接图。 */
  unreviewedEntries: NeighborEntry[]
}

export function useSheetNeighbors(sheetId: MaybeRefOrGetter<string>) {
  const sheetStore = useSheetStore()

  function getNeighborStatus(id: string): NeighborStatus {
    const source = sheetStore.getSheetById(id)
    const entries = (source?.neighborCodes ?? []).map((code, index) => {
      const sheet = sheetStore.getSheetByCode(code)
      const primaryCheck = sheet ? checkPrimaryScan(sheetStore.getScansForSheet(sheet.id)) : undefined
      return {
        code,
        direction: NEIGHBOR_DIRECTIONS[index] ?? NEIGHBOR_DIRECTIONS[0],
        ...(sheet ? { sheet } : {}),
        ...(primaryCheck ? { primaryCheck } : {}),
      }
    })
    const missingCodes = entries.filter((entry) => !entry.sheet).map((entry) => entry.code)
    const completeCount = entries.filter((entry) => entry.primaryCheck?.qualified).length
    const unreviewedEntries = entries.filter(
      (entry) => entry.sheet && entry.primaryCheck && !entry.primaryCheck.qualified,
    )

    return {
      ...(source ? { source } : {}),
      entries,
      missingCodes,
      adjacentCount: entries.length,
      completeCount,
      unreviewedEntries,
    }
  }

  const status = computed(() => getNeighborStatus(toValue(sheetId)))

  return {
    status,
    getNeighborStatus,
  }
}
