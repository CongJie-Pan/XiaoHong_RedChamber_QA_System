/**
 * ConversationList Styles
 * CSS-in-JS styles using antd-style
 */

import { createStyles } from 'antd-style';

export const useStyles = createStyles(({ css, token }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: ${token.colorBgLayout};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,

  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,

  title: css`
    font-size: 16px;
    font-weight: 600;
    color: ${token.colorText};
  `,

  newButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorPrimary};
    color: ${token.colorWhite};
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: ${token.colorPrimaryHover};
    }
  `,

  list: css`
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  `,

  item: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    margin-bottom: 4px;
    border-radius: ${token.borderRadius}px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,

  itemActive: css`
    background: ${token.colorPrimaryBg};

    &:hover {
      background: ${token.colorPrimaryBgHover};
    }
  `,

  itemContent: css`
    flex: 1;
    min-width: 0;
  `,

  itemTitle: css`
    font-size: 14px;
    font-weight: 500;
    color: ${token.colorText};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  `,

  itemPreview: css`
    font-size: 12px;
    color: ${token.colorTextTertiary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,

  itemMeta: css`
    font-size: 11px;
    color: ${token.colorTextQuaternary};
    margin-top: 4px;
  `,

  itemIcon: css`
    flex-shrink: 0;
    color: ${token.colorTextTertiary};
    margin-top: 2px;
  `,

  deleteButton: css`
    flex-shrink: 0;
    opacity: 0;
    color: ${token.colorTextTertiary};
    transition: all 0.2s;

    .${/* sc-selector */ ''} &:hover & {
      opacity: 1;
    }
  `,

  itemHover: css`
    &:hover .delete-btn {
      opacity: 1;
    }
  `,

  empty: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: ${token.colorTextQuaternary};
    text-align: center;
  `,

  emptyIcon: css`
    margin-bottom: 12px;
    opacity: 0.5;
  `,

  emptyText: css`
    font-size: 13px;
  `,

  loading: css`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
  `,
}));
