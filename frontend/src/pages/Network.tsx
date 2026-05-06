import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { modelsApi } from '../services/api';
import type { Referral, ReferralCommission } from '../services/api';

// ─── helpers ──────────────────────────────────────────────────────────────────

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sumCommissions = (commissions?: ReferralCommission[]) =>
  (commissions ?? []).reduce((s, c) => s + c.amount, 0);

const resolveName = (
  user?: { firstName?: string | null; lastName?: string | null; email?: string; username?: string | null } | null,
  fallbackEmail?: string | null,
  inviteCode?: string,
): string => {
  if (user) {
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return full || user.username || user.email || '—';
  }
  return fallbackEmail ?? (inviteCode ? `Invite · ${inviteCode}` : 'Pending invite');
};

const avatarInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + (parts.at(-1) ?? '')[0]).toUpperCase();
};

const avatarColors = [
  '#ff0f5f', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#4ade80',
  PENDING: '#facc15',
  COMPLETED: '#a5b4fc',
  CANCELLED: '#f87171',
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar = ({
  name,
  photoUrl,
  colorIdx = 0,
  size = 28,
}: {
  name: string;
  photoUrl?: string | null;
  colorIdx?: number;
  size?: number;
}) => {
  const dim = { width: size, height: size, borderRadius: '50%', flexShrink: 0 } as const;
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{ ...dim, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
      />
    );
  }
  return (
    <div
      style={{
        ...dim,
        background: avatarColors[colorIdx % avatarColors.length],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 24 ? '8px' : '10px',
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.02em',
      }}
    >
      {avatarInitials(name)}
    </div>
  );
};

// ─── single row (T1 or T2) ────────────────────────────────────────────────────

