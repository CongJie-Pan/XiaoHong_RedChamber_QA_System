import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RAGStatusPanel } from '../../../../frontend/src/components/RAGStatusPanel';
import type { RAGInfo } from '../../../../frontend/src/components/RAGStatusPanel';

// Mock the CSS module
vi.mock('../../../../frontend/src/components/RAGStatusPanel/styles', () => ({
  useStyles: () => ({
    styles: {
      container: 'container',
      header: 'header',
      statusInfo: 'statusInfo',
      checkIcon: 'checkIcon',
      spinnerIcon: 'spinnerIcon',
      statusText: 'statusText',
      sourceCount: 'sourceCount',
      progressTrack: 'progressTrack',
      progressBar: 'progressBar',
    },
    cx: (...args: any[]) => args.filter(Boolean).join(' '),
  }),
}));

describe('RAGStatusPanel', () => {
  it('Scenario 1: Idle state - returns null', () => {
    const ragInfo: RAGInfo = { status: 'idle', message: '', sources: [] };
    const { container } = render(<RAGStatusPanel ragInfo={ragInfo} />);
    expect(container.firstChild).toBeNull();
  });

  it('Scenario 2: Searching/Retrieving - shows loader and progress bar', () => {
    const ragInfo: RAGInfo = {
      status: 'searching_dense',
      message: '📖 翻閱古籍索引...',
      sources: [],
    };
    const { container } = render(<RAGStatusPanel ragInfo={ragInfo} />);
    
    expect(screen.getByText('📖 翻閱古籍索引...')).toBeInTheDocument();
    
    // Check progress bar width
    const progressBar = container.querySelector('.progressBar') as HTMLElement;
    expect(progressBar).toBeInTheDocument();
    expect(progressBar.style.width).toBe('30%'); // searching_dense maps to 30
  });

  it('Scenario 3: Complete/Generating - shows check icon and sources, hides progress bar', () => {
    const ragInfo: RAGInfo = {
      status: 'sources_ready',
      message: '✅ 找到 5 筆文獻',
      sources: Array(5).fill({ title: 'Mock Source', snippet: 'text', score: 1, chunk_id: '1' }),
    };
    const { container } = render(<RAGStatusPanel ragInfo={ragInfo} />);
    
    expect(screen.getByText('✅ 找到 5 筆文獻')).toBeInTheDocument();
    expect(screen.getByText('找到 5 筆文獻')).toBeInTheDocument();
    
    const progressBar = container.querySelector('.progressBar');
    expect(progressBar).not.toBeInTheDocument();
  });
});
