import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { modelsApi, type Campaign, type CampaignInput } from "../services/api";

/** Badge label: "https://teaseme.live" → "teaseme". Stored URL stays unchanged. */
function websiteLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Drop scheme/path/query/fragment.
  let host = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  host = host.split(/[/?#]/)[0] ?? host;

  // Drop any userinfo and port.
  host = (host.split("@").pop() ?? host).replace(/^www\./i, "");
  host = host.split(":")[0] ?? host;

  // Keep IP/localhost as-is.
  if (/^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})$/i.test(host)) return host;

  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 1) return host;

  const tld = parts.at(-1)!.toLowerCase();
  const sld = parts.at(-2)!.toLowerCase();
  const isTwoPartTld =
    ["co", "com", "net", "org", "gov", "ac", "edu"].includes(sld) &&
    tld.length >= 2;

  const domainIndex = isTwoPartTld ? parts.length - 3 : parts.length - 2;
  return parts[domainIndex] ?? host;
}

function siteHost(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** From domain may be the website host, or a parent/subdomain of it. */
function mailDomainMatches(websiteUrl: string, fromEmail: string | null | undefined): boolean {
  const email = fromEmail?.trim() ?? "";
  if (!email) return true;
  const host = siteHost(websiteUrl);
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);
}

const EMPTY_FORM: CampaignInput = {
  name: "",
  description: "",
  websiteUrl: "",
  defaultReferralUrl: "",
  commissionRate: 30,
  secondaryRate: 10,
  recurringRate: null,
  cookieLifeDays: 90,
  autoApprove: true,
  visibleToPromoters: true,
  maxInvitesPerMonth: null,
  linkedCampaignId: null,
  mainCampaignId: null,
  mailProvider: "smtp",
  mailHost: "",
  mailPort: 587,
  mailUser: "",
  mailPassword: "",
  fromEmail: "",
  fromName: "",
};

