'use client';

import React, { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GameMode, PlayerProfession, PROFESSION_CONFIGS, PLAYER_COLORS } from '@/types/game';

const ALL_PROFESSIONS: PlayerProfession[] = ['worker', 'entrepreneur', 'investor', 'government'];

export function SetupPage() {
  const { dispatch } = useGame();
  const [playerCount, setPlayerCount] = useState(4);
  const [gameMode, setGameMode] = useState<GameMode>('simple');
  const [players, setPlayers] = useState<{ name: string; profession: PlayerProfession }[]>(
    Array(4).fill(null).map(() => ({ name: '', profession: 'worker' }))
  );

  const handlePlayerCountChange = (count: number) => {
    const newCount = Math.max(2, Math.min(10, count));
    setPlayerCount(newCount);
    setPlayers(prev => {
      const newPlayers: { name: string; profession: PlayerProfession }[] = [];
      for (let i = 0; i < newCount; i++) {
        if (i < prev.length) {
          newPlayers.push(prev[i]);
        } else {
          newPlayers.push({ name: '', profession: 'worker' as PlayerProfession });
        }
      }
      return newPlayers;
    });
  };

  const updatePlayerName = (index: number, name: string) => {
    setPlayers(prev => prev.map((p, i) => i === index ? { ...p, name } : p));
  };

  const setPlayerProfession = (playerIndex: number, profession: PlayerProfession) => {
    setPlayers(prev => prev.map((p, i) => 
      i === playerIndex ? { ...p, profession } : p
    ));
  };

  const startGame = () => {
    const validPlayers = players.map((p, i) => ({
      name: p.name || `玩家${i + 1}`,
      profession: p.profession
    }));
    dispatch({ type: 'INIT_GAME', payload: { 
      playerNames: validPlayers.map(p => p.name), 
      playerProfessions: validPlayers.map(p => p.profession),
      gameMode,
    }});
    dispatch({ type: 'START_GAME' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 标题 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            经济模拟游戏
          </h1>
          <p className="text-muted-foreground text-lg">
            学习市场运作方式，理解经济规律
          </p>
        </div>

        {/* 游戏说明 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📖</span> 游戏说明
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">🎯 游戏目标</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 不同职业有不同的胜利目标</li>
                  <li>• 玩家轮流操作自己的角色</li>
                  <li>• 通过交易和决策影响经济</li>
                </ul>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">👥 职业类型</h4>
                <div className="flex flex-wrap gap-1">
                  {ALL_PROFESSIONS.map(prof => (
                    <Badge key={prof} variant="outline" className="text-xs">
                      {PROFESSION_CONFIGS[prof].icon} {PROFESSION_CONFIGS[prof].name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
              <h4 className="font-medium mb-2">💡 核心概念</h4>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>职业（互斥）：</strong>每个人只能选择一个职业：
                  员工、企业家、投资者、政府官员。
                </p>
                <p>
                  <strong>身份属性：</strong>所有人都默认是消费者，可以进行购物和基本投资。
                  购买房产后获得&quot;房东&quot;身份，购买股票/债券后获得&quot;投资者&quot;身份。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 年龄分层模式 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🧭</span> 选择游玩模式
            </CardTitle>
            <CardDescription>
              简单模式适合小学生理解经济概念，专业模式保留更完整的经济模拟。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              <Button
                type="button"
                variant={gameMode === 'simple' ? 'default' : 'outline'}
                className="h-auto min-w-0 justify-start whitespace-normal p-4"
                onClick={() => setGameMode('simple')}
              >
                <div className="min-w-0 text-left">
                  <div className="text-base font-bold">简单模式</div>
                  <div className="text-xs opacity-80 mt-1">优先生活、工作、购物和基础投资，提示更多，操作更少。</div>
                </div>
              </Button>
              <Button
                type="button"
                variant={gameMode === 'professional' ? 'default' : 'outline'}
                className="h-auto min-w-0 justify-start whitespace-normal p-4"
                onClick={() => setGameMode('professional')}
              >
                <div className="min-w-0 text-left">
                  <div className="text-base font-bold">专业模式</div>
                  <div className="text-xs opacity-80 mt-1">保留贷款、企业经营、政策调控和更完整的市场波动。</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 玩家数量 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>👥</span> 玩家数量
            </CardTitle>
            <CardDescription>
              2-10人参与游戏
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => handlePlayerCountChange(playerCount - 1)}
              >
                -
              </Button>
              <span className="text-3xl font-bold w-12 text-center">{playerCount}</span>
              <Button
                variant="outline"
                onClick={() => handlePlayerCountChange(playerCount + 1)}
              >
                +
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 玩家设置 */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>⚙️</span> 玩家设置
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {players.map((player, index) => {
              const profession = PROFESSION_CONFIGS[player.profession];
              return (
                <Card key={index} className="relative overflow-hidden">
                  <div 
                    className="absolute top-0 left-0 w-1 h-full"
                    style={{ backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length] }}
                  />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length] }}
                      >
                        {index + 1}
                      </div>
                      <Input
                        placeholder={`玩家${index + 1}`}
                        value={player.name}
                        onChange={e => updatePlayerName(index, e.target.value)}
                        className="flex-1 max-w-[150px]"
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Label className="text-sm">选择职业（互斥）</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {ALL_PROFESSIONS.map(prof => (
                          <Button
                            key={prof}
                            size="sm"
                            variant={player.profession === prof ? "default" : "outline"}
                            onClick={() => setPlayerProfession(index, prof)}
                            className="h-auto min-w-0 justify-start whitespace-normal py-2"
                          >
                            <span className="mr-1 shrink-0">{PROFESSION_CONFIGS[prof].icon}</span>
                            <span className="min-w-0 truncate">{PROFESSION_CONFIGS[prof].name}</span>
                          </Button>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <div className="font-medium">{profession.name}</div>
                        <div>{profession.incomeDescription}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        身份: <Badge variant="secondary" className="mr-1">消费者</Badge>
                        {player.profession === 'investor' && (
                          <Badge variant="secondary">投资者</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* 开始游戏 */}
        <Card className="bg-gradient-to-r from-primary/20 to-primary/5">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-xl font-bold">准备好开始了吗？</h3>
              <p className="text-muted-foreground text-center">
                {playerCount} 位玩家 · {gameMode === 'simple' ? '简单模式' : '专业模式'} · 游戏共 20 轮 · 轮流操作
              </p>
              <div className="text-sm text-muted-foreground text-center">
                <p>职业分配：</p>
                <div className="flex flex-wrap gap-1 justify-center mt-1">
                  {Object.entries(
                    players.reduce((acc, p) => {
                      acc[p.profession] = (acc[p.profession] || 0) + 1;
                      return acc;
                    }, {} as Record<PlayerProfession, number>)
                  ).map(([prof, count]) => (
                    <Badge key={prof} variant="outline" className="text-xs">
                      {PROFESSION_CONFIGS[prof as PlayerProfession].name} × {count}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button 
                size="lg" 
                onClick={startGame}
                className="text-lg px-8"
              >
                🚀 开始游戏
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
