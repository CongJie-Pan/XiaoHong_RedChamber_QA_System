/**
 * Citations Styles
 * CSS-in-JS styles using antd-style
 */

import { createStyles } from 'antd-style';

export const useStyles = createStyles(({ css, token }) => ({
  container: css`
    margin-top: 12px;
  `,

  header: css`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    cursor: pointer;
    user-select: none;
    color: ${token.colorTextSecondary};
    font-size: 13px;

    &:hover {
      color: ${token.colorText};
    }
  `,

  icon: css`
    color: ${token.colorTextTertiary};
    transition: transform 0.2s ${token.motionEaseOut};
  `,

  iconExpanded: css`
    transform: rotate(90deg);
  `,

  count: css`
    color: ${token.colorTextQuaternary};
    font-size: 12px;
  `,

  list: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 20px;
  `,

  link: css`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: ${token.borderRadius}px;
    font-size: 13px;
    color: ${token.colorLink};
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: all 0.2s;

    &:hover {
      background: ${token.colorFillQuaternary};
      color: ${token.colorLinkHover};
    }
  `,

  linkIcon: css`
    flex-shrink: 0;
    color: ${token.colorTextQuaternary};
  `,

  linkNumber: css`
    flex-shrink: 0;
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorFillTertiary};
    color: ${token.colorTextSecondary};
    font-size: 11px;
    font-weight: 500;
  `,

  linkText: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,

  sourcesGrid: css`
    display: flex;
    overflow-x: auto;
    gap: 10px;
    padding: 6px 2px 8px 2px;

    // Smooth scrolling & hide scrollbar for webkit
    scroll-behavior: smooth;
    &::-webkit-scrollbar {
      height: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: ${token.colorBorder};
      border-radius: 4px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
  `,

  sourceCard: css`
    flex: 0 0 240px; /* Fixed width for cards */
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: ${token.colorFillQuaternary};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    transition: all 0.2s;
    cursor: default;

    &:hover {
      background: ${token.colorFillTertiary};
      border-color: ${token.colorPrimaryBorder};
    }
  `,

  sourceHeader: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,

  sourceTitle: css`
    font-size: 13px;
    font-weight: 500;
    color: ${token.colorText};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,

  sourceSnippet: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
    line-height: 1.5;
    
    // Clamp to 3 lines
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
}));
