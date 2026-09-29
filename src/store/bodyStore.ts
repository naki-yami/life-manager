import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BodyMetric } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { hasAnyValue, readMetric, sanitizeMeasurements } from '../utils/body';
import { isDayKey } from '../utils/date';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { bodyMetricSchema } from '../services/schemas';

/**
 * 身体指标：一天最多一条。
 *
 * 为什么按日期写入（upsert）而不是「新增一条流水」：
 * 体重 / 围度是「每天量一次」的读数，同一天记两次多半是**修正**而不是两次测量。
 * 让 date 当主键，改一天的数据就是改那一条，历史里不会出现两条同日记录
 * 把趋势图连成锯齿，「较上次」也不会拿同一天的两个值去比。
 */
export interface BodyInput {
  date: string;
  weight?: number;
  bodyFat?: number;
  measurements?: Record<string, number>;
}

interface BodyState {
  records: BodyMetric[];
  /** 按日期写入：那天已有记录就更新，没有就新增；全空则等于删除那天 */
  saveRecord: (input: BodyInput) => void;
  deleteRecord: (id: string) => void;
  replaceRecords: (records: BodyMetric[]) => void;
}

const defaultState = { records: [] as BodyMetric[] };

export const useBodyStore = create<BodyState>()(
  persist(
    (set) => ({
      ...defaultState,
      saveRecord: ({ date, weight, bodyFat, measurements: rawMeasurements }) =>
        set((state) => {
          if (!isDayKey(date)) return state;
          const next: BodyMetric = {
            id: createId(),
            date,
            weight: readMetric(weight, 'weight'),
            bodyFat: readMetric(bodyFat, 'bodyFat'),
            measurements: sanitizeMeasurements(rawMeasurements ?? {}),
            createdAt: new Date().toISOString(),
          };

          // 把一天的数据全清空 = 删掉那天的记录，而不是留一条空壳在趋势里占位
          if (!hasAnyValue(next)) {
            return { records: state.records.filter((record) => record.date !== date) };
          }

          const existing = state.records.find((record) => record.date === date);
          if (!existing) return { records: [...state.records, next] };

          // 更新时保留原来的 id 与创建时间：记录的身份与「什么时候第一次量的」都不该被改写
          return {
            records: state.records.map((record) =>
              record.date === date
                ? { ...next, id: record.id, createdAt: record.createdAt }
                : record,
            ),
          };
        }),
      deleteRecord: (id) =>
        set((state) => ({ records: state.records.filter((record) => record.id !== id) })),
      replaceRecords: (records) => set({ records }),
    }),
    persistOptions<BodyState, Pick<BodyState, 'records'>>({
      name: STORAGE_KEYS.body,
      partialize: (state) => ({ records: state.records }),
      normalize: (persisted) => ({
        records: normalizeArray(bodyMetricSchema, asRecord(persisted).records),
      }),
    }),
  ),
);
