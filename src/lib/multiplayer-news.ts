import type { GameState, RandomEvent } from '@/types/game';

export interface RoundNewsEvent {
  event: RandomEvent;
  completedRound: number;
  newRound: number;
}

export function getRoundNewsKey(event: RandomEvent, round: number): string {
  return `${round}:${event.id || event.name}`;
}

export function shouldShowGameStateNews(previousState: GameState | null, incomingState: GameState): boolean {
  return Boolean(
    incomingState.currentNews
    && (!previousState || previousState.currentRound !== incomingState.currentRound),
  );
}

export function markRoundNewsIfNew(seenKeys: Set<string>, event: RoundNewsEvent): boolean {
  const key = getRoundNewsKey(event.event, event.newRound);
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
}
