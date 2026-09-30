import React from 'react';
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from '../../utils/markdown';

/**
 * Markdown 预览。
 *
 * 逐节点造 React 元素，全程不用 dangerouslySetInnerHTML：
 * 正文里的 `<script>` 只会原样显示成文字，不会被执行。
 */

const HEADING_CLASSES: Record<number, string> = {
  1: 'text-xl font-semibold',
  2: 'text-lg font-semibold',
  3: 'text-base font-semibold',
  4: 'text-sm font-semibold',
  5: 'text-sm font-medium',
  6: 'text-xs font-semibold uppercase tracking-wide text-content-tertiary',
};

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

const renderInline = (nodes: MarkdownInline[], keyPrefix: string): React.ReactNode[] =>
  nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-content">
            {renderInline(node.children, key)}
          </strong>
        );
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'strike':
        return (
          <del key={key} className="text-content-tertiary">
            {renderInline(node.children, key)}
          </del>
        );
      case 'code':
        return (
          <code
            key={key}
            className="rounded-sm border border-line-subtle bg-inset px-1 py-0.5 font-mono text-[0.85em]"
          >
            {node.value}
          </code>
        );
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            {renderInline(node.children, key)}
          </a>
        );
    }
  });

const Block: React.FC<{ block: MarkdownBlock; idPrefix: string }> = ({ block, idPrefix }) => {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, block.level));
      const Tag = HEADING_TAGS[level - 1]!;
      return <Tag className={HEADING_CLASSES[level]}>{renderInline(block.children, idPrefix)}</Tag>;
    }
    case 'paragraph':
      return <p className="whitespace-pre-wrap">{renderInline(block.children, idPrefix)}</p>;
    case 'blockquote':
      return (
        <blockquote className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 text-content-secondary">
          {renderInline(block.children, idPrefix)}
        </blockquote>
      );
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} className="whitespace-pre-wrap">
          {renderInline(item, `${idPrefix}-${index}`)}
        </li>
      ));
      return block.ordered ? (
        <ol className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul className="list-disc space-y-1 pl-5">{items}</ul>
      );
    }
    case 'code':
      return (
        <div className="overflow-hidden rounded border border-line-subtle bg-inset">
          {block.language && (
            <div className="border-b border-line-subtle px-3 py-1 text-2xs text-content-tertiary">
              {block.language}
            </div>
          )}
          <pre className="overflow-x-auto p-3">
            <code className="font-mono text-xs leading-relaxed text-content-secondary">
              {block.value}
            </code>
          </pre>
        </div>
      );
    case 'hr':
      return <hr className="border-line-subtle" />;
  }
};

export interface MarkdownPreviewProps {
  source: string;
  /** 正文为空时的占位文案 */
  emptyText?: string;
  className?: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  source,
  emptyText = '还没写内容，切回「编辑」开始吧。',
  className = '',
}) => {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);

  return (
    <div className={`space-y-3 text-sm leading-relaxed text-content ${className}`}>
      {blocks.length === 0 ? (
        <p className="text-content-tertiary italic">{emptyText}</p>
      ) : (
        blocks.map((block, index) => <Block key={index} block={block} idPrefix={`b${index}`} />)
      )}
    </div>
  );
};
