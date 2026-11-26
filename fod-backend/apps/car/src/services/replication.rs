use futures::StreamExt;
use proto_defination::common::FodGroupStatus;
use proto_defination::replication::primary_message::Msg as PrimaryMsg;
use proto_defination::replication::replication_service_server::ReplicationService;
use proto_defination::replication::{
    change, replica_message::Msg as ReplicaMsg, Change, ChangeBatch, CommandOutcome, CommandResult,
    GroupPushAck, MissionDigestRequest, MissionDigestResponse, Pong, PrimaryMessage, ReplicaMessage,
    SnapshotRequest, Welcome,
};
use sha2::{Digest, Sha256};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::broadcast;
use tonic::{Request, Response, Status, Streaming};
use uuid::Uuid;
use zoid_db::Db;
use zoid_storage::FrameStorage;

const MAX_REPLICATION_BATCH_BYTES: usize = 1_500_000;

async fn load_fod_frame(storage: &FrameStorage, f: &proto_defination::fod::FodEntity) -> Vec<u8> {
    if f.frame_missing || f.image_sha256.is_empty() {
        return Vec::new();
    }
    storage.read_frame(&f.image_sha256, false).await.unwrap_or_default()
}

async fn load_cleared_images(
    storage: &FrameStorage,
    c: &proto_defination::cleared_fod::ClearedFodEntity,
) -> Vec<Vec<u8>> {
    let mut images = Vec::new();
    for sha in c
        .before_image_sha256
        .iter()
        .chain(c.after_image_sha256.iter())
    {
        if !sha.is_empty() {
            if let Ok(bytes) = storage.read_frame(sha, false).await {
                images.push(bytes);
            }
        }
    }
    images
}

pub struct ReplicationServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
    node_id: String,
    change_tx: broadcast::Sender<Change>,
}

impl ReplicationServiceImpl {
    pub fn new(
        db: Db,
        storage: Arc<FrameStorage>,
        node_id: String,
        change_tx: broadcast::Sender<Change>,
    ) -> Self {
        Self {
            db,
            storage,
            node_id,
            change_tx,
        }
    }

    #[allow(dead_code)]
    pub async fn resolve_change(&self, seq: i64, entity: i16, key: &str) -> Option<Change> {
        match entity {
            1 => {
                // Mission
                if let Ok(id) = key.parse::<i64>() {
                    if let Ok(Some(m)) = self.db.get_mission(id).await {
                        return Some(Change {
                            seq,
                            entity: Some(change::Entity::Mission(m.to_proto())),
                            frame_jpeg: Vec::new(),
                            cleared_images: Vec::new(),
                        });
                    }
                }
            }
            2 => {
                // FodGroup "mission_id:group_id"
                let parts: Vec<&str> = key.split(':').collect();
                if parts.len() == 2 {
                    if let (Ok(m_id), Ok(g_id)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                        if let Ok(Some(g)) = self.db.get_fod_group(m_id, g_id).await {
                            return Some(Change {
                                seq,
                                entity: Some(change::Entity::Group(g.to_proto())),
                                frame_jpeg: Vec::new(),
                                cleared_images: Vec::new(),
                            });
                        }
                    }
                }
            }
            3 => {
                // Fod "mission_id:fod_uuid"
                let parts: Vec<&str> = key.split(':').collect();
                let uuid_str = if parts.len() == 2 { parts[1] } else { key };
                if let Ok(u) = Uuid::parse_str(uuid_str) {
                    if let Ok(Some(f)) = self.db.get_fod(u).await {
                        let f_proto = f.to_proto();
                        let frame_jpeg = load_fod_frame(&self.storage, &f_proto).await;
                        return Some(Change {
                            seq,
                            entity: Some(change::Entity::Fod(f_proto)),
                            frame_jpeg,
                            cleared_images: Vec::new(),
                        });
                    }
                }
            }
            4 => {
                // Cleared "mission_id:group_id"
                let parts: Vec<&str> = key.split(':').collect();
                if parts.len() == 2 {
                    if let (Ok(m_id), Ok(g_id)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                        if let Ok(Some(c)) = self.db.get_cleared_fod(m_id, g_id).await {
                            let c_proto = c.to_proto();
                            let cleared_images = load_cleared_images(&self.storage, &c_proto).await;
                            return Some(Change {
                                seq,
                                entity: Some(change::Entity::Cleared(c_proto)),
                                frame_jpeg: Vec::new(),
                                cleared_images,
                            });
                        }
                    }
                }
            }
            5 => {
                // User "username"
                if let Ok(Some(u)) = self.db.get_user_by_username(key).await {
                    return Some(Change {
                        seq,
                        entity: Some(change::Entity::User(u.to_proto())),
                        frame_jpeg: Vec::new(),
                        cleared_images: Vec::new(),
                    });
                } else {
                    return Some(Change {
                        seq,
                        entity: Some(change::Entity::Deleted(proto_defination::replication::Tombstone {
                            entity: 5,
                            entity_key: key.to_string(),
                        })),
                        frame_jpeg: Vec::new(),
                        cleared_images: Vec::new(),
                    });
                }
            }
            6 => {
                // MissionTemplate "id"
                if let Ok(Some(t)) = self.db.get_mission_template_by_id(key).await {
                    return Some(Change {
                        seq,
                        entity: Some(change::Entity::MissionTemplate(t.to_proto())),
                        frame_jpeg: Vec::new(),
                        cleared_images: Vec::new(),
                    });
                }
            }
            _ => {}
        }
        None
    }
}

