import type { FoodCategory } from './foodCategories';

/**
 * 食物库种子数据（F9）。
 *
 * 数值按 **每 100g 可食部分** 记（热量 kcal，蛋白 / 碳水 / 脂肪 g），
 * 是最标准的口径：选进来之后按实际吃的量改数字就行。
 * 数据是常见食物的公开营养近似值，够日常记录用，不追求实验室精度。
 */
export interface FoodSeed {
  name: string;
  category: FoodCategory;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const FOOD_SEEDS: FoodSeed[] = [
  // ---------- 主食 ----------
  { name: '米饭', category: '主食', calories: 116, protein: 2.6, carbs: 25.9, fat: 0.3 },
  { name: '馒头', category: '主食', calories: 223, protein: 7, carbs: 47, fat: 1.1 },
  { name: '面条（煮）', category: '主食', calories: 110, protein: 3.6, carbs: 22.8, fat: 0.4 },
  { name: '全麦面包', category: '主食', calories: 246, protein: 10.4, carbs: 45.6, fat: 3.4 },
  { name: '白面包', category: '主食', calories: 266, protein: 8.2, carbs: 49, fat: 3.2 },
  { name: '燕麦片（干）', category: '主食', calories: 367, protein: 15, carbs: 61, fat: 7 },
  { name: '玉米（鲜）', category: '主食', calories: 112, protein: 4, carbs: 22.8, fat: 1.2 },
  { name: '红薯', category: '主食', calories: 86, protein: 1.6, carbs: 20.1, fat: 0.1 },
  { name: '紫薯', category: '主食', calories: 82, protein: 1.3, carbs: 18.5, fat: 0.2 },
  { name: '土豆', category: '主食', calories: 77, protein: 2, carbs: 17.2, fat: 0.1 },
  { name: '山药', category: '主食', calories: 57, protein: 1.9, carbs: 12.4, fat: 0.2 },
  { name: '小米粥', category: '主食', calories: 46, protein: 1.4, carbs: 9.7, fat: 0.7 },
  { name: '糙米饭', category: '主食', calories: 112, protein: 2.6, carbs: 23.5, fat: 0.9 },
  { name: '糯米饭', category: '主食', calories: 116, protein: 2.7, carbs: 25.7, fat: 0.3 },
  { name: '饺子（猪肉）', category: '主食', calories: 231, protein: 8.5, carbs: 28, fat: 9.5 },
  { name: '包子（猪肉）', category: '主食', calories: 227, protein: 8.1, carbs: 30, fat: 8.6 },
  { name: '油条', category: '主食', calories: 388, protein: 6.9, carbs: 51, fat: 17.6 },
  { name: '披萨', category: '主食', calories: 266, protein: 11, carbs: 33, fat: 10 },
  { name: '汉堡（牛肉）', category: '主食', calories: 295, protein: 17, carbs: 24, fat: 14 },
  { name: '意面（煮）', category: '主食', calories: 131, protein: 5, carbs: 25, fat: 1.1 },

  // ---------- 蛋白质 ----------
  { name: '鸡胸肉', category: '蛋白质', calories: 133, protein: 24.6, carbs: 2.5, fat: 3.4 },
  { name: '鸡腿肉（去皮）', category: '蛋白质', calories: 146, protein: 20.9, carbs: 0, fat: 6.7 },
  { name: '鸡翅', category: '蛋白质', calories: 194, protein: 17.4, carbs: 1.5, fat: 11.8 },
  { name: '烤鸡（带皮）', category: '蛋白质', calories: 239, protein: 27, carbs: 0, fat: 14 },
  { name: '牛腱子', category: '蛋白质', calories: 98, protein: 20.3, carbs: 1.2, fat: 1.3 },
  { name: '牛里脊', category: '蛋白质', calories: 107, protein: 22.2, carbs: 0.9, fat: 0.9 },
  { name: '肥牛卷', category: '蛋白质', calories: 274, protein: 15, carbs: 1, fat: 23 },
  { name: '猪里脊', category: '蛋白质', calories: 155, protein: 20.2, carbs: 0.7, fat: 7.9 },
  { name: '猪五花肉', category: '蛋白质', calories: 568, protein: 9.3, carbs: 0, fat: 59 },
  { name: '排骨', category: '蛋白质', calories: 278, protein: 16.7, carbs: 0.7, fat: 23.1 },
  { name: '羊肉（瘦）', category: '蛋白质', calories: 118, protein: 20.5, carbs: 0.2, fat: 3.9 },
  { name: '培根', category: '蛋白质', calories: 541, protein: 37, carbs: 1.4, fat: 42 },
  { name: '火腿肠', category: '蛋白质', calories: 212, protein: 14, carbs: 15.6, fat: 10.4 },
  { name: '鸡蛋', category: '蛋白质', calories: 144, protein: 13.3, carbs: 2.8, fat: 8.8 },
  { name: '鸡蛋白', category: '蛋白质', calories: 60, protein: 11.6, carbs: 3.1, fat: 0.1 },
  { name: '鸭蛋', category: '蛋白质', calories: 180, protein: 12.6, carbs: 3.1, fat: 13 },
  { name: '带鱼', category: '蛋白质', calories: 127, protein: 17.7, carbs: 3.1, fat: 4.9 },
  { name: '三文鱼', category: '蛋白质', calories: 139, protein: 17.2, carbs: 0, fat: 7.8 },
  { name: '金枪鱼', category: '蛋白质', calories: 132, protein: 28, carbs: 0, fat: 1.3 },
  { name: '鲈鱼', category: '蛋白质', calories: 105, protein: 18.6, carbs: 0, fat: 3.4 },
  { name: '鲫鱼', category: '蛋白质', calories: 108, protein: 17.1, carbs: 3.8, fat: 2.7 },
  { name: '虾', category: '蛋白质', calories: 93, protein: 18.6, carbs: 2.8, fat: 0.8 },
  { name: '虾仁', category: '蛋白质', calories: 48, protein: 10.4, carbs: 0, fat: 0.7 },
  { name: '蟹肉', category: '蛋白质', calories: 62, protein: 11.6, carbs: 1.1, fat: 1.2 },
  { name: '鱿鱼', category: '蛋白质', calories: 84, protein: 17.4, carbs: 0, fat: 1.6 },
  { name: '豆腐', category: '蛋白质', calories: 81, protein: 8.1, carbs: 4.2, fat: 3.7 },
  { name: '豆腐干', category: '蛋白质', calories: 140, protein: 16.2, carbs: 4.6, fat: 5.7 },
  { name: '腐竹', category: '蛋白质', calories: 459, protein: 44.6, carbs: 22.3, fat: 21.7 },
  { name: '豆浆（无糖）', category: '蛋白质', calories: 31, protein: 3, carbs: 1.2, fat: 1.6 },
  { name: '黄豆（干）', category: '蛋白质', calories: 390, protein: 35, carbs: 34.2, fat: 16 },
  { name: '毛豆', category: '蛋白质', calories: 131, protein: 13.1, carbs: 10.5, fat: 5 },
  { name: '鹰嘴豆（煮）', category: '蛋白质', calories: 164, protein: 8.9, carbs: 27.4, fat: 2.6 },

  // ---------- 蔬菜 ----------
  { name: '西兰花', category: '蔬菜', calories: 36, protein: 4.1, carbs: 4.3, fat: 0.6 },
  { name: '菠菜', category: '蔬菜', calories: 28, protein: 2.6, carbs: 4.5, fat: 0.3 },
  { name: '生菜', category: '蔬菜', calories: 16, protein: 1.3, carbs: 2, fat: 0.2 },
  { name: '油麦菜', category: '蔬菜', calories: 15, protein: 1.4, carbs: 2.1, fat: 0.4 },
  { name: '白菜', category: '蔬菜', calories: 20, protein: 1.6, carbs: 3.4, fat: 0.2 },
  { name: '上海青', category: '蔬菜', calories: 15, protein: 1.4, carbs: 2.3, fat: 0.3 },
  { name: '芹菜', category: '蔬菜', calories: 22, protein: 1.2, carbs: 4.5, fat: 0.2 },
  { name: '黄瓜', category: '蔬菜', calories: 16, protein: 0.8, carbs: 2.9, fat: 0.2 },
  { name: '番茄', category: '蔬菜', calories: 20, protein: 0.9, carbs: 4, fat: 0.2 },
  { name: '胡萝卜', category: '蔬菜', calories: 39, protein: 1, carbs: 8.8, fat: 0.2 },
  { name: '白萝卜', category: '蔬菜', calories: 23, protein: 0.9, carbs: 5, fat: 0.1 },
  { name: '茄子', category: '蔬菜', calories: 23, protein: 1.1, carbs: 4.9, fat: 0.2 },
  { name: '豆芽', category: '蔬菜', calories: 18, protein: 1.9, carbs: 2.9, fat: 0.1 },
  { name: '青椒', category: '蔬菜', calories: 22, protein: 1.4, carbs: 5.4, fat: 0.3 },
  { name: '洋葱', category: '蔬菜', calories: 40, protein: 1.1, carbs: 9, fat: 0.2 },
  { name: '香菇', category: '蔬菜', calories: 26, protein: 2.2, carbs: 5.2, fat: 0.3 },
  { name: '金针菇', category: '蔬菜', calories: 32, protein: 2.4, carbs: 6, fat: 0.4 },
  { name: '杏鲍菇', category: '蔬菜', calories: 35, protein: 1.3, carbs: 8.3, fat: 0.1 },
  { name: '海带（鲜）', category: '蔬菜', calories: 13, protein: 1.2, carbs: 2.1, fat: 0.1 },
  { name: '紫菜（干）', category: '蔬菜', calories: 250, protein: 26.7, carbs: 44.1, fat: 1.1 },
  { name: '芦笋', category: '蔬菜', calories: 19, protein: 2.2, carbs: 3, fat: 0.1 },
  { name: '秋葵', category: '蔬菜', calories: 45, protein: 2, carbs: 11, fat: 0.1 },

  // ---------- 水果 ----------
  { name: '苹果', category: '水果', calories: 53, protein: 0.4, carbs: 13.7, fat: 0.2 },
  { name: '香蕉', category: '水果', calories: 93, protein: 1.4, carbs: 22, fat: 0.2 },
  { name: '橙子', category: '水果', calories: 48, protein: 0.8, carbs: 11.1, fat: 0.2 },
  { name: '橘子', category: '水果', calories: 44, protein: 0.8, carbs: 10.2, fat: 0.1 },
  { name: '葡萄', category: '水果', calories: 45, protein: 0.4, carbs: 10.3, fat: 0.3 },
  { name: '西瓜', category: '水果', calories: 26, protein: 0.5, carbs: 5.8, fat: 0.1 },
  { name: '桃子', category: '水果', calories: 42, protein: 0.6, carbs: 10.1, fat: 0.1 },
  { name: '梨', category: '水果', calories: 44, protein: 0.4, carbs: 11.6, fat: 0.2 },
  { name: '芒果', category: '水果', calories: 35, protein: 0.6, carbs: 8.3, fat: 0.2 },
  { name: '猕猴桃', category: '水果', calories: 61, protein: 0.8, carbs: 14.5, fat: 0.6 },
  { name: '草莓', category: '水果', calories: 32, protein: 1, carbs: 7.1, fat: 0.2 },
  { name: '蓝莓', category: '水果', calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3 },
  { name: '火龙果', category: '水果', calories: 55, protein: 1.1, carbs: 13.3, fat: 0.2 },
  { name: '菠萝', category: '水果', calories: 44, protein: 0.5, carbs: 10.8, fat: 0.1 },
  { name: '榴莲', category: '水果', calories: 150, protein: 2.6, carbs: 28.3, fat: 3.3 },
  { name: '牛油果', category: '水果', calories: 161, protein: 2, carbs: 7.4, fat: 15.3 },
  { name: '红枣（鲜）', category: '水果', calories: 125, protein: 1.1, carbs: 30.5, fat: 0.3 },

  // ---------- 乳制品 ----------
  { name: '牛奶（全脂）', category: '乳制品', calories: 65, protein: 3.3, carbs: 3.4, fat: 3.9 },
  { name: '牛奶（脱脂）', category: '乳制品', calories: 34, protein: 3.4, carbs: 5, fat: 0.1 },
  { name: '酸奶（无糖）', category: '乳制品', calories: 62, protein: 3.5, carbs: 4.7, fat: 3.3 },
  { name: '希腊酸奶', category: '乳制品', calories: 97, protein: 9, carbs: 3.9, fat: 5 },
  { name: '奶酪（切达）', category: '乳制品', calories: 402, protein: 25, carbs: 1.3, fat: 33 },
  { name: '马苏里拉', category: '乳制品', calories: 280, protein: 28, carbs: 2.2, fat: 17 },
  { name: '黄油', category: '乳制品', calories: 888, protein: 0.5, carbs: 0.1, fat: 98 },
  { name: '奶油（淡）', category: '乳制品', calories: 337, protein: 2.5, carbs: 2.7, fat: 36 },

  // ---------- 饮品 ----------
  { name: '美式咖啡', category: '饮品', calories: 2, protein: 0.1, carbs: 0, fat: 0 },
  { name: '拿铁（全脂奶）', category: '饮品', calories: 43, protein: 2.3, carbs: 3.7, fat: 2.1 },
  { name: '可乐', category: '饮品', calories: 43, protein: 0, carbs: 10.6, fat: 0 },
  { name: '无糖可乐', category: '饮品', calories: 0, protein: 0, carbs: 0, fat: 0 },
  { name: '橙汁（100%）', category: '饮品', calories: 45, protein: 0.7, carbs: 10.4, fat: 0.2 },
  { name: '啤酒', category: '饮品', calories: 43, protein: 0.5, carbs: 3.6, fat: 0 },
  { name: '红酒', category: '饮品', calories: 85, protein: 0.1, carbs: 2.6, fat: 0 },
  { name: '白酒（52度）', category: '饮品', calories: 311, protein: 0, carbs: 0, fat: 0 },
  { name: '奶茶（全糖）', category: '饮品', calories: 75, protein: 1.2, carbs: 13, fat: 2 },
  { name: '运动饮料', category: '饮品', calories: 26, protein: 0, carbs: 6.5, fat: 0 },
  { name: '蛋白粉（乳清，冲好）', category: '饮品', calories: 40, protein: 8, carbs: 1, fat: 0.5 },

  // ---------- 零食 ----------
  { name: '薯片', category: '零食', calories: 548, protein: 7, carbs: 49, fat: 37 },
  { name: '巧克力（牛奶）', category: '零食', calories: 535, protein: 6.9, carbs: 59, fat: 30 },
  { name: '黑巧克力（85%）', category: '零食', calories: 592, protein: 9.8, carbs: 30, fat: 46 },
  { name: '饼干', category: '零食', calories: 435, protein: 9, carbs: 71, fat: 13 },
  { name: '蛋糕', category: '零食', calories: 348, protein: 5.8, carbs: 67, fat: 5.1 },
  { name: '冰淇淋', category: '零食', calories: 207, protein: 3.5, carbs: 24, fat: 11 },
  { name: '坚果（混合）', category: '零食', calories: 607, protein: 20, carbs: 19, fat: 54 },
  { name: '核桃', category: '零食', calories: 646, protein: 14.9, carbs: 9.6, fat: 58.8 },
  { name: '花生', category: '零食', calories: 574, protein: 24.8, carbs: 21.7, fat: 44.3 },
  { name: '瓜子（葵花籽）', category: '零食', calories: 570, protein: 23.9, carbs: 12.5, fat: 49.3 },
  { name: '辣条', category: '零食', calories: 357, protein: 8, carbs: 51, fat: 13 },
  { name: '海苔（调味）', category: '零食', calories: 177, protein: 24, carbs: 20, fat: 2 },
  { name: '牛肉干', category: '零食', calories: 550, protein: 45, carbs: 8, fat: 40 },

  // ---------- 其他 ----------
  { name: '食用油', category: '其他', calories: 899, protein: 0, carbs: 0, fat: 99.9 },
  { name: '橄榄油', category: '其他', calories: 899, protein: 0, carbs: 0, fat: 100 },
  { name: '沙拉酱', category: '其他', calories: 680, protein: 1, carbs: 15, fat: 70 },
  { name: '番茄酱', category: '其他', calories: 83, protein: 1.2, carbs: 19, fat: 0.2 },
  { name: '蜂蜜', category: '其他', calories: 321, protein: 0.4, carbs: 75.6, fat: 1.9 },
  { name: '白糖', category: '其他', calories: 400, protein: 0, carbs: 99.9, fat: 0 },
  { name: '酱油', category: '其他', calories: 63, protein: 5.6, carbs: 10.1, fat: 0.1 },
  { name: '花生酱', category: '其他', calories: 594, protein: 25, carbs: 22, fat: 50 },
];
