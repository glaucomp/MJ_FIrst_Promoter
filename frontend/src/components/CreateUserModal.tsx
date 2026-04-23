import { useMemo, useState } from "react";
import { chattersApi, modelsApi, type ApiUser } from "../services/api";

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
   * admin set. Account managers should pass ["promoter", "chatter"].
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
    label: "Team Manager",
    description: "Can manage a team and switch to promoter view",
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

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState<UserType>(types[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ApiUser | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(true);

  const handleSubmit = async () => {
    if (!email) {
      setError("Email is required");
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
    setError("");
    setSuccess(null);
    setInviteEmailSent(true);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-scroll">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-5 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full lg:max-w-[960px] lg:p-12">
        <div className="flex flex-col gap-[20px]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">
              Create New User
            </h2>
            <button
              onClick={handleClose}
              className="text-[#9e9e9e] hover:text-white text-[24px] leading-none"
            >
              ×
            </button>
          </div>

          {success ? (
            <>
              {inviteEmailSent ? (
                <div className="bg-[#006622] border border-[#00d948] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#28ff70] text-[14px] font-medium">
                    Invite email sent to {success.email}. They have 72 hours to
                    set their password and activate the account.
                  </p>
                </div>
              ) : (
                <div className="bg-[#4a2a00] border border-[#ff9800] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#ffb74d] text-[14px] font-medium">
                    User created, but the invite email could not be sent.
                    Please ask an admin to re-send the invite.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-[8px]">
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] flex flex-col gap-[4px]">
                  <p className="text-white text-[16px] font-semibold">
                    {success.firstName} {success.lastName}
                  </p>
                  <p className="text-[#9e9e9e] text-[13px]">{success.email}</p>
                  <span className="self-start mt-[4px] px-[10px] py-[2px] rounded-[100px] text-[11px] font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
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
                    setInviteEmailSent(true);
                  }}
                  className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-white text-[14px] font-bold hover:bg-[#252525] transition-all"
                >
                  Create Another
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[12px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] transition-all"
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
                  <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="off"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                  />
                </div>
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="off"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                />
                <p className="text-[#9e9e9e] text-[12px] leading-[1.4]">
                  We'll send an invite email with a link for them to set their
                  own password.
                </p>
              </div>

              {/* User type */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
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
                        className={`flex items-center justify-between rounded-[8px] px-[14px] py-[12px] border text-left transition-all ${
                          selected
                            ? "bg-[#ff0f5f]/10 border-[#ff0f5f] "
                            : "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]"
                        }`}
                      >
                        <div>
                          <p
                            className={`text-base font-bold ${selected ? "text-tm-primary-color05" : "text-[#9e9e9e]"}`}
                          >
                            {meta.label}
                          </p>
                          <p
                            className={`text-[14px] ${selected ? "text-white" : "text-[#9e9e9e]"}`}
                          >
                            {meta.description}
                          </p>
                        </div>
                        <div
                          className={`w-[16px] h-[16px] rounded-full border-2 flex-shrink-0 ${
                            selected
                              ? "border-[#ff0f5f] bg-[#ff0f5f]"
                              : "border-[#555]"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#ff2a2a] text-[14px] font-medium">
                    {error}
                  </p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isLoading || !email}
                className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold leading-[1.4] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
