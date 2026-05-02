import { createStyles } from 'antd-style';

export const useStyles = createStyles(({ css }) => ({
  toolbar: css`
    position: fixed;
    z-index: 1000;
    display: flex;
    align-items: center;
    background: #262626;
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    gap: 2px;
    pointer-events: auto;
    border: 1px solid #434343;
    animation: fadeIn 0.15s ease-out;

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `,
  button: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: #bfbfbf;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
      background: #434343;
      color: #ffffff;
    }

    &:active {
      background: #595959;
    }
  `,
  divider: css`
    width: 1px;
    height: 16px;
    background: #434343;
    margin: 0 2px;
  `,
  label: css`
    font-size: 12px;
    padding: 0 8px;
    color: #8c8c8c;
    border-left: 1px solid #434343;
    height: 16px;
    display: flex;
    align-items: center;
  `,
}));
