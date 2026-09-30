import { beforeEach, describe, expect, it } from 'vitest';
import { allFoods, useLibraryStore } from './libraryStore';

beforeEach(() => {
  useLibraryStore.setState({ customFoods: [], customExercises: [] });
});

describe('libraryStore 自建食物', () => {
  it('添加后拼在种子前面，种子始终在库里', () => {
    useLibraryStore.getState().addCustomFood({
      name: '妈妈牌红烧肉',
      category: '其他',
      calories: 320,
      protein: 15,
      carbs: 8,
      fat: 26,
    });

    const all = allFoods(useLibraryStore.getState().customFoods);
    expect(all[0]!.name).toBe('妈妈牌红烧肉');
    expect(all.length).toBeGreaterThan(100);
    expect(all.some((food) => food.name === '鸡胸肉')).toBe(true);
  });

  it('同名去重（忽略首尾空格），重复时返回 duplicate', () => {
    const first = useLibraryStore.getState().addCustomFood({
      name: '私房菜',
      category: '其他',
      calories: 100,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(first).toBeUndefined();

    const second = useLibraryStore.getState().addCustomFood({
      name: '  私房菜  ',
      category: '其他',
      calories: 200,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(second).toBe('duplicate');
    expect(useLibraryStore.getState().customFoods).toHaveLength(1);
    // 保留的是第一次的名字（已去空格）
    expect(useLibraryStore.getState().customFoods[0]!.name).toBe('私房菜');
  });

  it('空名字不添加，删除按 id 走', () => {
    useLibraryStore.getState().addCustomFood({
      name: '  ',
      category: '其他',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(useLibraryStore.getState().customFoods).toHaveLength(0);

    useLibraryStore.getState().addCustomFood({
      name: '燕麦杯',
      category: '其他',
      calories: 150,
      protein: 6,
      carbs: 20,
      fat: 4,
    });
    const [food] = useLibraryStore.getState().customFoods;
    useLibraryStore.getState().deleteCustomFood(food!.id);
    expect(useLibraryStore.getState().customFoods).toHaveLength(0);
  });

  it('自建动作与自建食物互不影响，名字各自去重', () => {
    useLibraryStore.getState().addCustomExercise({ name: '上斜卧推', muscleGroup: '胸', equipment: '杠铃' });
    useLibraryStore.getState().addCustomExercise({ name: '上斜卧推', muscleGroup: '胸', equipment: '哑铃' });
    useLibraryStore.getState().addCustomFood({
      name: '上斜卧推',
      category: '其他',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });

    expect(useLibraryStore.getState().customExercises).toHaveLength(1);
    expect(useLibraryStore.getState().customFoods).toHaveLength(1);
  });
});
