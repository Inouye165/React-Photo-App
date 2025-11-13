import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const INITIAL_TOTALS = Object.freeze({
  promptTokens: 0,
  responseTokens: 0,
  totalTokens: 0,
  totalCost: 0,
});

function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function formatCost(value) {
  const numeric = Number(value) || 0;
  return `$${numeric.toFixed(6)}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AiDebugConsole({ selectedPhotoId }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [runningTotals, setRunningTotals] = useState(INITIAL_TOTALS);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const placeholder = selectedPhotoId
    ? 'Ask about the selected photo...'
    : 'Select a photo from the gallery to debug...';

  useEffect(() => {
    setRunningTotals(INITIAL_TOTALS);
    if (!selectedPhotoId) {
      setMessages([]);
      return;
    }
    setMessages([
      {
        id: `system-${selectedPhotoId}`,
        kind: 'system',
        timestamp: new Date().toISOString(),
        text: `Ready to debug photo #${selectedPhotoId}. Enter a prompt to run the LangGraph pipeline.`,
      },
    ]);
  }, [selectedPhotoId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    if (!selectedPhotoId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          kind: 'error',
          timestamp: new Date().toISOString(),
          text: 'Please select a photo from the gallery before running the debug console.',
        },
      ]);
      return;
    }

    const promptTimestamp = new Date().toISOString();
    const promptMessage = {
      id: `prompt-${promptTimestamp}`,
      kind: 'prompt',
      prompt: trimmed,
      timestamp: promptTimestamp,
    };

    setMessages((prev) => [...prev, promptMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/chat/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt: trimmed,
          photoId: selectedPhotoId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      const debugData = payload.debugData || {};
      const responseTimestamp = debugData.timestamp || new Date().toISOString();
      const stepMessages = Array.isArray(debugData.steps)
        ? debugData.steps.map((step, index) => {
          // Prefer explicit prompt/response fields emitted by backend
          const promptFromStep = step?.prompt || step?.request?.userPrompt || step?.request?.systemPrompt || '';
          // If backend provided both system+user, format them clearly
          let promptText = '';
          if (step?.prompt) {
            promptText = step.prompt;
          } else {
            const parts = [];
            if (step?.request?.systemPrompt) parts.push(`System:\n${step.request.systemPrompt}`);
            if (step?.request?.userPrompt) parts.push(`User:\n${step.request.userPrompt}`);
            promptText = parts.join('\n\n');
          }

          let responseText = step?.response || step?.responseText || '';
          if (responseText && typeof responseText === 'object') {
            try {
              responseText = JSON.stringify(responseText, null, 2);
            } catch {
              responseText = String(responseText);
            }
          }

          return {
            id: `step-${responseTimestamp}-${index}`,
            kind: 'step',
            timestamp: step?.timestamp || responseTimestamp,
            nodeName: step?.nodeName || step?.step || `Step ${index + 1}`,
            prompt: String(promptText || promptFromStep || '').trim(),
            response: typeof responseText === 'string' ? responseText : String(responseText || ''),
            model: step?.model,
            tokens: {
              prompt: step?.promptTokens,
              response: step?.responseTokens,
              total: step?.totalTokens,
            },
            cost: step?.cost,
            notes: step?.notes,
          };
        })
        : [];

      const responseMessage = {
        id: `response-${responseTimestamp}`,
        kind: 'response',
        timestamp: responseTimestamp,
        debugData,
      };

      setMessages((prev) => [...prev, ...stepMessages, responseMessage]);

      const incremental = {
        promptTokens: debugData.promptTokens ?? debugData.runningTotals?.promptTokens ?? 0,
        responseTokens: debugData.responseTokens ?? debugData.runningTotals?.responseTokens ?? 0,
        totalTokens: debugData.totalTokens ?? debugData.runningTotals?.totalTokens ?? 0,
        totalCost: debugData.totalCost ?? debugData.runningTotals?.totalCost ?? 0,
      };

      setRunningTotals((prev) => ({
        promptTokens: prev.promptTokens + (Number(incremental.promptTokens) || 0),
        responseTokens: prev.responseTokens + (Number(incremental.responseTokens) || 0),
        totalTokens: prev.totalTokens + (Number(incremental.totalTokens) || 0),
        totalCost: Number((prev.totalCost + (Number(incremental.totalCost) || 0)).toFixed(8)),
      }));
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          kind: 'error',
          timestamp: new Date().toISOString(),
          text: error?.message || 'Failed to run LangGraph debug session.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, selectedPhotoId]);

  const totalsView = useMemo(() => ([
    { label: 'Prompt tokens', value: runningTotals.promptTokens },
    { label: 'Response tokens', value: runningTotals.responseTokens },
    { label: 'Total tokens', value: runningTotals.totalTokens },
  ]), [runningTotals.promptTokens, runningTotals.responseTokens, runningTotals.totalTokens]);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">AI Debug Console</h2>
        <p className="text-xs text-gray-500 mt-1">
          Run ad-hoc LangGraph sessions against the currently selected photo.
        </p>
        <p className="text-xs text-gray-500">
          {selectedPhotoId ? `Selected photo ID: ${selectedPhotoId}` : 'No photo selected.'}
        </p>
      </div>
      <div className="border-b border-gray-200 px-4 py-3 bg-gray-50 text-xs text-gray-700 space-y-1">
        {totalsView.map(({ label, value }) => (
          <div key={label} className="flex justify-between">
            <span>{label}</span>
            <span className="font-mono">{formatNumber(value)}</span>
          </div>
        ))}
        <div className="flex justify-between">
          <span>Total cost</span>
          <span className="font-mono">{formatCost(runningTotals.totalCost)}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500">
            Select a photo to enable the debug console and view LangGraph telemetry.
          </div>
        ) : (
          messages.map((message) => {
            if (message.kind === 'prompt') {
              return (
                <div key={message.id} className="bg-white border border-blue-100 rounded-md px-3 py-2 text-sm text-gray-800">
                  <div className="text-xs text-gray-500 mb-1">Prompt · {formatTimestamp(message.timestamp)}</div>
                  <p className="whitespace-pre-wrap break-words">{message.prompt}</p>
                </div>
              );
            }
            if (message.kind === 'response') {
              const debugData = message.debugData || {};
              return (
                <div key={message.id} className="bg-white border border-emerald-100 rounded-md px-3 py-2 text-sm text-gray-800">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>Final Response · {formatTimestamp(message.timestamp)}</span>
                    <span>{(debugData.modelSummary && debugData.modelSummary.join(', ')) || debugData.model || 'Model: n/a'}</span>
                  </div>
                  {debugData.response && (
                    <div className="space-y-1 text-sm leading-5">
                      {debugData.response.caption && (
                        <p>
                          <span className="font-semibold">Caption:</span> {debugData.response.caption}
                        </p>
                      )}
                      {debugData.response.description && (
                        <p>
                          <span className="font-semibold">Description:</span> {debugData.response.description}
                        </p>
                      )}
                      {debugData.response.keywords && (
                        <p>
                          <span className="font-semibold">Keywords:</span> {debugData.response.keywords}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-3 text-xs text-gray-600 space-y-1">
                    <div>
                      Tokens · prompt: {formatNumber(debugData.promptTokens || 0)} · response: {formatNumber(debugData.responseTokens || 0)} · total: {formatNumber(debugData.totalTokens || 0)}
                    </div>
                    <div>Run cost · {formatCost(debugData.totalCost || 0)}</div>
                  </div>
                </div>
              );
            }
            if (message.kind === 'step') {
              return (
                <div key={message.id} className="bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>{message.nodeName} · {formatTimestamp(message.timestamp)}</span>
                    {message.model && <span>{message.model}</span>}
                  </div>
                  {message.prompt && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Prompt</div>
                      <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-gray-50 border border-gray-200 rounded p-2">{message.prompt}</pre>
                    </div>
                  )}
                  {message.response && (
                    <div className="mb-2">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Response</div>
                      <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-gray-50 border border-gray-200 rounded p-2">{message.response}</pre>
                    </div>
                  )}
                  {(message.tokens?.prompt || message.tokens?.response || message.tokens?.total || message.cost) && (
                    <div className="text-xs text-gray-600 mt-2 space-y-1">
                      {message.tokens?.prompt !== undefined && (
                        <div>Prompt tokens: {formatNumber(message.tokens.prompt)}</div>
                      )}
                      {message.tokens?.response !== undefined && (
                        <div>Response tokens: {formatNumber(message.tokens.response)}</div>
                      )}
                      {message.tokens?.total !== undefined && (
                        <div>Total tokens: {formatNumber(message.tokens.total)}</div>
                      )}
                      {message.cost !== undefined && (
                        <div>Cost: {formatCost(message.cost)}</div>
                      )}
                    </div>
                  )}
                  {message.notes && (
                    <div className="mt-2 text-xs text-gray-600">
                      Notes: {message.notes}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div
                key={message.id}
                className={`rounded-md px-3 py-2 text-xs ${message.kind === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-slate-100 border border-slate-200 text-slate-700'}`}
              >
                <div className="font-semibold mb-1">
                  {message.kind === 'error' ? 'Error' : 'Info'} · {formatTimestamp(message.timestamp)}
                </div>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-t border-gray-200 px-4 py-3 bg-white space-y-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!selectedPhotoId || isLoading}
          placeholder={placeholder}
          rows={3}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400 resize-none"
        />
        <button
          type="submit"
          disabled={!selectedPhotoId || isLoading || !input.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Running...' : 'Run Debug Session'}
        </button>
      </form>
    </div>
  );
}
