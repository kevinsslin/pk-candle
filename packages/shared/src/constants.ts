export type RoleKey =
  | 'WORKER'
  | 'STUDENT'
  | 'COLLEGE_BOY'
  | 'OG'
  | 'NOOB'
  | 'WOMITOUFU'
  | 'XIAOGUIZI'
  | 'JINGXIANG'
  | 'HOTBABY'
  | 'CONTRACT_GOD'
  | 'SIMP';

export const DEFAULT_ROLE_KEY: RoleKey = 'WORKER';

const BASE_ROLE_STATS = {
  initialCash: 5000,
};

export const ROLES: Record<RoleKey, {
  name: string;
  initialCash: number;
  desc: string;
}> = {
  WORKER: {
    name: '打工人',
    desc: '朝九晚五，积蓄尚可，家庭压力大。',
    ...BASE_ROLE_STATS
  },
  STUDENT: {
    name: '学生党',
    desc: '时间多，钱少，心态好。',
    ...BASE_ROLE_STATS
  },
  COLLEGE_BOY: {
    name: '极品男大学生',
    desc: '宿舍挖矿，食堂吃土，梦想是毕业即退休。',
    ...BASE_ROLE_STATS
  },
  OG: {
    name: '老韭菜',
    desc: '经历过牛熊，心态稳，但容易自负。',
    ...BASE_ROLE_STATS
  },
  NOOB: {
    name: 'Noob',
    desc: '什么都不懂，全靠运气，容易上头。',
    ...BASE_ROLE_STATS
  },
  WOMITOUFU: {
    name: '喔蜜豆腐',
    desc: '佛系持币，不悲不喜，随缘解套。',
    ...BASE_ROLE_STATS
  },
  XIAOGUIZI: {
    name: '小桂子',
    desc: '高杠杆爱好者，赢了会所嫩模，输了下海干活。',
    ...BASE_ROLE_STATS
  },
  JINGXIANG: {
    name: 'KOL 静香',
    desc: '颜值博主，粉丝众多，但容易被黑粉破防。',
    ...BASE_ROLE_STATS
  },
  HOTBABY: {
    name: 'KOL HotBaby',
    desc: '喊单机器，情绪极其不稳定，容易带崩全场。',
    ...BASE_ROLE_STATS
  },
  CONTRACT_GOD: {
    name: '余额疯涨-发誓不再玩合约',
    desc: '曾经的A8大佬，现在只剩100U，发誓最后一次。',
    ...BASE_ROLE_STATS
  },
  SIMP: {
    name: '是我喜欢转圈圈',
    desc: '她没有在耍我，她只是太忙了。',
    ...BASE_ROLE_STATS
  }
};

export const ROLE_LIST = Object.entries(ROLES).map(([key, role]) => ({
  key,
  ...role,
}));

export const TOKEN_NAMES = [
  'PEPE', 'DOGE', 'SHIB', 'ELON', 'MOON', 'SAFE', 'ROCKET', 'CAT', 'INU', 'CUM',
  'POGAI', 'LOWB', 'RATS', 'SATS', 'ORDI', 'TROLL', 'SQUID'
];

export const TOKEN_SUFFIXES = [
  'AI', 'GPT', '2.0', 'CEO', 'BABY', 'GOLD', 'DAO', 'FI', 'X', 'PRO', 'MAX'
];
