/**
 * 动作库种子数据（F9）。
 *
 * 覆盖六大肌群（胸 / 背 / 腿 / 肩 / 手臂 / 核心）与常见器械（杠铃 / 哑铃 / 徒手 / 器械 / 绳索），
 * 用户在训练记录里按名字搜索选择，不用再手打动作名。
 * 名字用健身房日常叫法，不追求教科书命名。
 */
export interface ExerciseSeed {
  name: string;
  muscleGroup: string;
  equipment: string;
}

export const MUSCLE_GROUPS = ['胸', '背', '腿', '肩', '手臂', '核心', '有氧'] as const;

export const EQUIPMENTS = ['杠铃', '哑铃', '徒手', '器械', '绳索'] as const;

export const EXERCISE_SEEDS: ExerciseSeed[] = [
  // ---------- 胸 ----------
  { name: '杠铃卧推', muscleGroup: '胸', equipment: '杠铃' },
  { name: '上斜杠铃卧推', muscleGroup: '胸', equipment: '杠铃' },
  { name: '下斜杠铃卧推', muscleGroup: '胸', equipment: '杠铃' },
  { name: '哑铃卧推', muscleGroup: '胸', equipment: '哑铃' },
  { name: '上斜哑铃卧推', muscleGroup: '胸', equipment: '哑铃' },
  { name: '哑铃飞鸟', muscleGroup: '胸', equipment: '哑铃' },
  { name: '绳索夹胸', muscleGroup: '胸', equipment: '绳索' },
  { name: '蝴蝶机夹胸', muscleGroup: '胸', equipment: '器械' },
  { name: '俯卧撑', muscleGroup: '胸', equipment: '徒手' },
  { name: '双杠臂屈伸', muscleGroup: '胸', equipment: '徒手' },

  // ---------- 背 ----------
  { name: '引体向上', muscleGroup: '背', equipment: '徒手' },
  { name: '反手引体向上', muscleGroup: '背', equipment: '徒手' },
  { name: '杠铃划船', muscleGroup: '背', equipment: '杠铃' },
  { name: 'T杠划船', muscleGroup: '背', equipment: '杠铃' },
  { name: '潘德雷划船', muscleGroup: '背', equipment: '杠铃' },
  { name: '哑铃单臂划船', muscleGroup: '背', equipment: '哑铃' },
  { name: '哑铃俯身飞鸟', muscleGroup: '背', equipment: '哑铃' },
  { name: '高位下拉', muscleGroup: '背', equipment: '器械' },
  { name: '坐姿绳索划船', muscleGroup: '背', equipment: '绳索' },
  { name: '直臂下压', muscleGroup: '背', equipment: '绳索' },
  { name: '硬拉', muscleGroup: '背', equipment: '杠铃' },

  // ---------- 腿 ----------
  { name: '杠铃深蹲', muscleGroup: '腿', equipment: '杠铃' },
  { name: '前蹲', muscleGroup: '腿', equipment: '杠铃' },
  { name: '箱式深蹲', muscleGroup: '腿', equipment: '杠铃' },
  { name: '高脚杯深蹲', muscleGroup: '腿', equipment: '哑铃' },
  { name: '哑铃箭步蹲', muscleGroup: '腿', equipment: '哑铃' },
  { name: '保加利亚分腿蹲', muscleGroup: '腿', equipment: '哑铃' },
  { name: '罗马尼亚硬拉', muscleGroup: '腿', equipment: '杠铃' },
  { name: '臀推', muscleGroup: '腿', equipment: '杠铃' },
  { name: '腿举', muscleGroup: '腿', equipment: '器械' },
  { name: '哈克深蹲', muscleGroup: '腿', equipment: '器械' },
  { name: '腿屈伸', muscleGroup: '腿', equipment: '器械' },
  { name: '俯卧腿弯举', muscleGroup: '腿', equipment: '器械' },
  { name: '坐姿提踵', muscleGroup: '腿', equipment: '器械' },
  { name: '站姿提踵', muscleGroup: '腿', equipment: '徒手' },
  { name: '深蹲跳', muscleGroup: '腿', equipment: '徒手' },

  // ---------- 肩 ----------
  { name: '杠铃站姿推举', muscleGroup: '肩', equipment: '杠铃' },
  { name: '坐姿杠铃推举', muscleGroup: '肩', equipment: '杠铃' },
  { name: '哑铃坐姿推举', muscleGroup: '肩', equipment: '哑铃' },
  { name: '阿诺德推举', muscleGroup: '肩', equipment: '哑铃' },
  { name: '哑铃侧平举', muscleGroup: '肩', equipment: '哑铃' },
  { name: '哑铃前平举', muscleGroup: '肩', equipment: '哑铃' },
  { name: '俯身反向飞鸟', muscleGroup: '肩', equipment: '哑铃' },
  { name: '直立划船', muscleGroup: '肩', equipment: '杠铃' },
  { name: '绳索面拉', muscleGroup: '肩', equipment: '绳索' },
  { name: '绳索侧平举', muscleGroup: '肩', equipment: '绳索' },

  // ---------- 手臂 ----------
  { name: '杠铃弯举', muscleGroup: '手臂', equipment: '杠铃' },
  { name: '曲杆弯举', muscleGroup: '手臂', equipment: '杠铃' },
  { name: '反握弯举', muscleGroup: '手臂', equipment: '杠铃' },
  { name: '哑铃弯举', muscleGroup: '手臂', equipment: '哑铃' },
  { name: '锤式弯举', muscleGroup: '手臂', equipment: '哑铃' },
  { name: '上斜哑铃弯举', muscleGroup: '手臂', equipment: '哑铃' },
  { name: '集中弯举', muscleGroup: '手臂', equipment: '哑铃' },
  { name: '绳索弯举', muscleGroup: '手臂', equipment: '绳索' },
  { name: '窄距卧推', muscleGroup: '手臂', equipment: '杠铃' },
  { name: '仰卧杠铃臂屈伸', muscleGroup: '手臂', equipment: '杠铃' },
  { name: '哑铃颈后臂屈伸', muscleGroup: '手臂', equipment: '哑铃' },
  { name: '绳索下压', muscleGroup: '手臂', equipment: '绳索' },
  { name: '哑铃腕弯举', muscleGroup: '手臂', equipment: '哑铃' },

  // ---------- 核心 ----------
  { name: '平板支撑', muscleGroup: '核心', equipment: '徒手' },
  { name: '侧平板支撑', muscleGroup: '核心', equipment: '徒手' },
  { name: '卷腹', muscleGroup: '核心', equipment: '徒手' },
  { name: '仰卧举腿', muscleGroup: '核心', equipment: '徒手' },
  { name: '俄罗斯转体', muscleGroup: '核心', equipment: '徒手' },
  { name: '死虫式', muscleGroup: '核心', equipment: '徒手' },
  { name: '悬垂举腿', muscleGroup: '核心', equipment: '徒手' },
  { name: '健腹轮', muscleGroup: '核心', equipment: '器械' },
  { name: '山羊挺身', muscleGroup: '核心', equipment: '器械' },
  { name: '绳索卷腹', muscleGroup: '核心', equipment: '绳索' },

  // ---------- 有氧 ----------
  { name: '跑步机慢跑', muscleGroup: '有氧', equipment: '器械' },
  { name: '划船机', muscleGroup: '有氧', equipment: '器械' },
  { name: '椭圆机', muscleGroup: '有氧', equipment: '器械' },
  { name: '动感单车', muscleGroup: '有氧', equipment: '器械' },
  { name: '跳绳', muscleGroup: '有氧', equipment: '徒手' },
  { name: '波比跳', muscleGroup: '有氧', equipment: '徒手' },
  { name: '壶铃摆荡', muscleGroup: '有氧', equipment: '器械' },
  { name: '农夫行走', muscleGroup: '有氧', equipment: '器械' },
  { name: '战绳', muscleGroup: '有氧', equipment: '器械' },
];
