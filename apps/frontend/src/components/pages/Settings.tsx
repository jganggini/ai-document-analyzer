import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../common/Layout';
import { ConfirmModal } from '../common/ConfirmModal';
import { LoadingState } from '../common/LoadingState';
import { settingsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_APP_DISPLAY_NAME } from '../../config/branding';
import { appBrandingQueryKey } from '../../hooks/useAppBranding';

const DEFAULT_AGENT_NAME = 'Nadia Assist';
const LEGACY_AGENT_NAMES = new Set([DEFAULT_AGENT_NAME.toLowerCase()]);

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-oracle-light-gray mt-1">{children}</p>;
}

function normalizeSettingsPayload(payload: any) {
  const app = { ...(payload?.app || {}) };
  const configuredName = String(app.name || '').trim();
  const configuredAgentName = String(app.agent_name || '').trim();

  if (!configuredAgentName) {
    app.agent_name = LEGACY_AGENT_NAMES.has(configuredName.toLowerCase())
      ? configuredName
      : DEFAULT_AGENT_NAME;
  }
  if (!configuredName || LEGACY_AGENT_NAMES.has(configuredName.toLowerCase())) {
    app.name = DEFAULT_APP_DISPLAY_NAME;
  }

  return {
    ...payload,
    app,
  };
}

