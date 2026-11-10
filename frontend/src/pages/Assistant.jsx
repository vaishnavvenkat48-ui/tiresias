import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PaperPlaneRight, Sparkle, TreeStructure, ArrowCounterClockwise, Graph, User, Trash, Globe } from '@phosphor-icons/react';
import { aiApi, graphsApi } from '../services/dataService';
import { errorMessage } from '../services/api';
import { useAsync } from '../utils/useAsync';
import { useUser } from '../context/UserContext';
import { Spinner } from '../components/UI';

const KEY = 'tiresias_chat';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };

const STARTERS = (graph) => graph
  ? [`Summarise “${graph.title}” in five points`, `What should I study first in ${graph.title}?`, `Which concepts in this graph connect the most ideas?`, `Quiz me on ${graph.title}`]
  : ['What have I been exploring lately?', 'Suggest a topic that connects my recent interests', 'Explain a concept like I am new to it', 'How should I structure a study session?'];

/** Server message → UI message. */
const fromServer = (m, graphId) => ({ role: m.role === 'assistant' ? 'ai' : 'user', text: m.content, sources: m.sources || [], provider: m.provider, graphId });

const Assistant = () => {
  const saved = load();
  const { analytics, refresh } = useUser();
  const graphs = useAsync(() => graphsApi.list({ limit: 100 }).then((d) => d.items || []), []);
  const convos = useAsync(() => aiApi.conversations().then((d) => d.items || []), []);
  const [graphId, setGraphId] = useState(saved?.graphId || '');
  const [conversationId, setConversationId] = useState(saved?.conversationId || null);
  const [messages, setMessages] = useState(saved?.messages || []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const graph = graphs.data?.find((g) => g._id === graphId) || null;

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify({ graphId, conversationId, messages: messages.slice(-40) })); } catch { /* noop */ }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, graphId, conversationId]);

  const newConversation = () => { setConversationId(null); setMessages([]); inputRef.current?.focus(); };

  const openConversation = async (id) => {
    try {
      const c = await aiApi.conversation(id);
      setConversationId(c._id);
      setGraphId(c.graphId || '');
      setMessages(c.messages.map((m) => fromServer(m, c.graphId)));
    } catch (e) {
      setMessages([{ role: 'ai', text: errorMessage(e, 'Could not open that conversation.'), error: true }]);
    }
  };

  const removeConversation = async (id) => {
    await aiApi.deleteConversation(id).catch(() => null);
    convos.setData((list) => (list || []).filter((c) => c._id !== id));
    if (id === conversationId) newConversation();
  };

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await aiApi.chat({ message: question, conversationId: conversationId || undefined, graphId: graphId || undefined });
      if (!conversationId) convos.reload();
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: 'ai', text: res.answer, sources: res.sources || [], provider: res.provider, graph: res.context?.graph, graphId: res.context?.graphId || graphId }]);
      refresh();
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', text: errorMessage(e, 'The assistant could not answer right now.'), error: true }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const recentTopics = (analytics?.topTopics || []).slice(0, 5);

  return (
    <div className="grid gap-6 lg:h-[calc(100dvh-80px)] lg:grid-cols-[280px_1fr]">
      {/* Context column */}
      <aside className="space-y-4">
        <div>
          <p className="eyebrow">AI Assistant</p>
          <h1 className="h-page mt-1 !text-[32px]">Ask Tiresias</h1>
          <p className="mt-2 text-[13.5px] text-fg-2">Answers are grounded in your saved graphs and exploration history.</p>
        </div>
        <section className="surface-sm p-4">
          <label htmlFor="ground" className="field-label flex items-center gap-1.5"><TreeStructure size={14} /> Ground answers in</label>
          <select id="ground" className="input" value={graphId} onChange={(e) => setGraphId(e.target.value)} disabled={graphs.loading}>
            <option value="">My history only</option>
            {(graphs.data || []).map((g) => <option key={g._id} value={g._id}>{g.title} ({g.nodes?.length || 0})</option>)}
          </select>
          {graph && (
            <Link to={`/explore?graph=${graph._id}`} className="mt-3 flex items-center gap-1.5 text-[12.5px] text-fg-2 hover:text-fg"><Graph size={13} /> Open this graph</Link>
          )}
          {!graphs.loading && !graphs.data?.length && <p className="mt-2 text-[12px] text-fg-3">Save a graph from Explore to ground answers in it.</p>}
        </section>
        {recentTopics.length > 0 && (
          <section className="surface-sm hidden p-4 lg:block">
            <p className="field-label">Your recent topics</p>
            <div className="flex flex-wrap gap-1.5">
              {recentTopics.map((t) => <button key={t.name} type="button" className="chip" onClick={() => send(`Explain ${t.name} and how it connects to my other interests`)}>{t.name}</button>)}
            </div>
          </section>
        )}
        <section className="surface-sm hidden p-3 lg:block">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-[12.5px] font-medium text-fg-2">Conversations</p>
            <button type="button" className="btn btn-ghost btn-sm !h-7" onClick={newConversation}><ArrowCounterClockwise size={13} /> New</button>
          </div>
          {!convos.data?.length && <p className="px-1 py-2 text-[12px] text-fg-3">Your chats are saved here.</p>}
          <ul className="max-h-60 space-y-0.5 overflow-y-auto">
            {(convos.data || []).map((c) => (
              <li key={c._id} className="group flex items-center gap-1">
                <button type="button" onClick={() => openConversation(c._id)} aria-current={c._id === conversationId ? 'true' : undefined}
                  className={`min-w-0 flex-1 truncate rounded-[8px] px-2 py-1.5 text-left text-[12.5px] ${c._id === conversationId ? 'bg-hover text-fg' : 'text-fg-2 hover:bg-hover'}`} title={c.title}>
                  {c.title}
                </button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm !h-7 !w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete conversation ${c.title}`} onClick={() => removeConversation(c._id)}><Trash size={12} /></button>
              </li>
            ))}
          </ul>
        </section>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={newConversation}><ArrowCounterClockwise size={14} /> New conversation</button>
        )}
      </aside>

      {/* Conversation */}
      <section className="surface flex min-h-[70dvh] flex-col overflow-hidden lg:min-h-0" aria-label="Conversation">
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {!messages.length && (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center py-10 text-center">
              <span className="surface-sm mb-4 grid h-14 w-14 place-items-center text-accent"><Sparkle size={24} weight="duotone" /></span>
              <p className="text-[16px] font-semibold text-fg">{graph ? `Ask about “${graph.title}”` : 'What would you like to understand?'}</p>
              <p className="mt-1 text-[13px] text-fg-2">{graph ? `I can see its ${graph.nodes?.length || 0} concepts and how they connect.` : 'Choose a saved graph on the left for answers grounded in it.'}</p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {STARTERS(graph).map((s) => <button key={s} type="button" className="surface-sm surface-interactive p-3 text-left text-[13px] text-fg-2 hover:text-fg" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.role === 'user' ? 'well-sm text-fg-2' : 'surface-sm text-accent'}`}>
                  {m.role === 'user' ? <User size={15} /> : <Sparkle size={15} weight="fill" />}
                </span>
                <div className={`max-w-[85%] ${m.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`inline-block whitespace-pre-wrap px-4 py-3 text-left text-[14px] leading-relaxed ${m.role === 'user' ? 'well-sm text-fg' : 'surface-sm book-text text-fg'} ${m.error ? '!text-danger' : ''}`}>
                    {m.text}
                  </div>
                  {m.role === 'ai' && (m.sources?.length > 0 || m.provider) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {m.sources?.map((s) => (s.type === 'web'
                        ? <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="chip !h-6 !text-[11.5px]" title="Newly retrieved — not from your graph"><Globe size={11} /> {s.label}</a>
                        : m.graphId
                          ? <Link key={s.label} to={`/explore?graph=${m.graphId}&focus=${encodeURIComponent(s.label)}`} className="chip !h-6 !text-[11.5px]" title="Concept from your graph"><Graph size={11} /> {s.label}</Link>
                          : null))}
                      {m.graph && <span className="text-[11.5px] text-fg-3">from “{m.graph}”</span>}
                      {(m.provider === 'mock' || m.provider === 'offline') && <span className="badge">offline tutor</span>}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div className="flex gap-3">
              <span className="surface-sm grid h-8 w-8 place-items-center rounded-full text-accent"><Spinner size={14} /></span>
              <div className="surface-sm flex items-center gap-1.5 px-4 py-3">
                {[0, 1, 2].map((d) => <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-fg-2" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }} />)}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-line-strong p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <label htmlFor="ask" className="sr-only">Your question</label>
            <textarea
              id="ask" ref={inputRef} rows={1} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={graph ? `Ask about ${graph.title}…` : 'Ask anything…'}
              className="input max-h-40 min-h-[46px] resize-none"
            />
            <button type="submit" className="btn btn-primary btn-icon !h-[46px] !w-[46px]" disabled={!input.trim() || loading} aria-label="Send">
              <PaperPlaneRight size={18} weight="fill" />
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-fg-3">Enter to send · Shift+Enter for a new line</p>
        </form>
      </section>
    </div>
  );
};

export default Assistant;
