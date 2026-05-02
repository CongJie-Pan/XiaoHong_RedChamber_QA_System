'use client';

// =================================================================
// MAIN ENTRY POINT
// Why this is simple:
// The actual logic is encapsulated within the ChatContainer component.
// This follows the "Fat Component, Skinny Route" pattern, keeping 
// the root page clean and focused on high-level structure.
// =================================================================

/**
 * Home Page
 * Main entry point for the XiaoHong Chat interface.
 */

import { ChatContainer } from '@/components/ChatContainer';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0d0d0d]">
      <ChatContainer />
    </main>
  );
}