export function Settings() {
  const [formData, setFormData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('app');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [avatarDropActive, setAvatarDropActive] = useState(false);
  const agentAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  useEffect(() => {
    if (data?.data) {
      setFormData(normalizeSettingsPayload(data.data));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (updates: any) => settingsApi.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: appBrandingQueryKey });
      showToast('Settings saved successfully', 'success');
    },
    onError: () => showToast('Failed to save settings', 'error'),
  });
  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadAgentAvatar(file),
    onSuccess: (response) => {
      const avatarUrl = String(response?.data?.avatar_url || '').trim();
      setFormData((prev: any) => ({
        ...prev,
        app: {
          ...(prev?.app || {}),
          avatar_url: avatarUrl,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Agent image updated', 'success');
    },
    onError: (error: any) => {
      const detail = String(error?.response?.data?.detail || error?.message || 'Failed to upload image');
      showToast(detail, 'error');
    },
  });
  const deleteAvatarMutation = useMutation({
    mutationFn: () => settingsApi.deleteAgentAvatar(),
    onSuccess: () => {
      setFormData((prev: any) => ({
        ...prev,
        app: {
          ...(prev?.app || {}),
          avatar_url: '',
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Agent image removed', 'success');
    },
    onError: (error: any) => {
      const detail = String(error?.response?.data?.detail || error?.message || 'Failed to remove image');
      showToast(detail, 'error');
    },
  });

  const handleSave = () => {
    setShowSaveModal(true);
  };

  const confirmSave = () => {
    updateMutation.mutate(formData);
    setShowSaveModal(false);
  };

  const updateField = (category: string, field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value,
      },
    }));
  };
  const applicationDisplayName = useMemo(() => {
    const resolved = String(formData?.app?.name || '').trim();
    return resolved || DEFAULT_APP_DISPLAY_NAME;
  }, [formData?.app?.name]);
  const agentDisplayName = useMemo(() => {
    const resolved = String(formData?.app?.agent_name || '').trim();
    return resolved || DEFAULT_AGENT_NAME;
  }, [formData?.app?.agent_name]);
  const agentAvatarLetter = useMemo(() => {
    return (agentDisplayName[0] || 'N').toUpperCase();
  }, [agentDisplayName]);
  const agentAvatarUrl = useMemo(() => {
    const resolved = String(formData?.app?.avatar_url || '').trim();
    return resolved || '';
  }, [formData?.app?.avatar_url]);

  const processAgentAvatarFile = (file: File | null | undefined) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/gif'];
    if (!allowed.includes(file.type)) {
      showToast('Unsupported format. Use PNG, JPG, or GIF.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size exceeds 2 MB.', 'error');
      return;
    }
    uploadAvatarMutation.mutate(file);
  };

  const handleAgentAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    processAgentAvatarFile(event.target.files?.[0]);
    event.currentTarget.value = '';
  };

  if (isLoading || !formData) {
    return (
      <Layout>
        <LoadingState className="py-8" label="Loading settings..." textClassName="text-oracle-light-gray" />
      </Layout>
    );
  }

  const tabs = [
    { id: 'app', name: 'Application' },
    { id: 'rag', name: 'RAG Processing' },
    { id: 'embedding', name: 'Embedding' },
  ];

  return (
    <Layout>
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
            <p className="text-oracle-light-gray">Configure application parameters</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="app-light-surface bg-white rounded-lg shadow p-8 space-y-6">
          <div className="flex gap-2 border-b border-oracle-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-oracle-red text-oracle-red'
                    : 'border-transparent text-oracle-medium-gray hover:text-oracle-dark-gray'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>

          <div>
          {activeTab === 'app' && (
            <div className="space-y-4">
              <div className="settings-section-card--neutral flex items-center gap-3 rounded-lg border border-gray-300 bg-gray-100 p-4">
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">Application Settings</p>
                  <p className="text-sm text-gray-600">Configure general application parameters and behavior</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Application Name</label>
                  <input
                    type="text"
                    value={applicationDisplayName}
                    onChange={(e) => updateField('app', 'name', e.target.value)}
                    className="input-oracle"
                  />
                  <FieldHint>Controls the product name shown in the header, login and home pages.</FieldHint>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={agentDisplayName}
                    onChange={(e) => updateField('app', 'agent_name', e.target.value)}
                    className="input-oracle"
                  />
                  <FieldHint>Controls the assistant name used inside chat responses and avatars.</FieldHint>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Session Timeout (minutes)</label>
                  <input
                    type="number"
                    value={formData.app?.session_timeout_minutes || 480}
                    onChange={(e) => updateField('app', 'session_timeout_minutes', parseInt(e.target.value))}
                    className="input-oracle"
                    min="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Timezone</label>
                  <select
                    value={formData.app?.timezone || 'America/Lima'}
                    onChange={(e) => updateField('app', 'timezone', e.target.value)}
                    className="input-oracle"
                  >
                    <optgroup label="Americas">
                      <option value="America/New_York">America/New_York (EST/EDT)</option>
                      <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                      <option value="America/Denver">America/Denver (MST/MDT)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                      <option value="America/Mexico_City">America/Mexico_City</option>
                      <option value="America/Bogota">America/Bogota</option>
                      <option value="America/Lima">America/Lima</option>
                      <option value="America/Santiago">America/Santiago</option>
                      <option value="America/Buenos_Aires">America/Buenos_Aires</option>
                      <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                      <option value="America/Caracas">America/Caracas</option>
                      <option value="America/Toronto">America/Toronto</option>
                      <option value="America/Vancouver">America/Vancouver</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                      <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                      <option value="Europe/Madrid">Europe/Madrid (CET/CEST)</option>
                      <option value="Europe/Rome">Europe/Rome (CET/CEST)</option>
                      <option value="Europe/Amsterdam">Europe/Amsterdam (CET/CEST)</option>
                      <option value="Europe/Moscow">Europe/Moscow (MSK)</option>
                    </optgroup>
                    <optgroup label="Asia">
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                      <option value="Asia/Hong_Kong">Asia/Hong_Kong (HKT)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                      <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                      <option value="Asia/Manila">Asia/Manila (PHT)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (ICT)</option>
                    </optgroup>
                    <optgroup label="Pacific">
                      <option value="Pacific/Auckland">Pacific/Auckland (NZST/NZDT)</option>
                      <option value="Pacific/Sydney">Australia/Sydney (AEST/AEDT)</option>
                      <option value="Pacific/Honolulu">Pacific/Honolulu (HST)</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="UTC">UTC</option>
                      <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                      <option value="Africa/Cairo">Africa/Cairo (EET)</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Default Agent Language</label>
                  <select
                    value={formData.app?.language || 'es'}
                    onChange={(e) => updateField('app', 'language', e.target.value)}
                    className="input-oracle"
                  >
                    <option value="es">Spanish</option>
                    <option value="en">English</option>
                    <option value="pt">Portuguese</option>
                  </select>
                </div>
              </div>
              <div className="md:max-w-[calc((100%-1rem)/2)]">
                <label className="block text-sm font-medium mb-1">Agent Image (optional)</label>
                <div
                  className={`py-6 px-6 border-2 border-dashed rounded-lg text-center transition-all ${
                    avatarDropActive ? 'border-oracle-red bg-red-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  } ${
                    uploadAvatarMutation.isPending ? 'opacity-70' : ''
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (uploadAvatarMutation.isPending) return;
                    setAvatarDropActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setAvatarDropActive(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setAvatarDropActive(false);
                    if (uploadAvatarMutation.isPending) return;
                    const dropped = event.dataTransfer?.files;
                    if (!dropped || dropped.length === 0) return;
                    if (dropped.length > 1) {
                      showToast('Only one image file is allowed.', 'error');
                    }
                    processAgentAvatarFile(dropped[0]);
                  }}
                >
                  <div className="mx-auto w-12 h-12 rounded-xl bg-oracle-red text-white flex items-center justify-center text-lg font-bold overflow-hidden">
                    {agentAvatarUrl ? (
                      <img
                        src={agentAvatarUrl}
                        alt="Agent avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{agentAvatarLetter}</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-oracle-dark-gray">
                    Drag and Drop
                  </p>
                  <p className="text-sm text-oracle-medium-gray mt-1">
                    Select one image file, or drop it here
                  </p>
                  <p className="text-xs text-oracle-light-gray mt-1">
                    Only PNG, JPG and GIF files are accepted
                  </p>
                  {uploadAvatarMutation.isPending ? (
                    <p className="mt-2 text-sm text-oracle-medium-gray">Uploading...</p>
                  ) : (
                    <label
                      htmlFor="agent-avatar-input"
                      className="mt-2 inline-block text-oracle-blue-link hover:underline text-sm cursor-pointer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Select File
                    </label>
                  )}
                  {agentAvatarUrl && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteAvatarMutation.mutate();
                      }}
                      disabled={deleteAvatarMutation.isPending}
                      className="ml-2 text-sm text-red-600 hover:underline disabled:opacity-60"
                    >
                      {deleteAvatarMutation.isPending ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                  <input
                    id="agent-avatar-input"
                    ref={agentAvatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    onChange={handleAgentAvatarUpload}
                    disabled={uploadAvatarMutation.isPending}
                    className="hidden"
                  />
                  <p className="text-xs text-oracle-light-gray mt-2">
                    Max file size: 2 MB
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rag' && (
            <div className="space-y-4">
              <div className="settings-section-card--accent flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <svg className="w-10 h-10 text-oracle-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">RAG Processing Settings</p>
                  <p className="text-sm text-gray-600">Configure ingestion concurrency and retrieval budgets used by the runtime</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div>
                  <p className="font-medium text-oracle-dark-gray">Ingestion</p>
                  <p className="text-sm text-oracle-medium-gray">These values control how many ingestion workers can run at the same time.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Parallel Jobs</label>
                    <input
                      type="number"
                      value={formData.rag?.['ingest.max_parallel_jobs'] ?? 2}
                      onChange={(e) => updateField('rag', 'ingest.max_parallel_jobs', Number(e.target.value || 2))}
                      className="input-oracle"
                      min="1"
                      max="20"
                    />
                    <FieldHint>Sets how many ingestion jobs can run in parallel across the queue.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Parallel Documents</label>
                    <input
                      type="number"
                      value={formData.rag?.['ingest.max_parallel_documents'] ?? 3}
                      onChange={(e) => updateField('rag', 'ingest.max_parallel_documents', Number(e.target.value || 3))}
                      className="input-oracle"
                      min="1"
                      max="20"
                    />
                    <FieldHint>Limits how many files a single ingestion workflow can process at the same time.</FieldHint>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div>
                  <p className="font-medium text-oracle-dark-gray">Retrieval</p>
                  <p className="text-sm text-oracle-medium-gray">Tune shortlist and page pool sizes before fusion and reranking.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Scoped Document Shortlist</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.doc_shortlist_scoped'] ?? 12}
                      onChange={(e) => updateField('rag', 'retrieval.doc_shortlist_scoped', Number(e.target.value || 12))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Controls how many files are kept when the question scope is already narrowed.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Global Document Shortlist</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.doc_shortlist_global'] ?? 20}
                      onChange={(e) => updateField('rag', 'retrieval.doc_shortlist_global', Number(e.target.value || 20))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Sets the initial file shortlist when the question searches across the full workspace.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Scoped Page Pool</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.page_pool_scoped'] ?? 36}
                      onChange={(e) => updateField('rag', 'retrieval.page_pool_scoped', Number(e.target.value || 36))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Defines the maximum page pool gathered from scoped file candidates before reranking.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Global Page Pool</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.page_pool_global'] ?? 60}
                      onChange={(e) => updateField('rag', 'retrieval.page_pool_global', Number(e.target.value || 60))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Defines the maximum page pool gathered for open-ended searches across all files.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Scoped Rerank Pool</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.rerank_scoped'] ?? 24}
                      onChange={(e) => updateField('rag', 'retrieval.rerank_scoped', Number(e.target.value || 24))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Caps reranking depth for metadata-first and already-scoped questions.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Global Rerank Pool</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.rerank_global'] ?? 32}
                      onChange={(e) => updateField('rag', 'retrieval.rerank_global', Number(e.target.value || 32))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Caps reranking depth for broad semantic searches across the whole corpus.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max Candidates</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.max_candidates'] ?? 2000}
                      onChange={(e) => updateField('rag', 'retrieval.max_candidates', Number(e.target.value || 2000))}
                      className="input-oracle"
                      min="40"
                    />
                    <FieldHint>Caps the total retrieval candidates collected before fusion and diversity selection.</FieldHint>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max MMR Pool</label>
                    <input
                      type="number"
                      value={formData.rag?.['retrieval.max_mmr_pool'] ?? 1200}
                      onChange={(e) => updateField('rag', 'retrieval.max_mmr_pool', Number(e.target.value || 1200))}
                      className="input-oracle"
                      min="1"
                    />
                    <FieldHint>Limits the pool sent into MMR so diversity stays useful without adding excess latency.</FieldHint>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'embedding' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 3v2.25M14.25 3v2.25M9.75 18.75V21M14.25 18.75V21M3 9.75h2.25M3 14.25h2.25M18.75 9.75H21M18.75 14.25H21M6.75 6.75h10.5v10.5H6.75V6.75z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 9.75h4.5v4.5h-4.5v-4.5z" />
                </svg>
                <div>
                  <p className="font-medium text-amber-800">Embedding and Answer Strategy</p>
                  <p className="text-sm text-amber-700">The embedding model is fixed; only answer and visual verification budgets are tunable.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Embedding Dimension</label>
                  <input
                    type="number"
                    value={formData.embedding?.dimension ?? 768}
                    className="input-oracle bg-gray-100 text-oracle-medium-gray"
                    min="1"
                    disabled
                  />
                  <p className="text-xs text-oracle-light-gray mt-1">Derived from the active local multimodal model.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Answer Max Evidence</label>
                  <input
                    type="number"
                    value={formData.embedding?.answer_max_evidence ?? 3}
                    onChange={(e) => updateField('embedding', 'answer_max_evidence', Number(e.target.value || 3))}
                    className="input-oracle"
                    min="1"
                    max="20"
                  />
                  <p className="text-xs text-oracle-light-gray mt-1">Limits how many top evidence pages are passed into final answer synthesis.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Visual Analysis Top K</label>
                  <input
                    type="number"
                    value={formData.embedding?.visual_analysis_top_k ?? 2}
                    onChange={(e) => updateField('embedding', 'visual_analysis_top_k', Number(e.target.value || 2))}
                    className="input-oracle"
                    min="1"
                    max="20"
                  />
                  <p className="text-xs text-oracle-light-gray mt-1">Controls how many pages go through explicit visual verification.</p>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {showSaveModal && (
        <ConfirmModal
          icon={
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M12 21a9 9 0 100-18 9 9 0 000 18z" />
            </svg>
          }
          iconBg="bg-red-100"
          iconRing="ring-red-50"
          title="Save settings"
          message="Are you sure you want to save these changes?"
          detail="Applies modified settings immediately for all users."
          confirmText="Save changes"
          confirmClass="text-red-600 hover:bg-red-50"
          onConfirm={confirmSave}
          onCancel={() => setShowSaveModal(false)}
          loading={updateMutation.isPending}
          loadingText="Saving..."
        />
      )}
    </Layout>
  );
}
