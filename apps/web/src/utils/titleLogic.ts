import type { PlayerState, TradeHistoryItem } from '@pk-candle/shared';

type TitlePlayer = Pick<PlayerState, 'cash' | 'initialCash' | 'history' | 'position'>;

type SharePlayer = Pick<PlayerState, 'cash' | 'initialCash' | 'history'>;

type TradeSide = TradeHistoryItem['side'];

type CountResult = {
  buyCount: number;
  sellCount: number;
};

const countSides = (history: TradeHistoryItem[]): CountResult => {
  return history.reduce<CountResult>((acc, entry) => {
    if (entry.type === 'OPEN') {
      if (entry.side === 'LONG') acc.buyCount += 1;
      if (entry.side === 'SHORT') acc.sellCount += 1;
    }
    return acc;
  }, { buyCount: 0, sellCount: 0 });
};

export const getPlayerTitle = (player: TitlePlayer, isVictory: boolean) => {
  const { cash, initialCash, history } = player;
  const roi = initialCash > 0 ? ((cash - initialCash) / initialCash) * 100 : 0;
  const tradeCount = history.length;

  if (isVictory) {
    if (cash > 1000000) return '链上马斯克';
    if (cash > 500000) return 'Web3 皇帝';
    if (cash > 100000) return '链上巴菲特';
    if (cash > 50000) return 'A8 巨鲸';
    if (cash > 10000) return '交易战神';
    if (roi > 1000) return '千倍神话';
    if (tradeCount === 0) return '躺赢大师';
    return '幸存者';
  }

  if (cash <= 0) {
    if (tradeCount > 100) return '高频低能';
    if (tradeCount < 3) return '落地成盒';
    if (initialCash > 10000) return '败家子';
    if (history.length > 0 && history[history.length - 1]?.type === 'OPEN') return '山顶洞人';
    return '电子乞丐';
  }

  const { buyCount, sellCount } = countSides(history);

  if (buyCount > 0 && sellCount === 0) return '钻石手 (死拿)';
  if (buyCount > 50 && sellCount > 50) return '量化机器人';
  if (tradeCount > 20 && roi < 0) return '反向指标';
  if (tradeCount > 10 && roi > 0 && roi < 10) return '手续费贡献者';

  if (tradeCount > 5 && roi < -50) return '止损是什么';
  if (tradeCount > 5 && roi > 50 && roi < 100) return '卖飞艺术家';
  if (tradeCount > 30 && roi > 200) return '波段之王';

  if (roi > 500) return '百倍猎人';
  if (roi > 100) return '翻倍大师';
  if (roi > 50) return '精明投机者';
  if (roi > 0) return '回本天尊';
  if (roi > -20) return '白玩一场';
  if (roi > -50) return '合格韭菜';
  if (roi > -80) return '腰斩之王';
  if (roi > -95) return '脚踝斩';

  return '慈善家';
};

export const generateShareImage = (player: SharePlayer, isVictory: boolean, title: string) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const width = 600;
  const height = 800;

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = isVictory ? '#F59E0B' : '#EF4444';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isVictory ? 'VICTORY' : 'GAME OVER', width / 2, 100);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(title, width / 2, 180);

  ctx.fillStyle = '#1F2937';
  ctx.fillRect(50, 220, 500, 300);
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 220, 500, 300);

  ctx.fillStyle = '#9CA3AF';
  ctx.font = '30px sans-serif';
  ctx.textAlign = 'left';

  const initial = player.initialCash || 1000;
  const roi = ((player.cash - initial) / initial) * 100;

  const stats = [
    { label: '最终资产', value: `$${player.cash.toFixed(2)}`, color: player.cash > 0 ? '#34D399' : '#F87171' },
    { label: '收益率', value: `${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`, color: roi > 0 ? '#34D399' : '#F87171' },
    { label: '交易次数', value: player.history.length, color: '#FFFFFF' },
  ];

  stats.forEach((stat, index) => {
    const y = 280 + index * 60;
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(stat.label, 80, y);
    ctx.fillStyle = stat.color;
    ctx.textAlign = 'right';
    let displayValue = String(stat.value);
    ctx.fillText(displayValue, 520, y);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#4B5563';
  ctx.font = 'italic 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ChainLife - 链上人生', width / 2, 600);

  ctx.fillStyle = '#6B7280';
  ctx.font = '20px sans-serif';
  ctx.fillText('玩的不是币，是情绪。', width / 2, 640);

  ctx.fillStyle = '#3B82F6';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('@TokenSci', width / 2, 750);

  return canvas.toDataURL('image/png');
};
