import type { MarketPhase, TokenInfo } from './types';

type ChatEffect = {
  type: 'PUMP' | 'DUMP' | 'VOLATILITY';
  strength: number;
};

type CharacterMessage = string | { text: string; effect: ChatEffect };

const CHARACTERS: Record<string, { msgs: CharacterMessage[] }> = {
  '极品男大学生': {
    msgs: [
      '室友问我为什么跪着看手机，我说我在看K线。',
      '食堂阿姨手抖了一下，我的生活费就没了。',
      '有没有富婆姐姐看看我？我不想努力了。',
      '这波赚了请全宿舍吃泡面，加肠！',
      '刚才上课偷偷开了一单，差点被老师没收手机。',
      '谁帮我带份饭？赢了分你10u。',
      '为了炒币，我已经三天没洗头了。'
    ]
  },
  '小桂子': {
    msgs: [
      '这波我开了100倍，赢了会所嫩模，输了下海干活！',
      '梭哈了！别问，问就是信仰！',
      '有没有老哥借我50u吃饭？回本了必还！',
      '今晚不是暴富就是爆仓！',
      '兄弟们，我感觉要起飞了，快上车！',
      '完了，爆仓短信来了...',
      '再充最后500u，这把必翻身！'
    ]
  },
  '喔蜜豆腐': {
    msgs: [
      '阿弥陀佛，涨跌随缘。',
      '施主，莫要执着于K线，心中有佛，万物皆空。',
      '这波回调是给有缘人上车的机会。',
      '善哉善哉，项目方也是为了生活。',
      '不悲不喜，拿住就是胜利。',
      '一切都是虚妄，唯有BTC永恒。'
    ]
  },
  'KOL HotBaby': {
    msgs: [
      { text: '家人们！这个币我看好，目标100x！🚀', effect: { type: 'PUMP', strength: 0.04 } },
      { text: '冲冲冲！不要怂，就是干！', effect: { type: 'PUMP', strength: 0.02 } },
      '刚才谁卖飞了？出来挨打！',
      '这K线太美了，典型的圆弧底！',
      '项目方跟我说了，马上有利好！',
      '别问为什么，买就对了！',
      '这波要是跌了，我直播吃键盘！'
    ]
  },
  'KOL 静香': {
    msgs: [
      '今天收益不错，去买个包包~ 👜',
      '有人要看我的实盘吗？',
      '哎呀，又被止损了，好烦哦。',
      '谢谢哥哥的打赏，爱你么么哒~ ❤️',
      '这个币好丑，不想买了。',
      '谁在黑我？律师函警告！',
      '今晚直播复盘，记得来看哦。'
    ]
  },
  '余额疯涨-发誓不再玩合约': {
    msgs: [
      '最后一次，真的最后一次玩合约！',
      '再玩合约我就是狗！',
      '真香...',
      '刚才那波要是开了多就好了...',
      '我发誓，这把赚了就提现销户！',
      '为什么我一开多就跌，一开空就涨？监控我？',
      '兄弟们，我又管不住手了...'
    ]
  },
  '是我喜欢转圈圈': {
    msgs: [
      '赚了钱就给她买那个包包，她一定会开心的。',
      '她回我消息了！虽然只是个“哦”，但她心里有我！',
      '女神说她想去马尔代夫，我要努力炒币！',
      '她没有在耍我，她只是太忙了没空理我。',
      '今天情人节，发个520红包给她，希望能收。',
      '只要她幸福，我就满足了。',
      '兄弟们，这个币能涨吗？我想攒彩礼。'
    ]
  },
  '孙割': {
    msgs: [
      { text: '我决定收购这个项目！', effect: { type: 'PUMP', strength: 0.06 } },
      { text: '这波热度我蹭定了！', effect: { type: 'VOLATILITY', strength: 0.08 } },
      '祖传一百万，专治各种不服。',
      '有人说我是镰刀？我是来拯救行业的！',
      '这项目不错，发个推支持一下。'
    ]
  },
  '凉兮': {
    msgs: [
      '谁借我200u？我必还！',
      '你们这群黑粉，等着被打脸吧！',
      { text: '我实盘给你们看，这波必空！', effect: { type: 'DUMP', strength: 0.04 } },
      '我又爆了...心态崩了...',
      '我不服！我要翻本！',
      '今晚不睡了，决战到天亮！'
    ]
  },
  '老韭菜': {
    msgs: [
      '这种盘子我见多了，跑得快才是赢家。',
      '不要看群，看K线。',
      '横盘就是蓄力，懂不懂？',
      '别人恐惧我贪婪，别人贪婪我恐惧。',
      '先出本金，利润让它飞。'
    ]
  },
  '项目方': {
    msgs: [
      { text: '我们在做事 (Building)。', effect: { type: 'PUMP', strength: 0.02 } },
      '不要FUD，技术团队在加班。',
      '马上上所，大家拿住。',
      '锁仓计划马上公布。',
      '这只是技术性回调。'
    ]
  },
  'Bot': {
    msgs: [
      { text: '检测到大额买入！🐳', effect: { type: 'PUMP', strength: 0.05 } },
      { text: '检测到大额卖出！⚠️', effect: { type: 'DUMP', strength: 0.05 } },
      '当前持币地址数：1337',
      '燃烧机制已启动 🔥'
    ]
  }
};

const COMMON_MSGS = [
  '这项目怎么样？', '有人看过合约吗？', '群主呢？出来说话！',
  '什么时候拉盘？', '家人们谁懂啊', '合约地址发一下',
  '滑点设置多少？', '有没有锁池子？', '维权群拉我一下',
  '天台见', '别墅靠海', '归零归零', '接盘侠来了'
];

const pickRandom = <T>(items: T[], fallback: T): T => {
  if (!items.length) return fallback;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? fallback;
};

export const getChatMessage = (phase: MarketPhase, price: number, token: TokenInfo | null) => {
  const senders = Object.keys(CHARACTERS);
  senders.push('群友A', '群友B', '路人甲');

  const sender = pickRandom(senders, '群友A');
  let text = '';
  let effect: ChatEffect | null = null;

  const character = CHARACTERS[sender];
  if (character) {
    const charMsgs = character.msgs;
    const msg = pickRandom(charMsgs, '...');

    if (typeof msg === 'object') {
      text = msg.text;
      effect = msg.effect;
    } else {
      text = msg;
    }
  } else {
    text = pickRandom(COMMON_MSGS, '...');
  }

  if (Math.random() < 0.4) {
    if (phase === 'PUMP') {
      const pumpMsgs = ['起飞！🚀', '绿得发慌', '庄家拉盘了', '这波能上币安', '市值才100万，空间巨大'];
      text = pickRandom(pumpMsgs, '起飞！🚀');
      effect = null;
    } else if (phase === 'MOON') {
      const moonMsgs = ['卧槽！！！', '百倍了！', '财富自由！', 'To The Moon 🌕', '🚀🚀🚀🚀🚀'];
      text = pickRandom(moonMsgs, '🚀🚀🚀🚀🚀');
      effect = null;
    } else if (phase === 'DUMP') {
      const dumpMsgs = ['救命啊😭', '谁在砸盘？', '稳住，技术性回调', '接盘侠来了', '把我的钱还给我'];
      text = pickRandom(dumpMsgs, '救命啊😭');
      effect = null;
    } else if (phase === 'RUG') {
      const rugMsgs = ['RUG了！！！', '报警吧', '我的钱啊', '网站打不开了', '群主退群了', '貔貅盘！'];
      text = pickRandom(rugMsgs, 'RUG了！！！');
      effect = null;
    }
  }

  return {
    sender,
    text,
    effect
  };
};
