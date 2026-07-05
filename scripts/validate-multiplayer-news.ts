import { createInitialGameState } from '../src/game/initial-state';
import { markRoundNewsIfNew, shouldShowGameStateNews } from '../src/lib/multiplayer-news';
import { GameState, RandomEvent } from '../src/types/game';

function event(id: string, name: string): RandomEvent {
  return {
    id,
    type: 'economic_crisis',
    name,
    icon: '📰',
    description: `${name} 描述`,
    story: `${name} 背景`,
    explanation: `${name} 传导解释`,
    effects: {},
    probability: 1,
  };
}

function state(round: number, news: RandomEvent | null): GameState {
  return {
    ...createInitialGameState([
      { id: 'host', name: '房主', color: '#2563eb', profession: 'worker' },
      { id: 'guest', name: '玩家', color: '#16a34a', profession: 'entrepreneur' },
    ], 'professional'),
    currentRound: round,
    currentNews: news,
  };
}

function assertGameStateNewsOnlyShowsOnNewRound(): void {
  const news = event('round_3_news', '第 3 轮新闻');
  const previous = state(3, news);
  const sameRoundAfterAction = {
    ...previous,
    market: {
      ...previous.market,
      gdp: previous.market.gdp + 1200,
    },
  };
  const nextRound = state(4, event('round_4_news', '第 4 轮新闻'));

  if (!shouldShowGameStateNews(null, previous)) {
    throw new Error('首次进入带新闻的游戏状态时，应显示新闻');
  }
  if (shouldShowGameStateNews(previous, sameRoundAfterAction)) {
    throw new Error('同一回合普通操作同步 game:state 时不应重复显示新闻');
  }
  if (!shouldShowGameStateNews(previous, nextRound)) {
    throw new Error('进入新回合时应显示新新闻');
  }
}

function assertRoundEndNewsDeduplicatesByRoundAndEvent(): void {
  const seen = new Set<string>();
  const news = event('policy_news', '政策生效');
  const first = markRoundNewsIfNew(seen, {
    event: news,
    completedRound: 3,
    newRound: 4,
  });
  const duplicateRoundEnd = markRoundNewsIfNew(seen, {
    event: news,
    completedRound: 3,
    newRound: 4,
  });
  const duplicateGameStateAfterRoundEnd = markRoundNewsIfNew(seen, {
    event: news,
    completedRound: 3,
    newRound: 4,
  });
  const sameNewsNextRound = markRoundNewsIfNew(seen, {
    event: news,
    completedRound: 4,
    newRound: 5,
  });

  if (!first) {
    throw new Error('第一次收到回合新闻应显示');
  }
  if (duplicateRoundEnd || duplicateGameStateAfterRoundEnd) {
    throw new Error('同一回合同一新闻不应重复显示');
  }
  if (!sameNewsNextRound) {
    throw new Error('同一新闻 id 在新回合出现时应允许显示');
  }
}

assertGameStateNewsOnlyShowsOnNewRound();
assertRoundEndNewsDeduplicatesByRoundAndEvent();

console.log('Multiplayer news passed: same-round game state updates do not replay news, and round-end news is deduplicated by round/event.');
