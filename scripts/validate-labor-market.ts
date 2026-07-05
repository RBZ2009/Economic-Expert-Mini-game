import { createInitialGameState } from '../src/game/initial-state';
import { getJobOffers, isQualifiedForJob, JobOffer } from '../src/game/jobs';
import {
  buildWageNegotiationContext,
  FORCED_REST_DURATION,
  FORCED_REST_RECOVERY_HEALTH,
  getActionBlockReasonForPlayer,
  getForcedRestTrigger,
  getWageNegotiationOutcome,
  WORK_HEALTH_THRESHOLD,
} from '../src/game/labor';
import { ECONOMY_BALANCE, GameState, Market, Player } from '../src/types/game';
import fs from 'node:fs';
import path from 'node:path';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createState(): GameState {
  return createInitialGameState([
    { id: 'worker', name: '员工', color: '#2563eb', profession: 'worker' },
    { id: 'entrepreneur', name: '企业家', color: '#16a34a', profession: 'entrepreneur' },
    { id: 'investor', name: '投资者', color: '#9333ea', profession: 'investor' },
  ], 'professional');
}

function getWorker(state: GameState): Player {
  const worker = state.players.find(player => player.profession === 'worker');
  if (!worker) throw new Error('测试状态缺少员工玩家');
  return worker;
}

function withMarket(base: Market, overrides: Partial<Market>): Market {
  return {
    ...clone(base),
    ...overrides,
    macroState: {
      ...base.macroState,
      ...(overrides.macroState ?? {}),
    },
    creditConditions: {
      ...base.creditConditions,
      ...(overrides.creditConditions ?? {}),
    },
    laborMarket: base.laborMarket ? {
      ...base.laborMarket,
      ...(overrides.laborMarket ?? {}),
    } : overrides.laborMarket,
  };
}

function withWorker(base: Player, overrides: Partial<Player>): Player {
  return {
    ...clone(base),
    ...overrides,
    workerAbilities: {
      ...base.workerAbilities!,
      ...(overrides.workerAbilities ?? {}),
    },
    workState: {
      ...base.workState,
      ...(overrides.workState ?? {}),
    },
    goods: {
      ...base.goods,
      ...(overrides.goods ?? {}),
    },
  };
}

function assertOfferHasRealisticFields(offer: JobOffer): void {
  assert(Boolean(offer.industry), `${offer.id} 缺少行业`);
  assert(typeof offer.requiredSkill === 'number', `${offer.id} 缺少技能门槛`);
  assert(typeof offer.requiredEducation === 'number', `${offer.id} 缺少学历门槛`);
  assert(typeof offer.requiredExperience === 'number', `${offer.id} 缺少经验门槛`);
  assert(offer.contractType === offer.paymentType, `${offer.id} 合同类型和支付方式不一致`);
  assert(offer.wage > 0, `${offer.id} 工资必须为正`);
  assert(offer.hoursPerRound > 0, `${offer.id} 缺少每轮工时`);
  assert(offer.fatigueCost > 0, `${offer.id} 缺少疲劳消耗`);
  assert(offer.happinessCost >= 0, `${offer.id} 幸福度消耗异常`);
  assert(offer.healthCost >= 0, `${offer.id} 健康风险异常`);
  assert(offer.benefits >= 0, `${offer.id} 福利异常`);
  assert(offer.promotionTrack.length > 0, `${offer.id} 缺少晋升路径`);
  assert(offer.jobSecurity > 0, `${offer.id} 缺少稳定性`);
}

function assertJobOfferStructure(): void {
  const state = createState();
  const worker = getWorker(state);
  const offers = getJobOffers(state.players, worker, state.market.employmentRate, state.market);
  assert(offers.length >= 3, `岗位机会不足: ${offers.length}`);
  offers.forEach(assertOfferHasRealisticFields);
  const mostlyNoDirectHealthCost = offers.filter(offer => offer.healthCost === 0).length / offers.length;
  assert(mostlyNoDirectHealthCost >= 0.75, `普通岗位应主要消耗疲劳和幸福，而非直接扣健康: noHealthCostShare=${mostlyNoDirectHealthCost}`);
  assert(offers.some(offer => offer.paymentType === 'hourly' && offer.maxWorkPerRound > 1), '缺少可多次工作的时薪岗位');
  assert(offers.some(offer => offer.paymentType === 'monthly' && offer.overtimeAllowed), '缺少可加班的月薪岗位');
}

function assertHumanCapitalUnlocksJobs(): void {
  const state = createState();
  const worker = getWorker(state);
  const entryWorker = withWorker(worker, {
    workerAbilities: {
      ...worker.workerAbilities!,
      skill: 24,
      educationLevel: 0,
      experience: 0,
    },
  });
  const skilledWorker = withWorker(worker, {
    goods: { ...worker.goods, education: 8 },
    workerAbilities: {
      ...worker.workerAbilities!,
      skill: 82,
      educationLevel: 3,
      experience: 6,
      negotiationPower: 70,
    },
  });
  const entryOffers = getJobOffers(state.players, entryWorker, state.market.employmentRate, state.market).filter(offer => isQualifiedForJob(entryWorker, offer));
  const skilledOffers = getJobOffers(state.players, skilledWorker, state.market.employmentRate, state.market).filter(offer => isQualifiedForJob(skilledWorker, offer));
  const entryBest = Math.max(...entryOffers.map(offer => offer.wage));
  const skilledBest = Math.max(...skilledOffers.map(offer => offer.wage));
  assert(skilledBest > entryBest * 1.35, `能力提升没有显著解锁更高工资: entry=${entryBest}, skilled=${skilledBest}`);
  assert(skilledOffers.some(offer => offer.requiredEducation >= 2 && offer.requiredExperience >= 3), '高能力员工没有解锁高门槛岗位');
}

