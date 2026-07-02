import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '经济模拟游戏',
    template: '%s | 经济模拟游戏',
  },
  description: '帮助小朋友们理解市场运作方式的经济模拟游戏',
  keywords: ['经济模拟', '教育游戏', '市场运作', '财商教育'],
  authors: [{ name: '经济模拟游戏' }],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {children}
      </body>
    </html>
  );
}
