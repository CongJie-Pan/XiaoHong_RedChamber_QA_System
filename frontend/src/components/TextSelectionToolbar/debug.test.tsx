import { App } from 'antd';
import { describe, it, vi } from 'vitest';

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: { success: 'mocked success' }
    })
  }
}));

describe('Debug antd mock', () => {
  it('should return mocked App.useApp()', () => {
    console.log(App.useApp());
  });
});
