use proto_defination::common::FodGroupStatus;
use proto_defination::replication::CommandOutcome;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GroupState {
    pub status: FodGroupStatus,
    pub version: i64,
}

#[derive(Debug, Clone)]
pub struct CommandRequest {
    pub desired_status: FodGroupStatus,
    pub base_version: i64,
}

/// Evaluates a status transition command against current authoritative state.
/// Pure, deterministic logic preserving runway safety:
/// - CLEARED is terminal and absolute.
/// - Human operator decisions override raw system NEW detections.
/// - Competing human decisions use compare-and-set on group version.
pub fn decide(current: &GroupState, cmd: &CommandRequest) -> CommandOutcome {
    match (current.status, cmd.desired_status) {
        (FodGroupStatus::Cleared, FodGroupStatus::Cleared) => CommandOutcome::NoOp,
        (FodGroupStatus::Cleared, _) => CommandOutcome::RejectedCleared,
        (_, FodGroupStatus::Cleared) => CommandOutcome::Applied,
        (s, d) if s == d => CommandOutcome::NoOp,
        (FodGroupStatus::New, _) => CommandOutcome::Applied,
        // Competing human decisions or Undo back to New (ACCEPTED <-> REJECTED <-> NEW)
        (_, _) if cmd.base_version >= current.version || cmd.base_version == 0 => CommandOutcome::Applied,
        _ => CommandOutcome::RejectedStale,
    }
}

// ───────────────────────── Version vectors ─────────────────────────
//
// Each FOD group carries a version vector {node_id: counter}. A node bumps
// ONLY its own counter when it makes a decision. This lets any two nodes tell
// apart:
//   * "incoming is newer"      → incoming dominates local  → take it
//   * "local is newer / same"  → local dominates or equal  → ignore incoming
//   * "both changed offline"   → concurrent                → deterministic merge
//
// The merged result is pointwise-max(local, incoming) + 1 on the resolving
// node, so it dominates BOTH inputs and every node converges on it.

use std::collections::{BTreeMap, HashMap};

pub type VersionVector = BTreeMap<String, i64>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VvOrder {
    Equal,
    /// a dominates b (a has seen everything b has, and more)
    Greater,
    /// b dominates a
    Less,
    Concurrent,
}

pub fn vv_from_map(m: &HashMap<String, i64>) -> VersionVector {
    m.iter().filter(|(_, v)| **v > 0).map(|(k, v)| (k.clone(), *v)).collect()
}

pub fn vv_to_map(v: &VersionVector) -> HashMap<String, i64> {
    v.iter().map(|(k, v)| (k.clone(), *v)).collect()
}

/// Scalar summary of a vector; strictly increases along any causal chain.
pub fn vv_sum(v: &VersionVector) -> i64 {
    v.values().sum()
}

pub fn vv_compare(a: &VersionVector, b: &VersionVector) -> VvOrder {
    let mut a_ahead = false;
    let mut b_ahead = false;
    for k in a.keys().chain(b.keys()) {
        let av = a.get(k).copied().unwrap_or(0);
        let bv = b.get(k).copied().unwrap_or(0);
        if av > bv {
            a_ahead = true;
        } else if bv > av {
            b_ahead = true;
        }
    }
    match (a_ahead, b_ahead) {
        (false, false) => VvOrder::Equal,
        (true, false) => VvOrder::Greater,
        (false, true) => VvOrder::Less,
        (true, true) => VvOrder::Concurrent,
    }
}

pub fn vv_max(a: &VersionVector, b: &VersionVector) -> VersionVector {
    let mut out = a.clone();
    for (k, bv) in b {
        let e = out.entry(k.clone()).or_insert(0);
        if *bv > *e {
            *e = *bv;
        }
    }
    out
}

pub fn vv_bump(v: &mut VersionVector, node: &str) {
    *v.entry(node.to_string()).or_insert(0) += 1;
}

/// Versioned status of one FOD group as seen by one node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionedGroup {
    pub status: FodGroupStatus,
    pub vv: VersionVector,
    pub decided_at_ms: i64,
    pub updated_by: String,
}

