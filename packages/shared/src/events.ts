import type { EventCondition, EventPack, MarketEvent, MarketState, PersonalEvent, PlayerState } from './types';

const pickOne = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!;

export const matchConditions = (
  conditions: EventCondition | undefined,
  player: PlayerState,
  market: MarketState,
  day: number
) => {
  if (!conditions) return true;
  if (conditions.minCash !== undefined && player.cash < conditions.minCash) return false;
  if (conditions.maxCash !== undefined && player.cash > conditions.maxCash) return false;
  if (conditions.minStress !== undefined && player.stress < conditions.minStress) return false;
  if (conditions.maxStress !== undefined && player.stress > conditions.maxStress) return false;
  if (conditions.minDay !== undefined && day < conditions.minDay) return false;
  if (conditions.maxDay !== undefined && day > conditions.maxDay) return false;
  if (conditions.phaseIn && !conditions.phaseIn.includes(market.phase)) return false;
  return true;
};

export const pickPersonalEvent = (
  pack: EventPack,
  player: PlayerState,
  market: MarketState,
  day: number,
  recentEvents: string[] = []
): PersonalEvent | null => {
  const valid = pack.personalEvents.filter((event) => {
    if (recentEvents.includes(event.id)) return false;
    return matchConditions(event.conditions, player, market, day);
  });

  if (!valid.length) return null;
  return pickOne(valid);
};

export const pickMarketEvent = (
  pack: EventPack,
  market: MarketState,
  day: number,
  recentEvents: string[] = []
): MarketEvent | null => {
  const valid = pack.marketEvents.filter((event) => {
    if (recentEvents.includes(event.id)) return false;
    return matchConditions(event.conditions, {
      id: 'market',
      name: 'market',
      roleKey: 'market',
      role: 'market',
      initialCash: 0,
      cash: 0,
      stress: 0,
      history: [],
      position: null,
      ready: false,
      status: 'ACTIVE',
    }, market, day);
  });

  if (!valid.length) return null;
  return pickOne(valid);
};

const PERSONAL_EVENTS: PersonalEvent[] = [
  {
    id: 'health-001',
    title: 'Gas 过敏',
    description: '连续盯盘 + 刷空投任务，你开始对“再点一次确认”过敏。',
    choices: [
      { id: 'A', text: '休息+买护眼灯', effect: { cash: -200 } },
      { id: 'B', text: '继续“再点一次确认”', effect: { cash: 0 } }
    ]
  },
  {
    id: 'stress-001',
    title: '头皮质押',
    description: '头发掉得像解锁进度条，你怀疑自己在质押头皮。',
    choices: [
      { id: 'A', text: '买生发盲盒', effect: { cash: -800 } },
      { id: 'B', text: '光头上链直播', effect: { cash: 300 } }
    ]
  },
  {
    id: 'kol-001',
    title: 'Space 喊单',
    description: '某大 V 开 Twitter Space，声音像白皮书一样厚。',
    choices: [
      { id: 'A', text: '跟单“试试”', effect: { cash: 500 } },
      { id: 'B', text: '反向被“教育”', effect: { cash: -400 } }
    ]
  },
  {
    id: 'faith-001',
    title: 'FUD 来袭',
    description: '群里传“跨链桥出事”，表情包都飞起来了。',
    choices: [
      { id: 'A', text: '恐慌止损', effect: { cash: -300 } },
      { id: 'B', text: '看链上数据再说', effect: { cash: 200 } }
    ]
  },
  {
    id: 'listing-001',
    title: '疑似上所',
    description: '有人截图“交易所小号暗示”，市场开始自嗨。',
    choices: [
      { id: 'A', text: '提前埋伏', effect: { cash: 700 } },
      { id: 'B', text: '继续等官宣', effect: { cash: -200 } }
    ]
  },
  {
    id: 'poor-001',
    title: 'Gas 费吃掉午饭',
    description: '转账一笔手续费比午饭还贵。',
    conditions: { maxCash: 100 },
    choices: [
      { id: 'A', text: '接个 Web3 外包', effect: { cash: 120 } },
      { id: 'B', text: '继续原地挖坑', effect: { cash: -30 } }
    ]
  },
  {
    id: 'club-001',
    title: '链上 Afterparty',
    description: '今晚“财富自由”群组织线下派对。',
    conditions: { minCash: 10000 },
    choices: [
      { id: 'A', text: '全场买单', effect: { cash: -2000 } },
      { id: 'B', text: '回家复盘', effect: { cash: 300 } }
    ]
  },
  {
    id: 'house-001',
    title: '拿币换房',
    description: '中介说可以 BTC 结算，语气比白皮书还自信。',
    conditions: { minCash: 50000 },
    choices: [
      { id: 'A', text: '首付打过去', effect: { cash: -50000 } },
      { id: 'B', text: '继续持币观望', effect: { cash: 0 } }
    ]
  },
  {
    id: 'ex-001',
    title: '前任来借 U',
    description: 'TA 说只是短借 USDT，真的。',
    conditions: { minCash: 5000 },
    choices: [
      { id: 'A', text: '转 888U', effect: { cash: -888 } },
      { id: 'B', text: '已读不回', effect: { cash: 200 } }
    ]
  },
  {
    id: 'match-001',
    title: '相亲问职业',
    description: '对方问你做什么，你脑内只有“链上”。',
    conditions: { minCash: 2000 },
    choices: [
      { id: 'A', text: '吹成“量化基金”', effect: { cash: -150 } },
      { id: 'B', text: '老实说“打工挖空投”', effect: { cash: 80 } }
    ]
  },
  {
    id: 'hack-001',
    title: '空投陷阱',
    description: '陌生人发来“只需签名即可领”的链接。',
    conditions: { minCash: 500 },
    choices: [
      { id: 'A', text: '一键授权', effect: { cash: -1000 } },
      { id: 'B', text: '报告钓鱼', effect: { cash: 50 } }
    ]
  },
  {
    id: 'loan-001',
    title: '质押借贷广告',
    description: '平台推送“0 抵押高额度”，听起来像诈骗。',
    conditions: { minCash: 1, maxCash: 500 },
    choices: [
      { id: 'A', text: '上杠杆冲一把', effect: { cash: 2000 } },
      { id: 'B', text: '关通知保命', effect: { cash: -100 } }
    ]
  },
  {
    id: 'pc-001',
    title: '节点宕机',
    description: '关键时刻电脑蓝屏，像你的验证节点。',
    choices: [
      { id: 'A', text: '紧急修机', effect: { cash: -600 } },
      { id: 'B', text: '借朋友设备', effect: { cash: -150 } }
    ]
  },
  {
    id: 'usb-001',
    title: '捡到助记词 U 盘',
    description: 'U 盘上写着“十二词，懂的来”。',
    choices: [
      { id: 'A', text: '插电脑中毒', effect: { cash: -400 } },
      { id: 'B', text: '上交二手店', effect: { cash: 100 } }
    ]
  }
];

