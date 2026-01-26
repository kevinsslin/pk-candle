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
    title: '身体不适',
    description: '连续盯盘过久，身体发出警告。',
    choices: [
      { id: 'A', text: '去医院体检', effect: { cash: -200 } },
      { id: 'B', text: '硬扛继续盯盘', effect: { cash: 0 } }
    ]
  },
  {
    id: 'stress-001',
    title: '脱发危机',
    description: '洗澡时头发掉了一地，你开始怀疑人生。',
    choices: [
      { id: 'A', text: '植发套餐', effect: { cash: -800 } },
      { id: 'B', text: '光头直播带货', effect: { cash: 300 } }
    ]
  },
  {
    id: 'kol-001',
    title: 'KOL 喊单',
    description: '推特大V突然喊单，群里瞬间炸锅。',
    choices: [
      { id: 'A', text: '跟单小赚', effect: { cash: 500 } },
      { id: 'B', text: '反向被套', effect: { cash: -400 } }
    ]
  },
  {
    id: 'faith-001',
    title: 'FUD 来袭',
    description: '群里传出项目方跑路的消息。',
    choices: [
      { id: 'A', text: '恐慌割肉', effect: { cash: -300 } },
      { id: 'B', text: '无视谣言', effect: { cash: 200 } }
    ]
  },
  {
    id: 'listing-001',
    title: '上币预热',
    description: '传闻交易所即将上架，市场热度飙升。',
    choices: [
      { id: 'A', text: '提前埋伏', effect: { cash: 700 } },
      { id: 'B', text: '错过车票', effect: { cash: -200 } }
    ]
  },
  {
    id: 'poor-001',
    title: '生活拮据',
    description: '泡面都吃不起了，要不要去打个工？',
    conditions: { maxCash: 100 },
    choices: [
      { id: 'A', text: '兼职补贴', effect: { cash: 120 } },
      { id: 'B', text: '继续躺平', effect: { cash: -30 } }
    ]
  },
  {
    id: 'club-001',
    title: '会所嫩模',
    description: '今晚赚麻了，兄弟们喊你去消费。',
    conditions: { minCash: 10000 },
    choices: [
      { id: 'A', text: '全场买单', effect: { cash: -2000 } },
      { id: 'B', text: '省钱复盘', effect: { cash: 300 } }
    ]
  },
  {
    id: 'house-001',
    title: '买房置业',
    description: '中介推荐一套海景房。',
    conditions: { minCash: 50000 },
    choices: [
      { id: 'A', text: '首付出手', effect: { cash: -50000 } },
      { id: 'B', text: '继续持币', effect: { cash: 0 } }
    ]
  },
  {
    id: 'ex-001',
    title: '前任来电',
    description: '听说你赚了钱，对方突然发消息。',
    conditions: { minCash: 5000 },
    choices: [
      { id: 'A', text: '转账 888', effect: { cash: -888 } },
      { id: 'B', text: '冷处理', effect: { cash: 200 } }
    ]
  },
  {
    id: 'match-001',
    title: '相亲局',
    description: '家里安排了相亲，对方问你是做什么的。',
    conditions: { minCash: 2000 },
    choices: [
      { id: 'A', text: '吹牛翻车', effect: { cash: -150 } },
      { id: 'B', text: '老实人设', effect: { cash: 80 } }
    ]
  },
  {
    id: 'hack-001',
    title: '遭遇黑客',
    description: '有人发来一个 “空投领取” 链接。',
    conditions: { minCash: 500 },
    choices: [
      { id: 'A', text: '点开被骗', effect: { cash: -1000 } },
      { id: 'B', text: '无视钓鱼', effect: { cash: 50 } }
    ]
  },
  {
    id: 'loan-001',
    title: '借钱炒币',
    description: '网贷平台发来额度提升短信。',
    conditions: { minCash: 1, maxCash: 500 },
    choices: [
      { id: 'A', text: '借钱上车', effect: { cash: 2000 } },
      { id: 'B', text: '放弃机会', effect: { cash: -100 } }
    ]
  },
  {
    id: 'pc-001',
    title: '电脑故障',
    description: '关键时刻电脑突然蓝屏。',
    choices: [
      { id: 'A', text: '重装系统', effect: { cash: -600 } },
      { id: 'B', text: '借朋友电脑', effect: { cash: -150 } }
    ]
  },
  {
    id: 'usb-001',
    title: '捡到 U 盘',
    description: '路边捡到一个写着 “BTC 私钥” 的 U 盘。',
    choices: [
      { id: 'A', text: '插电脑中毒', effect: { cash: -400 } },
      { id: 'B', text: '卖给回收', effect: { cash: 100 } }
    ]
  }
];

const MARKET_EVENTS: MarketEvent[] = [
  {
    id: 'market-201',
    title: 'KOL 一键开播',
    description: '全网 KOL 集体喊单，热度拉满。',
    effect: { phase: 'PUMP', volatilityDelta: 0.03 }
  },
  {
    id: 'market-202',
    title: '交易所上币预热',
    description: '交易所官推点赞，群里炸了。',
    effect: { phase: 'PUMP', volatilityDelta: 0.02 }
  },
  {
    id: 'market-203',
    title: '监管利空',
    description: '某大区监管收紧，情绪瞬间转冷。',
    effect: { phase: 'DUMP', volatilityDelta: 0.03 }
  },
  {
    id: 'market-204',
    title: '巨鲸砸盘',
    description: '链上监控报警，巨鲸开始出货。',
    effect: { phase: 'DUMP', volatilityDelta: 0.04 }
  },
  {
    id: 'market-205',
    title: '拉升拉升',
    description: '项目方回购，K 线拐头向上。',
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
