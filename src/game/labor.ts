import { ECONOMY_BALANCE, Market, Player } from '@/types/game';
import { getJobOffers, getWorkerCurrentJob, isQualifiedForJob, JobOffer } from '@/game/jobs';

export const WORK_HEALTH_THRESHOLD = 25;
export const FORCED_REST_TRIGGER = 10;
export const FORCED_REST_RECOVERY_HEALTH = 30;
export const FORCED_REST_DURATION = 2;

export type WageNegotiationOutcome = 'rejected' | 'small_raise' | 'normal_raise' | 'strong_raise';

export interface WageNegotiationContext {
  ability: NonNullable<Player['workerAbilities']>;
  currentJob: JobOffer;
  marketMinimum: number;
  outsideOptions: number;
  bestOutsideWage: number;
  outsideWagePremium: number;
  employerStrength: number;
  employmentPenalty: number;
  askRatio: number;
  relationshipPenalty: number;
  successChance: number;
}

export function clampLaborValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getForcedRestTrigger(player: Player): number {
  return player.health < FORCED_REST_TRIGGER && (player.workState.forcedRestRounds ?? 0) <= 0
    ? FORCED_REST_DURATION
    : player.workState.forcedRestRounds ?? 0;
}

export function getActionBlockReasonForPlayer(player: Player): string | null {
  const forcedRestRounds = getForcedRestTrigger(player);
  return forcedRestRounds > 0 ? `健康值过低，需强制休息 ${forcedRestRounds} 轮` : null;
}

export function getDefaultWorkerAbilities(): NonNullable<Player['workerAbilities']> {
  return {
    skill: 30,
    wageLevel: ECONOMY_BALANCE.worker.baseWage,
    trainingSessions: 0,
    unemployedRounds: 0,
    negotiationPower: 20,
  };
}

export function buildWageNegotiationContext(
  player: Player,
  players: Player[],
  market: Market,
): WageNegotiationContext {
  const ability = player.workerAbilities ?? getDefaultWorkerAbilities();
  const currentJob = getWorkerCurrentJob(player, players, market);
  const marketMinimum = market.laborMarket?.minimumWage ?? Math.round(ECONOMY_BALANCE.worker.baseWage * 0.6);
  const qualifiedOutsideOffers = getJobOffers(players, player, market.employmentRate, market)
    .filter(offer => offer.id !== currentJob.id && isQualifiedForJob(player, offer) && offer.wage >= currentJob.wage * 0.95);
  const outsideOptions = qualifiedOutsideOffers.length;
  const bestOutsideWage = qualifiedOutsideOffers.reduce((best, offer) => Math.max(best, offer.wage), 0);
  const outsideWagePremium = bestOutsideWage > 0
    ? clampLaborValue((bestOutsideWage - currentJob.wage) / Math.max(1, currentJob.wage), 0, 0.35)
    : 0;
  const employerPlayer = players.find(item => item.id === currentJob.employerId);
  const employerNpc = market.npcFirms.find(firm => firm.id === currentJob.employerId || `npc_firm_${firm.id}` === currentJob.id);
  const employerStrength = employerPlayer?.company
    ? clampLaborValue(
        0.35
        + employerPlayer.company.stats.monthlyProfit / 18000
        + employerPlayer.company.morale / 220
        + employerPlayer.company.marketShare / 180,
        0.15,
        1.25,
      )
    : employerNpc
      ? clampLaborValue(0.25 + employerNpc.financialHealth / 110 + (employerNpc.marketShare ?? 0) / 220, 0.12, 1.15)
      : clampLaborValue(0.45 + market.employmentRate / 180 - market.macroState.unemploymentPressure * 0.22, 0.2, 1);
  const employmentPenalty = (100 - market.employmentRate) * 0.45 + market.macroState.unemploymentPressure * 30;
  const askRatio = clampLaborValue(
    (ability.wageLevel - currentJob.wage) / Math.max(currentJob.wage, 1),
    -0.1,
    0.25,
  );
  const relationshipPenalty = ability.lastNegotiationOutcome === 'rejected' ? 10 : 0;
  const successChance = clampLaborValue(
    (
      ability.skill * 0.32
      + ability.negotiationPower * 0.42
      + outsideOptions * 5
      + outsideWagePremium * 34
      + employerStrength * 18
      + market.employmentRate * 0.14
      - employmentPenalty
      - askRatio * 85
      - relationshipPenalty
    ) / 100,
    0.12,
    0.88,
  );

  return {
    ability,
    currentJob,
    marketMinimum,
    outsideOptions,
    bestOutsideWage,
    outsideWagePremium,
    employerStrength,
    employmentPenalty,
    askRatio,
    relationshipPenalty,
    successChance,
  };
}

export function getWageNegotiationOutcome(successChance: number, roll: number): WageNegotiationOutcome {
  return roll > successChance
    ? 'rejected'
    : roll > successChance * 0.72
      ? 'small_raise'
      : roll > successChance * 0.35
        ? 'normal_raise'
        : 'strong_raise';
}

export function getWageRaiseMultiplier(outcome: WageNegotiationOutcome): number {
  if (outcome === 'strong_raise') return 1.1;
  if (outcome === 'normal_raise') return 1.06;
  if (outcome === 'small_raise') return 1.03;
  return 1;
}