const MARKET_EVENTS: MarketEvent[] = [
  {
    id: 'market-201',
    title: 'KOL 集体开麦',
    description: '全网 Space 开爆，情绪直接拉满。',
    effect: { phase: 'PUMP', volatilityDelta: 0.03 }
  },
  {
    id: 'market-202',
    title: '交易所小号暗示',
    description: '官推点赞 + 神秘表情包，群里直接起飞。',
    effect: { phase: 'PUMP', volatilityDelta: 0.02 }
  },
  {
    id: 'market-203',
    title: '监管发声',
    description: '某地区放风收紧，市场瞬间降温。',
    effect: { phase: 'DUMP', volatilityDelta: 0.03 }
  },
  {
    id: 'market-204',
    title: '巨鲸搬砖',
    description: '链上监控报警，大额转入交易所。',
    effect: { phase: 'DUMP', volatilityDelta: 0.04 }
  },
  {
    id: 'market-205',
    title: '项目方回购',
    description: '国库回购上链，K 线开始拐头。',
    conditions: { phaseIn: ['Accumulation', 'PUMP', 'DUMP', 'MOON'] },
    effect: { phase: 'PUMP', volatilityDelta: 0.025 }
  }
];

const DAILY_EXPENSES = [
  { id: 'expense-01', label: '购买防脱洗发水', cost: 80 },
  { id: 'expense-02', label: '请群友喝奶茶', cost: 120 },
  { id: 'expense-03', label: '充值梯子会员', cost: 50 },
  { id: 'expense-04', label: '点了一份豪华外卖', cost: 60 },
  { id: 'expense-05', label: '给女主播刷礼物', cost: 200 },
  { id: 'expense-06', label: '购买硬件钱包', cost: 150 },
  { id: 'expense-07', label: '参加线下聚会', cost: 300 },
  { id: 'expense-08', label: '缴纳宽带费', cost: 100 },
  { id: 'expense-09', label: '购买精神食粮(游戏)', cost: 70 },
  { id: 'expense-10', label: '去医院挂号', cost: 50 }
];

export const CORE_PACK: EventPack = {
  id: 'core',
  name: 'Core Meme Pack',
  description: 'Base event pack with PK Candle flavor.',
  version: 1,
  settings: {
    personalEventMinMs: 45000,
    personalEventMaxMs: 80000,
    marketEventMinMs: 30000,
    marketEventMaxMs: 55000
  },
  personalEvents: PERSONAL_EVENTS,
  marketEvents: MARKET_EVENTS,
  dailyExpenses: DAILY_EXPENSES
};
