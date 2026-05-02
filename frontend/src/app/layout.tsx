/**
 * Root Layout for XiaoHong QA System.
 * 
 * This file serves as the top-level wrapper for the entire application, 
 * orchestrating global font loading, UI styling, and error boundaries.
 */

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme, App } from 'antd';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

// =================================================================
// FONT CONFIGURATION
// We use Next.js font optimization to reduce Layout Shift (CLS). 
// Geist is chosen for its clean, modern look which provides a nice 
// contrast to the ancient literature content.
// =================================================================

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// =================================================================
// SEO & METADATA
// Centralized metadata for social sharing and browser tab display.
// The icons point to the custom logo to reinforce branding.
// =================================================================

export const metadata: Metadata = {
  title: '小紅 XiaoHong - 您的紅樓夢專業問答助手',
  description: '結合思考過程視覺化的 AI 問答助手',
  icons: {
    icon: '/logo/favicon.ico',
  },
};

// =================================================================
// ROOT COMPONENT
// Why this structure:
// 1. ErrorBoundary: Catches rendering crashes at the highest level.
// 2. AntdRegistry: Prevents Flash of Unstyled Content (FOUC) in SSR.
// 3. ConfigProvider: Defines the "XiaoHong Red" (#8B1E1E) dark theme, 
//    evoking the classic Chinese aesthetic of the Dream of the Red Chamber.
// =================================================================

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ErrorBoundary>
          <AntdRegistry>
            <ConfigProvider
              theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                  colorPrimary: '#8B1E1E',
                  colorInfo: '#8B1E1E',
                  colorBgBase: '#0d0d0d',
                  colorBgContainer: '#262626',
                  colorBgElevated: '#262626',
                  colorBgLayout: '#0d0d0d',
                  colorTextBase: '#f0f0f0',
                },
              }}
            >
              <App>
                {children}
              </App>
            </ConfigProvider>
          </AntdRegistry>
        </ErrorBoundary>
      </body>
    </html>
  );
}
