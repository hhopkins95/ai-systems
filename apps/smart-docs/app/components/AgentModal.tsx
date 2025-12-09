'use client';

import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
// Cast to any to avoid React 19 JSX type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AgentWithSource } from '@/types';
import Modal from './Modal';
import SourceBadge from './SourceBadge';

interface AgentModalProps {
  agent: AgentWithSource | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentModal({ agent, isOpen, onClose }: AgentModalProps) {
  if (!agent) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={agent.name}>
      <div className="space-y-4">
        {/* Header info */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SourceBadge source={agent.source} />
          </div>
          {agent.metadata?.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {agent.metadata.description}
            </p>
          )}
        </div>

        {/* Content */}
        <div>
          <SyntaxHighlighter
            language="markdown"
            style={vscDarkPlus as any}
            className="text-xs rounded"
          >
            {agent.content}
          </SyntaxHighlighter>
        </div>
      </div>
    </Modal>
  );
}
