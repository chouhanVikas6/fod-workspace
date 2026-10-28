use futures::StreamExt;
use proto_defination::common::FodGroupStatus;
use proto_defination::replication::primary_message::Msg as PrimaryMsg;
use proto_defination::replication::replication_service_server::ReplicationService;
use proto_defination::replication::{
    change, replica_message::Msg as ReplicaMsg, Change, ChangeBatch, CommandOutcome, CommandResult,
    MissionDigestRequest, MissionDigestResponse, Pong, PrimaryMessage, ReplicaMessage,
    SnapshotRequest, Welcome,
};
use sha2::{Digest, Sha256};
use std::pin::Pin;
use tokio::sync::broadcast;
use tonic::{Request, Response, Status, Streaming};
use uuid::Uuid;
use zoid_db::models::FodGroupStatus as DbGroupStatus;
use zoid_db::Db;
use zoid_replication::{decide, CommandRequest, GroupState};

pub struct ReplicationServiceImpl {
    db: Db,
    node_id: String,
    change_tx: broadcast::Sender<Change>,
}

impl ReplicationServiceImpl {
    pub fn new(db: Db, node_id: String, change_tx: broadcast::Sender<Change>) -> Self {
        Self {
            db,
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
                        return Some(Change {
                            seq,
                            entity: Some(change::Entity::Fod(f.to_proto())),
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
                            return Some(Change {
                                seq,
                                entity: Some(change::Entity::Cleared(c.to_proto())),
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
        let primary_node_id = self.node_id.clone();
        let change_tx = self.change_tx.clone();
        let mut change_rx = change_tx.subscribe();

        let head_seq = db.get_head_seq().await.unwrap_or(0);

        let output_stream = async_stream::try_stream! {
            let mut replica_cursor: i64 = 0;

            // Wait for Hello message from replica
            if let Some(first_msg) = in_stream.next().await {
                let msg = first_msg.map_err(|e| Status::internal(e.to_string()))?;
                if let Some(ReplicaMsg::Hello(hello)) = msg.msg {
                    replica_cursor = hello.cursor;
                    yield PrimaryMessage {
                        msg: Some(PrimaryMsg::Welcome(Welcome {
                            primary_node_id: primary_node_id.clone(),
                            protocol_version: 1,
                            head_seq,
                            oldest_retained_seq: 1,
                        })),
                    };

                    // Catch up replica from its cursor to head_seq
                    while replica_cursor < head_seq {
                        let change_rows = db.get_changes_since(replica_cursor, 200).await.unwrap_or_default();
                        if change_rows.is_empty() {
                            break;
                        }
                        let mut changes = Vec::with_capacity(change_rows.len());
                        let mut last_seq = replica_cursor;

                        for row in change_rows {
                            last_seq = row.seq;
                            // Fetch corresponding entity
                            let c = match row.entity {
                                1 => {
                                    if let Ok(id) = row.entity_key.parse::<i64>() {
                                        db.get_mission(id).await.ok().flatten().map(|m| Change {
                                            seq: row.seq,
                                            entity: Some(change::Entity::Mission(m.to_proto())),
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
                                            })
                                        } else { None }
                                    } else { None }
                                }
                                3 => {
                                    let parts: Vec<&str> = row.entity_key.split(':').collect();
                                    let u_str = if parts.len() == 2 { parts[1] } else { &row.entity_key };
                                    if let Ok(u) = Uuid::parse_str(u_str) {
                                        db.get_fod(u).await.ok().flatten().map(|f| Change {
                                            seq: row.seq,
                                            entity: Some(change::Entity::Fod(f.to_proto())),
                                        })
                                    } else { None }
                                }
                                4 => {
                                    let parts: Vec<&str> = row.entity_key.split(':').collect();
                                    if parts.len() == 2 {
                                        if let (Ok(m), Ok(g)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                                            db.get_cleared_fod(m, g).await.ok().flatten().map(|c| Change {
                                                seq: row.seq,
                                                entity: Some(change::Entity::Cleared(c.to_proto())),
                                            })
                                        } else { None }
                                    } else { None }
                                }
                                _ => None,
                            };

                            if let Some(ch) = c {
                                changes.push(ch);
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

            // Loop processing incoming replica messages or outgoing broadcast changes
            loop {
                tokio::select! {
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

                                        while replica_cursor < current_head {
                                            let change_rows = db.get_changes_since(replica_cursor, 200).await.unwrap_or_default();
                                            if change_rows.is_empty() {
                                                break;
                                            }
                                            let mut changes = Vec::with_capacity(change_rows.len());
                                            let mut last_seq = replica_cursor;

                                            for row in change_rows {
                                                last_seq = row.seq;
                                                let c = match row.entity {
                                                    1 => {
                                                        if let Ok(id) = row.entity_key.parse::<i64>() {
                                                            db.get_mission(id).await.ok().flatten().map(|m| Change {
                                                                seq: row.seq,
                                                                entity: Some(change::Entity::Mission(m.to_proto())),
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
                                                                })
                                                            } else { None }
                                                        } else { None }
                                                    }
                                                    3 => {
                                                        let parts: Vec<&str> = row.entity_key.split(':').collect();
                                                        let u_str = if parts.len() == 2 { parts[1] } else { &row.entity_key };
                                                        if let Ok(u) = Uuid::parse_str(u_str) {
                                                            db.get_fod(u).await.ok().flatten().map(|f| Change {
                                                                seq: row.seq,
                                                                entity: Some(change::Entity::Fod(f.to_proto())),
                                                            })
                                                        } else { None }
                                                    }
                                                    4 => {
                                                        let parts: Vec<&str> = row.entity_key.split(':').collect();
                                                        if parts.len() == 2 {
                                                            if let (Ok(m), Ok(g)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                                                                db.get_cleared_fod(m, g).await.ok().flatten().map(|c| Change {
                                                                    seq: row.seq,
                                                                    entity: Some(change::Entity::Cleared(c.to_proto())),
                                                                })
                                                            } else { None }
                                                        } else { None }
                                                    }
                                                    5 => {
                                                        db.get_user_by_username(&row.entity_key).await.ok().flatten().map(|u| Change {
                                                            seq: row.seq,
                                                            entity: Some(change::Entity::User(u.to_proto())),
                                                        })
                                                    }
                                                    _ => None,
                                                };

                                                if let Some(ch) = c {
                                                    changes.push(ch);
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
                                    Some(ReplicaMsg::Ack(ack)) => {
                                        replica_cursor = replica_cursor.max(ack.cursor);
                                    }
                                    Some(ReplicaMsg::Command(cmd)) => {
                                        let cmd_uuid = Uuid::parse_str(&cmd.command_id).unwrap_or_else(|_| Uuid::new_v4());

                                        let mut result_outcome = CommandOutcome::RejectedInvalid;
                                        let mut updated_group = None;

                                        if let Ok(Some(g)) = db.get_fod_group(cmd.mission_id, cmd.group_id).await {
                                            let desired_proto = FodGroupStatus::try_from(cmd.desired_status).unwrap_or(FodGroupStatus::GroupStatusUnspecified);
                                            let state = GroupState {
                                                status: FodGroupStatus::from(g.status.clone()),
                                                version: g.version,
                                            };
                                            let req = CommandRequest {
                                                desired_status: desired_proto,
                                                base_version: cmd.base_version,
                                            };

                                            let outcome = decide(&state, &req);
                                            result_outcome = outcome;

                                            if outcome == CommandOutcome::Applied {
                                                let desired_db = DbGroupStatus::from(desired_proto);
                                                if let Ok(Some(ug)) = db.update_fod_group_status(cmd.mission_id, cmd.group_id, desired_db, g.version).await {
                                                    let proto_ug = ug.to_proto();
                                                    updated_group = Some(proto_ug.clone());

                                                    let new_seq = db.append_change(2, &format!("{}:{}", cmd.mission_id, cmd.group_id)).await.unwrap_or(0);
                                                    let _ = db.record_applied_command(cmd_uuid, CommandOutcome::Applied as i16, ug.version).await;

                                                    let change_item = Change {
                                                        seq: new_seq,
                                                        entity: Some(change::Entity::Group(proto_ug)),
                                                    };
                                                    let _ = change_tx.send(change_item);
                                                }
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
                                    Some(ReplicaMsg::UserUpsert(u)) => {
                                        if let Ok(row) = db.upsert_replicated_user(&u).await {
                                            let proto_user = row.to_proto();
                                            let new_seq = db.append_change(5, &row.username).await.unwrap_or(0);
                                            let change_item = Change {
                                                seq: new_seq,
                                                entity: Some(change::Entity::User(proto_user)),
                                            };
                                            let _ = change_tx.send(change_item);
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
