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
        (_, _) if cmd.base_version == current.version || cmd.base_version == 0 => CommandOutcome::Applied,
        _ => CommandOutcome::RejectedStale,
    }
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
}