export const Campaigns = () => {
  const { logout } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignInput>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await modelsApi.getAllCampaigns();
      setCampaigns(data);
    } catch (err) {
      if (err instanceof Error && err.message === "SESSION_EXPIRED") {
        logout();
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to load campaigns",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditingCampaign(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    const explicit = c.visibleToPromoters ? (c.mainCampaign ?? null) : null;
    // Ignore a stored main whose website is not the one on this campaign.
    // Saving would otherwise copy that other site onto the live referral URL.
    const main =
      explicit && explicit.websiteUrl === c.websiteUrl ? explicit : null;
    setEditingCampaign(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      websiteUrl: main?.websiteUrl ?? c.websiteUrl,
      defaultReferralUrl: main?.defaultReferralUrl ?? c.defaultReferralUrl ?? "",
      commissionRate: c.commissionRate,
      secondaryRate: c.secondaryRate ?? 0,
      recurringRate: c.recurringRate ?? null,
      cookieLifeDays: c.cookieLifeDays,
      autoApprove: c.autoApprove,
      visibleToPromoters: c.visibleToPromoters,
      maxInvitesPerMonth: c.maxInvitesPerMonth,
      linkedCampaignId: c.linkedCampaignId ?? null,
      mainCampaignId: main?.id ?? null,
      mailProvider: c.mailProvider === "aws" ? "aws" : "smtp",
      mailHost: c.mailHost ?? "",
      mailPort: c.mailPort ?? 587,
      mailUser: c.mailUser ?? "",
      mailPassword: "",
      fromEmail: main?.fromEmail ?? c.fromEmail ?? "",
      fromName: main?.fromName ?? c.fromName ?? "",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (form.visibleToPromoters !== false && !form.mainCampaignId) {
      setFormError(
        "Select a main campaign. The public campaign uses that campaign's website.",
      );
      return;
    }
    // Creating a second public program must not steal an existing company's
    // hidden→public invite link. Force a dedicated hidden campaign first.
    if (form.visibleToPromoters !== false && form.mainCampaignId) {
      const main = campaigns.find((c) => c.id === form.mainCampaignId);
      if (
        main?.linkedCampaign &&
        main.linkedCampaign.id !== editingCampaign?.id
      ) {
        setFormError(
          `"${main.name}" already invites into ${main.linkedCampaign.name}. Turn off Visible to Promoters, create a new hidden campaign for the new company, then use that as Main.`,
        );
        return;
      }
    }
    if (!form.websiteUrl.trim()) {
      setFormError(
        form.visibleToPromoters !== false
          ? "The main campaign has no website URL"
          : "Website URL is required",
      );
      return;
    }
    if (form.commissionRate < 0 || form.commissionRate > 100) {
      setFormError("Promoter commission must be 0–100");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        maxInvitesPerMonth: form.maxInvitesPerMonth ?? null,
        // `linkedCampaignId` only makes sense on hidden AM campaigns. If
        // the admin flipped a campaign to Public, clear the link so we
        // never persist a dangling reference that would silently confuse
        // the AM invite logic.
        linkedCampaignId: form.visibleToPromoters
          ? null
          : (form.linkedCampaignId || null),
        mainCampaignId: form.visibleToPromoters
          ? form.mainCampaignId || null
          : null,
      };
      if (editingCampaign) {
        await modelsApi.updateCampaign(editingCampaign.id, payload);
      } else {
        await modelsApi.createCampaign(payload);
      }
      const data = await modelsApi.getAllCampaigns();
      setCampaigns(data);
      setIsModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save campaign",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (c: Campaign) => {
    setTogglingId(c.id);
    try {
      const updated = await modelsApi.updateCampaign(c.id, {
        isActive: !c.isActive,
      });
      setCampaigns((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
    } catch {
      // silent — could show toast
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await modelsApi.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete campaign",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const inheritsWebsite = form.visibleToPromoters !== false;
  const mainCampaignOptions = campaigns.filter(
    (c) => !c.visibleToPromoters && c.id !== editingCampaign?.id,
  );
  // Hidden campaigns not already inviting into another public program —
  // preferred for a second company so we don't steal the first company's link.
  const unusedMainCampaignOptions = mainCampaignOptions.filter(
    (c) =>
      !c.linkedCampaign ||
      c.linkedCampaign.id === editingCampaign?.id ||
      c.id === form.mainCampaignId,
  );
  const selectedMain =
    mainCampaignOptions.find((c) => c.id === form.mainCampaignId) ?? null;
  const selectedMainAlreadyLinkedElsewhere =
    !!selectedMain?.linkedCampaign &&
    selectedMain.linkedCampaign.id !== editingCampaign?.id;
  const needsNewHiddenForSecondCompany =
    inheritsWebsite &&
    !editingCampaign &&
    unusedMainCampaignOptions.length === 0 &&
    mainCampaignOptions.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-col lg:flex-row gap-3">
        <h1 className="text-3xl leading-9 font-semibold text-white lg:w-auto">
          Campaigns
        </h1>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4  justify-between lg:justify-end w-full">
          <p className="text-base text-tm-text-color08">{campaigns.length} total</p>
          <button
            onClick={openCreate}
            className="btn-primary-cta rounded-lg px-4 py-3 text-sm font-bold leading-[1.4]  active:scale-[0.98] transition-all"
          >
            + Create Campaign
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-semibold">{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-tm-text-color08 text-base">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3 lg:gap-6">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-lg p-4 lg:p-6 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-col gap-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-col lg:flex-row">
                  <div className="flex flex-col gap-1">
                    <p className="text-white text-xl lg:text-2xl">
                      {c.name}
                    </p>
                    {c.description && (
                      <p className="text-tm-text-color09 text-base">
                        {c.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-start lg:flex-row lg:items-center gap-3">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleActive(c)}
                      disabled={togglingId === c.id}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${c.isActive
                        ? "bg-tm-success-color12 border-tm-success-color09 text-tm-success-color05 hover:bg-[#005518] hover:scale-95"
                        : "bg-[#333] border-[#555] text-tm-text-color08 hover:bg-[#3a3a3a]"
                        } disabled:opacity-50`}
                    >
                      {togglingId === c.id
                        ? "..."
                        : c.isActive
                          ? "Active"
                          : "Inactive"}
                    </button>

                    {/* Visibility badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${c.visibleToPromoters
                        ? "bg-tm-secondary-color11 border-tm-secondary-color05 text-tm-secondary-color03"
                        : "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-tm-text-color08"
                        }`}
                    >
                      {c.visibleToPromoters ? "Public" : "Hidden"}
                    </span>

                    <span
                      title={c.websiteUrl}
                      className="inline-flex max-w-full items-center rounded-full border border-tm-primary-color09 bg-tm-primary-color12 px-3 py-1 text-xs font-bold text-tm-primary-color02 break-all"
                    >
                      {websiteLabel(c.websiteUrl)}
                    </span>

                    {c.mailProvider === "aws" && (
                      <span
                        title="Invites send through the MJ Promoter AWS account"
                        className="inline-flex max-w-full items-center rounded-full border border-tm-primary-color09 bg-tm-primary-color12 px-3 py-1 text-xs font-bold text-tm-primary-color02"
                      >
                        AWS
                      </span>
                    )}

                    {c.mailProvider === "aws" && !c.fromEmail ? null : c.fromEmail && mailDomainMatches(c.websiteUrl, c.fromEmail) ? (
                      <span
                        title={`Invites send from ${c.fromEmail}`}
                        className="inline-flex max-w-full items-center rounded-full border border-tm-primary-color09 bg-tm-primary-color12 px-3 py-1 text-xs font-bold text-tm-primary-color02 break-all"
                      >
                        {c.fromEmail}
                      </span>
                    ) : (
                      <span
                        title={
                          c.fromEmail
                            ? "This From address is a different domain from the campaign website, so invites can land in junk."
                            : "Add a mail login on the hidden company campaign before invites can be emailed."
                        }
                        className="inline-flex max-w-full items-center rounded-full border border-tm-warning-color09 bg-tm-warning-color12 px-3 py-1 text-xs font-bold text-tm-warning-color02 break-all"
                      >
                        {c.fromEmail ? `${c.fromEmail} domain mismatch` : "No mailbox"}
                      </span>
                    )}

                    {/* Link status — only on hidden AM campaigns. Surfaces
                        misconfigured campaigns directly on the list. */}
                    {!c.visibleToPromoters && c.linkedCampaign && (
                      <span
                        title={`Linked to ${c.linkedCampaign.name}`}
                        className="px-3 py-1.5 rounded-full text-xs font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-tm-text-color08"
                      >
                        Linked → {c.linkedCampaign.name}
                      </span>
                    )}
                    {!c.visibleToPromoters && !c.linkedCampaign && (
                      <span
                        title="No public campaign linked. AMs enrolled here can't invite anyone."
                        className="px-3 py-1.5 rounded-full text-xs font-bold border bg-[#332200] border-[#cc9900] text-[#ffcc33]"
                      >
                        Not linked
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2 lg:grid lg:grid-cols-6 lg:gap-4 lg:text-center lg:mt-3">
                  <div className="flex flex-col gap-2">
                    <p className="text-tm-text-color10 text-xs uppercase font-bold">
                      Promoter commission %
                    </p>
                    <p className="text-white text-lg ">
                      {c.commissionRate}%
                    </p>
                  </div>
                  {c.secondaryRate != null && c.secondaryRate > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-tm-text-color10 text-xs uppercase font-bold">
                        {secondaryRateLabelForCampaign(c.visibleToPromoters)}
                      </p>
                      <p className="text-white text-lg ">
                        {c.secondaryRate}%
                      </p>
                    </div>
                  )}
                  {c.recurringRate != null &&
                    c.recurringRate > 0 &&
                    c.visibleToPromoters && (
                      <div className="flex flex-col gap-2">
                        <p className="text-tm-text-color10 text-xs uppercase font-bold">
                          Account manager %
                        </p>
                        <p className="text-white text-lg ">
                          {c.recurringRate}%
                        </p>
                      </div>
                    )}
                  <div className="flex flex-col gap-2">
                    <p className="text-tm-text-color10 text-xs uppercase font-bold">
                      Cookie
                    </p>
                    <p className="text-white text-lg ">
                      {c.cookieLifeDays}d
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-tm-text-color10 text-xs uppercase font-bold">
                      Invites/mo
                    </p>
                    <p className="text-white text-lg ">
                      {c.maxInvitesPerMonth ?? "∞"}
                    </p>
                  </div>
                  {c._count && (
                    <div className="flex flex-col gap-2">
                      <p className="text-tm-text-color10 text-xs uppercase font-bold">
                        Referrals
                      </p>
                      <p className="text-white text-lg ">
                        {c._count.referrals}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex items-center justify-end gap-4 pt-6 pb-4 mt-4 border-t border-[rgba(255,255,255,0.05)]">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-tm-text-color08 text-sm lg:text-base hover:text-white hover:-translate-y-0.5 transition-all"
                  >
                    Edit
                  </button>

                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-tm-text-color08 text-xs">
                        Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="px-2.5 py-1 rounded-md text-xs bg-tm-danger-color12 border border-tm-danger-color09 text-tm-danger-color05 hover:bg-[#880000] disabled:opacity-50 transition-colors"
                      >
                        {deletingId === c.id ? "..." : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-md text-xs bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-tm-text-color08 hover:text-white transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="text-tm-danger-color04 text-sm hover:text-tm-danger-color05 hover:-translate-y-0.5 transition-all"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {campaigns.length === 0 && (
            <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-lg p-6 text-center">
              <p className="text-tm-text-color08 text-base">
                No campaigns yet. Create the first one.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-5 py-5">
          <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-lg p-6 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1)] w-full lg:max-w-240 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col gap-4.5">
              {/* Modal header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                  {editingCampaign ? "Edit Campaign" : "Create Campaign"}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-tm-text-color08 hover:text-white text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <Field label="Campaign Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Influencer Referral Campaign"
                  className={inputCls}
                />
              </Field>

              <Field label="Description">
                <input
                  type="text"
                  value={form.description ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Optional description"
                  className={inputCls}
                />
              </Field>

              {inheritsWebsite && (
                <Field label="Main campaign">
                  {needsNewHiddenForSecondCompany && (
                    <div className="mb-3 rounded-md border border-tm-warning-color09/40 bg-tm-warning-color12/30 px-3 py-2.5">
                      <p className="text-tm-warning-color02 text-sm leading-[1.4]">
                        Every hidden campaign is already linked to a public
                        campaign. For a <span className="font-semibold">new company</span>, turn
                        off <span className="font-semibold">Visible to Promoters</span> below,
                        create a new hidden campaign with that company's website,
                        then come back and create this public campaign with that
                        hidden as Main.
                      </p>
                    </div>
                  )}
                  <select
                    value={form.mainCampaignId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      const main = mainCampaignOptions.find((c) => c.id === id);
                      setForm((f) => ({
                        ...f,
                        mainCampaignId: id,
                        websiteUrl: main?.websiteUrl ?? "",
                        defaultReferralUrl: main?.defaultReferralUrl ?? "",
                        mailProvider: main?.mailProvider === "aws" ? "aws" : "smtp",
                        fromEmail: main?.fromEmail ?? "",
                        fromName: main?.fromName ?? "",
                      }));
                    }}
                    className={inputCls}
                  >
                    <option value="">— Select a main campaign —</option>
                    {mainCampaignOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.linkedCampaign
                          ? ` → ${c.linkedCampaign.name}`
                          : " (available)"}
                      </option>
                    ))}
                  </select>
                  <p className="text-tm-text-color10 text-xs mt-1.5 leading-[1.4]">
                    Choose a hidden campaign. This public campaign uses that
                    campaign's website, referral URL, and mail login.
                  </p>
                  {selectedMainAlreadyLinkedElsewhere && (
                    <p className="text-tm-danger-color05 text-xs mt-1.5 leading-[1.4]">
                      Saving will move{" "}
                      <span className="font-semibold">{selectedMain?.name}</span>{" "}
                      off{" "}
                      <span className="font-semibold">
                        {selectedMain?.linkedCampaign?.name}
                      </span>{" "}
                      and break that company's invites. Create a new hidden
                      campaign for the new company instead.
                    </p>
                  )}
                </Field>
              )}

              <Field label="Website URL">
                <input
                  type="url"
                  value={form.websiteUrl}
                  readOnly={inheritsWebsite}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, websiteUrl: e.target.value }))
                  }
                  placeholder={
                    inheritsWebsite
                      ? "Comes from the main campaign"
                      : "https://teaseme.live"
                  }
                  className={`${inputCls}${inheritsWebsite ? " opacity-70" : ""}`}
                />
              </Field>

              <Field label="Default Referral URL">
                <input
                  type="url"
                  value={form.defaultReferralUrl ?? ""}
                  readOnly={inheritsWebsite}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      defaultReferralUrl: e.target.value,
                    }))
                  }
                  placeholder={
                    inheritsWebsite
                      ? "Comes from the main campaign"
                      : "https://teaseme.live/join"
                  }
                  className={`${inputCls}${inheritsWebsite ? " opacity-70" : ""}`}
                />
              </Field>

              {inheritsWebsite ? (
                <Field label="From email">
                  <input
                    type="email"
                    readOnly
                    value={selectedMain?.fromEmail || form.fromEmail || ""}
                    placeholder="Comes from the main campaign"
                    className={`${inputCls} opacity-70`}
                  />
                  <p className="text-tm-text-color10 text-xs mt-1.5 leading-[1.4]">
                    {selectedMain?.mailProvider === "aws"
                      ? "Invites send through AWS"
                      : "Invites send from the main campaign's mailbox"}
                    {selectedMain?.fromName ? ` as ${selectedMain.fromName}` : ""}.
                  </p>
                  {(selectedMain?.fromEmail || form.fromEmail) &&
                    !mailDomainMatches(
                      form.websiteUrl,
                      selectedMain?.fromEmail || form.fromEmail,
                    ) && (
                      <p className="text-tm-warning-color02 text-xs mt-1.5 leading-[1.4]">
                        This From domain does not match the website, so invites
                        can land in junk. Change the mail login on the hidden
                        campaign.
                      </p>
                    )}
                </Field>
              ) : (
                <>
                  <Field label="Email service">
                    <select
                      value={form.mailProvider === "aws" ? "aws" : "smtp"}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mailProvider: e.target.value === "aws" ? "aws" : "smtp",
                        }))
                      }
                      className={inputCls}
                    >
                      <option value="aws">AWS email service</option>
                      <option value="smtp">Own mailbox</option>
                    </select>
                  </Field>
                  {form.mailProvider === "aws" ? (
                    <>
                      <div className="flex gap-3 flex-col lg:flex-row">
                        <Field label="From email" className="flex-1">
                          <input
                            type="email"
                            value={form.fromEmail ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, fromEmail: e.target.value }))
                            }
                            placeholder="teaseme@teaseme.live"
                            className={inputCls}
                          />
                        </Field>
                        <Field label="From name" className="flex-1">
                          <input
                            type="text"
                            value={form.fromName ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, fromName: e.target.value }))
                            }
                            placeholder="TeaseMe"
                            className={inputCls}
                          />
                        </Field>
                      </div>
                      <p className="text-tm-text-color10 text-xs leading-[1.4] -mt-2">
                        Invites use the MJ Promoter AWS account. The From address
                        must already be allowed in that account.
                      </p>
                    </>
                  ) : (
                  <>
                  <div className="flex gap-3 flex-col lg:flex-row">
                    <Field label="Mail host" className="flex-1">
                      <input
                        type="text"
                        value={form.mailHost ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, mailHost: e.target.value }))
                        }
                        placeholder="smtp.example.com"
                        autoComplete="off"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Port" className="w-full lg:w-28">
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={form.mailPort ?? 587}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            mailPort: parseInt(e.target.value, 10) || 587,
                          }))
                        }
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <div className="flex gap-3 flex-col lg:flex-row">
                    <Field label="Mail username" className="flex-1">
                      <input
                        type="text"
                        value={form.mailUser ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, mailUser: e.target.value }))
                        }
                        placeholder="invites@example.com"
                        autoComplete="off"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Mail password" className="flex-1">
                      <input
                        type="password"
                        value={form.mailPassword ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, mailPassword: e.target.value }))
                        }
                        placeholder={
                          editingCampaign?.mailPasswordSet
                            ? "Leave blank to keep the saved password"
                            : "Mailbox password"
                        }
                        autoComplete="new-password"
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <div className="flex gap-3 flex-col lg:flex-row">
                    <Field label="From email" className="flex-1">
                      <input
                        type="email"
                        value={form.fromEmail ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, fromEmail: e.target.value }))
                        }
                        placeholder="invites@example.com"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="From name" className="flex-1">
                      <input
                        type="text"
                        value={form.fromName ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, fromName: e.target.value }))
                        }
                        placeholder="Sugar Scratchie"
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  {form.fromEmail?.trim() &&
                    !mailDomainMatches(form.websiteUrl, form.fromEmail) && (
                      <p className="text-tm-warning-color02 text-xs leading-[1.4] -mt-2">
                        The From domain does not match this website. Invites from
                        a different domain can land in junk. Saving is still allowed.
                      </p>
                    )}
                  <p className="text-tm-text-color10 text-xs leading-[1.4] -mt-2">
                    Port 465 uses SSL. Any other port uses STARTTLS. The mailbox
                    host must already allow this domain to send (SPF and DKIM).
                  </p>
                  </>
                  )}
                </>
              )}

              {/* Rates row */}
              <div className="flex gap-3 flex-col lg:flex-row">
                <Field label="Promoter commission %" className="flex-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.commissionRate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        commissionRate: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className={inputCls}
                  />
                </Field>
                <Field
                  label={secondaryRateLabelForCampaign(
                    form.visibleToPromoters ?? true,
                  )}
                  className="flex-1"
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.secondaryRate ?? 0}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        secondaryRate: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className={inputCls}
                  />
                </Field>
                {form.visibleToPromoters && (
                  <Field label="Account manager %" className="flex-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={form.recurringRate ?? 0}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value);
                        setForm((f) => ({
                          ...f,
                          recurringRate: v > 0 ? v : null,
                        }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                )}
              </div>

              {/* Cookie + Invites row */}
              <div className="flex gap-3 flex-col lg:flex-row">
                <Field label="Cookie Life (days)" className="flex-1">
                  <input
                    type="number"
                    min={1}
                    value={form.cookieLifeDays ?? 90}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        cookieLifeDays: parseInt(e.target.value) || 90,
                      }))
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Max Invites/Month" className="flex-1">
                  <input
                    type="number"
                    min={0}
                    value={form.maxInvitesPerMonth ?? ""}
                    placeholder="Unlimited"
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({
                        ...f,
                        maxInvitesPerMonth: v === "" ? null : parseInt(v),
                      }));
                    }}
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* Toggles row */}
              <div className="flex gap-3 flex-col lg:flex-row">
                <Toggle
                  label="Visible to Promoters"
                  value={form.visibleToPromoters ?? true}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      visibleToPromoters: v,
                      ...(!v && { recurringRate: null, mainCampaignId: null }),
                      // Going public clears any stale link; going hidden
                      // leaves the existing one (or null) for the admin to
                      // pick below.
                      ...(v && {
                        linkedCampaignId: null,
                        mainCampaignId: null,
                        websiteUrl: "",
                        defaultReferralUrl: "",
                      }),
                      // Going hidden unlocks website fields for a new company.
                      ...(!v && {
                        websiteUrl:
                          f.websiteUrl && !f.mainCampaignId ? f.websiteUrl : "",
                        defaultReferralUrl:
                          f.defaultReferralUrl && !f.mainCampaignId
                            ? f.defaultReferralUrl
                            : "",
                      }),
                    }))
                  }
                />
                <Toggle
                  label="Auto Approve"
                  value={form.autoApprove ?? true}
                  onChange={(v) => setForm((f) => ({ ...f, autoApprove: v }))}
                />
              </div>
              {form.visibleToPromoters === false && !editingCampaign && (
                <p className="text-tm-text-color10 text-xs leading-[1.4] -mt-2">
                  Hidden = Account Manager membership for one company. Enter
                  that company's website below, save, then create a Public
                  campaign that uses this one as Main.
                </p>
              )}

              {/* Linked Public Campaign — only relevant for hidden (AM
                  membership) campaigns. The picked campaign is what new
                  AMs enrolled here will invite promoters into. */}
              {form.visibleToPromoters === false && (
                <Field label="Linked Public Campaign">
                  <select
                    value={form.linkedCampaignId ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        linkedCampaignId: e.target.value || null,
                      }))
                    }
                    className={inputCls}
                  >
                    <option value="">— None —</option>
                    {campaigns
                      .filter(
                        (c) =>
                          c.visibleToPromoters &&
                          c.isActive &&
                          c.id !== editingCampaign?.id,
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-tm-text-color10 text-xs mt-1.5 leading-[1.4]">
                    Account managers enrolled in this hidden campaign will
                    invite promoters into the selected public campaign. That
                    public campaign takes this campaign's website and referral
                    URL. Leave as "None" only if no AMs use this campaign yet.
                  </p>
                </Field>
              )}

              {formError && (
                <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-md px-4 py-3">
                  <p className="text-tm-danger-color05 text-sm font-medium">
                    {formError}
                  </p>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary-cta rounded-lg px-6 py-3.5  text-base font-bold  active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving
                  ? "Saving..."
                  : editingCampaign
                    ? "Save Changes"
                    : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `secondaryRate` meaning: AM % on hidden campaigns, referral upline % on public. */
function secondaryRateLabelForCampaign(visibleToPromoters: boolean): string {
  return visibleToPromoters ? "Referral commission %" : "Account manager %";
}

const inputCls =
  "bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-sm text-white focus:outline-none focus:border-tm-primary-color04 placeholder-[#555] w-full";

const Field = ({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label className="text-tm-text-color08 text-sm font-bold uppercase" >
      {label}
    </label>
    {children}
  </div>
);

const Toggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    onClick={() => onChange(!value)}
    className={`flex-1 flex items-center justify-between rounded-lg px-3.5 py-3 border transition-all ${value
      ? "bg-tm-primary-color04/10 border-tm-primary-color04"
      : "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]"
      }`}
  >
    <span
      className={`text-sm font-bold ${value ? "text-tm-primary-color05" : "text-tm-text-color08"}`}
    >
      {label}
    </span>
    <div
      className={`w-4 h-4 rounded-full border-2 ${value ? "border-tm-primary-color04 bg-tm-primary-color04" : "border-[#555]"
        }`}
    />
  </button>
);
