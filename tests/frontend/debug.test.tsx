import { App } from 'antd';
import { describe, it, vi } from 'vitest';

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
      },
      notification: {},
      modal: {},
    }),
  },
}));

describe('Debug antd mock', () => {
  it('should return mocked App.useApp()', () => {
    console.log('DEBUG APP USEAPP:', App.useApp());
  });
});
