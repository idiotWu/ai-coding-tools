import React, { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

interface CodeBlockProps {
  code: string;
  language?: string;
  searchTerm?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, searchTerm }) => {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      // Reset the element for re-highlighting
      codeRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  // Highlight search term in code if present
  const highlightSearchTerm = (text: string): React.ReactNode => {
    if (!searchTerm?.trim()) return text;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <mark key={i} className="search-highlight">{part}</mark>
      ) : (
        part
      )
    );
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
        <code ref={codeRef} className={language ? `language-${language}` : ''}>
          {searchTerm ? highlightSearchTerm(code) : code}
        </code>
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
