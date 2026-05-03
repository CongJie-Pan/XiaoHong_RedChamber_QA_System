'use client';

// =================================================================
// MARKDOWN RENDERING CONFIGURATIONS
// Why: Standardizes the rendering of AI-generated Markdown. 
// Specifically handles XSS sanitization for links and images, and 
// injects custom interactive logic into standard Markdown elements 
// like blockquotes.
// =================================================================

import React from 'react';
import { Components } from 'react-markdown';
import { CornerDownRight } from 'lucide-react';

/**
 * Safe URL protocols whitelist
 */
const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/**
 * Validate URL is safe (http/https/mailto only)
 */
export function isSafeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return SAFE_URL_PROTOCOLS.includes(urlObj.protocol);
  } catch {
    // Relative URLs are safe
    return url.startsWith('/') || url.startsWith('#');
  }
}

/**
 * Custom ReactMarkdown components for XSS protection and custom styling
 */
export const createMarkdownComponents = (
  styles: Record<string, string>, 
  cx: (...args: Array<string | false | null | undefined>) => string, 
  onQuoteClick: (text: string) => void
): Components => ({
  // Custom blockquote for citations
  // Why: Transform standard Markdown blockquotes into interactive elements
  // that can trigger UI actions (like highlighting source text).
  blockquote: ({ children }) => {
    // Extract text content from children to find it in the DOM
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(extractText).join('');
      if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.props.children) {
        return extractText(node.props.children);
      }
      return '';
    };
    const textContent = extractText(children).trim();


    return (
      <blockquote 
        className={cx(styles.quoteBlock, 'interactive-quote')} 
        onClick={() => onQuoteClick(textContent)}
        style={{ cursor: 'pointer' }}
        title="點擊以在文中反白此段落"
      >
        <CornerDownRight size={14} className={styles.quoteBlockArrow} />
        <div className={styles.quoteBlockContent}>
          {children}
        </div>
      </blockquote>
    );
  },
  // Sanitize links - only allow safe protocols
  a: ({ href, children, ...props }) => {
    if (!isSafeUrl(href)) {
      return <span>{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },
  // Sanitize images - only allow safe src URLs
  img: ({ src, alt, ...props }) => {
    const isValidSrc = src && typeof src === 'string' && (
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('data:image/')
    );
    if (!isValidSrc) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt || ''} {...props} />;
  },
  // Prevent script tags
  script: () => null,
});
