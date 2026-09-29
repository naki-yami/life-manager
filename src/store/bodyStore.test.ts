import { beforeEach, describe, expect, it } from 'vitest';
import { useBodyStore } from './bodyStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { MAX_BODY_READING } from '../utils/body';

const store = () => useBodyStore.getState();
const first = () => store().records[0]!;

beforeEach(() => {
  localStorage.clear();
  useBodyStore.setState({ records: [] });
});

describe('bodyStore 按日期写入', () => {
  it('新增一条记录会保留体重、体脂与围度', () => {
    store().saveRecord({
      date: '2026-09-29',
      weight: 70.4,
      bodyFat: 18.2,
      measurements: { waist: 80.5, chest: 95 },
    });

    expect(store().records).toHaveLength(1);
    expect(first()).toMatchObject({
      date: '2026-09-29',
      weight: 70.4,
      bodyFat: 18.2,
      measurements: { waist: 80.5, chest: 95 },
    });
    expect(first().id).toBeTruthy();
    expect(first().createdAt).toBeTruthy();
  });

  it('同一天再保存是更新而不是新增，id 与创建时间保持不变', () => {
    store().saveRecord({ date: '2026-09-29', weight: 70 });
    const before = { id: first().id, createdAt: first().createdAt };

    store().saveRecord({ date: '2026-09-29', weight: 69.5, measurements: { waist: 79 } });

    expect(store().records).toHaveLength(1);
    expect(first().id).toBe(before.id);
    expect(first().createdAt).toBe(before.createdAt);
    expect(first().weight).toBe(69.5);
    expect(first().measurements).toEqual({ waist: 79 });
  });

  it('没填的项不会写成 0', () => {
    store().saveRecord({ date: '2026-09-29', weight: 70 });

    expect(first().weight).toBe(70);
    expect(first().bodyFat).toBeUndefined();
    expect(first().measurements).toEqual({});
  });

  it('把一天的值全部清空等于删掉那天的记录', () => {
    store().saveRecord({ date: '2026-09-29', weight: 70 });
    expect(store().records).toHaveLength(1);

    store().saveRecord({ date: '2026-09-29' });

    expect(store().records).toHaveLength(0);
  });

  it('非法日期不写入，避免出现定位不了的记录', () => {
    store().saveRecord({ date: '2026/09/29', weight: 70 });
    store().saveRecord({ date: '', weight: 70 });

    expect(store().records).toHaveLength(0);
  });

  it('读数清洗：非正数收成 undefined，超上限按上限收，脏围度键被丢掉', () => {
    store().saveRecord({
      date: '2026-09-29',
      weight: 900,
      bodyFat: 0,
      measurements: { waist: -1, chest: 95.44, '   ': 80, oops: Number.NaN },
    });

    expect(first().weight).toBe(MAX_BODY_READING);
    expect(first().bodyFat).toBeUndefined();
    expect(first().measurements).toEqual({ chest: 95.4 });
  });

  it('deleteRecord 按 id 删除，replaceRecords 整表替换', () => {
    store().saveRecord({ date: '2026-09-01', weight: 70 });
    store().saveRecord({ date: '2026-09-02', weight: 69 });
    store().deleteRecord(first().id);
    expect(store().records.map((record) => record.date)).toEqual(['2026-09-02']);

    store().replaceRecords([
      {
        id: 'b1',
        date: '2026-08-01',
        measurements: {},
        createdAt: '2026-08-01T09:00:00.000Z',
      },
    ]);
    expect(store().records).toHaveLength(1);
    expect(store().records[0]!.id).toBe('b1');
  });
});

describe('持久化与归一化', () => {
  it('写入 lm:body，读数与围度一起落盘', () => {
    store().saveRecord({ date: '2026-09-29', weight: 70.4, measurements: { waist: 80 } });

    const raw = localStorage.getItem(STORAGE_KEYS.body);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as {
      state: { records: Array<{ weight: number; measurements: Record<string, number> }> };
    };
    expect(parsed.state.records[0]!.weight).toBe(70.4);
    expect(parsed.state.records[0]!.measurements).toEqual({ waist: 80 });
  });

  it('旧数据缺字段时按 schema 补齐', async () => {
    localStorage.setItem(
      STORAGE_KEYS.body,
      JSON.stringify({
        state: { records: [{ id: 'b1', date: '2026-09-29', weight: 70 }] },
        version: 11,
      }),
    );

    await useBodyStore.persist.rehydrate();

    const record = first();
    expect(record).toMatchObject({ id: 'b1', date: '2026-09-29', weight: 70, measurements: {} });
    expect(record.createdAt).toBeTruthy();
  });

  it('脏读数在归一化时被清掉，坏日期的记录被丢弃', async () => {
    localStorage.setItem(
      STORAGE_KEYS.body,
      JSON.stringify({
        state: {
          records: [
            {
              id: 'b1',
              date: '2026-09-29',
              weight: '很重',
              bodyFat: 18,
              measurements: { waist: 80, bad: 'x' },
              createdAt: '2026-09-29T09:00:00.000Z',
            },
            { id: 'b2', date: '2026/09/28', weight: 70, measurements: {} },
          ],
        },
        version: 11,
      }),
    );

    await useBodyStore.persist.rehydrate();

    expect(store().records).toHaveLength(1);
    expect(first().id).toBe('b1');
    expect(first().weight).toBeUndefined();
    expect(first().bodyFat).toBe(18);
    expect(first().measurements).toEqual({ waist: 80 });
  });
});
