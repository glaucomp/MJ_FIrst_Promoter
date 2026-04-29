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
   * updated `ApiUser` returned by the API; the second is the campaign id
   * the admin selected (so the parent can patch its `AccountManagerSummary`
   * cache without a refetch).
   */
  onUpdated: (user: ApiUser, campaignId: string) => void;
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
  const [campaignId, setCampaignId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Re-seed the form whenever the modal opens for a (potentially) different
  // AM. The current-campaign comes straight from the AM list payload.
  useEffect(() => {
    if (!isOpen || !manager) return;
    setFirstName(manager.firstName ?? "");
    setLastName(manager.lastName ?? "");
    setEmail(manager.email);
    setCampaignId(manager.currentCampaign?.id ?? "");
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

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null,
    [campaigns, campaignId],
  );

  if (!isOpen || !manager) return null;

  const handleSubmit = async () => {
    // Campaign is required by this UI, even though the underlying
    // `modelsApi.updateUser` accepts `campaignId: null` to clear an AM's
    // hidden membership. Clearing leaves the AM unable to invite anyone,
    // which is never a useful end state — the only path that should be
    // able to remove an AM's membership is the demote-to-non-AM flow,
    // which the backend handles automatically. We deliberately mirror
    // CreateUserModal's "campaign is mandatory for AMs" rule here so the
    // Create and Edit experiences stay symmetric.
    if (!campaignId) {
      setError("Please select a campaign");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Email is intentionally not sent — the field is locked in the UI.
      const updated = await modelsApi.updateUser(manager.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        campaignId,
      });
      onUpdated(updated, campaignId);
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
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-5 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full lg:max-w-[640px] lg:p-12">
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">
              Edit Account Manager
            </h2>
            <button
              onClick={handleClose}
              className="text-[#9e9e9e] hover:text-white text-[24px] leading-none"
            >
              ×
            </button>
          </div>

          {success && (
            <div className="bg-tm-success-color12 border border-tm-success-color09 rounded-[8px] px-[16px] py-[12px]">
              <p className="text-tm-success-color05 text-[14px] font-medium">
                Account manager updated.
              </p>
            </div>
          )}

          <div className="flex gap-[12px] flex-col lg:flex-row">
            <div className="flex flex-col gap-[8px] flex-1">
              <label
                htmlFor="edit-am-first-name"
                className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]"
              >
                First Name
              </label>
              <input
                id="edit-am-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
                className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
              />
            </div>
            <div className="flex flex-col gap-[8px] flex-1">
              <label
                htmlFor="edit-am-last-name"
                className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]"
              >
                Last Name
              </label>
              <input
                id="edit-am-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
                className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <label
              htmlFor="edit-am-email"
              className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]"
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
              className="bg-[#141414] border border-[rgba(255,255,255,0.06)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-[#9e9e9e] cursor-not-allowed select-text"
            />
            <p className="text-[#9e9e9e] text-[12px] leading-[1.4]">
              Email can't be changed from here yet.
            </p>
          </div>

          <div className="flex flex-col gap-[8px]">
            <label
              htmlFor="edit-am-campaign"
              className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]"
            >
              Campaign
            </label>
            {campaignsLoading && (
              <p className="text-[#9e9e9e] text-[14px]">Loading campaigns…</p>
            )}
            {!campaignsLoading && campaigns.length === 0 && (
              <p className="text-[#ffcc33] text-[13px] leading-[1.4]">
                No hidden Account Manager campaigns exist. Create one on the
                Campaigns page (toggle "Visible to Promoters" off and link it
                to a public campaign), then come back here.
              </p>
            )}
            {!campaignsLoading && campaigns.length > 0 && (
              <>
                <select
                  id="edit-am-campaign"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f]"
                >
                  <option value="">— Select a campaign —</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.linkedCampaign
                        ? ` → invites into ${c.linkedCampaign.name}`
                        : " (not linked)"}
                    </option>
                  ))}
                </select>
                {selectedCampaign && !selectedCampaign.linkedCampaign && (
                  <p className="text-[#ffcc33] text-[12px] leading-[1.4]">
                    This campaign isn't linked to a public campaign yet, so
                    the AM won't have anything to invite into. Set the linked
                    campaign on the Campaigns page first.
                  </p>
                )}
                {selectedCampaign?.linkedCampaign && (
                  <p className="text-[#9e9e9e] text-[12px] leading-[1.4]">
                    The AM will be able to invite promoters into{" "}
                    <span className="text-white font-medium">
                      {selectedCampaign.linkedCampaign.name}
                    </span>.
                  </p>
                )}
              </>
            )}
            {campaignsError && (
              <p className="text-tm-danger-color05 text-[12px] leading-[1.4]">
                {campaignsError}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-[8px] px-[16px] py-[12px]">
              <p className="text-tm-danger-color05 text-[14px] font-medium">
                {error}
              </p>
            </div>
          )}

          <div className="flex gap-[12px]">
            <button
              onClick={handleClose}
              className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-white text-[14px] font-bold hover:bg-[#252525] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !campaignId}
              className="flex-1 bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[12px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
