import { useEffect, useMemo, useState } from "react";
import {
  chattersApi,
  modelsApi,
  type ApiUser,
  type Campaign,
} from "../services/api";

type UserType =
  | "account_manager"
  | "team_manager"
  | "promoter"
  | "chatter"
  | "payer";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (user: ApiUser) => void;
  /**
   * Which user types the current caller is allowed to create. Defaults to the
   * admin set. Account managers should pass ["chatter"] only.
   */
  allowedTypes?: UserType[];
}

const USER_TYPE_META: Record<
  UserType,
  { label: string; description: string }
> = {
  account_manager: {
    label: "Account Manager",
    description: "Can invite promoters and manage campaigns",
  },
  team_manager: {
    label: "PROMOTER +",
    description: "Can invite and manage a team of promoters",
  },
  promoter: {
    label: "Promoter",
    description: "Creates tracking links and earns commissions",
  },
  chatter: {
    label: "Chatter",
    description: "Works inside chatter groups under this account manager",
  },
  payer: {
    label: "Payer",
    description: "Back-office role — access to reports, payouts and settings",
  },
};

const DEFAULT_ALLOWED: UserType[] = [
  "account_manager",
  "team_manager",
  "promoter",
  "payer",
];

export const CreateUserModal = ({
  isOpen,
  onClose,
  onCreated,
  allowedTypes,
}: CreateUserModalProps) => {
  const types = useMemo(
    () =>
      allowedTypes && allowedTypes.length > 0
        ? allowedTypes
        : DEFAULT_ALLOWED,
    [allowedTypes],
  );

  const modalTitle =
    types.length === 1 && types[0] === "chatter"
      ? "Create New Chatter"
      : "Create New User";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState<UserType>(types[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ApiUser | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(true);

  // Account-manager-specific: which hidden AM membership campaign the new
  // AM will be enrolled in. The campaign's `linkedCampaignId` is what
  // surfaces in the AM's invite picker once they log in, so picking it
  // here is what makes "if the AM invites, they have the campaign already"
  // work end-to-end.
  const [amCampaigns, setAmCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState("");

  const isAccountManager = userType === "account_manager";

  useEffect(() => {
    if (!isOpen || !isAccountManager || amCampaigns.length > 0) return;
    let cancelled = false;
    setCampaignsLoading(true);
    setCampaignsError("");
    modelsApi
      .getAllCampaigns()
      .then((all) => {
        if (cancelled) return;
        const hidden = all.filter(
          (c) => c.isActive && !c.visibleToPromoters,
        );
        setAmCampaigns(hidden);
        if (hidden.length > 0 && !campaignId) {
          setCampaignId(hidden[0].id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const errorMessage =
          err instanceof Error && err.message === "SESSION_EXPIRED"
            ? "Your session has expired. Please sign in again."
            : err instanceof Error
              ? err.message
              : "Failed to load campaigns";
        setCampaignsError(errorMessage);
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAccountManager, amCampaigns.length, campaignId]);

  const selectedAmCampaign = useMemo(
    () => amCampaigns.find((c) => c.id === campaignId) ?? null,
    [amCampaigns, campaignId],
  );

  const handleSubmit = async () => {
    if (!email) {
      setError("Email is required");
      return;
    }
    if (isAccountManager && !campaignId) {
      setError("Please select a campaign for this account manager");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      let user: ApiUser;
      let emailSent = true;
      if (userType === "chatter") {
        // Chatters have their own creation endpoint which also handles the
        // account-manager ownership stamp on the server.
        const result = await chattersApi.create({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
        });
        user = {
          id: result.chatter.id,
          email: result.chatter.email,
          firstName: result.chatter.firstName ?? "",
          lastName: result.chatter.lastName ?? "",
          role: "PROMOTER",
          userType: "CHATTER",
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        emailSent = result.inviteEmailSent ?? true;
      } else {
        const result = await modelsApi.createUser({
          email,
          firstName,
          lastName,
          userType,
          ...(isAccountManager && campaignId ? { campaignId } : {}),
        });
        user = result.user;
        emailSent = result.inviteEmailSent ?? true;
      }
      setInviteEmailSent(emailSent);
      setSuccess(user);
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setUserType(types[0]);
    setCampaignId("");
    setError("");
    setSuccess(null);
    setInviteEmailSent(true);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-scroll">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-sm p-5 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full lg:max-w-[960px] lg:p-12">
        <div className="flex flex-col gap-[20px]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg leading-[1.4] font-bold text-white">
              {modalTitle}
            </h2>
            <button
              onClick={handleClose}
              className="text-tm-text-color08 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>

          {success ? (
            <>
              {inviteEmailSent ? (
                <div className="bg-tm-success-color12 border border-tm-success-color09 rounded-sm px-[16px] py-[12px]">
                  <p className="text-tm-success-color05 text-sm font-medium">
                    Invite email sent to {success.email}. They can use the
                    invite email to set their password and activate the
                    account.
                  </p>
                </div>
              ) : (
                <div className="bg-[#4a2a00] border border-[#ff9800] rounded-sm px-[16px] py-[12px]">
                  <p className="text-tm-warning-color05 text-sm font-medium">
                    User created, but the invite email could not be sent.
                    Please ask an admin to re-send the invite.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-[8px]">
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] flex flex-col gap-[4px]">
                  <p className="text-white text-base font-semibold">
                    {success.firstName} {success.lastName}
                  </p>
                  <p className="text-tm-text-color08 text-sm">{success.email}</p>
                  <span className="self-start mt-[4px] px-4 py-[2px] rounded-full text-xs font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-tm-text-color08">
                    {success.userType?.toLowerCase().replace("_", " ")}
                  </span>
                </div>
              </div>

              <div className="flex gap-[12px]">
                <button
                  onClick={() => {
                    setSuccess(null);
                    setEmail("");
                    setFirstName("");
                    setLastName("");
                    setCampaignId("");
                    setInviteEmailSent(true);
                  }}
                  className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] text-white text-sm font-bold hover:bg-[#252525] transition-all"
                >
                  Create Another
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 btn-primary-cta rounded-sm px-[16px] py-[12px]  text-sm font-bold transition-all"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Name row */}
              <div className="flex gap-[12px] flex-col lg:flex-row">
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-tm-text-color08 text-xs font-bold uppercase">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="off"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-base text-white focus:outline-none focus:border--tm-primary-color04 placeholder-[#555]"
                  />
                </div>
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-tm-text-color08 text-xs font-bold uppercase">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="off"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-base text-white focus:outline-none focus:border--tm-primary-color04 placeholder-[#555]"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-tm-text-color08 text-xs font-bold uppercase">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-base text-white focus:outline-none focus:border--tm-primary-color04 placeholder-[#555]"
                />
                <p className="text-tm-text-color08 text-xs leading-[1.4]">
                  We'll send an invite email with a link for them to set their
                  own password.
                </p>
              </div>

              {/* User type */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-tm-text-color08 text-xs font-bold uppercase">
                  Role
                </label>
                <div className="flex flex-col gap-[8px]">
                  {types.map((value) => {
                    const meta = USER_TYPE_META[value];
                    const selected = userType === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setUserType(value)}
                        className={`flex items-center justify-between rounded-sm px-[14px] py-[12px] border text-left transition-all ${
                          selected
                            ? "bg--tm-primary-color04/10 border--tm-primary-color04 "
                            : "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]"
                        }`}
                      >
                        <div>
                          <p
                            className={`text-base font-bold ${selected ? "text-tm-primary-color05" : "text-tm-text-color08"}`}
                          >
                            {meta.label}
                          </p>
                          <p
                            className={`text-sm ${selected ? "text-white" : "text-tm-text-color08"}`}
                          >
                            {meta.description}
                          </p>
                        </div>
                        <div
                          className={`w-[16px] h-[16px] rounded-full border-2 shrink-0 ${
                            selected
                              ? "border--tm-primary-color04 bg--tm-primary-color04"
                              : "border-[#555]"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campaign picker — only for Account Managers. The chosen
                  hidden AM campaign is what attaches the new AM to a public
                  campaign via its `linkedCampaignId`, so they can invite
                  promoters straight after activation. */}
              {isAccountManager && (
                <div className="flex flex-col gap-[8px]">
                  <label className="text-tm-text-color08 text-xs font-bold uppercase">
                    Campaign
                  </label>
                  {campaignsLoading && (
                    <p className="text-tm-text-color08 text-sm">
                      Loading campaigns…
                    </p>
                  )}
                  {!campaignsLoading && amCampaigns.length === 0 && (
                    <p className="text-tm-warning-color05 text-sm leading-[1.4]">
                      No hidden Account Manager campaigns exist yet. Create
                      one on the Campaigns page (toggle "Visible to
                      Promoters" off and link it to a public campaign), then
                      come back here.
                    </p>
                  )}
                  {!campaignsLoading && amCampaigns.length > 0 && (
                    <>
                      <select
                        value={campaignId}
                        onChange={(e) => setCampaignId(e.target.value)}
                        className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[14px] py-[11px] text-base text-white focus:outline-none focus:border--tm-primary-color04"
                      >
                        <option value="">— Select a campaign —</option>
                        {amCampaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.linkedCampaign
                              ? ` → invites into ${c.linkedCampaign.name}`
                              : " (not linked)"}
                          </option>
                        ))}
                      </select>
                      {selectedAmCampaign && !selectedAmCampaign.linkedCampaign && (
                        <p className="text-tm-warning-color02 text-xs leading-[1.4]">
                          This campaign isn't linked to a public campaign
                          yet, so the new AM won't see anything to invite
                          into. Set the linked campaign on the Campaigns
                          page first.
                        </p>
                      )}
                      {selectedAmCampaign?.linkedCampaign && (
                        <p className="text-tm-text-color08 text-xs leading-[1.4]">
                          The new AM will be able to invite promoters into{" "}
                          <span className="text-white font-medium">
                            {selectedAmCampaign.linkedCampaign.name}
                          </span>.
                        </p>
                      )}
                    </>
                  )}
                  {campaignsError && (
                    <p className="text-tm-danger-color05 text-xs leading-[1.4]">
                      {campaignsError}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-sm px-[16px] py-[12px]">
                  <p className="text-tm-danger-color05 text-sm font-medium">
                    {error}
                  </p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={
                  isLoading ||
                  !email ||
                  (isAccountManager && !campaignId)
                }
                className="btn-primary-cta rounded-sm px-[24px] py-[14px]  text-base font-bold leading-[1.4]  active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creating..." : "Send Invite"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
