import React, { useMemo, useState } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

interface CodeBlockProps {
  code: string;
  language?: string;
  searchTerm?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, searchTerm }) => {
  const [copied, setCopied] = useState(false);

  // Use hljs.highlight() instead of highlightElement() to avoid direct DOM manipulation
  const highlightedHtml = useMemo(() => {
    if (searchTerm?.trim()) {
      // When searching, return plain text with search highlights
      // (syntax highlighting would interfere with search term highlighting)
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      // Fallback to escaped plain text
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }, [code, language, searchTerm]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="CodeBlock">
      <div className="CodeBlock__header">
        {language && <span className="CodeBlock__language">{language}</span>}
        <button className="CodeBlock__copy" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="CodeBlock__pre">
        <code
          className={language ? `language-${language}` : ''}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
};

// Utility function to parse markdown code blocks
export interface ParsedCodeBlock {
  type: 'code' | 'text';
  content: string;
  language?: string;
}

export function parseMarkdownCodeBlocks(text: string): ParsedCodeBlock[] {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const result: ParsedCodeBlock[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        result.push({ type: 'text', content: textBefore });
      }
    }

    // Add the code block
    result.push({
      type: 'code',
      content: match[2],
      language: match[1] || undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last code block
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText.trim()) {
      result.push({ type: 'text', content: remainingText });
    }
  }

  // If no code blocks found, return the entire text
  if (result.length === 0 && text.trim()) {
    result.push({ type: 'text', content: text });
  }

  return result;
}
