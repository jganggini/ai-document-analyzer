import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../common/Layout';
import { LoadingState } from '../common/LoadingState';
import { ModalPortal } from '../common/ModalPortal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  improvementApi,
  type ImprovementCheckpointThread,
  type ImprovementEvalCase,
  type ImprovementEvalRun,
  type ImprovementTraceRun,
} from '../../services/api';

type ImprovementTab = 'traces' | 'evals' | 'feedback' | 'checkpoints';

const CHECKPOINTS_PAGE_SIZE = 10;
const EVAL_CASES_PAGE_SIZE = 10;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${sec}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

function parseTerms(value: string): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function StatusPill({ value }: { value: string }) {
  const normalized = String(value || '').toLowerCase();
  const tone =
    normalized === 'completed' || normalized === 'passed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : normalized === 'failed'
        ? 'border-red-200 bg-red-50 text-red-700'
        : normalized === 'running'
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {value || 'pending'}
    </span>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-oracle-border bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-oracle-light-gray">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-oracle-dark-gray">{value}</p>
      {detail ? <p className="mt-1 text-xs text-oracle-medium-gray">{detail}</p> : null}
    </div>
  );
}

export function ContinuousImprovement() {
  const { user } = useAuth();
  const sessionScope = user?.user_id ?? 'anonymous';
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ImprovementTab>('traces');
  const [selectedTraceId, setSelectedTraceId] = useState('');
  const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
  const [caseName, setCaseName] = useState('');
  const [caseCategory, setCaseCategory] = useState('regression');
  const [caseQuestion, setCaseQuestion] = useState('');
  const [caseTerms, setCaseTerms] = useState('');
  const [minimumCitations, setMinimumCitations] = useState(1);
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [selectedEvalRunId, setSelectedEvalRunId] = useState<number | null>(null);
  const [evalCasesPage, setEvalCasesPage] = useState(1);
  const [checkpointsPage, setCheckpointsPage] = useState(1);

  const overviewQuery = useQuery({
    queryKey: ['improvement', 'overview', sessionScope],
    queryFn: () => improvementApi.getOverview(),
  });
  const tracesQuery = useQuery({
    queryKey: ['improvement', 'traces', sessionScope],
    queryFn: () => improvementApi.listTraces(40),
  });
  const traceStepsQuery = useQuery({
    queryKey: ['improvement', 'trace-steps', selectedTraceId],
    queryFn: () => improvementApi.listTraceSteps(selectedTraceId, 240),
    enabled: Boolean(selectedTraceId),
  });
  const feedbackQuery = useQuery({
    queryKey: ['improvement', 'feedback', sessionScope],
    queryFn: () => improvementApi.listFeedback(40),
  });
  const evalCasesQuery = useQuery({
    queryKey: ['improvement', 'eval-cases', sessionScope],
    queryFn: () => improvementApi.listEvalCases(160),
  });
  const evalRunsQuery = useQuery({
    queryKey: ['improvement', 'eval-runs', sessionScope],
    queryFn: () => improvementApi.listEvalRuns(30),
  });
  const evalResultsQuery = useQuery({
    queryKey: ['improvement', 'eval-results', selectedEvalRunId],
    queryFn: () => improvementApi.listEvalResults(Number(selectedEvalRunId), 100),
    enabled: Boolean(selectedEvalRunId),
  });
  const checkpointsQuery = useQuery({
    queryKey: ['improvement', 'checkpoints', sessionScope],
    queryFn: () => improvementApi.listCheckpoints(100),
  });

  const selectedTrace = useMemo(() => {
    return (tracesQuery.data?.data.items || []).find((item) => item.trace_id === selectedTraceId) || null;
  }, [selectedTraceId, tracesQuery.data?.data.items]);

  const createCaseMutation = useMutation({
    mutationFn: () =>
      improvementApi.createEvalCase({
        name: caseName.trim(),
        category: caseCategory.trim() || 'manual',
        question: caseQuestion.trim(),
        source: 'ui',
        expected: {
          requires_citations: true,
          minimum_citations: minimumCitations,
          must_include_terms: parseTerms(caseTerms),
          pass_threshold: 0.8,
        },
      }),
    onSuccess: () => {
      setCaseName('');
      setCaseQuestion('');
      setCaseTerms('');
      setMinimumCitations(1);
      setShowCreateCaseModal(false);
      queryClient.invalidateQueries({ queryKey: ['improvement', 'eval-cases', sessionScope] });
      queryClient.invalidateQueries({ queryKey: ['improvement', 'overview', sessionScope] });
      showToast('Evaluation case saved', 'success');
    },
    onError: (error: any) => {
      showToast(String(error?.response?.data?.detail || error?.message || 'Could not save evaluation case'), 'error');
    },
  });

  const runEvalMutation = useMutation({
    mutationFn: () =>
      improvementApi.createEvalRun({
        name: `UI evaluation ${new Date().toLocaleString()}`,
        case_ids: selectedCaseIds,
        top_k: 5,
      }),
    onSuccess: (response) => {
      const runId = Number(response?.data?.eval_run_id || 0);
      if (runId > 0) setSelectedEvalRunId(runId);
      queryClient.invalidateQueries({ queryKey: ['improvement', 'eval-runs', sessionScope] });
      queryClient.invalidateQueries({ queryKey: ['improvement', 'eval-results'] });
      queryClient.invalidateQueries({ queryKey: ['improvement', 'traces', sessionScope] });
      queryClient.invalidateQueries({ queryKey: ['improvement', 'checkpoints', sessionScope] });
      queryClient.invalidateQueries({ queryKey: ['improvement', 'overview', sessionScope] });
      showToast('Evaluation run completed', 'success');
    },
    onError: (error: any) => {
      showToast(String(error?.response?.data?.detail || error?.message || 'Could not run evaluation'), 'error');
    },
  });

  const overview = overviewQuery.data?.data;
  const traces = tracesQuery.data?.data.items || [];
  const feedback = feedbackQuery.data?.data.items || [];
  const evalCases = evalCasesQuery.data?.data.items || [];
  const evalRuns = evalRunsQuery.data?.data.items || [];
  const evalResults = evalResultsQuery.data?.data.items || [];
  const checkpoints = checkpointsQuery.data?.data.items || [];
  const evalCasesTotalPages = Math.max(1, Math.ceil(evalCases.length / EVAL_CASES_PAGE_SIZE));
  const safeEvalCasesPage = Math.min(evalCasesPage, evalCasesTotalPages);
  const evalCasesStartIndex = (safeEvalCasesPage - 1) * EVAL_CASES_PAGE_SIZE;
  const evalCasesEndIndex = Math.min(evalCasesStartIndex + EVAL_CASES_PAGE_SIZE, evalCases.length);
  const paginatedEvalCases = evalCases.slice(evalCasesStartIndex, evalCasesEndIndex);
  const checkpointsTotalPages = Math.max(1, Math.ceil(checkpoints.length / CHECKPOINTS_PAGE_SIZE));
  const safeCheckpointsPage = Math.min(checkpointsPage, checkpointsTotalPages);
  const checkpointsStartIndex = (safeCheckpointsPage - 1) * CHECKPOINTS_PAGE_SIZE;
  const checkpointsEndIndex = Math.min(checkpointsStartIndex + CHECKPOINTS_PAGE_SIZE, checkpoints.length);
  const paginatedCheckpoints = checkpoints.slice(checkpointsStartIndex, checkpointsEndIndex);

  useEffect(() => {
    if (selectedEvalRunId || evalRuns.length === 0) return;
    setSelectedEvalRunId(evalRuns[0].eval_run_id);
  }, [evalRuns, selectedEvalRunId]);

  useEffect(() => {
    setCheckpointsPage(1);
    setEvalCasesPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (evalCasesPage > evalCasesTotalPages) {
      setEvalCasesPage(evalCasesTotalPages);
    }
  }, [evalCasesPage, evalCasesTotalPages]);

  useEffect(() => {
    if (checkpointsPage > checkpointsTotalPages) {
      setCheckpointsPage(checkpointsTotalPages);
    }
  }, [checkpointsPage, checkpointsTotalPages]);

  useEffect(() => {
    if (!showCreateCaseModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCreateCaseModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateCaseModal]);

  const passRate = useMemo(() => {
    const total = Number(overview?.completed_count || 0) + Number(overview?.failed_count || 0);
    if (!total) return 0;
    return Number(overview?.completed_count || 0) / total;
  }, [overview?.completed_count, overview?.failed_count]);

  const toggleCase = (evalCase: ImprovementEvalCase) => {
    setSelectedCaseIds((prev) =>
      prev.includes(evalCase.eval_case_id)
        ? prev.filter((item) => item !== evalCase.eval_case_id)
        : [...prev, evalCase.eval_case_id]
    );
  };

  const openTraceFromEval = (traceId: string) => {
    const normalizedTraceId = String(traceId || '').trim();
    if (!normalizedTraceId) return;
    setSelectedTraceId(normalizedTraceId);
    setActiveTab('traces');
  };

  const tabs: Array<{ id: ImprovementTab; label: string }> = [
    { id: 'traces', label: 'Traces' },
    { id: 'evals', label: 'Evals' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'checkpoints', label: 'Checkpoints' },
  ];
  const canSaveCase = Boolean(caseName.trim() && caseQuestion.trim());

  if (overviewQuery.isLoading) {
    return (
      <Layout>
        <LoadingState className="py-8" label="Loading settings..." textClassName="text-oracle-light-gray" />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="app-page-title text-3xl font-bold">Observability</h1>
            <p className="app-page-description mt-1 text-sm">
              Local traces, feedback, evaluations, and checkpoint visibility for the document graph.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['improvement'] });
              showToast('Improvement data refreshed', 'success');
            }}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-oracle-red px-4 text-sm font-medium text-white transition-colors hover:bg-oracle-red/90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 19a8 8 0 0013-3M19 5A8 8 0 006 8" />
            </svg>
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricTile label="Traces" value={String(overview?.trace_count ?? 0)} detail={`${overview?.running_count ?? 0} running`} />
          <MetricTile label="Completed" value={String(overview?.completed_count ?? 0)} detail={formatPercent(passRate)} />
          <MetricTile label="Avg Citations" value={(overview?.avg_cited_sources ?? 0).toFixed(1)} detail="cited sources" />
          <MetricTile label="Feedback" value={String(overview?.recent_feedback_count ?? 0)} detail="user signals" />
          <MetricTile label="Eval Cases" value={String(overview?.eval_case_count ?? 0)} detail={`${overview?.eval_run_count ?? 0} runs`} />
          <MetricTile
            label="Checkpoints"
            value={String(overview?.checkpoint_count ?? 0)}
            detail={`${overview?.checkpoint_thread_count ?? 0} threads`}
          />
        </div>

        <div className="app-light-surface flex min-h-0 flex-1 flex-col rounded-lg border border-oracle-border bg-white shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-oracle-border px-4 pt-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'border-oracle-red text-oracle-red'
                    : 'border-transparent text-oracle-medium-gray hover:text-oracle-dark-gray'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'traces' ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)]">
              <div className="flex min-w-0 min-h-0 flex-col border-r border-oracle-border">
                <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <table className="min-w-full table-fixed text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-oracle-light-gray">
                      <tr>
                        <th className="w-44 px-4 py-3">Time</th>
                        <th className="px-4 py-3">Question</th>
                        <th className="w-[160px] px-4 py-3">Route</th>
                        <th className="w-[118px] px-4 py-3">Status</th>
                        <th className="w-[88px] px-4 py-3">Cites</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {traces.map((trace: ImprovementTraceRun) => (
                        <tr
                          key={trace.trace_id}
                          className={`cursor-pointer transition hover:bg-gray-50 ${
                            selectedTraceId === trace.trace_id ? 'bg-amber-50/70' : ''
                          }`}
                          onClick={() => setSelectedTraceId(trace.trace_id)}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-oracle-medium-gray">{formatDateTime(trace.started_at)}</td>
                          <td className="px-4 py-3">
                            <p className="line-clamp-2 font-medium text-oracle-dark-gray">{trace.question}</p>
                            <p className="mt-1 truncate text-xs text-oracle-light-gray">{trace.thread_id}</p>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-oracle-medium-gray">
                            {trace.answerability_route || 'unclassified'}
                          </td>
                          <td className="px-4 py-3"><StatusPill value={trace.status} /></td>
                          <td className="px-4 py-3 text-sm font-semibold text-oracle-dark-gray">{trace.cited_sources_count}</td>
                        </tr>
                      ))}
                      {traces.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-oracle-light-gray">
                            No trace runs recorded yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex min-w-0 min-h-0 flex-col">
                <div className="shrink-0 border-b border-oracle-border px-4 py-3">
                  <p className="text-sm font-semibold text-oracle-dark-gray">
                    {selectedTrace ? selectedTrace.question : 'Trace detail'}
                  </p>
                  {selectedTrace ? (
                    <p className="mt-1 text-xs text-oracle-light-gray">
                      {selectedTrace.trace_id} - {selectedTrace.answerability_route || 'unclassified'}
                    </p>
                  ) : null}
                </div>
                <div className="app-scrollbar min-h-0 flex-1 overflow-auto p-4">
                  {!selectedTraceId ? (
                    <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-oracle-light-gray">
                      Select a trace to inspect graph steps.
                    </div>
                  ) : traceStepsQuery.isLoading ? (
                    <LoadingState className="py-8" size="sm" label="Loading trace steps..." textClassName="text-oracle-light-gray" />
                  ) : (
                    <div className="space-y-3">
                      {(traceStepsQuery.data?.data.items || []).map((step) => (
                        <details key={step.step_id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-sm font-semibold text-oracle-dark-gray">
                              {step.node || step.status}
                            </span>
                            <span className="shrink-0 text-xs text-oracle-light-gray">{step.duration_ms || 0} ms</span>
                          </summary>
                          <pre className="app-scrollbar mt-2 max-h-72 overflow-auto rounded bg-gray-50 p-3 text-[11px] leading-5 text-oracle-medium-gray">
                            {compactJson({ payload: step.payload, state_patch: step.state_patch, error: step.error })}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'evals' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-oracle-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-oracle-dark-gray">Evaluation cases</p>
                  <p className="text-xs text-oracle-light-gray">{selectedCaseIds.length} selected</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setShowCreateCaseModal(true)}
                  >
                    + Eval
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={selectedCaseIds.length === 0 || runEvalMutation.isPending}
                    onClick={() => runEvalMutation.mutate()}
                  >
                    {runEvalMutation.isPending ? 'Running...' : 'Run selected'}
                  </button>
                </div>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_470px]">
                  <div className="flex min-h-0 min-w-0 flex-col">
                    <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-oracle-light-gray">
                        <tr>
                          <th className="w-12 px-4 py-3"></th>
                          <th className="px-4 py-3">Case</th>
                          <th className="w-32 px-4 py-3">Category</th>
                          <th className="w-32 px-4 py-3">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedEvalCases.map((evalCase) => (
                          <tr key={evalCase.eval_case_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={`Select ${evalCase.name}`}
                                checked={selectedCaseIds.includes(evalCase.eval_case_id)}
                                onChange={() => toggleCase(evalCase)}
                                className="h-4 w-4 rounded border-gray-300 text-oracle-red accent-oracle-red focus:ring-oracle-red"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-oracle-dark-gray">{evalCase.name}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-oracle-medium-gray">{evalCase.question}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-oracle-medium-gray">{evalCase.category}</td>
                            <td className="px-4 py-3 text-xs text-oracle-medium-gray">{evalCase.source}</td>
                          </tr>
                        ))}
                        {evalCases.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-sm text-oracle-light-gray">
                              No evaluation cases recorded yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                    </div>
                    {evalCases.length > 0 ? (
                      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-3">
                        <p className="text-sm text-gray-600">
                          Showing {evalCasesStartIndex + 1}-{evalCasesEndIndex} of {evalCases.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEvalCasesPage((page) => Math.max(1, page - 1))}
                            disabled={safeEvalCasesPage <= 1}
                            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-gray-600">
                            Page {safeEvalCasesPage} of {evalCasesTotalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEvalCasesPage((page) => Math.min(evalCasesTotalPages, page + 1))}
                            disabled={safeEvalCasesPage >= evalCasesTotalPages}
                            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 min-h-0 flex-col border-l border-oracle-border">
                    <div className="shrink-0 border-b border-oracle-border bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold text-oracle-dark-gray">Recent runs</p>
                      <p className="text-xs text-oracle-light-gray">Select a run to inspect results and traces.</p>
                    </div>
                    <div className="app-scrollbar max-h-[250px] shrink-0 divide-y divide-gray-100 overflow-auto">
                      {evalRuns.map((run: ImprovementEvalRun) => (
                        <button
                          key={run.eval_run_id}
                          type="button"
                          className={`block w-full px-4 py-3 text-left transition hover:bg-gray-50 ${
                            selectedEvalRunId === run.eval_run_id ? 'bg-amber-50/70' : ''
                          }`}
                          onClick={() => setSelectedEvalRunId(run.eval_run_id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-medium text-oracle-dark-gray">{run.name}</p>
                            <StatusPill value={run.status} />
                          </div>
                          <p className="mt-1 text-xs text-oracle-light-gray">
                            {run.result_count} results - score {formatPercent(run.avg_score || 0)}
                          </p>
                        </button>
                      ))}
                      {evalRuns.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-oracle-light-gray">No evaluation runs recorded yet.</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 border-t border-oracle-border px-4 py-3">
                      <p className="text-sm font-semibold text-oracle-dark-gray">Results</p>
                      <p className="text-xs text-oracle-light-gray">
                        {selectedEvalRunId ? `Run #${selectedEvalRunId}` : 'No run selected'}
                      </p>
                    </div>
                    <div className="app-scrollbar min-h-0 flex-1 space-y-2 overflow-auto px-4 pb-4">
                      {!selectedEvalRunId ? (
                        <div className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-oracle-light-gray">
                          Select a run to audit its answers.
                        </div>
                      ) : evalResultsQuery.isLoading ? (
                        <LoadingState className="py-6" size="sm" label="Loading eval results..." textClassName="text-oracle-light-gray" />
                      ) : (
                        evalResults.map((result) => (
                          <div key={result.eval_result_id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="min-w-0 truncate text-sm font-semibold text-oracle-dark-gray">{result.case_name}</p>
                              <StatusPill value={result.status} />
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-oracle-medium-gray">{result.question}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-oracle-light-gray">
                              <span>Score {formatPercent(result.score || 0)}</span>
                              {result.trace_id ? (
                                <button
                                  type="button"
                                  className="font-semibold text-oracle-red hover:underline"
                                  onClick={() => openTraceFromEval(result.trace_id)}
                                >
                                  View trace
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                      {selectedEvalRunId && !evalResultsQuery.isLoading && evalResults.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-oracle-light-gray">
                          This run has no recorded results.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
            </div>
          ) : null}

          {activeTab === 'feedback' ? (
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <table className="min-w-full table-fixed text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-oracle-light-gray">
                  <tr>
                    <th className="w-44 px-4 py-3">Time</th>
                    <th className="w-32 px-4 py-3">Signal</th>
                    <th className="px-4 py-3">Prompt</th>
                    <th className="px-4 py-3">Answer</th>
                    <th className="w-32 px-4 py-3">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {feedback.map((event) => (
                    <tr key={event.feedback_event_id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-oracle-medium-gray">{formatDateTime(event.created_at)}</td>
                      <td className="px-4 py-3">
                        <StatusPill value={`${event.event_type}:${event.value}`} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="line-clamp-3 text-sm text-oracle-dark-gray">{event.user_prompt || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="line-clamp-3 text-xs leading-5 text-oracle-medium-gray">
                          {event.assistant_answer_preview || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-oracle-light-gray">{event.trace_id || '-'}</td>
                    </tr>
                  ))}
                  {feedback.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-oracle-light-gray">
                        No feedback events recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeTab === 'checkpoints' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <table className="min-w-full table-fixed text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-oracle-light-gray">
                    <tr>
                      <th className="w-[260px] px-4 py-3">Thread</th>
                      <th className="px-4 py-3">Latest question</th>
                      <th className="w-28 px-4 py-3">Snapshots</th>
                      <th className="w-24 px-4 py-3">Writes</th>
                      <th className="w-24 px-4 py-3">Traces</th>
                      <th className="w-44 px-4 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedCheckpoints.map((checkpoint: ImprovementCheckpointThread) => (
                      <tr key={checkpoint.thread_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="truncate text-xs font-semibold text-oracle-dark-gray">{checkpoint.thread_id}</p>
                          {checkpoint.latest_trace_id ? (
                            <button
                              type="button"
                              className="mt-1 text-xs font-semibold text-oracle-red hover:underline"
                              onClick={() => openTraceFromEval(checkpoint.latest_trace_id)}
                            >
                              View latest trace
                            </button>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <p className="line-clamp-2 text-sm text-oracle-dark-gray">{checkpoint.latest_question || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-oracle-dark-gray">{checkpoint.checkpoint_count}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-oracle-dark-gray">{checkpoint.write_count}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-oracle-dark-gray">{checkpoint.trace_count}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-oracle-medium-gray">{formatDateTime(checkpoint.updated_at)}</td>
                      </tr>
                    ))}
                    {checkpoints.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-oracle-light-gray">
                          No checkpoints recorded yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {checkpoints.length > 0 ? (
                <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-3">
                  <p className="text-sm text-gray-600">
                    Showing {checkpointsStartIndex + 1}-{checkpointsEndIndex} of {checkpoints.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCheckpointsPage((page) => Math.max(1, page - 1))}
                      disabled={safeCheckpointsPage <= 1}
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {safeCheckpointsPage} of {checkpointsTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCheckpointsPage((page) => Math.min(checkpointsTotalPages, page + 1))}
                      disabled={safeCheckpointsPage >= checkpointsTotalPages}
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {showCreateCaseModal ? (
          <ModalPortal zIndex="z-[300]" className="items-start justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-eval-case-title"
              className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-0 shadow-2xl"
              style={{
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              <div className="bg-oracle-dark-gray px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0">
                    <h2 id="create-eval-case-title" className="text-lg font-semibold text-white">
                      New evaluation case
                    </h2>
                    <p className="mt-1 text-sm text-gray-200">Define a reusable question for the local evaluation loop.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateCaseModal(false)}
                    className="ml-auto rounded-lg p-1.5 text-gray-200 transition-colors hover:bg-white/10"
                    aria-label="Close evaluation case modal"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 bg-white px-6 pb-6 pt-5">
                <div className="app-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  <div>
                    <label htmlFor="eval-case-name" className="block text-xs font-semibold uppercase tracking-wide text-oracle-light-gray">
                      Name
                    </label>
                    <input
                      id="eval-case-name"
                      autoFocus
                      className="input-oracle mt-1"
                      value={caseName}
                      onChange={(event) => setCaseName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="eval-case-category" className="block text-xs font-semibold uppercase tracking-wide text-oracle-light-gray">
                      Category
                    </label>
                    <input
                      id="eval-case-category"
                      className="input-oracle mt-1"
                      value={caseCategory}
                      onChange={(event) => setCaseCategory(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="eval-case-question" className="block text-xs font-semibold uppercase tracking-wide text-oracle-light-gray">
                      Question
                    </label>
                    <textarea
                      id="eval-case-question"
                      className="input-oracle mt-1 min-h-[120px] resize-y"
                      value={caseQuestion}
                      onChange={(event) => setCaseQuestion(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="eval-case-terms" className="block text-xs font-semibold uppercase tracking-wide text-oracle-light-gray">
                      Must include terms
                    </label>
                    <input
                      id="eval-case-terms"
                      className="input-oracle mt-1"
                      value={caseTerms}
                      onChange={(event) => setCaseTerms(event.target.value)}
                      placeholder="comma separated"
                    />
                  </div>
                  <div>
                    <label htmlFor="eval-case-minimum-citations" className="block text-xs font-semibold uppercase tracking-wide text-oracle-light-gray">
                      Minimum citations
                    </label>
                    <input
                      id="eval-case-minimum-citations"
                      className="input-oracle mt-1"
                      type="number"
                      min={0}
                      max={8}
                      value={minimumCitations}
                      onChange={(event) => setMinimumCitations(Number(event.target.value || 0))}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 pt-4">
                  <button type="button" onClick={() => setShowCreateCaseModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={createCaseMutation.isPending || !canSaveCase}
                    onClick={() => createCaseMutation.mutate()}
                  >
                    {createCaseMutation.isPending ? 'Saving...' : 'Save case'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        ) : null}
      </div>
    </Layout>
  );
}
