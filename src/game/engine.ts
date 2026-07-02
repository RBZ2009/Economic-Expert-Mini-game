import { MultiplayerGameAction, MultiplayerGameActionType } from '@/game/actions';

export interface EngineResult {
  success: boolean;
  error?: string;
}

export type MultiplayerActionHandlers<Context> = {
  [Type in MultiplayerGameActionType]: (
    context: Context,
    playerId: string,
    action: Extract<MultiplayerGameAction, { type: Type }>
  ) => EngineResult;
};

export function applyMultiplayerGameAction<Context>(
  context: Context,
  playerId: string,
  action: MultiplayerGameAction,
  handlers: MultiplayerActionHandlers<Context>
): EngineResult {
  const handler = handlers[action.type] as (
    context: Context,
    playerId: string,
    action: MultiplayerGameAction
  ) => EngineResult;

  return handler(context, playerId, action);
}
