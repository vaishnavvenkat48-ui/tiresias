import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PushPin } from '@phosphor-icons/react';

/**
 * Neumorphic concept node. Memoised on `data` — physics ticks only move the
 * React Flow wrapper (transform), so this body does not re-render per frame.
 * Visual state (dim / highlight / selected / dragging) is driven by classes on
 * the wrapper, also without re-rendering this component.
 */
const ConceptNode = ({ data }) => {
  const depthCls = `depth-${Math.min(data.depth, 3)}`;
  return (
    <div className={`kg-node ${depthCls}${data.depth === 0 ? ' is-root' : ''}${data.isNew ? ' is-new' : ''}${data.ai ? ' is-ai' : ''}`} title={`${data.label}${data.ai ? ' · AI-suggested concept' : ''}${data.description ? `\n\n${data.description.slice(0, 220)}` : ''}`}>
      {/* Invisible anchors — floating edges compute their own endpoints */}
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
      <span className="kg-dot" aria-hidden="true" />
      <span className="kg-label">{data.label}</span>
      {(data.expanding || data.pinned || data.hiddenCount > 0) && (
        <span className="kg-meta">
          {data.expanding && <span className="kg-spinner" aria-label="Expanding" />}
          {data.pinned && <PushPin size={11} weight="fill" className="kg-pin" aria-label="Pinned" />}
          {data.hiddenCount > 0 && <span className="kg-count" aria-label={`${data.hiddenCount} hidden`}>+{data.hiddenCount}</span>}
        </span>
      )}
    </div>
  );
};

export default memo(ConceptNode);
