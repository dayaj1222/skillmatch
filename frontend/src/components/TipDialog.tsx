import { useEffect, useMemo, useState } from "react";
import { CheckCircle, QrCode, X } from "@phosphor-icons/react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Tip } from "../lib/types";
import { ErrorNote, SectionHead } from "./ui";

/**
 * Tip a teammate from an ongoing project.
 *
 * Step one creates a server-side payment record and returns a signed UPI URI
 * rendered as a QR. Step two is the payer confirming the transfer in their UPI
 * app; the payee's "tips received" total only counts confirmed payments.
 */
export function TipDialog({
  projectId,
  projectTitle,
  onClose,
}: {
  projectId: number;
  projectTitle: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [members, setMembers] = useState<{ user_id: number; username: string }[] | null>(null);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("100");
  const [note, setNote] = useState("");
  const [tip, setTip] = useState<Tip | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .teamEmails(projectId)
      .then((people) => {
        const others = people
          .filter((p) => p.username !== user?.username)
          .map((p) => ({ user_id: p.user_id, username: p.username }));
        setMembers(others);
        setSelected(others[0]?.username ?? "");
      })
      .catch(() => setMembers([]));
  }, [projectId, user?.username]);

  const selectedMember = useMemo(
    () => members?.find((m) => m.username === selected) ?? null,
    [members, selected],
  );

  const create = async () => {
    const value = Number(amount);
    if (!selected || !Number.isFinite(value) || value <= 0) return;
    setBusy(true);
    setError(null);
    try {
      setTip(
        await api.createTip({
          payee_username: selected,
          amount: value,
          project_id: projectId,
          note: note.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the tip");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!tip) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmTip(tip.id);
      setPaid(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="skill-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tip-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="skill-modal animate-pop">
        <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <p className="eyebrow">{projectTitle}</p>
            <h2 id="tip-title" className="display text-[1.5rem]">
              {paid ? "Tip sent" : tip ? "Scan to pay" : "Tip a teammate"}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost h-8 px-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {error && <div className="mt-4"><ErrorNote message={error} /></div>}

        {paid ? (
          <div className="mt-6 text-center">
            <CheckCircle size={44} weight="fill" className="mx-auto text-active" />
            <p className="mt-3 text-[0.9375rem]">
              Recorded {tip?.currency === "INR" ? "₹" : ""}
              {tip?.amount} for @{tip?.payee_username}.
            </p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              They will see it in their own profile — nobody else can.
            </p>
            <button type="button" className="btn btn-primary mt-5 w-full" onClick={onClose}>
              Done
            </button>
          </div>
        ) : tip ? (
          <div className="mt-5">
            <div className="mx-auto max-w-[20rem] rounded-sm border border-rule bg-white p-4">
              <img src={tip.qr_svg} alt="UPI payment QR code" className="mx-auto h-56 w-56" />
            </div>
            <p className="mt-4 text-center text-[0.9375rem]">
              Pay <strong>₹{tip.amount.toFixed(2)}</strong> to{" "}
              <strong>@{tip.payee_username}</strong>
            </p>
            <p className="mt-1 text-center text-[0.8125rem] text-muted">
              Scan with any UPI app, or open the payment link below.
            </p>
            <a href={tip.upi_link} className="btn btn-primary mt-4 w-full">
              <QrCode size={16} weight="bold" />
              Open UPI app
            </a>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setTip(null)}>
                Back
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={confirm}>
                {busy ? "Recording…" : "I've paid"}
              </button>
            </div>
            <p className="mt-3 text-center text-[0.7rem] text-faint">
              Secure ref {tip.signature?.slice(0, 10) ?? "—"} · only the payer can confirm.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <SectionHead title="Who" />
              {members === null ? (
                <p className="text-[0.875rem] text-muted">Loading teammates…</p>
              ) : members.length === 0 ? (
                <p className="text-[0.875rem] text-muted">
                  No teammates to tip yet. Accepted members show up here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className={`chip ${selected === m.username ? "chip-active" : ""}`}
                      onClick={() => setSelected(m.username)}
                    >
                      @{m.username}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tip-amount" className="field-label">
                  Amount (INR)
                </label>
                <input
                  id="tip-amount"
                  type="number"
                  min={1}
                  step="1"
                  className="field-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="tip-note" className="field-label">
                  Note (optional)
                </label>
                <input
                  id="tip-note"
                  className="field-input"
                  placeholder="Thanks for the schema work"
                  maxLength={120}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={busy || !selectedMember || !(Number(amount) > 0)}
              onClick={create}
            >
              {busy ? "Building QR…" : "Generate UPI QR"}
            </button>
            <p className="text-center text-[0.75rem] text-faint">
              The money moves directly between your UPI accounts. SkillMatch only records the
              signed reference.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
