// ============================================================
// 自定义服务器 - Next.js + WebSocket 共用 5000 端口
// ============================================================

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { setupGameHandler } from './ws-handlers/game';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const PORT = Number(process.env.DEPLOY_RUN_PORT) || 5000;

// Create Next.js app
const app = next({ dev, hostname, port: PORT });
const handle = app.getRequestHandler();

// WebSocket 路由注册
const wssMap = new Map<string, WebSocketServer>();

function registerWsEndpoint(path: string): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  wssMap.set(path, wss);
  return wss;
}

function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const { pathname } = new URL(req.url!, `http://${req.headers.host}`);
  const wss = wssMap.get(pathname);
  
  if (wss) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else if (!dev) {
    // 生产环境销毁未注册的 upgrade 请求
    socket.destroy();
  }
}

// 注册游戏 WebSocket 端点
const gameWss = registerWsEndpoint('/ws/game');
setupGameHandler(gameWss);

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  server.on('upgrade', handleUpgrade);

  server.listen(PORT, () => {
    console.log(
      `> Server listening at http://${hostname}:${PORT} as ${
        dev ? 'development' : 'production'
      }`
    );
    console.log('> WebSocket endpoints:');
    console.log('  - /ws/game (game room management)');
  });
});
