import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare, X, Send, Loader2, FileText, Globe, Search, CheckCheck, ExternalLink } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ReportChatProps {
  runIds: number[];
  address: string;
  projectType?: string | null;
  zoning?: string | null;
  tifName?: string | null;
  opportunityZone?: boolean | null;
  reportSnapshot?: string | null;
}

/** One provenance-tagged block of an assistant answer. */
interface AnswerBlock {
  kind: "report" | "outside" | "plain";
  text: string;
  cite?: string; // report field/section OR outside source name
  url?: string;  // outside blocks only
}

/**
 * Parse the assistant's marker format into provenance blocks:
 *   :::report cite="TIF field"
 *   ...text...
 *   :::outside source="City of Chicago — TIF Program" url="https://..."
 *   ...text...
 * Content with no markers (legacy history) renders as a single "plain" block.
 */
export function parseAssistantBlocks(content: string): AnswerBlock[] {
  const markerRe = /^:::(report|outside)([^\n]*)$/gm;
  const matches = Array.from(content.matchAll(markerRe));
  if (matches.length === 0) {
    const text = content.trim();
    return text ? [{ kind: "plain", text }] : [];
  }
  const blocks: AnswerBlock[] = [];
  // Any preamble before the first marker renders as plain text
  const preamble = content.slice(0, matches[0].index).trim();
  if (preamble) blocks.push({ kind: "plain", text: preamble });

  matches.forEach((m, i) => {
    const kind = m[1] as "report" | "outside";
    const attrs = m[2] || "";
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const text = content.slice(start, end).trim();
    if (!text) return;
    const cite = /(?:cite|source)="([^"]*)"/.exec(attrs)?.[1]?.trim() || undefined;
    const url = /url="(https?:\/\/[^"]*)"/.exec(attrs)?.[1]?.trim() || undefined;
    blocks.push({ kind, text, cite, url });
  });
  return blocks.length ? blocks : [{ kind: "plain", text: content.trim() }];
}

function generateSuggestions(props: Omit<ReportChatProps, "runIds" | "reportSnapshot">): string[] {
  const { projectType, zoning, tifName, opportunityZone } = props;
  const q: string[] = [];

  if (projectType) {
    q.push(`What incentives apply to a ${projectType} project here?`);
  } else {
    q.push("What programs or incentives apply to this property?");
  }

  if (zoning) {
    q.push(`What uses are allowed under ${zoning} zoning?`);
  }

  if (tifName && tifName !== "Not in TIF District") {
    q.push(`How does the ${tifName} TIF district benefit my project?`);
  } else {
    q.push("Is this property in a TIF district, and what does that mean?");
  }

  if (opportunityZone) {
    q.push("What are the Opportunity Zone tax benefits for investing here?");
  } else {
    q.push("What is the SBIF program and do I qualify based on this report?");
  }

  return q.slice(0, 4);
}

/** Render **bold** spans without a markdown library. */
function renderInline(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p));
}

function AssistantMessage({ content }: { content: string }) {
  const blocks = parseAssistantBlocks(content);
  return (
    <div className="rc-amsg">
      <div className="rc-aname"><span className="d"></span>Report Assistant</div>
      {blocks.map((b, i) => (
        <div key={i} className={`rc-ablock ${b.kind}`}>
          {b.kind === "report" && (
            <span className="rc-prov report"><FileText size={11} />From this report</span>
          )}
          {b.kind === "outside" && (
            <span className="rc-prov outside"><Globe size={11} />Outside source</span>
          )}
          <div className="rc-atxt">{renderInline(b.text)}</div>
          {b.kind === "report" && b.cite && (
            <div className="rc-cite"><CheckCheck size={11} /><span className="rf">{b.cite}</span> · this report</div>
          )}
          {b.kind === "outside" && (
            <div className="rc-cite">
              {b.url ? (
                <><ExternalLink size={11} /><a href={b.url} target="_blank" rel="noopener noreferrer">{b.cite || b.url}</a></>
              ) : (
                <><Globe size={11} /><span>{b.cite ? `${b.cite} · ` : ""}general knowledge — verify independently</span></>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReportChat({
  runIds,
  address,
  projectType,
  zoning,
  tifName,
  opportunityZone,
  reportSnapshot,
}: ReportChatProps) {
  const { user, token } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const primaryRunId = runIds[0];

  useEffect(() => {
    if (!user || user.plan !== "subscriber" || !primaryRunId || historyLoaded) return;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`/api/runs/${primaryRunId}/chat`, { headers, credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages?.length) {
          setMessages(data.messages);
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [user, token, primaryRunId, historyLoaded]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }, 100);
  }, [open, messages.length]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;
    const userMsg: Message = { role: "user", content: content.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/report-chat", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ runIds, messages: updatedMessages, reportSnapshot }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Failed to get response");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, messages, runIds, token, reportSnapshot]);

  if (!user || user.plan !== "subscriber") return null;

  const suggestions = generateSuggestions({ address, projectType, zoning, tifName, opportunityZone });
  const shortAddress = address.split(",")[0];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="rc-launch"
          data-testid="button-open-report-chat"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Report Assistant</span>
          {historyLoaded && messages.length > 0 && (
            <span className="cnt">{messages.length}</span>
          )}
        </button>
      )}

      {open && (
        <div className="rc-panel fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[400px] h-[560px]">
          <div className="rc-hd">
            <span className="ic"><MessageSquare size={17} /></span>
            <div className="min-w-0">
              <div className="rc-hd-t ttl">Report Assistant</div>
              <div className="addr truncate">{shortAddress}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="x"
              data-testid="button-close-report-chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rc-body">
            {!historyLoaded ? (
              <div className="rc-status">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading conversation…
              </div>
            ) : (
              <>
                <div className="rc-intro">
                  Ask anything about this property. I answer from <b>this report and its data first</b> — and clearly mark anything I bring in from outside, with a source.
                </div>
                <div className="rc-key">
                  <span className="rc-kchip"><span className="kd rp"></span>From this report</span>
                  <span className="rc-kchip"><span className="kd out"></span>Outside source · cited</span>
                </div>

                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="rc-umsg"><div className="bub">{m.content}</div></div>
                  ) : (
                    <AssistantMessage key={i} content={m.content} />
                  )
                )}

                {messages.length === 0 && (
                  <>
                    <div className="rc-sugh">Suggested questions</div>
                    <div className="rc-sug">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          className="rc-schip"
                          data-testid={`button-chat-suggestion-${i}`}
                        >
                          <Search size={13} />
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {loading && (
              <div className="rc-status">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking…
              </div>
            )}

            {error && (
              <p className="rc-status" style={{ justifyContent: "center" }}>{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="rc-foot">
            <div className="rc-inputrow">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Ask about this report…"
                data-testid="input-chat-message"
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="rc-send"
                data-testid="button-send-chat"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="rc-disc">Answers use this report and its data first. Outside info is cited — verify independently.</p>
          </div>
        </div>
      )}
    </>
  );
}
