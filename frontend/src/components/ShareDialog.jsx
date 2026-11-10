import { useEffect, useState } from 'react';
import { Copy, Check, ShareNetwork, LinkBreak } from '@phosphor-icons/react';
import { Modal, Spinner } from './UI';
import { graphsApi } from '../services/dataService';
import { errorMessage } from '../services/api';

/**
 * Create / copy / revoke a public read-only link for a graph.
 * `graph` is { _id|id, title, shareId? }; `onChange(shareId|null)` reports the new state.
 */
const ShareDialog = ({ graph, onClose, onChange }) => {
  const id = graph?._id || graph?.id;
  const [shareId, setShareId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setShareId(graph?.shareId || null); setError(''); setCopied(false); }, [graph]);

  const url = shareId ? `${window.location.origin}/g/${shareId}` : '';

  const toggle = async (enabled) => {
    setBusy(true); setError('');
    try {
      const res = await graphsApi.share(id, enabled);
      setShareId(res.shareId);
      onChange?.(res.shareId);
    } catch (e) {
      setError(errorMessage(e, 'Could not update the share link.'));
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select fallback */ }
  };

  return (
    <Modal open={!!graph} onClose={onClose} title="Share this graph" description={graph ? `Anyone with the link can view “${graph.title}” (read-only). They can't edit it or see your other graphs.` : ''}>
      {error && <p role="alert" className="mb-3 text-[13px] text-danger">{error}</p>}
      {shareId ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <label htmlFor="share-url" className="sr-only">Share link</label>
            <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} className="input !text-[13px]" />
            <button type="button" className="btn btn-primary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => toggle(false)}>{busy ? <Spinner size={13} /> : <LinkBreak size={14} />} Stop sharing (the link stops working)</button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy || !id} onClick={() => toggle(true)}>{busy ? <Spinner size={14} /> : <ShareNetwork size={15} />} Create share link</button>
      )}
    </Modal>
  );
};

export default ShareDialog;