function assertNegotiationRespondsToLaborMarket(): void {
  const state = createState();
  const worker = withWorker(getWorker(state), {
    workerAbilities: {
      ...getWorker(state).workerAbilities!,
      skill: 76,
      educationLevel: 3,
      experience: 5,
      negotiationPower: 74,
      wageLevel: Math.round(ECONOMY_BALANCE.worker.baseWage * 0.92),
      currentJobId: 'npc_factory_monthly',
      paymentType: 'monthly',
      lastNegotiationOutcome: undefined,
    },
  });
  const strongMarket = withMarket(state.market, {
    employmentRate: 86,
    macroState: {
      ...state.market.macroState,
      unemploymentPressure: 0.05,
      businessConfidence: 82,
      socialMobilityIndex: 72,
    },
  });
  const weakMarket = withMarket(state.market, {
    employmentRate: 46,
    macroState: {
      ...state.market.macroState,
      unemploymentPressure: 0.72,
      businessConfidence: 32,
      socialMobilityIndex: 30,
    },
  });
  const strongContext = buildWageNegotiationContext(worker, state.players.map(player => player.id === worker.id ? worker : player), strongMarket);
  const weakContext = buildWageNegotiationContext(worker, state.players.map(player => player.id === worker.id ? worker : player), weakMarket);
  assert(strongContext.successChance > weakContext.successChance + 0.18, `谈薪没有明显响应就业环境: strong=${strongContext.successChance}, weak=${weakContext.successChance}`);
  assert(strongContext.outsideOptions >= weakContext.outsideOptions, '强就业环境不应减少外部机会');
  assert(getWageNegotiationOutcome(strongContext.successChance, 0.2) !== 'rejected', '低随机值下强市场谈薪仍被拒，概率映射异常');
  assert(getWageNegotiationOutcome(weakContext.successChance, 0.95) === 'rejected', '高随机值下弱市场谈薪没有被拒，概率映射异常');

  const alreadyNegotiated = withWorker(worker, {
    workerAbilities: {
      ...worker.workerAbilities!,
      lastNegotiationRound: state.currentRound,
    },
  });
  assert(alreadyNegotiated.workerAbilities?.lastNegotiationRound === state.currentRound, '缺少每轮谈薪限制标记');
}

function assertHealthFatigueAndForcedRestRules(): void {
  const state = createState();
  const worker = getWorker(state);
  const exhausted = withWorker(worker, {
    health: 55,
    workState: {
      ...worker.workState,
      fatigueLevel: 90,
    },
  });
  const fatiguePenalty = Math.max(0, exhausted.workState.fatigueLevel - 60);
  const fatigueHealthPenalty = exhausted.workState.fatigueLevel >= 80
    ? Math.ceil((exhausted.workState.fatigueLevel - 70) / 4)
    : 0;
  const healthDelta = 7 - Math.floor(fatiguePenalty / 8) - fatigueHealthPenalty;
  assert(healthDelta < 0, `高疲劳没有转化为健康损害: delta=${healthDelta}`);

  const lowHealth = withWorker(worker, { health: WORK_HEALTH_THRESHOLD - 1 });
  assert(lowHealth.health < WORK_HEALTH_THRESHOLD, '健康阈值测试构造失败');

  const critical = withWorker(worker, { health: 8, workState: { ...worker.workState, forcedRestRounds: 0 } });
  assert(getForcedRestTrigger(critical) === FORCED_REST_DURATION, '健康低于 10 没有触发 2 轮强制休息');
  assert(getActionBlockReasonForPlayer(critical)?.includes('强制休息') ?? false, '强制休息没有阻止行动');
  let forcedRestRounds = getForcedRestTrigger(critical);
  let health = critical.health;
  forcedRestRounds -= 1;
  health = Math.max(health, forcedRestRounds === 0 ? FORCED_REST_RECOVERY_HEALTH : 12);
  assert(forcedRestRounds === 1 && health >= 12, '强制休息第 1 轮没有维持最低恢复');
  forcedRestRounds -= 1;
  health = Math.max(health, forcedRestRounds === 0 ? FORCED_REST_RECOVERY_HEALTH : 12);
  assert(forcedRestRounds === 0 && health >= FORCED_REST_RECOVERY_HEALTH, '强制休息结束后没有恢复到 30');
}

function assertSingleAndMultiUseSharedLaborRules(): void {
  const projectRoot = process.cwd();
  const single = fs.readFileSync(path.join(projectRoot, 'src/contexts/GameContext.tsx'), 'utf8');
  const multi = fs.readFileSync(path.join(projectRoot, 'src/ws-handlers/game.ts'), 'utf8');
  for (const [label, source] of [['single', single], ['multi', multi]] as const) {
    assert(source.includes("from '@/game/labor'"), `${label} 未接入共享劳动规则模块`);
    assert(source.includes('buildWageNegotiationContext'), `${label} 未使用共享谈薪上下文`);
    assert(source.includes('getActionBlockReasonForPlayer'), `${label} 未使用共享强制休息阻断`);
    assert(source.includes('getWorkerCurrentJob({ ...player, workerAbilities }') && source.includes(".paymentType === 'monthly'"), `${label} 月薪发放标记没有基于当前岗位判断`);
  }
}

assertJobOfferStructure();
assertHumanCapitalUnlocksJobs();
assertNegotiationRespondsToLaborMarket();
assertHealthFatigueAndForcedRestRules();
assertSingleAndMultiUseSharedLaborRules();

console.log('Labor market passed: job fields, human-capital mobility, wage negotiation, fatigue-health limits, forced rest, and single/multi shared rules are verified.');