#[tonic::async_trait]
impl ReplicationService for ReplicationServiceImpl {
    type SessionStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<PrimaryMessage, Status>> + Send + 'static>>;

    async fn session(
        &self,
        request: Request<Streaming<ReplicaMessage>>,
    ) -> Result<Response<Self::SessionStream>, Status> {
        let mut in_stream = request.into_inner();
        let db = self.db.clone();
        let storage = self.storage.clone();
        let primary_node_id = self.node_id.clone();
        let change_tx = self.change_tx.clone();
        let mut change_rx = change_tx.subscribe();

        let head_seq = db.get_head_seq().await.unwrap_or(0);

        let output_stream = async_stream::try_stream! {
            let mut replica_cursor: i64 = 0;
            let mut priority_batches: std::collections::VecDeque<ChangeBatch> = std::collections::VecDeque::new();

            // Wait for Hello message from replica
            if let Some(first_msg) = in_stream.next().await {
                let msg = first_msg.map_err(|e| Status::internal(e.to_string()))?;
                if let Some(ReplicaMsg::Hello(hello)) = msg.msg {
                    replica_cursor = hello.cursor;
                    tracing::info!(
                        "Replica '{}' connected (cursor={}, head_seq={})",
                        hello.node_id,
                        replica_cursor,
                        head_seq
                    );
                    yield PrimaryMessage {
                        msg: Some(PrimaryMsg::Welcome(Welcome {
                            primary_node_id: primary_node_id.clone(),
                            protocol_version: 1,
                            head_seq,
                            oldest_retained_seq: 1,
                        })),
                    };

                    // If this is a fresh replica (cursor == 0), send an initial snapshot of
                    // recent missions + their groups & biggest FODs.
                    // When cursor > 0, the replica already has the base data and only needs
                    // incremental updated data from change_log (plus mission metadata & templates).
                    if let Ok((missions, _)) = db.list_missions(10, 0).await {
                        let mut m_changes = Vec::with_capacity(missions.len());
                        for m in &missions {
                            m_changes.push(Change {
                                seq: replica_cursor,
                                entity: Some(change::Entity::Mission(m.to_proto())),
                                frame_jpeg: Vec::new(),
                                cleared_images: Vec::new(),
                            });
                        }
                        if !m_changes.is_empty() {
                            priority_batches.push_back(ChangeBatch {
                                from_seq: replica_cursor,
                                to_seq: replica_cursor,
                                changes: m_changes,
                            });
                        }

                        // Include all mission templates in the initial priority snapshot
                        if let Ok(templates) = db.get_all_mission_templates().await {
                            let t_changes: Vec<Change> = templates
                                .into_iter()
                                .map(|t| Change {
                                    seq: replica_cursor,
                                    entity: Some(change::Entity::MissionTemplate(t.to_proto())),
                                    frame_jpeg: Vec::new(),
                                    cleared_images: Vec::new(),
                                })
                                .collect();
                            if !t_changes.is_empty() {
                                priority_batches.push_back(ChangeBatch {
                                    from_seq: replica_cursor,
                                    to_seq: replica_cursor,
                                    changes: t_changes,
                                });
                            }
                        }

                        if replica_cursor == 0 {
                            for m in missions.iter().take(6) {
                                if m.storage_tier == "COLD_STORED" || m.storage_tier == "CAR_DROPPED" {
                                    continue;
                                }
                                if let Ok(fods) = db.get_biggest_fods_for_mission(m.id).await {
                                    let mut batch_changes: Vec<Change> = Vec::new();
                                    let mut batch_bytes: usize = 0;
                                    for f in fods {
                                        let f_proto = f.to_proto();
                                        let frame_jpeg = load_fod_frame(&storage, &f_proto).await;
                                        batch_bytes += frame_jpeg.len();
                                        batch_changes.push(Change {
                                            seq: replica_cursor,
                                            entity: Some(change::Entity::Fod(f_proto)),
                                            frame_jpeg,
                                            cleared_images: Vec::new(),
                                        });
                                        if batch_bytes >= MAX_REPLICATION_BATCH_BYTES || batch_changes.len() >= 100 {
                                            priority_batches.push_back(ChangeBatch {
                                                from_seq: replica_cursor,
                                                to_seq: replica_cursor,
                                                changes: std::mem::take(&mut batch_changes),
                                            });
                                            batch_bytes = 0;
                                        }
                                    }
                                    if !batch_changes.is_empty() {
                                        priority_batches.push_back(ChangeBatch {
                                            from_seq: replica_cursor,
                                            to_seq: replica_cursor,
                                            changes: batch_changes,
                                        });
                                    }
                                }
                                if let Ok((groups, _)) = db.list_fod_groups(m.id, 5000, 0).await {
                                    for chunk in groups.chunks(200) {
                                        let changes: Vec<Change> = chunk
                                            .iter()
                                            .map(|g| Change {
                                                seq: replica_cursor,
                                                entity: Some(change::Entity::Group(g.to_proto())),
                                                frame_jpeg: Vec::new(),
                                                cleared_images: Vec::new(),
                                            })
                                            .collect();
                                        priority_batches.push_back(ChangeBatch {
                                            from_seq: replica_cursor,
                                            to_seq: replica_cursor,
                                            changes,
                                        });
                                    }
                                }
                                if let Ok(cleared_list) = db.list_cleared_fods_for_mission(m.id).await {
                                    let mut batch_changes: Vec<Change> = Vec::new();
                                    let mut batch_bytes: usize = 0;
                                    for c in cleared_list {
                                        let c_proto = c.to_proto();
                                        let cleared_images = load_cleared_images(&storage, &c_proto).await;
                                        let img_bytes: usize = cleared_images.iter().map(|b| b.len()).sum();
                                        batch_bytes += img_bytes;
                                        batch_changes.push(Change {
                                            seq: replica_cursor,
                                            entity: Some(change::Entity::Cleared(c_proto)),
                                            frame_jpeg: Vec::new(),
                                            cleared_images,
                                        });
                                        if batch_bytes >= MAX_REPLICATION_BATCH_BYTES || batch_changes.len() >= 50 {
                                            priority_batches.push_back(ChangeBatch {
                                                from_seq: replica_cursor,
                                                to_seq: replica_cursor,
                                                changes: std::mem::take(&mut batch_changes),
                                            });
                                            batch_bytes = 0;
                                        }
                                    }
                                    if !batch_changes.is_empty() {
                                        priority_batches.push_back(ChangeBatch {
                                            from_seq: replica_cursor,
                                            to_seq: replica_cursor,
                                            changes: batch_changes,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let mut catchup_tick = tokio::time::interval(std::time::Duration::from_millis(25));
            catchup_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

            // Loop processing incoming replica messages, priority snapshot batches, and incremental catch-up
            loop {
                tokio::select! {
                    biased;
                    in_res = in_stream.next() => {
                        match in_res {
                            Some(Ok(rep_msg)) => {
                                match rep_msg.msg {
                                    Some(ReplicaMsg::Ping(ping)) => {
                                        let current_head = db.get_head_seq().await.unwrap_or(0);
                                        yield PrimaryMessage {
                                            msg: Some(PrimaryMsg::Pong(Pong {
                                                t: ping.t,
                                                head_seq: current_head,
                                            })),
                                        };
                                    }
                                    Some(ReplicaMsg::Ack(ack)) => {
                                        replica_cursor = replica_cursor.max(ack.cursor);
                                    }
                                    Some(ReplicaMsg::Command(cmd)) => {
                                        if db.is_mission_cold_stored(cmd.mission_id).await.unwrap_or(false) {
                                            yield PrimaryMessage {
                                                msg: Some(PrimaryMsg::Result(CommandResult {
                                                    command_id: cmd.command_id,
                                                    outcome: CommandOutcome::RejectedInvalid as i32,
                                                    group: None,
                                                    detail: "Mission is cold-stored (frozen)".to_string(),
                                                })),
                                            };
                                            continue;
                                        }
                                        let cmd_uuid = Uuid::parse_str(&cmd.command_id).unwrap_or_else(|_| Uuid::new_v4());
                                        let desired_proto = FodGroupStatus::try_from(cmd.desired_status).unwrap_or(FodGroupStatus::GroupStatusUnspecified);
                                        let decided_at = if cmd.issued_at_ms > 0 { cmd.issued_at_ms } else { chrono::Utc::now().timestamp_millis() };
                                        let actor = if !cmd.operator_id.is_empty() { cmd.operator_id.clone() } else { "replica-operator".to_string() };

                                        let mut result_outcome = CommandOutcome::RejectedInvalid;
                                        let mut updated_group = None;

                                        if let Ok(Some((_before, after, outcome))) = db.mutate_fod_group(cmd.mission_id, cmd.group_id, |current| {
                                            let local = current.versioned();
                                            let (out, next_v) = zoid_replication::apply_local_decision(
                                                &local,
                                                desired_proto,
                                                None,
                                                decided_at,
                                                &actor,
                                                &primary_node_id,
                                            );
                                            let write = next_v.map(|st| zoid_db::models::GroupWrite {
                                                state: st,
                                                dirty: false,
                                            });
                                            (write, out)
                                        }).await {
                                            result_outcome = outcome;
                                            if let Some(ug) = after {
                                                let proto_ug = ug.to_proto();
                                                updated_group = Some(proto_ug.clone());

                                                let new_seq = db.append_change(2, &format!("{}:{}", cmd.mission_id, cmd.group_id)).await.unwrap_or(0);
                                                let _ = db.record_applied_command(cmd_uuid, CommandOutcome::Applied as i16, ug.version).await;

                                                let change_item = Change {
                                                    seq: new_seq,
                                                    entity: Some(change::Entity::Group(proto_ug)),
                                                    frame_jpeg: Vec::new(),
                                                    cleared_images: Vec::new(),
                                                };
                                                let _ = change_tx.send(change_item);
                                            }
                                        }

                                        yield PrimaryMessage {
                                            msg: Some(PrimaryMsg::Result(CommandResult {
                                                command_id: cmd.command_id,
                                                outcome: result_outcome as i32,
                                                group: updated_group,
                                                detail: format!("{:?}", result_outcome),
                                            })),
                                        };
                                    }
                                    Some(ReplicaMsg::GroupPush(push_g)) => {
                                        let mission_id = push_g.mission_id;
                                        let group_id = push_g.group_id;
                                        if db.is_mission_cold_stored(mission_id).await.unwrap_or(false) {
                                            yield PrimaryMessage {
                                                msg: Some(PrimaryMsg::GroupAck(GroupPushAck {
                                                    mission_id,
                                                    group_id,
                                                    merged: None,
                                                    outcome: "FROZEN_COLD_STORED".to_string(),
                                                })),
                                            };
                                            continue;
                                        }
                                        let incoming = zoid_db::models::versioned_from_proto(&push_g);

                                        let _ = db.insert_replicated_group_if_absent(&push_g, false).await;
                                        let _ = db.merge_group_biggest_fod(mission_id, group_id, push_g.biggest_fod.as_deref(), push_g.biggest_fod_size).await;

                                        let mut outcome_str = "NOT_FOUND".to_string();
                                        let mut merged_proto = None;

                                        if let Ok(Some((before, after, outcome))) = db.mutate_fod_group(mission_id, group_id, |current| {
                                            let local = current.versioned();
                                            let dec = zoid_replication::merge_remote(&local, &incoming, &primary_node_id);
                                            match dec {
                                                zoid_replication::MergeDecision::KeepLocal => {
                                                    (None, ("KEPT_PRIMARY", current.to_proto()))
                                                }
                                                zoid_replication::MergeDecision::TakeIncoming => {
                                                    let write = zoid_db::models::GroupWrite {
                                                        state: incoming.clone(),
                                                        dirty: false,
                                                    };
                                                    (Some(write), ("TOOK_REPLICA", current.to_proto()))
                                                }
                                                zoid_replication::MergeDecision::Merged(merged_state) => {
                                                    let write = zoid_db::models::GroupWrite {
                                                        state: merged_state,
                                                        dirty: false,
                                                    };
                                                    (Some(write), ("MERGED", current.to_proto()))
                                                }
                                            }
                                        }).await {
                                            outcome_str = outcome.0.to_string();
                                            let final_proto = after.map(|a| a.to_proto()).unwrap_or_else(|| before.to_proto());
                                            merged_proto = Some(final_proto.clone());

                                            if outcome_str != "KEPT_PRIMARY" {
                                                let new_seq = db.append_change(2, &format!("{}:{}", mission_id, group_id)).await.unwrap_or(0);
                                                let change_item = Change {
                                                    seq: new_seq,
                                                    entity: Some(change::Entity::Group(final_proto)),
                                                    frame_jpeg: Vec::new(),
                                                    cleared_images: Vec::new(),
                                                };
                                                let _ = change_tx.send(change_item);
                                            }
                                        }

                                        yield PrimaryMessage {
                                            msg: Some(PrimaryMsg::GroupAck(GroupPushAck {
                                                mission_id,
                                                group_id,
                                                merged: merged_proto,
                                                outcome: outcome_str,
                                            })),
                                        };
                                    }
                                    Some(ReplicaMsg::UserUpsert(u)) => {
                                        if let Ok(row) = db.upsert_replicated_user(&u).await {
                                            let proto_user = row.to_proto();
                                            let new_seq = db.append_change(5, &row.username).await.unwrap_or(0);
                                            let change_item = Change {
                                                seq: new_seq,
                                                entity: Some(change::Entity::User(proto_user)),
                                                frame_jpeg: Vec::new(),
                                                cleared_images: Vec::new(),
                                            };
                                            let _ = change_tx.send(change_item);
                                        }
                                    }
                                    Some(ReplicaMsg::TemplateUpsert(t)) => {
                                        if let Ok(row) = db.upsert_replicated_mission_template(&t).await {
                                            let proto_tmpl = row.to_proto();
                                            let new_seq = db.append_change(6, &row.id).await.unwrap_or(0);
                                            let change_item = Change {
                                                seq: new_seq,
                                                entity: Some(change::Entity::MissionTemplate(proto_tmpl)),
                                                frame_jpeg: Vec::new(),
                                                cleared_images: Vec::new(),
                                            };
                                            let _ = change_tx.send(change_item);
                                        }
                                    }
                                    Some(ReplicaMsg::ClearedPush(push)) => {
                                        if let Some(ref c) = push.cleared {
                                            if db.is_mission_cold_stored(c.mission_id).await.unwrap_or(false) {
                                                continue;
                                            }
                                        }
                                        for img in &push.images {
                                            if !img.is_empty() {
                                                let _ = storage.save_frame(img).await;
                                            }
                                        }
                                        if let Some(c) = push.cleared {
                                            let _ = db.ensure_mission_exists(c.mission_id).await;
                                            let (lat, lon, sd) = c
                                                .location
                                                .map(|l| (l.lat, l.lon, l.sd))
                                                .unwrap_or((0.0, 0.0, 0.0));
                                            let status = proto_defination::common::ClearedFodStatus::try_from(c.status)
                                                .map(zoid_db::models::ClearedFodStatus::from)
                                                .unwrap_or(zoid_db::models::ClearedFodStatus::Found);
                                            let row = zoid_db::models::ClearedFodRow {
                                                id: Uuid::parse_str(&c.id).unwrap_or_else(|_| Uuid::new_v4()),
                                                mission_id: c.mission_id,
                                                group_id: c.group_id,
                                                status,
                                                before_image_sha256: c.before_image_sha256,
                                                after_image_sha256: c.after_image_sha256,
                                                lat,
                                                lon,
                                                sd,
                                                created_at: chrono::DateTime::from_timestamp_millis(c.created_at)
                                                    .unwrap_or_else(chrono::Utc::now),
                                                created_by: c.created_by,
                                            };
                                            if db.insert_cleared_fod(&row).await.is_ok() {
                                                let proto_cleared = row.to_proto();
                                                let new_seq = db
                                                    .append_change(4, &format!("{}:{}", row.mission_id, row.group_id))
                                                    .await
                                                    .unwrap_or(0);
                                                let _ = change_tx.send(Change {
                                                    seq: new_seq,
                                                    entity: Some(change::Entity::Cleared(proto_cleared)),
                                                    frame_jpeg: Vec::new(),
                                                    cleared_images: push.images,
                                                });
                                            }
                                        }
                                    }
                                    Some(ReplicaMsg::StorageDirective(dir)) => {
                                        if let Ok(Some(m)) = db.get_mission(dir.mission_id).await {
                                            if m.status == zoid_db::models::MissionStatus::Active {
                                                tracing::warn!("Ignoring StorageDirective for ACTIVE mission {}", dir.mission_id);
                                                continue;
                                            }
                                            if dir.directive == "DROP_HOT_DATA" && dir.storage_epoch >= m.storage_epoch {
                                                let target_tier = if dir.storage_tier.is_empty() {
                                                    "COLD_STORED"
                                                } else {
                                                    dir.storage_tier.as_str()
                                                };
                                                let cold_at = dir
                                                    .cold_stored_at_ms
                                                    .filter(|&ms| ms > 0)
                                                    .and_then(chrono::DateTime::from_timestamp_millis);
                                                if let Ok((updated, safe_shas)) = db
                                                    .purge_mission_hot_data(
                                                        dir.mission_id,
                                                        target_tier,
                                                        dir.storage_epoch,
                                                        None,
                                                        dir.archive_size_bytes,
                                                        None,
                                                        cold_at,
                                                    )
                                                    .await
                                                {
                                                    let (freed, removed) = storage.delete_frames(&safe_shas).await;
                                                    tracing::info!(
                                                        "Car dropped hot data for mission {} (tier={}, epoch={}, removed {} frames / {} bytes)",
                                                        dir.mission_id, target_tier, dir.storage_epoch, removed, freed
                                                    );
                                                    let seq = db.append_change(1, &dir.mission_id.to_string()).await.unwrap_or(0);
                                                    let _ = change_tx.send(Change {
                                                        seq,
                                                        entity: Some(change::Entity::Mission(updated.to_proto())),
                                                        frame_jpeg: Vec::new(),
                                                        cleared_images: Vec::new(),
                                                    });
                                                }
                                            } else if dir.directive == "RESTORE_AVAILABLE" && dir.storage_epoch > m.storage_epoch {
                                                if let Ok(updated) = db
                                                    .update_mission_storage_state(dir.mission_id, "HOT", dir.storage_epoch)
                                                    .await
                                                {
                                                    tracing::info!(
                                                        "Car marked mission {} HOT (epoch={}) after ATC restore",
                                                        dir.mission_id, dir.storage_epoch
                                                    );
                                                    let seq = db.append_change(1, &dir.mission_id.to_string()).await.unwrap_or(0);
                                                    let _ = change_tx.send(Change {
                                                        seq,
                                                        entity: Some(change::Entity::Mission(updated.to_proto())),
                                                        frame_jpeg: Vec::new(),
                                                        cleared_images: Vec::new(),
                                                    });
                                                }
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            Some(Err(e)) => {
                                tracing::warn!("Replica stream error: {}", e);
                                break;
                            }
                            None => break,
                        }
                    }
                    live_change_res = change_rx.recv() => {
                        if let Ok(live_change) = live_change_res {
                            if live_change.seq > replica_cursor {
                                replica_cursor = live_change.seq;
                                yield PrimaryMessage {
                                    msg: Some(PrimaryMsg::Batch(ChangeBatch {
                                        from_seq: live_change.seq,
                                        to_seq: live_change.seq,
                                        changes: vec![live_change],
                                    })),
                                };
                            }
                        }
                    }
                    _ = catchup_tick.tick() => {
                        // 1. Drain up to 3 priority snapshot batches (newest missions first)
                        for _ in 0..3 {
                            if let Some(batch) = priority_batches.pop_front() {
                                yield PrimaryMessage {
                                    msg: Some(PrimaryMsg::Batch(batch)),
                                };
                            } else {
                                break;
                            }
                        }

                                if priority_batches.is_empty() {
                                    let current_head = db.get_head_seq().await.unwrap_or(0);
                                    for _ in 0..8 {
                                        if replica_cursor >= current_head {
                                            break;
                                        }
                                        let change_rows = db.get_changes_since(replica_cursor, 500).await.unwrap_or_default();
                                        if change_rows.is_empty() {
                                            break;
                                        }
                                        let mut changes = Vec::with_capacity(change_rows.len());
                                        let mut batch_bytes: usize = 0;
                                        let mut last_seq = replica_cursor;

                                        // Deduplicate identical (entity, entity_key) within the window so we only
                                        // resolve and transmit the latest state once per entity.
                                        let mut latest_seq_for_entity: std::collections::HashMap<(i16, String), i64> =
                                            std::collections::HashMap::with_capacity(change_rows.len());
                                        for row in &change_rows {
                                            latest_seq_for_entity.insert((row.entity, row.entity_key.clone()), row.seq);
                                        }

                                        for row in change_rows {
                                            last_seq = row.seq;
                                            if latest_seq_for_entity.get(&(row.entity, row.entity_key.clone())).copied() != Some(row.seq) {
                                                continue;
                                            }
                                            let c = match row.entity {
                                        1 => {
                                            if let Ok(id) = row.entity_key.parse::<i64>() {
                                                db.get_mission(id).await.ok().flatten().map(|m| Change {
                                                    seq: row.seq,
                                                    entity: Some(change::Entity::Mission(m.to_proto())),
                                                    frame_jpeg: Vec::new(),
                                                    cleared_images: Vec::new(),
                                                })
                                            } else { None }
                                        }
                                        2 => {
                                            let parts: Vec<&str> = row.entity_key.split(':').collect();
                                            if parts.len() == 2 {
                                                if let (Ok(m), Ok(g)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                                                    db.get_fod_group(m, g).await.ok().flatten().map(|grp| Change {
                                                        seq: row.seq,
                                                        entity: Some(change::Entity::Group(grp.to_proto())),
                                                        frame_jpeg: Vec::new(),
                                                        cleared_images: Vec::new(),
                                                    })
                                                } else { None }
                                            } else { None }
                                        }
                                        3 => {
                                            let parts: Vec<&str> = row.entity_key.split(':').collect();
                                            let u_str = if parts.len() == 2 { parts[1] } else { &row.entity_key };
                                            if let Ok(u) = Uuid::parse_str(u_str) {
                                                if let Some(f) = db.get_fod(u).await.ok().flatten() {
                                                    let f_proto = f.to_proto();
                                                    let frame_jpeg = load_fod_frame(&storage, &f_proto).await;
                                                    batch_bytes += frame_jpeg.len();
                                                    Some(Change {
                                                        seq: row.seq,
                                                        entity: Some(change::Entity::Fod(f_proto)),
                                                        frame_jpeg,
                                                        cleared_images: Vec::new(),
                                                    })
                                                } else { None }
                                            } else { None }
                                        }
                                        4 => {
                                            let parts: Vec<&str> = row.entity_key.split(':').collect();
                                            if parts.len() == 2 {
                                                if let (Ok(m), Ok(g)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                                                    if let Some(c) = db.get_cleared_fod(m, g).await.ok().flatten() {
                                                        let c_proto = c.to_proto();
                                                        let cleared_images = load_cleared_images(&storage, &c_proto).await;
                                                        let img_bytes: usize = cleared_images.iter().map(|b| b.len()).sum();
                                                        batch_bytes += img_bytes;
                                                        Some(Change {
                                                            seq: row.seq,
                                                            entity: Some(change::Entity::Cleared(c_proto)),
                                                            frame_jpeg: Vec::new(),
                                                            cleared_images,
                                                        })
                                                    } else { None }
                                                } else { None }
                                            } else { None }
                                        }
                                        5 => {
                                            db.get_user_by_username(&row.entity_key).await.ok().flatten().map(|u| Change {
                                                seq: row.seq,
                                                entity: Some(change::Entity::User(u.to_proto())),
                                                frame_jpeg: Vec::new(),
                                                cleared_images: Vec::new(),
                                            })
                                        }
                                        6 => {
                                            db.get_mission_template_by_id(&row.entity_key).await.ok().flatten().map(|t| Change {
                                                seq: row.seq,
                                                entity: Some(change::Entity::MissionTemplate(t.to_proto())),
                                                frame_jpeg: Vec::new(),
                                                cleared_images: Vec::new(),
                                            })
                                        }
                                        _ => None,
                                    };

                                    if let Some(ch) = c {
                                        changes.push(ch);
                                    }
                                    if batch_bytes >= MAX_REPLICATION_BATCH_BYTES {
                                        break;
                                    }
                                }

                                replica_cursor = last_seq;

                                if !changes.is_empty() {
                                    yield PrimaryMessage {
                                        msg: Some(PrimaryMsg::Batch(ChangeBatch {
                                            from_seq: changes.first().map(|c| c.seq).unwrap_or(replica_cursor),
                                            to_seq: last_seq,
                                            changes,
                                        })),
                                    };
                                }
                            }
                        }
                    }
                }
            }
        };

        Ok(Response::new(Box::pin(output_stream)))
    }

    async fn mission_digest(
        &self,
        request: Request<MissionDigestRequest>,
    ) -> Result<Response<MissionDigestResponse>, Status> {
        let req = request.into_inner();
        let (group_count, fod_count) = self
            .db
            .get_mission_stats(req.mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let head_seq = self.db.get_head_seq().await.unwrap_or(0);

        // Digest over count + mission_id + head_seq
        let mut hasher = Sha256::new();
        hasher.update(req.mission_id.to_le_bytes());
        hasher.update(group_count.to_le_bytes());
        hasher.update(fod_count.to_le_bytes());
        hasher.update(head_seq.to_le_bytes());
        let digest = hasher.finalize().to_vec();

        Ok(Response::new(MissionDigestResponse {
            mission_id: req.mission_id,
            group_count,
            fod_count,
            digest,
            as_of_seq: head_seq,
        }))
    }

    type SnapshotMissionStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<ChangeBatch, Status>> + Send + 'static>>;

    async fn snapshot_mission(
        &self,
        request: Request<SnapshotRequest>,
    ) -> Result<Response<Self::SnapshotMissionStream>, Status> {
        let req = request.into_inner();
        let db = self.db.clone();
        let mission_id = req.mission_id;

        let output_stream = async_stream::try_stream! {
            // Snapshot groups
            let (groups, _) = db.list_fod_groups(mission_id, 1000, 0).await.map_err(|e| Status::internal(e.to_string()))?;
            let mut changes = Vec::with_capacity(groups.len());

            for (idx, g) in groups.into_iter().enumerate() {
                changes.push(Change {
                    seq: (idx + 1) as i64,
                    entity: Some(change::Entity::Group(g.to_proto())),
                    frame_jpeg: Vec::new(),
                    cleared_images: Vec::new(),
                });
            }

            if !changes.is_empty() {
                yield ChangeBatch {
                    from_seq: 1,
                    to_seq: changes.len() as i64,
                    changes,
                };
            }
        };

        Ok(Response::new(Box::pin(output_stream)))
    }
}
