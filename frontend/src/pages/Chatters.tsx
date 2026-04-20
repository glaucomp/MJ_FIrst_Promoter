import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { chattersApi } from "../services/api";
import type { Chatter } from "../types";

// ── Create Chatter Modal ────────────────────────────────────────────────────

interface CreateChatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (chatter: Chatter) => void;
}

const CreateChatterModal = ({
  isOpen,
  onClose,
  onCreated,
}: CreateChatterModalProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Chatter | null>(null);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const data = await chattersApi.create({
        email,
        password,
        firstName,
        lastName,
      });
      setSuccess(data.chatter);
      onCreated(data.chatter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chatter");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-5 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full lg:max-w-[960px]">
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">
              Create New Chatter
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
              <div className="bg-[#006622] border border-[#00d948] rounded-[8px] px-[16px] py-[12px]">
                <p className="text-[#28ff70] text-[14px] font-medium">
                  Chatter created successfully!
                </p>
              </div>
              <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] flex flex-col gap-[4px]">
                <p className="text-white text-[16px] font-semibold">
                  {success.firstName} {success.lastName}
                </p>
                <p className="text-[#9e9e9e] text-[13px]">{success.email}</p>
                <span className="self-start mt-[4px] px-[10px] py-[2px] rounded-[100px] text-[11px] font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
                  chatter
                </span>
              </div>
              <div className="flex gap-[12px]">
                <button
                  onClick={() => {
                    setSuccess(null);
                    setEmail("");
                    setPassword("");
                    setFirstName("");
                    setLastName("");
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
              <div className="flex gap-[12px]">
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Sofia"
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
                    placeholder="Martinez"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sofia@example.com"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                />
              </div>

              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                />
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
                disabled={isLoading || !email || !password}
                className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold leading-[1.4] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creating..." : "Create Chatter"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ───────────────────────────────────────────────────────────────

export const Chatters = () => {
  const { user } = useAuth();
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canManage =
    user?.baseRole === "admin" || user?.baseRole === "account_manager";

  useEffect(() => {
    loadChatters();
  }, []);

  const loadChatters = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await chattersApi.list();
      setChatters(data.chatters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chatters");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await chattersApi.delete(id);
      setChatters((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete chatter");
    } finally {
      setDeletingId(null);
    }
  };

  const displayName = (c: Chatter) => {
    const parts = [c.firstName, c.lastName].filter(Boolean).join(" ");
    return parts || c.email;
  };

  return (
    <div className="flex flex-col gap-[24px] p-[24px] max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-white leading-[1.3]">
            Chatters
          </h1>
          <p className="text-[#9e9e9e] text-[14px] mt-[4px]">
            {chatters.length} chatter{chatters.length !== 1 ? "s" : ""} in the
            system
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + New Chatter
          </button>
        )}
      </div>

      {error && (
        <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
          <p className="text-[#ff2a2a] text-[14px] font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-[48px]">
          <div className="w-[32px] h-[32px] border-2 border-[#ff0f5f] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : chatters.length === 0 ? (
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[32px] text-center">
          <p className="text-[#9e9e9e] text-[16px]">No chatters yet.</p>
          {canManage && (
            <p className="text-[#9e9e9e] text-[14px] mt-[8px]">
              Click{" "}
              <span className="text-white font-semibold">+ New Chatter</span> to
              create one.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {chatters.map((chatter) => (
            <div
              key={chatter.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] flex items-center justify-between gap-[16px]"
            >
              <div className="flex flex-col gap-[4px] min-w-0">
                <p className="text-white text-[16px] font-semibold truncate">
                  {displayName(chatter)}
                </p>
                <p className="text-[#9e9e9e] text-[13px] truncate">
                  {chatter.email}
                </p>
                {(chatter.groups ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-[6px] mt-[6px]">
                    {(chatter.groups ?? []).map((g) => (
                      <span
                        key={g.id}
                        className="px-[8px] py-[2px] rounded-[100px] text-[11px] font-bold border border-[rgba(255,255,255,0.1)] text-[#9e9e9e]"
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-[8px] flex-shrink-0">
                <span
                  className={`px-[8px] py-[2px] rounded-[100px] text-[11px] font-bold border ${
                    chatter.isActive
                      ? "border-[#00d948] text-[#28ff70]"
                      : "border-[#555] text-[#9e9e9e]"
                  }`}
                >
                  {chatter.isActive ? "Active" : "Inactive"}
                </span>

                {canManage &&
                  (confirmDeleteId === chatter.id ? (
                    <div className="flex items-center gap-[6px]">
                      <span className="text-[#9e9e9e] text-[12px]">
                        Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(chatter.id)}
                        disabled={deletingId === chatter.id}
                        className="text-[#ff2a2a] text-[12px] font-bold hover:text-[#ff4444] disabled:opacity-50"
                      >
                        {deletingId === chatter.id ? "..." : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[#9e9e9e] text-[12px] font-bold hover:text-white"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(chatter.id)}
                      className="text-[#9e9e9e] hover:text-[#ff2a2a] text-[13px] transition-colors"
                    >
                      Delete
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateChatterModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(chatter) => {
          setChatters((prev) => [
            { ...chatter, groups: chatter.groups ?? [] },
            ...prev,
          ]);
        }}
      />
    </div>
  );
};