const PersonRow = ({
  name,
  photoUrl,
  colorIdx,
  subLabel,
  earned,
  statusColor,
  isT2 = false,
  isLastT2 = false,
  expandButton,
}: {
  name: string;
  photoUrl?: string | null;
  colorIdx: number;
  subLabel: string;
  earned: number;
  statusColor?: string;
  isT2?: boolean;
  isLastT2?: boolean;
  expandButton?: React.ReactNode;
}) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
    {/* tree connector lines for T2 */}
    {isT2 && (
      <>
        {/* vertical line — cut at the midpoint of the last item */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: isLastT2 ? 0 : undefined,
            bottom: isLastT2 ? '50%' : 0,
            height: isLastT2 ? '50%' : undefined,
            width: 1,
            background: 'rgba(255,42,113,0.25)',
          }}
        />
        {/* horizontal branch */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: '50%',
            width: 14,
            height: 1,
            background: 'rgba(255,42,113,0.25)',
          }}
        />
      </>
    )}

    <div
      style={{
        flex: 1,
        marginLeft: isT2 ? 36 : 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: isT2 ? '8px 16px 8px 12px' : '10px 16px',
        background: isT2 ? 'rgba(255,255,255,0.025)' : undefined,
        borderRadius: isT2 ? 6 : undefined,
        margin: isT2 ? '1px 8px 1px 36px' : undefined,
      }}
    >
      <Avatar name={name} photoUrl={photoUrl} colorIdx={colorIdx} size={isT2 ? 22 : 28} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: isT2 ? '12px' : '14px',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.2px',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          {statusColor && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: statusColor,
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subLabel}
          </span>
        </div>
      </div>

      {earned > 0 ? (
        <span
          style={{
            fontSize: isT2 ? '11px' : '12px',
            fontWeight: 600,
            color: 'var(--color-accent-bright)',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ${money(earned)}
        </span>
      ) : (
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>—</span>
      )}

      {expandButton}
    </div>
  </div>
);

// ─── T1 entry (with collapsible T2 children) ─────────────────────────────────

const T1Entry = ({ referral, colorIdx }: { referral: Referral; colorIdx: number }) => {
  const t2 = referral.childReferrals ?? [];
  const [open, setOpen] = useState(true);

  const name = resolveName(
    referral.referredUser,
    referral.metadata?.inviteeEmail,
    referral.inviteCode,
  );
  const earned = sumCommissions(referral.commissions);
  const statusColor = STATUS_COLOR[referral.status] ?? 'rgba(255,255,255,0.3)';
  const subLabel = [
    referral.status.charAt(0) + referral.status.slice(1).toLowerCase(),
    t2.length > 0 ? `${t2.length} referred` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <PersonRow
        name={name}
        photoUrl={referral.referredUser?.photoUrl}
        colorIdx={colorIdx}
        subLabel={subLabel}
        earned={earned}
        statusColor={statusColor}
        expandButton={
          t2.length > 0 ? (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Collapse' : 'Expand'}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: open ? 'rgba(255,42,113,0.15)' : 'rgba(255,255,255,0.05)',
                color: open ? 'var(--color-accent-bright)' : 'var(--color-text-muted)',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                marginLeft: 4,
                transition: 'background 0.15s',
              }}
            >
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 900,
                  display: 'block',
                  transform: open ? 'rotate(90deg)' : undefined,
                  transition: 'transform 0.15s',
                }}
              >
                ▶
              </span>
            </button>
          ) : (
            <div style={{ width: 24, flexShrink: 0 }} />
          )
        }
      />

      {open && t2.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: 0 }}>
          {/* full vertical line behind all T2 items */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'rgba(255,42,113,0.25)',
              pointerEvents: 'none',
            }}
          />
          {t2.map((child, idx) => {
            const childName = resolveName(child.referredUser);
            const childEarned = sumCommissions(child.commissions);
            return (
              <PersonRow
                key={child.id}
                name={childName}
                photoUrl={child.referredUser?.photoUrl}
                colorIdx={(colorIdx + idx + 1) % avatarColors.length}
                subLabel={child.referredUser?.email ?? 'Pending'}
                earned={childEarned}
                isT2
                isLastT2={idx === t2.length - 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── page ─────────────────────────────────────────────────────────────────────

export const Network = () => {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    modelsApi
      .getMyReferrals()
      .then(setReferrals)
      .catch(() => setError('Could not load network data. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const t1 = referrals.filter((r) => r.referrer?.id === user?.id);
  const allT2 = t1.flatMap((r) => r.childReferrals ?? []);
  const t1Earnings = t1.reduce((s, r) => s + sumCommissions(r.commissions), 0);
  const t2Earnings = allT2.reduce((s, cr) => s + sumCommissions(cr.commissions), 0);

  const rowStyle = {
    padding: '0 var(--space-16)',
    height: 'var(--button-m)',
    borderRadius: 'var(--radius-round)',
    background: 'var(--color-surface-end)',
    boxShadow: '0 -1px 0 0 rgba(255,255,255,0.10)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* heading */}
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}
        >
          My Network
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>
          T1 — influencers you invited · T2 — people they referred
        </p>
      </div>

      {/* loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 44,
                borderRadius: 100,
                background: 'rgba(255,255,255,0.05)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}

      {/* error */}
      {error && (
        <div
          style={{
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            background: 'rgba(239,68,68,0.1)',
            color: '#f87171',
            border: '1px solid rgba(239,68,68,0.25)',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* stat row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(
              [
                {
                  label: 'T1 Influencers',
                  value: t1.length,
                  sub: `${t1.filter((r) => r.status === 'ACTIVE').length} active`,
                },
                {
                  label: 'T2 People',
                  value: allT2.length,
                  sub: allT2.length > 0 ? 'via T1' : 'none yet',
                },
                {
                  label: 'Total Earned',
                  value: t1Earnings + t2Earnings > 0 ? `$${money(t1Earnings + t2Earnings)}` : '—',
                  sub: (() => {
                    if (t2Earnings > 0) return `T1 $${money(t1Earnings)} · T2 $${money(t2Earnings)}`;
                    if (t1Earnings > 0) return 'from T1 commissions';
                    return 'no commissions yet';
                  })(),
                },
              ] as const
            ).map(({ label, value, sub }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: 'var(--color-surface-end)',
                  boxShadow: '0 -1px 0 0 rgba(255,255,255,0.10)',
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    marginBottom: 4,
                  }}
                >
                  {label}
                </p>
                <p
                  className="stat-value"
                  style={{ lineHeight: 1, marginBottom: 4 }}
                >
                  {value}
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* empty state */}
          {t1.length === 0 && (
            <div
              style={{
                ...rowStyle,
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 13,
                height: 'auto',
                padding: '32px 16px',
                borderRadius: 12,
              }}
            >
              No direct invites yet — send your first invite to build your network.
            </div>
          )}

          {/* tree */}
          {t1.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* T1 section label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{ flex: 1, height: 1, background: 'rgba(255,42,113,0.2)' }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-accent-bright)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                  }}
                >
                  Direct Invites
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 100,
                    background: 'rgba(255,42,113,0.15)',
                    color: 'var(--color-accent-bright)',
                  }}
                >
                  {t1.length}
                </span>
                <div
                  style={{ flex: 1, height: 1, background: 'rgba(255,42,113,0.2)' }}
                />
              </div>

              {/* all T1 rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {t1.map((ref, idx) => (
                  <div key={ref.id}>
                    {/* divider between T1 entries (not before first) */}
                    {idx > 0 && (
                      <div
                        style={{
                          height: 1,
                          background: 'rgba(255,255,255,0.05)',
                          margin: '4px 0',
                        }}
                      />
                    )}
                    <T1Entry referral={ref} colorIdx={idx} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
