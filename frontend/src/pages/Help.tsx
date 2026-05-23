import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { helpApi, type HelpVideo, type HelpVideoRecord } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

const card: CSSProperties = {
  background: 'var(--color-surface, #1a1a2e)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  overflow: 'hidden',
};

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted, rgba(255,255,255,0.5))',
  marginBottom: 6,
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const input: CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '10px 12px',
  color: 'var(--color-text, #fff)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtn: CSSProperties = {
  background: 'var(--color-primary, #ff0f5f)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--color-text, #fff)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  cursor: 'pointer',
};

const dangerBtn: CSSProperties = {
  background: 'rgba(239,68,68,0.12)',
  color: '#f87171',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  cursor: 'pointer',
};

const USER_TYPE_LABELS: Record<string, string> = {
  ACCOUNT_MANAGER: 'Account Manager',
  CHATTER: 'Chatter',
};

// ─────────────────────────────────────────────────────────────────────────────
// Video Card (viewer)
// ─────────────────────────────────────────────────────────────────────────────

const VideoCard = ({ video, index }: { video: HelpVideo; index: number }) => {
  const [error, setError] = useState(false);

  return (
    <div style={card}>
      <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
        {error ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13 }}>Unable to load video</span>
          </div>
        ) : (
          <video
            src={video.url}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            controls
            playsInline
            preload="metadata"
            onError={() => setError(true)}
            aria-label={video.title}
          />
        )}
      </div>
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span
            style={{
              background: 'var(--color-primary, #ff0f5f)',
              color: '#fff',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '3px 8px',
              flexShrink: 0,
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-text, #fff)', lineHeight: 1.3 }}>
            {video.title}
          </h3>
        </div>
        {video.description && (
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            {video.description}
          </p>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

const VideoSkeleton = () => (
  <div style={card}>
    <div
      style={{
        aspectRatio: '16/9',
        background: 'rgba(255,255,255,0.06)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
    <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ height: 14, width: '60%', borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: 12, width: '85%', borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out 0.2s infinite' }} />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Add/Edit form
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { title: '', description: '', s3Key: '', userType: 'ACCOUNT_MANAGER' as 'ACCOUNT_MANAGER' | 'CHATTER', sortOrder: 0 };

interface VideoFormProps {
  initial?: HelpVideoRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

const VideoForm = ({ initial, onSaved, onCancel }: VideoFormProps) => {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          description: initial.description ?? '',
          s3Key: initial.s3Key,
          userType: initial.userType,
          sortOrder: initial.sortOrder,
        }
      : { ...EMPTY_FORM },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.s3Key.trim()) { setError('S3 key is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (initial) {
        await helpApi.adminUpdateVideo(initial.id, {
          title: form.title,
          description: form.description || undefined,
          s3Key: form.s3Key,
          userType: form.userType,
          sortOrder: Number(form.sortOrder),
        });
      } else {
        await helpApi.adminCreateVideo({
          title: form.title,
          description: form.description || undefined,
          s3Key: form.s3Key,
          userType: form.userType,
          sortOrder: Number(form.sortOrder),
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={label}>Title *</span>
        <input style={input} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Video title" />
      </div>
      <div>
        <span style={label}>Description</span>
        <input style={input} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional description" />
      </div>
      <div>
        <span style={label}>S3 Key *</span>
        <input style={input} value={form.s3Key} onChange={(e) => set('s3Key', e.target.value)} placeholder="e.g. videos/help/am-intro.mp4" />
      </div>
      <div className="help-form-2col">
        <div>
          <span style={label}>Visible to</span>
          <select
            style={{ ...input, appearance: 'none' }}
            value={form.userType}
            onChange={(e) => set('userType', e.target.value)}
          >
            <option value="ACCOUNT_MANAGER">Account Manager</option>
            <option value="CHATTER">Chatter</option>
          </select>
        </div>
        <div>
          <span style={label}>Sort order</span>
          <input
            style={input}
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', Number(e.target.value))}
          />
        </div>
      </div>
      {error && (
        <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" style={primaryBtn} disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add video'}
        </button>
        <button type="button" style={ghostBtn} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin panel
// ─────────────────────────────────────────────────────────────────────────────

const AdminPanel = () => {
  const [records, setRecords] = useState<HelpVideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HelpVideoRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    helpApi
      .adminListVideos()
      .then(setRecords)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this video?')) return;
    setDeletingId(id);
    try {
      await helpApi.adminDeleteVideo(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (r: HelpVideoRecord) => {
    try {
      const updated = await helpApi.adminUpdateVideo(r.id, { isActive: !r.isActive });
      setRecords((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleFormSaved = () => {
    setShowForm(false);
    setEditing(null);
    load();
  };

  const amVideos = records.filter((r) => r.userType === 'ACCOUNT_MANAGER');
  const chatterVideos = records.filter((r) => r.userType === 'CHATTER');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Header row */}
      <div className="help-admin-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text, #fff)' }}>
            Manage Help Videos
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Add, edit, or remove videos visible to account managers and chatters.
          </p>
        </div>
        {!showForm && !editing && (
          <button style={primaryBtn} onClick={() => setShowForm(true)}>
            + Add video
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && !editing && (
        <div style={{ ...card, padding: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: 'var(--color-text, #fff)' }}>
            New video
          </h3>
          <VideoForm onSaved={handleFormSaved} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 18px', color: '#f87171', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Video tables by user type */}
      {[
        { title: 'Account Manager Videos', items: amVideos },
        { title: 'Chatter Videos', items: chatterVideos },
      ].map(({ title, items }) => (
        <div key={title}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {title}
          </h3>
          {loading ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No videos yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map((r) => (
                <div key={r.id}>
                  {editing?.id === r.id ? (
                    <div style={{ ...card, padding: '20px 24px' }}>
                      <VideoForm initial={r} onSaved={handleFormSaved} onCancel={() => setEditing(null)} />
                    </div>
                  ) : (
                    <div
                      className="help-admin-row"
                      style={{ opacity: r.isActive ? 1 : 0.5 }}
                    >
                      {/* Rank badge */}
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.07)',
                          color: 'rgba(255,255,255,0.4)',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          flexShrink: 0,
                        }}
                      >
                        #{r.sortOrder}
                      </span>

                      {/* Title + key */}
                      <div className="help-admin-row-info">
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.s3Key}
                        </div>
                      </div>

                      {/* Status pill */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 20,
                          flexShrink: 0,
                          background: r.isActive ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
                          color: r.isActive ? '#4ade80' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        {r.isActive ? 'Active' : 'Hidden'}
                      </span>

                      {/* Actions */}
                      <div className="help-admin-row-actions">
                        <button style={ghostBtn} onClick={() => setEditing(r)}>Edit</button>
                        <button style={ghostBtn} onClick={() => handleToggleActive(r)}>
                          {r.isActive ? 'Hide' : 'Show'}
                        </button>
                        <button
                          style={dangerBtn}
                          disabled={deletingId === r.id}
                          onClick={() => handleDelete(r.id)}
                        >
                          {deletingId === r.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Viewer (AM / Chatter)
// ─────────────────────────────────────────────────────────────────────────────

const VideoViewer = () => {
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    helpApi
      .getHelpVideos()
      .then((data) => { if (!cancelled) setVideos(data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load videos'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '16px 20px', color: '#f87171', fontSize: 14, marginBottom: 24 }}>
          {error}
        </div>
      )}
      <div className="help-video-grid">
        {isLoading ? (
          <><VideoSkeleton /><VideoSkeleton /></>
        ) : videos.length === 0 && !error ? (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '48px 0' }}>
            No videos available yet.
          </p>
        ) : (
          videos.map((video, i) => <VideoCard key={video.id} video={video} index={i} />)
        )}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export const Help = () => {
  const { user } = useAuth();
  const isAdmin = user?.baseRole === 'admin';

  const subtitle = isAdmin
    ? 'Manage training videos shown to account managers and chatters.'
    : 'Training videos to help you get the most out of the platform.';

  return (
    <div className="help-page-wrapper">
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        select option { background: #1a1a2e; }

        .help-video-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
          gap: 24px;
        }

        .help-page-wrapper {
          max-width: 960px;
          margin: 0 auto;
          padding: 32px 24px 48px;
        }

        @media (max-width: 600px) {
          .help-page-wrapper {
            padding: 16px 0 32px;
          }
          .help-page-header {
            padding: 0 16px;
            margin-bottom: 20px !important;
          }
          .help-video-grid {
            gap: 0;
            border-radius: 0;
          }
          .help-video-grid > * {
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
            border-top: none !important;
          }
        }

        .help-admin-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: var(--color-surface, #1a1a2e);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
        }

        .help-admin-row-info {
          flex: 1;
          min-width: 0;
        }

        .help-admin-row-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .help-admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .help-form-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 600px) {
          .help-admin-row {
            flex-wrap: wrap;
          }
          .help-admin-row-info {
            order: 1;
            width: calc(100% - 52px);
          }
          .help-admin-row-actions {
            order: 2;
            width: 100%;
            flex-wrap: wrap;
          }
          .help-admin-header {
            flex-wrap: wrap;
          }
          .help-form-2col {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Page header */}
      <div className="help-page-header" style={{ marginBottom: 36 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--color-text, #fff)', letterSpacing: '-0.01em' }}>
          Help
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
          {subtitle}
        </p>
      </div>

      {isAdmin ? <AdminPanel /> : <VideoViewer />}
    </div>
  );
};
