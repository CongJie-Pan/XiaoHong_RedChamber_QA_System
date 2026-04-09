/**
 * ChatInput Styles
 * CSS-in-JS styles using antd-style
 *
 * DeepSeek-style layout: the textarea and toolbar are stacked inside a single
 * rounded container. The toolbar holds mode-toggle pills on the left and the
 * circular send button on the right — all on the same horizontal line.
 */

import { createStyles } from 'antd-style';

export const useStyles = createStyles(({ css, token }) => ({
  // Outer container: column-flex card that highlights on focus-within
  container: css`
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 12px 16px 10px;
    background: ${token.colorBgElevated};
    border: 1px solid ${token.colorBorder};
    border-radius: ${token.borderRadiusLG}px;
    margin: 0 16px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    transition: border-color 0.2s, box-shadow 0.2s;

    &:focus-within {
      border-color: ${token.colorPrimary};
      box-shadow: 0 0 0 2px ${token.colorPrimaryBg};
    }
  `,

  // Borderless textarea that fills the top of the card
  textarea: css`
    width: 100%;
    min-height: 44px;
    max-height: 200px;
    padding: 4px 0;
    border: none;
    background: transparent;
    color: ${token.colorText};
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;

    &::placeholder {
      color: ${token.colorTextPlaceholder};
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `,

  // Bottom row: left-side mode pills + right-side send button
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
    gap: 8px;
  `,

  toolbarLeft: css`
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  `,

  toolbarRight: css`
    display: flex;
    align-items: center;
    flex-shrink: 0;
  `,

  // Faint character counter
  charCount: css`
    font-size: 11px;
    color: ${token.colorTextQuaternary};
    margin-left: 4px;
  `,

  // Circular send button aligned in the toolbar
  sendButton: css`
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: ${token.colorPrimary};
    color: ${token.colorWhite};
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: ${token.colorPrimaryHover};
      transform: scale(1.05);
    }

    &:active:not(:disabled) {
      background: ${token.colorPrimaryActive};
    }

    &:disabled {
      background: ${token.colorBgContainerDisabled};
      color: ${token.colorTextDisabled};
      cursor: not-allowed;
    }
  `,

  stopButton: css`
    background: ${token.colorError};

    &:hover:not(:disabled) {
      background: ${token.colorErrorHover};
    }

    &:active:not(:disabled) {
      background: ${token.colorErrorActive};
    }
  `,

  // Pill-shaped mode toggle buttons with icon + label text
  toggleButton: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    height: 28px;
    border: 1px solid ${token.colorBorder};
    border-radius: 14px;
    background: transparent;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;

    &:hover {
      color: ${token.colorPrimary};
      border-color: ${token.colorPrimary};
      background: ${token.colorPrimaryBg};
    }
  `,

  toggleButtonActive: css`
    color: ${token.colorPrimary};
    border-color: ${token.colorPrimary};
    background: ${token.colorPrimaryBg};
    font-weight: 500;

    &:hover {
      background: ${token.colorPrimaryBgHover};
    }
  `,

  // Stubs kept for backward-compat so any old references don't cause TS errors
  inputWrapper: css`flex: 1;`,
  hint: css`display: none;`,
  actionBar: css`display: none;`,
}));
