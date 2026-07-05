import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function assertIncludes(path: string, tokens: string[], label: string): void {
  const text = source(path);
  const missing = tokens.filter(token => !text.includes(token));
  if (missing.length > 0) {
    throw new Error(`${label} 缺少: ${missing.join(', ')}`);
  }
}

function assertSingleAndMultiWorkbenchExposeCausalPanels(): void {
  assertIncludes('src/components/game/GamePage.tsx', [
    'GameWorkbench',
    'EconomyCausalPanel',
    'PlayerActions',
  ], '单人工作台');

  assertIncludes('src/components/room/MultiplayerGamePage.tsx', [
    'GameWorkbench',
    'EconomyCausalPanel',
    'AssetPricingPanel',
    'GovernmentFeedbackPanel',
    'RoomOptionsMenu',
    "gameState.gameMode === 'simple'",
    '简单模式',
    '专业',
  ], '多人工作台');

  assertIncludes('src/components/game/PlayerActions.tsx', [
    "state.gameMode === 'simple'",
    'AssetPricingPanel',
    'GovernmentFeedbackPanel',
    '必需品不足会影响健康和幸福度',
    '每轮会自然恢复一些健康',
    '疲劳',
  ], '单人操作区教学解释');
}

function assertCausalPanelsExplainCoreSystems(): void {
  assertIncludes('src/components/game/EconomyCausalPanel.tsx', [
    '基础原料',
    '中间品',
    '包装物流',
    '能源',
    '企业成本',
    '终端价格',
    '外需指数',
    '进口成本',
    '居民信贷紧缩',
    '企业信贷紧缩',
    '坏账压力',
    '家庭分层与消费',
    '政府反馈',
    '企业竞争',
    'NPC',
  ], '经济因果链面板');

  assertIncludes('src/components/game/AssetPricingPanel.tsx', [
    '盈利预期',
    '风险偏好',
    '宏观折现率',
    '利率',
    '信用风险',
    '违约预期',
    '通胀预期',
    '避险需求',
    '政策利率',
    '机会成本',
  ], '资产定价面板');

  assertIncludes('src/components/game/GovernmentFeedbackPanel.tsx', [
    '居民支持',
    '企业支持',
    '财政健康',
    '社会稳定',
    '通胀满意度',
    '预算空间',
    '政策执行效率',
    '下台风险',
  ], '政府反馈面板');
}

function assertSupplyChainExposureIsConsistent(): void {
  const expectedRows = [
    'food: { basicMaterials: 0.36, intermediateGoods: 0.08, packagingLogistics: 0.4, energy: 0.16 }',
    'daily_necessities: { basicMaterials: 0.42, intermediateGoods: 0.28, packagingLogistics: 0.22, energy: 0.08 }',
    'entertainment: { basicMaterials: 0.16, intermediateGoods: 0.42, packagingLogistics: 0.12, energy: 0.3 }',
    'luxury: { basicMaterials: 0.18, intermediateGoods: 0.36, packagingLogistics: 0.1, energy: 0.36 }',
    'public_service: { basicMaterials: 0.08, intermediateGoods: 0.2, packagingLogistics: 0.32, energy: 0.4 }',
    'finance: { basicMaterials: 0.04, intermediateGoods: 0.12, packagingLogistics: 0.14, energy: 0.7 }',
  ];

  ['src/game/market.ts', 'src/game/initial-state.ts', 'src/contexts/GameContext.tsx'].forEach(path => {
    assertIncludes(path, expectedRows, `${path} 供应链行业暴露矩阵`);
  });
}

assertSingleAndMultiWorkbenchExposeCausalPanels();
assertCausalPanelsExplainCoreSystems();
assertSupplyChainExposureIsConsistent();

console.log('Frontend explanations passed: single/multi workbenches expose causal panels, core systems are explained, and supply-chain exposure is consistent.');
