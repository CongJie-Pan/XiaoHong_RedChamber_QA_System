/**
 * MessageList Styles
 * CSS-in-JS styles using antd-style
 */

import { createStyles, keyframes } from 'antd-style';

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const cursorBlink = keyframes`
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
`;

export const useStyles = createStyles(({ css, token }) => ({
  // MessageList styles
  container: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  `,

  empty: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 40px;
    gap: 14px;
  `,

  emptyTitle: css`
    font-size: 26px;
    font-weight: 700;
    color: ${token.colorText};
    margin: 0;
    line-height: 1.4;
    letter-spacing: -0.3px;
  `,

  emptyDescription: css`
    font-size: 15px;
    color: ${token.colorTextTertiary};
    margin: 0;
  `,

  // MessageItem styles
  messageItem: css`
    display: flex;
    gap: 12px;
    animation: ${fadeIn} 0.3s ease-out;
  `,

  userMessage: css`
    flex-direction: row-reverse;

    .bubbleWrapper {
      align-items: flex-end;
    }
  `,

  avatar: css`
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  `,

  userAvatar: css`
    background: ${token.colorPrimary};
    color: ${token.colorWhite};
  `,

  assistantAvatar: css`
    background: #F9EBEB;
    color: #8B1E1E;
  `,

  // AI Message wrapper - vertical layout
  assistantMessageWrapper: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 0;
    overflow: hidden; /* Hard clip anything wider than this flex child */
  `,

  // AI Message header - avatar, model name, timestamp in a row
  assistantHeader: css`
    display: flex;
    align-items: center;
    gap: 8px;

    &:hover .hoverTimestamp {
      opacity: 1;
    }
  `,

  modelName: css`
    font-size: 13px;
    font-weight: 500;
    color: ${token.colorTextSecondary};
    white-space: nowrap;
  `,

  hoverTimestamp: css`
    font-size: 12px;
    color: ${token.colorTextQuaternary};
    opacity: 0;
    transition: opacity 0.2s;
    margin-left: 4px;
  `,

  bubbleWrapper: css`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    min-width: 0;
    gap: 4px;
  `,

  bubble: css`
    padding: 12px 16px;
    border-radius: ${token.borderRadiusLG}px;
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
    overflow: hidden;
  `,

  userBubble: css`
    background: ${token.colorPrimary};
    color: ${token.colorWhite};
    border-bottom-right-radius: 4px;
  `,

  assistantBubble: css`
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    border-bottom-left-radius: 4px;
  `,

  content: css`
    font-size: 16px;
    overflow-wrap: anywhere;
    word-break: break-word;

    p {
      margin: 0 0 8px 0;

      &:last-child {
        margin-bottom: 0;
      }
    }

    code {
      padding: 2px 6px;
      background: ${token.colorFillTertiary};
      border-radius: ${token.borderRadiusSM}px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
    }

    pre {
      padding: 12px;
      background: ${token.colorFillQuaternary};
      border-radius: ${token.borderRadius}px;
      overflow-x: auto;

      code {
        padding: 0;
        background: transparent;
      }
    }

    ul, ol {
      margin: 8px 0;
      padding-left: 20px;
    }

    ul {
      list-style-type: disc;
    }

    ol {
      list-style-type: decimal;
    }

    li {
      margin: 4px 0;
    }

    a {
      color: ${token.colorLink};
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  `,

  streamingCursor: css`
    display: inline-block;
    width: 2px;
    height: 16px;
    background: ${token.colorText};
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: ${cursorBlink} 1s step-end infinite;
  `,

  thinkingPanelWrapper: css`
    margin-bottom: 12px;
  `,

  citationsWrapper: css`
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid ${token.colorBorderSecondary};
    width: 100%;
    min-width: 0;
  `,

  // Scroll to bottom button
  scrollButton: css`
    position: sticky;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: ${token.colorPrimary};
    color: ${token.colorWhite};
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    z-index: 10;

    &:hover {
      background: ${token.colorPrimaryHover};
      transform: translateX(-50%) scale(1.1);
    }

    &:active {
      transform: translateX(-50%) scale(0.95);
    }
  `,

  // Action buttons container
  actionButtons: css`
    display: flex;
    gap: 8px;
  `,

  // Action button style (copy, regenerate)
  actionButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: ${token.borderRadius}px;
    background: transparent;
    color: ${token.colorText};
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      color: ${token.colorPrimary};
      transform: scale(1.1);
    }

    &:active {
      transform: scale(0.95);
    }
  `,

  // Legacy: keep for user messages
  copyButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: ${token.borderRadius}px;
    background: transparent;
    color: ${token.colorText};
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      color: ${token.colorPrimary};
      transform: scale(1.1);
    }

    &:active {
      transform: scale(0.95);
    }
  `,

  // User message action buttons container
  userActionButtons: css`
    display: flex;
    gap: 8px;
  `,

  // Edit mode container
  editModeContainer: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 80%;
  `,

  // Edit textarea
  editTextarea: css`
    width: 100%;
    min-height: 80px;
    padding: 12px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    font-size: 14px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
    background: ${token.colorBgContainer};
    color: ${token.colorText};

    &:focus {
      border-color: ${token.colorPrimary};
    }

    &::placeholder {
      color: ${token.colorTextPlaceholder};
    }
  `,

  // Edit mode buttons container
  editButtons: css`
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  `,

  // Edit mode button base
  editButton: css`
    padding: 6px 16px;
    border-radius: ${token.borderRadius}px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  `,

  // Save button
  editSaveButton: css`
    background: ${token.colorPrimary};
    color: ${token.colorWhite};

    &:hover {
      background: ${token.colorPrimaryHover};
    }

    &:disabled {
      background: ${token.colorBgContainerDisabled};
      color: ${token.colorTextDisabled};
      cursor: not-allowed;
    }
  `,

  // Cancel button
  editCancelButton: css`
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    border: 1px solid ${token.colorBorderSecondary};

    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorPrimary};
    }
  `,
}));
