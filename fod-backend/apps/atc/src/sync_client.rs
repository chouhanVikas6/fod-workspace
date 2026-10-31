use futures::StreamExt;
use proto_defination::replication::primary_message::Msg as PrimaryMsg;
use proto_defination::replication::replica_message::Msg as ReplicaMsg;
use proto_defination::replication::replication_service_client::ReplicationServiceClient;
use proto_defination::replication::{
    change, Ack, Command, Hello, NodeRole, Ping, PrimaryMessage, ReplicaMessage,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::Request;
use zoid_db::Db;

#[derive(Clone)]
pub struct SyncClient {
    car_endpoint: String,
    db: Db,
    node_id: String,
    cmd_tx: mpsc::Sender<Command>,
    user_tx: mpsc::Sender<proto_defination::user::UserEntity>,
    group_tx: tokio::sync::broadcast::Sender<proto_defination::fod_group::FodGroupEntity>,
    group_push_tx: mpsc::Sender<proto_defination::fod_group::FodGroupEntity>,
}

impl SyncClient {
    pub fn new(
        car_endpoint: String,
        db: Db,
        node_id: String,
        group_tx: tokio::sync::broadcast::Sender<proto_defination::fod_group::FodGroupEntity>,
    ) -> (
        Self,
        mpsc::Receiver<Command>,
        mpsc::Receiver<proto_defination::user::UserEntity>,
        mpsc::Receiver<proto_defination::fod_group::FodGroupEntity>,
    ) {
        let (cmd_tx, cmd_rx) = mpsc::channel(100);
        let (user_tx, user_rx) = mpsc::channel(100);
        let (group_push_tx, group_push_rx) = mpsc::channel(200);
        let client = Self {
            car_endpoint,
            db,
            node_id,
            cmd_tx,
            user_tx,
            group_tx,
            group_push_tx,
        };
        (client, cmd_rx, user_rx, group_push_rx)
    }

    pub fn command_sender(&self) -> mpsc::Sender<Command> {
        self.cmd_tx.clone()
    }

    pub fn user_sender(&self) -> mpsc::Sender<proto_defination::user::UserEntity> {
        self.user_tx.clone()
    }

    pub fn group_push_sender(&self) -> mpsc::Sender<proto_defination::fod_group::FodGroupEntity> {
        self.group_push_tx.clone()
    }

    pub async fn run_replication_loop(
        self: Arc<Self>,
        mut cmd_rx: mpsc::Receiver<Command>,
        mut user_rx: mpsc::Receiver<proto_defination::user::UserEntity>,
        mut group_push_rx: mpsc::Receiver<proto_defination::fod_group::FodGroupEntity>,
    ) {
        let mut backoff_secs = 1;

        loop {
            tracing::info!(
                "Connecting to Car primary replication at {}",
                self.car_endpoint
            );

            match ReplicationServiceClient::connect(self.car_endpoint.clone()).await {
                Ok(mut client) => {
                    tracing::info!("Replication connection established with Car primary");
                    backoff_secs = 1;

                    let cursor = self
                        .db
                        .get_upstream_cursor("car-primary")
                        .await
                        .unwrap_or(0);

                    let (out_tx, out_rx) = mpsc::channel::<ReplicaMessage>(100);

                    // Send initial Hello
                    let hello_msg = ReplicaMessage {
                        msg: Some(ReplicaMsg::Hello(Hello {
                            node_id: self.node_id.clone(),
                            role: NodeRole::Atc as i32,
                            protocol_version: 1,
                            cursor,
                        })),
                    };
                    let _ = out_tx.send(hello_msg).await;

                    // Immediately push any offline/dirty groups from ATC to Car!
                    if let Ok(dirty_groups) = self.db.list_dirty_fod_groups(200).await {
                        for dg in dirty_groups {
                            let _ = out_tx.send(ReplicaMessage {
                                msg: Some(ReplicaMsg::GroupPush(dg.to_proto())),
                            }).await;
                        }
                    }

                    let in_stream_req = Request::new(ReceiverStream::new(out_rx));

                    match client.session(in_stream_req).await {
                        Ok(resp) => {
                            let mut in_stream = resp.into_inner();
                            let mut ping_interval = tokio::time::interval(Duration::from_secs(5));

                            loop {
                                tokio::select! {
                                    _ = ping_interval.tick() => {
                                        let ping_msg = ReplicaMessage {
                                            msg: Some(ReplicaMsg::Ping(Ping {
                                                t: chrono::Utc::now().timestamp_millis(),
                                            })),
                                        };
                                        if out_tx.send(ping_msg).await.is_err() {
                                            break;
                                        }
                                    }
                                    cmd = cmd_rx.recv() => {
                                        if let Some(c) = cmd {
                                            let cmd_msg = ReplicaMessage {
                                                msg: Some(ReplicaMsg::Command(c)),
                                            };
                                            if out_tx.send(cmd_msg).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                    push_g = group_push_rx.recv() => {
                                        if let Some(g) = push_g {
                                            let push_msg = ReplicaMessage {
                                                msg: Some(ReplicaMsg::GroupPush(g)),
                                            };
                                            if out_tx.send(push_msg).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                    u = user_rx.recv() => {
                                        if let Some(user) = u {
                                            let user_msg = ReplicaMessage {
                                                msg: Some(ReplicaMsg::UserUpsert(user)),
                                            };
                                            if out_tx.send(user_msg).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                    primary_msg = in_stream.next() => {
                                        match primary_msg {
                                            Some(Ok(msg)) => {
                                                if let Err(e) = self.handle_primary_message(msg, &out_tx).await {
                                                    tracing::error!("Error handling replicated change: {}", e);
                                                }
                                            }
                                            Some(Err(e)) => {
                                                tracing::warn!("Replication stream error: {}", e);
                                                break;
                                            }
                                            None => {
                                                tracing::warn!("Replication stream closed by primary");
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Replication session handshake failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        "Could not connect to Car primary ({}): {}. Retrying in {}s...",
                        self.car_endpoint,
                        e,
                        backoff_secs
                    );
                }
            }

            tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
            backoff_secs = (backoff_secs * 2).min(10);
        }
    }

    async fn ensure_mission_exists(
        &self,
        mission_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if self.db.get_mission(mission_id).await?.is_none() {
            // Try fetching full mission details from Car primary
            if let Ok(mut client) =
                proto_defination::mission::mission_service_client::MissionServiceClient::connect(
                    self.car_endpoint.clone(),
                )
                .await
            {
                if let Ok(resp) = client
                    .retrieve_mission_data(tonic::Request::new(
                        proto_defination::mission::RetrieveMissionRequest { mission_id },
                    ))
                    .await
                {
                    if let Some(m) = resp.into_inner().mission {
                        let _ = self.db.upsert_replicated_mission(&m).await;
                        return Ok(());
                    }
                }
            }

            // Fallback: create placeholder mission so foreign key constraint is satisfied
            self.db.ensure_mission_exists(mission_id).await?;
        }
        Ok(())
    }

    async fn handle_primary_message(
        &self,
        msg: PrimaryMessage,
        out_tx: &mpsc::Sender<ReplicaMessage>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        match msg.msg {
            Some(PrimaryMsg::Welcome(w)) => {
                tracing::info!(
                    "Primary welcomed replica: primary_node={}, head_seq={}",
                    w.primary_node_id,
                    w.head_seq
                );
            }
            Some(PrimaryMsg::Batch(batch)) => {
                for change in batch.changes {
                    if let Some(entity) = change.entity {
                        match entity {
                            change::Entity::Mission(m) => {
                                self.db.upsert_replicated_mission(&m).await?;
                            }
                            change::Entity::Group(g) => {
                                self.ensure_mission_exists(g.mission_id).await?;
                                let _ = self.db.insert_replicated_group_if_absent(&g, false).await;
                                let _ = self.db.merge_group_biggest_fod(g.mission_id, g.group_id, g.biggest_fod.as_deref(), g.biggest_fod_size).await;
                                let incoming = zoid_db::models::versioned_from_proto(&g);
                                let mut updated_group = None;
                                let mut needs_push_back = false;

                                if let Ok(Some((_before, after, dec))) = self.db.mutate_fod_group(g.mission_id, g.group_id, |current| {
                                    let local = current.versioned();
                                    let dec = zoid_replication::merge_remote(&local, &incoming, &self.node_id);
                                    match dec {
                                        zoid_replication::MergeDecision::KeepLocal => {
                                            let write = if !current.dirty {
                                                Some(zoid_db::models::GroupWrite {
                                                    state: local.clone(),
                                                    dirty: true,
                                                })
                                            } else {
                                                None
                                            };
                                            (write, zoid_replication::MergeDecision::KeepLocal)
                                        }
                                        zoid_replication::MergeDecision::TakeIncoming => {
                                            let write = zoid_db::models::GroupWrite {
                                                state: incoming.clone(),
                                                dirty: false,
                                            };
                                            (Some(write), zoid_replication::MergeDecision::TakeIncoming)
                                        }
                                        zoid_replication::MergeDecision::Merged(merged_state) => {
                                            let merged_clone = merged_state.clone();
                                            let write = zoid_db::models::GroupWrite {
                                                state: merged_state,
                                                dirty: true,
                                            };
                                            (Some(write), zoid_replication::MergeDecision::Merged(merged_clone))
                                        }
                                    }
                                }).await {
                                    match dec {
                                        zoid_replication::MergeDecision::KeepLocal => {
                                            needs_push_back = true;
                                        }
                                        zoid_replication::MergeDecision::TakeIncoming => {
                                            if let Some(a) = after {
                                                let proto = a.to_proto();
                                                let _ = self.group_tx.send(proto);
                                            }
                                        }
                                        zoid_replication::MergeDecision::Merged(_) => {
                                            needs_push_back = true;
                                            if let Some(a) = after {
                                                let proto = a.to_proto();
                                                let _ = self.group_tx.send(proto.clone());
                                                updated_group = Some(proto);
                                            }
                                        }
                                    }
                                }

                                if needs_push_back {
                                    let push_entity = match updated_group {
                                        Some(eg) => Some(eg),
                                        None => self.db.get_fod_group(g.mission_id, g.group_id).await.ok().flatten().map(|row| row.to_proto()),
                                    };
                                    if let Some(push_msg) = push_entity {
                                        let _ = out_tx.send(ReplicaMessage {
                                            msg: Some(ReplicaMsg::GroupPush(push_msg)),
                                        }).await;
                                    }
                                }
                            }
                            change::Entity::Fod(f) => {
                                self.ensure_mission_exists(f.mission_id).await?;
                                self.db.upsert_replicated_fod(&f).await?;
                            }
                            change::Entity::Cleared(c) => {
                                self.ensure_mission_exists(c.mission_id).await?;
                                let (lat, lon, sd) = c
                                    .location
                                    .map(|l| (l.lat, l.lon, l.sd))
                                    .unwrap_or((0.0, 0.0, 0.0));
                                let status = proto_defination::common::ClearedFodStatus::try_from(
                                    c.status,
                                )
                                .map(zoid_db::models::ClearedFodStatus::from)
                                .unwrap_or(zoid_db::models::ClearedFodStatus::Found);

                                let row = zoid_db::models::ClearedFodRow {
                                    id: uuid::Uuid::parse_str(&c.id)
                                        .unwrap_or_else(|_| uuid::Uuid::new_v4()),
                                    mission_id: c.mission_id,
                                    group_id: c.group_id,
                                    status,
                                    before_image_sha256: c.before_image_sha256,
                                    after_image_sha256: c.after_image_sha256,
                                    lat,
                                    lon,
                                    sd,
                                    created_at: chrono::DateTime::from_timestamp_millis(
                                        c.created_at,
                                    )
                                    .unwrap_or_else(chrono::Utc::now),
                                    created_by: c.created_by,
                                };
                                self.db.insert_cleared_fod(&row).await?;
                            }
                            change::Entity::User(u) => {
                                self.db.upsert_replicated_user(&u).await?;
                            }
                            change::Entity::Deleted(t) => {
                                if t.entity == 5 {
                                    let _ = self.db.delete_user_by_username(&t.entity_key).await;
                                }
                            }
                        }
                    }
                }

                self.db
                    .update_upstream_cursor("car-primary", batch.to_seq)
                    .await?;

                let ack_msg = ReplicaMessage {
                    msg: Some(ReplicaMsg::Ack(Ack {
                        cursor: batch.to_seq,
                    })),
                };
                let _ = out_tx.send(ack_msg).await;
            }
            Some(PrimaryMsg::GroupAck(ack)) => {
                tracing::info!(
                    "GroupAck received from Car: mission={}, group={}, outcome={}",
                    ack.mission_id,
                    ack.group_id,
                    ack.outcome
                );
                if let Some(merged_g) = ack.merged {
                    let incoming = zoid_db::models::versioned_from_proto(&merged_g);
                    let _ = self.db.mutate_fod_group(ack.mission_id, ack.group_id, |_current| {
                        let write = zoid_db::models::GroupWrite {
                            state: incoming.clone(),
                            dirty: false,
                        };
                        (Some(write), ())
                    }).await;
                    let _ = self.group_tx.send(merged_g);
                } else {
                    let _ = self.db.mutate_fod_group(ack.mission_id, ack.group_id, |current| {
                        let write = zoid_db::models::GroupWrite {
                            state: current.versioned(),
                            dirty: false,
                        };
                        (Some(write), ())
                    }).await;
                }
            }
            Some(PrimaryMsg::Result(res)) => {
                tracing::info!(
                    "Command result received from Car: command_id={}, outcome={}",
                    res.command_id,
                    res.outcome
                );
            }
            Some(PrimaryMsg::Pong(_)) => {
                // Connection alive
            }
            _ => {}
        }

        Ok(())
    }
}