/// Conflict rule for concurrent edits (true = `a` wins):
///   1. CLEARED always wins (runway safety, terminal state)
///   2. the later operator decision (decided_at_ms) wins
///   3. tie → lexicographically larger updated_by, then status ordinal
///      (purely to be deterministic on every node)
pub fn wins_conflict(a: &VersionedGroup, b: &VersionedGroup) -> bool {
    let a_cl = a.status == FodGroupStatus::Cleared;
    let b_cl = b.status == FodGroupStatus::Cleared;
    if a_cl != b_cl {
        return a_cl;
    }
    if a.decided_at_ms != b.decided_at_ms {
        return a.decided_at_ms > b.decided_at_ms;
    }
    if a.updated_by != b.updated_by {
        return a.updated_by > b.updated_by;
    }
    (a.status as i32) >= (b.status as i32)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeDecision {
    /// Local already has this (or newer) — ignore incoming.
    KeepLocal,
    /// Incoming strictly newer — store it as-is.
    TakeIncoming,
    /// Concurrent edits — store this freshly minted mutual version.
    Merged(VersionedGroup),
}

/// Merge a state received from another node (replication batch / push / ack).
/// `resolver` is the id of the node performing the merge.
pub fn merge_remote(
    local: &VersionedGroup,
    incoming: &VersionedGroup,
    resolver: &str,
) -> MergeDecision {
    let order = vv_compare(&incoming.vv, &local.vv);

    // Safety net: CLEARED is terminal. Never let a non-CLEARED state replace it.
    if local.status == FodGroupStatus::Cleared && incoming.status != FodGroupStatus::Cleared {
        return match order {
            VvOrder::Less | VvOrder::Equal => MergeDecision::KeepLocal,
            _ => {
                let mut vv = vv_max(&local.vv, &incoming.vv);
                vv_bump(&mut vv, resolver);
                MergeDecision::Merged(VersionedGroup { vv, ..local.clone() })
            }
        };
    }

    match order {
        VvOrder::Greater => MergeDecision::TakeIncoming,
        VvOrder::Less => MergeDecision::KeepLocal,
        VvOrder::Equal if incoming.status == local.status => MergeDecision::KeepLocal,
        // Equal vectors but different status only happens with legacy
        // (pre-vector) data — treat exactly like a concurrent edit.
        VvOrder::Equal | VvOrder::Concurrent => {
            let winner = if wins_conflict(incoming, local) { incoming } else { local };
            let mut vv = vv_max(&local.vv, &incoming.vv);
            vv_bump(&mut vv, resolver);
            MergeDecision::Merged(VersionedGroup {
                status: winner.status,
                vv,
                decided_at_ms: winner.decided_at_ms,
                updated_by: winner.updated_by.clone(),
            })
        }
    }
}

/// An operator decision arriving at `node` (from its own UI, or from a desktop
/// client that is connected to it).
///
/// `base_vv` = the version vector the operator was looking at when deciding
/// (None/empty = unknown → assume they saw the current state).
///
/// Returns the outcome and, when Applied, the new state to persist.
pub fn apply_local_decision(
    current: &VersionedGroup,
    desired: FodGroupStatus,
    base_vv: Option<&VersionVector>,
    decided_at_ms: i64,
    actor: &str,
    node: &str,
) -> (CommandOutcome, Option<VersionedGroup>) {
    if desired == FodGroupStatus::GroupStatusUnspecified {
        return (CommandOutcome::RejectedInvalid, None);
    }
    if current.status == FodGroupStatus::Cleared {
        return if desired == FodGroupStatus::Cleared {
            (CommandOutcome::NoOp, None)
        } else {
            (CommandOutcome::RejectedCleared, None)
        };
    }

    let base = base_vv.filter(|b| !b.is_empty());
    // Stale = current contains changes the operator never saw.
    let stale = base
        .map(|b| matches!(vv_compare(b, &current.vv), VvOrder::Less | VvOrder::Concurrent))
        .unwrap_or(false);

    if desired == current.status {
        return (CommandOutcome::NoOp, None);
    }

    if stale && desired != FodGroupStatus::Cleared && current.decided_at_ms > decided_at_ms {
        // Someone else made a more recent decision the operator hadn't seen.
        return (CommandOutcome::RejectedStale, None);
    }

    let mut vv = match base {
        Some(b) => vv_max(&current.vv, b),
        None => current.vv.clone(),
    };
    vv_bump(&mut vv, node);
    (
        CommandOutcome::Applied,
        Some(VersionedGroup {
            status: desired,
            vv,
            decided_at_ms,
            updated_by: actor.to_string(),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;


    #[test]
    fn test_cleared_is_absolute_and_terminal() {
        let cur = GroupState {
            status: FodGroupStatus::New,
            version: 0,
        };
        let cmd = CommandRequest {
            desired_status: FodGroupStatus::Cleared,
            base_version: 0,
        };
        assert_eq!(decide(&cur, &cmd), CommandOutcome::Applied);

        let cleared_cur = GroupState {
            status: FodGroupStatus::Cleared,
            version: 1,
        };
        let rej_cmd = CommandRequest {
            desired_status: FodGroupStatus::Accepted,
            base_version: 1,
        };
        assert_eq!(decide(&cleared_cur, &rej_cmd), CommandOutcome::RejectedCleared);
    }

    #[test]
    fn test_human_overrides_new() {
        let cur = GroupState {
            status: FodGroupStatus::New,
            version: 0,
        };
        let cmd = CommandRequest {
            desired_status: FodGroupStatus::Accepted,
            base_version: 0,
        };
        assert_eq!(decide(&cur, &cmd), CommandOutcome::Applied);
    }

    #[test]
    fn test_version_guards_stale_human_decisions() {
        let cur = GroupState {
            status: FodGroupStatus::Accepted,
            version: 2, // version was already bumped by another operator
        };
        let stale_cmd = CommandRequest {
            desired_status: FodGroupStatus::Rejected,
            base_version: 1, // operator looked at stale version 1
        };
        assert_eq!(decide(&cur, &stale_cmd), CommandOutcome::RejectedStale);

        let valid_cmd = CommandRequest {
            desired_status: FodGroupStatus::Rejected,
            base_version: 2,
        };
        assert_eq!(decide(&cur, &valid_cmd), CommandOutcome::Applied);
    }

    fn vv(pairs: &[(&str, i64)]) -> VersionVector {
        pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect()
    }

    fn g(status: FodGroupStatus, v: VersionVector, at: i64, by: &str) -> VersionedGroup {
        VersionedGroup { status, vv: v, decided_at_ms: at, updated_by: by.into() }
    }

    #[test]
    fn vv_compare_orders() {
        assert_eq!(vv_compare(&vv(&[("car", 1)]), &vv(&[("car", 1)])), VvOrder::Equal);
        assert_eq!(vv_compare(&vv(&[("car", 2)]), &vv(&[("car", 1)])), VvOrder::Greater);
        assert_eq!(vv_compare(&vv(&[]), &vv(&[("atc", 1)])), VvOrder::Less);
        assert_eq!(
            vv_compare(&vv(&[("car", 1)]), &vv(&[("atc", 1)])),
            VvOrder::Concurrent
        );
    }

    #[test]
    fn only_greater_version_is_applied() {
        let local = g(FodGroupStatus::Accepted, vv(&[("car", 2)]), 10, "car");
        let older = g(FodGroupStatus::Rejected, vv(&[("car", 1)]), 5, "car");
        let newer = g(FodGroupStatus::Rejected, vv(&[("car", 3)]), 20, "car");
        assert_eq!(merge_remote(&local, &older, "atc"), MergeDecision::KeepLocal);
        assert_eq!(merge_remote(&local, &local.clone(), "atc"), MergeDecision::KeepLocal);
        assert_eq!(merge_remote(&local, &newer, "atc"), MergeDecision::TakeIncoming);
    }

    /// Reported bug: decide on car, disconnect, decide on ATC, reconnect.
    #[test]
    fn offline_edits_on_both_nodes_merge_to_one_mutual_version() {
        // Both start from the same replicated state.
        let base = g(FodGroupStatus::New, vv(&[]), 0, "");
        let (_, car) = apply_local_decision(&base, FodGroupStatus::Accepted, None, 100, "car-op", "car");
        let (_, atc) = apply_local_decision(&base, FodGroupStatus::Rejected, None, 200, "atc-op", "atc");
        let car = car.unwrap();
        let atc = atc.unwrap();
        // Old scheme: both would be "version 1" and neither would win.
        assert_eq!(vv_sum(&car.vv), vv_sum(&atc.vv));

        // Car merges ATC's push.
        let MergeDecision::Merged(on_car) = merge_remote(&car, &atc, "car") else {
            panic!("expected merge")
        };
        assert_eq!(on_car.status, FodGroupStatus::Rejected); // later decision wins
        assert_eq!(on_car.vv, vv(&[("atc", 1), ("car", 2)]));

        // Merged state dominates both sides → ATC and car agree.
        assert_eq!(merge_remote(&atc, &on_car, "atc"), MergeDecision::TakeIncoming);
        assert_eq!(merge_remote(&car, &on_car, "car"), MergeDecision::TakeIncoming);

        // Merge is symmetric: if ATC had resolved instead, same winner.
        let MergeDecision::Merged(on_atc) = merge_remote(&atc, &car, "atc") else {
            panic!("expected merge")
        };
        assert_eq!(on_atc.status, on_car.status);
    }

    #[test]
    fn cleared_wins_conflicts_and_is_terminal() {
        let cl = g(FodGroupStatus::Cleared, vv(&[("car", 1)]), 1, "car");
        let acc = g(FodGroupStatus::Accepted, vv(&[("atc", 1)]), 999, "atc");
        let MergeDecision::Merged(m) = merge_remote(&acc, &cl, "atc") else { panic!() };
        assert_eq!(m.status, FodGroupStatus::Cleared);
        assert!(matches!(merge_remote(&cl, &acc, "car"), MergeDecision::Merged(ref x) if x.status == FodGroupStatus::Cleared));
        let (o, _) = apply_local_decision(&cl, FodGroupStatus::New, None, 5, "x", "car");
        assert_eq!(o, CommandOutcome::RejectedCleared);
    }

    #[test]
    fn legacy_equal_versions_with_different_status_are_merged() {
        let car = g(FodGroupStatus::Accepted, vv(&[("legacy", 1)]), 100, "car");
        let atc = g(FodGroupStatus::Rejected, vv(&[("legacy", 1)]), 50, "atc");
        let MergeDecision::Merged(m) = merge_remote(&car, &atc, "car") else { panic!() };
        assert_eq!(m.status, FodGroupStatus::Accepted);
        assert_eq!(m.vv, vv(&[("car", 1), ("legacy", 1)]));
    }

    #[test]
    fn stale_client_decision_loses_to_newer_upstream_decision() {
        let cur = g(FodGroupStatus::Accepted, vv(&[("car", 2)]), 500, "car");
        let seen = vv(&[("car", 1)]);
        let (o, _) = apply_local_decision(&cur, FodGroupStatus::Rejected, Some(&seen), 300, "desktop", "car");
        assert_eq!(o, CommandOutcome::RejectedStale);
        // ...but a stale view with a LATER decision still applies and dominates both.
        let (o, s) = apply_local_decision(&cur, FodGroupStatus::Rejected, Some(&seen), 900, "desktop", "car");
        assert_eq!(o, CommandOutcome::Applied);
        assert_eq!(s.unwrap().vv, vv(&[("car", 3)]));
    }

    #[test]
    fn client_carrying_other_nodes_history_is_folded_in() {
        // Desktop saw ATC's decision {atc:1}; car never did.
        let car = g(FodGroupStatus::New, vv(&[]), 0, "");
        let seen = vv(&[("atc", 1)]);
        let (o, s) = apply_local_decision(&car, FodGroupStatus::Rejected, Some(&seen), 10, "desktop", "car");
        assert_eq!(o, CommandOutcome::Applied);
        let s = s.unwrap();
        assert_eq!(s.vv, vv(&[("atc", 1), ("car", 1)]));
        // When ATC later pushes {atc:1}, car already dominates it.
        let atc = g(FodGroupStatus::Rejected, seen, 10, "atc-op");
        assert_eq!(merge_remote(&s, &atc, "car"), MergeDecision::KeepLocal);
    }
}
