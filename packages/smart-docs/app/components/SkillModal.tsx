'use client';

import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
// Cast to any to avoid React 19 JSX type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Skill } from '@/types';
import Modal from './Modal';
import SourceBadge from './SourceBadge';

interface SkillModalProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
}

const getLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md':
      return 'markdown';
    case 'js':
      return 'javascript';
    case 'ts':
      return 'typescript';
    case 'json':
      return 'json';
    case 'py':
      return 'python';
    case 'sh':
      return 'bash';
    case 'yml':
    case 'yaml':
      return 'yaml';
    default:
      return 'text';
  }
};

const sortFiles = (files: string[]): string[] => {
  return [...files].sort((a, b) => {
    const aBasename = a.split('/').pop() || a;
    const bBasename = b.split('/').pop() || b;

    // skill.md always comes first (case-insensitive)
    if (aBasename.toLowerCase() === 'skill.md') return -1;
    if (bBasename.toLowerCase() === 'skill.md') return 1;

    // Otherwise alphabetical
    return aBasename.localeCompare(bBasename);
  });
};

export default function SkillModal({ skill, isOpen, onClose }: SkillModalProps) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Reset to first tab when skill changes
  useEffect(() => {
    setActiveFileIndex(0);
  }, [skill?.name]);

  if (!skill) return null;

  const sortedFiles = sortFiles(skill.files);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={skill.name}>
      <div className="space-y-4">
        {/* Header info */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SourceBadge source={skill.source} />
          </div>
          {skill.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {skill.description}
            </p>
          )}
        </div>

        {sortedFiles.length === 0 ? (
          <p className="text-sm text-gray-500">No files found for this skill</p>
        ) : (
          <>
            {/* File tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex overflow-x-auto">
                {sortedFiles.map((filename, idx) => {
                  return (
                    <button
                      key={idx}
                      className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                        activeFileIndex === idx
                          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                      onClick={() => setActiveFileIndex(idx)}
                    >
                      {filename}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* File content */}
            <div>
              {skill.fileContents && skill.fileContents[sortedFiles[activeFileIndex]] ? (
                <SyntaxHighlighter
                  language={getLanguageFromFilename(sortedFiles[activeFileIndex])}
                  style={vscDarkPlus as any}
                  className="text-xs rounded"
                >
                  {skill.fileContents[sortedFiles[activeFileIndex]]}
                </SyntaxHighlighter>
              ) : (
                <p className="text-sm text-gray-500 italic">Content not loaded</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
