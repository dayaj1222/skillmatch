// Who the viewer is on a project, and what that lets them do.
//
// The backend enforces every rule; this module only *reflects* them, but the
// reflection belongs in one place. Before it existed, six booleans were
// composed inline in the JSX and each new branch added another `&&` to the
// render conditions. Now the component reads named facts.

import type { ProjectDetail, User } from "./types";

export interface ProjectRelationship {
  /** The viewer leads this project (owner). */
  isLeader: boolean;
  /** The viewer is on the team but does not lead it. */
  isMember: boolean;
  /** The viewer has a pending application of their own. */
  isApplicant: boolean;
  /** The viewer has a pending invitation from the owner. */
  isInvitee: boolean;

  /** The viewer may apply: signed in, not on the team, no row yet, not closed. */
  canApply: boolean;
  /** Only the leader sees the applicant list. */
  canSeeApplicants: boolean;
  /** The project is closed; nothing more can happen. */
  isClosed: boolean;

  /** Seats still free, floored at zero. */
  spotsLeft: number;
  /** Pending applications, when the viewer can see them. */
  pendingCount: number;
}

/**
 * Derive one viewer's relationship to one project.
 *
 * A pure function of the project detail and the signed-in user, so it is
 * trivial to test and impossible to drift between pages.
 */
export function relationTo(project: ProjectDetail, user: User | null): ProjectRelationship {
  const isLeader = Boolean(user && user.id === project.owner_id);
  const membership = project.my_membership;
  const isMember = Boolean(membership) && !isLeader;

  const application = project.my_application;
  const isPending = application?.status === "PENDING";
  const isInvitee = Boolean(isPending && application?.initiated_by === "OWNER");
  const isApplicant = Boolean(isPending && application?.initiated_by !== "OWNER");

  const isClosed = project.status === "CLOSED";
  const spotsLeft = Math.max(project.capacity - project.member_count, 0);
  const canSeeApplicants = isLeader;

  const canApply =
    Boolean(user) && !isLeader && !membership && !application && !isClosed;

  return {
    isLeader,
    isMember,
    isApplicant,
    isInvitee,
    canApply,
    canSeeApplicants,
    isClosed,
    spotsLeft,
    pendingCount: canSeeApplicants
      ? (project.applicants?.filter((a) => a.status === "PENDING").length ?? 0)
      : 0,
  };
}

/** True when the viewer is on the team (leader or member). */
export function isOnTeam(rel: ProjectRelationship): boolean {
  return rel.isLeader || rel.isMember;
}
