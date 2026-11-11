import { useEffect, useMemo, useState } from "react";
import {
  modelsApi,
  type AccountManagerSummary,
  type ApiUser,
  type Campaign,
} from "../services/api";

interface EditAccountManagerModalProps {
  isOpen: boolean;
  manager: AccountManagerSummary | null;
  onClose: () => void;
  /**
   * Called once the PUT /users/:id has succeeded. The first arg is the
   * updated `ApiUser` returned by the API; the second is the campaign ids
   * the admin selected (so the parent can patch its `AccountManagerSummary`
   * cache without a refetch).
   */
  onUpdated: (user: ApiUser, campaignIds: string[]) => void;
}

export const EditAccountManagerModal = ({
  isOpen,
  manager,
  onClose,
  onUpdated,
}: EditAccountManagerModalProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Re-seed the form whenever the modal opens for a (potentially) different
  // AM. Seed from `campaigns` when present, else fall back to `currentCampaign`.
  useEffect(() => {
    if (!isOpen || !manager) return;
    setFirstName(manager.firstName ?? "");
    setLastName(manager.lastName ?? "");
    setEmail(manager.email);
    const fromList = (manager.campaigns ?? [])
      .map((c) => c.id)
      .filter(Boolean);
    const seed =
      fromList.length > 0
        ? fromList
        : manager.currentCampaign?.id
          ? [manager.currentCampaign.id]
          : [];
    setSelectedCampaignIds(seed);
    setError("");
    setSuccess(false);
  }, [isOpen, manager]);

  // Load the hidden AM membership campaigns the admin can pick from. We
  // mirror CreateUserModal's filter exactly — active and `!visibleToPromoters`.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCampaignsLoading(true);
    setCampaignsError("");
    modelsApi
      .getAllCampaigns()
      .then((all) => {
        if (cancelled) return;
        setCampaigns(all.filter((c) => c.isActive && !c.visibleToPromoters));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCampaignsError(
          err instanceof Error ? err.message : "Failed to load campaigns",
        );
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const selectedCampaigns = useMemo(
    () => campaigns.filter((c) => selectedCampaignIds.includes(c.id)),
    [campaigns, selectedCampaignIds],
  );

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  if (!isOpen || !manager) return null;

  const handleSubmit = async () => {
    if (selectedCampaignIds.length === 0) {
      setError("Please select at least one campaign");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Email is intentionally not sent — the field is locked in the UI.
      const updated = await modelsApi.updateUser(manager.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        campaignIds: selectedCampaignIds,
      });
      onUpdated(updated, selectedCampaignIds);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setError("");
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-scroll">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-sm p-5 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full lg:max-w-[640px] lg:p-12">
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg leading-[1.4] font-bold text-white">
              Edit Account Manager
            </h2>
            <button
              onClick={handleClose}
              className="text-tm-text-color08 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>

          {success && (
            <div className="bg-tm-success-color12 border border-tm-success-color09 rounded-sm px-[16px] py-[12px]">
              <p className="text-tm-success-color05 text-sm font-medium">
                Account manager updated.
              </p>
            </div>
          )}

          <div className="flex gap-[12px] flex-col lg:flex-row">
            <div className="flex flex-col gap-[8px] flex-1">
              <label
                htmlFor="edit-am-first-name"
                className="text-tm-text-color08 text-sm font-bold uppercase "
              >
                First Name
              </label>
              <input
                id="edit-am-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
                className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-base text-white focus:outline-none focus:border-tm-primary-color04 placeholder-[#555]"
              />
            </div>
            <div className="flex flex-col gap-[8px] flex-1">
              <label
                htmlFor="edit-am-last-name"
                className="text-tm-text-color08 text-sm font-bold uppercase "
              >
                Last Name
              </label>
              <input
                id="edit-am-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
                className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-base text-white focus:outline-none focus:border-tm-primary-color04 placeholder-[#555]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <label
              htmlFor="edit-am-email"
              className="text-tm-text-color08 text-sm font-bold uppercase "
            >
              Email
            </label>
            {/* Email is locked for now — changing an AM's login address has
                downstream effects (invite links, password-reset tokens,
                TeaseMe sync key) we don't want to allow inline yet. */}
            <input
              id="edit-am-email"
              type="email"
              value={email}
              readOnly
              disabled
              autoComplete="off"
              className="bg-[#141414] border border-[rgba(255,255,255,0.06)] rounded-sm px-[14px] py-[11px] text-base text-tm-text-color08 cursor-not-allowed select-text"
            />
            <p className="text-tm-text-color08 text-xs leading-[1.4]">
              Email can't be changed from here yet.
            </p>
          </div>

          <div className="flex flex-col gap-[8px]">
            <span className="text-tm-text-color08 text-sm font-bold uppercase ">
              Campaigns
            </span>
            <p className="text-tm-text-color08 text-xs leading-[1.4] -mt-1">
              Select every company this account manager should invite into.
              Promoters they own are enrolled on each linked public campaign.
            </p>
            {campaignsLoading && (
              <p className="text-tm-text-color08 text-sm">Loading campaigns…</p>
            )}
            {!campaignsLoading && campaigns.length === 0 && (
              <p className="text-tm-warning-color02 text-sm leading-[1.4]">
                No hidden Account Manager campaigns exist. Create one on the
                Campaigns page (toggle "Visible to Promoters" off and link it
                to a public campaign), then come back here.
              </p>
            )}
            {!campaignsLoading && campaigns.length > 0 && (
              <div className="flex flex-col gap-2 rounded-sm border border-[rgba(255,255,255,0.1)] bg-[#1a1a1a] p-3">
                {campaigns.map((c) => {
                  const checked = selectedCampaignIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-3 cursor-pointer rounded-sm px-2 py-2 hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCampaign(c.id)}
                        className="mt-1 accent-tm-primary-color04"
                      />
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm text-white font-medium">
                          {c.name}
                        </span>
                        <span className="text-xs text-tm-text-color08">
                          {c.linkedCampaign
                            ? `Invites into ${c.linkedCampaign.name}`
                            : "Not linked to a public campaign"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedCampaigns.some((c) => !c.linkedCampaign) && (
              <p className="text-tm-warning-color02 text-xs leading-[1.4]">
                At least one selected campaign isn't linked to a public
                campaign yet, so the AM won't have anything to invite into for
                that company. Set the linked campaign on the Campaigns page
                first.
              </p>
            )}
            {selectedCampaigns.some((c) => c.linkedCampaign) && (
              <p className="text-tm-text-color08 text-xs leading-[1.4]">
                The AM will be able to invite promoters into{" "}
                <span className="text-white font-medium">
                  {selectedCampaigns
                    .map((c) => c.linkedCampaign?.name)
                    .filter(Boolean)
                    .join(", ")}
                </span>
                .
              </p>
            )}
            {campaignsError && (
              <p className="text-tm-danger-color05 text-xs leading-[1.4]">
                {campaignsError}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-sm px-[16px] py-[12px]">
              <p className="text-tm-danger-color05 text-sm font-medium">
                {error}
              </p>
            </div>
          )}

          <div className="flex gap-[12px]">
            <button
              onClick={handleClose}
              className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] text-white text-sm font-bold hover:bg-[#252525] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || selectedCampaignIds.length === 0}
              className="flex-1 btn-primary-cta rounded-sm px-[16px] py-[12px]  text-sm font-bold  active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
