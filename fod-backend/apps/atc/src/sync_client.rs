use futures::StreamExt;
use proto_defination::replication::primary_message::Msg as PrimaryMsg;
use proto_defination::replication::replica_message::Msg as ReplicaMsg;
use proto_defination::replication::replication_service_client::ReplicationServiceClient;
use proto_defination::replication::{
    change, Ack, ClearedFodPush, Command, Hello, NodeRole, Ping, PrimaryMessage, ReplicaMessage,
    StorageDirective,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::Request;
use zoid_db::Db;
use zoid_storage::FrameStorage;

#[derive(Clone)]
pub struct SyncClient {
    car_endpoint: String,
    db: Db,
    storage: Arc<FrameStorage>,
    node_id: String,
    cmd_tx: mpsc::Sender<Command>,
    user_tx: mpsc::Sender<proto_defination::user::UserEntity>,
    template_tx: mpsc::Sender<proto_defination::mission::MissionTemplateEntity>,
    group_tx: tokio::sync::broadcast::Sender<proto_defination::fod_group::FodGroupEntity>,
    group_push_tx: mpsc::Sender<proto_defination::fod_group::FodGroupEntity>,
    cleared_push_tx: mpsc::Sender<ClearedFodPush>,
    storage_directive_tx: mpsc::Sender<StorageDirective>,
}

impl SyncClient {
    pub fn new(
        car_endpoint: String,
        db: Db,
        storage: Arc<FrameStorage>,
        node_id: String,
        group_tx: tokio::sync::broadcast::Sender<proto_defination::fod_group::FodGroupEntity>,
    ) -> (
        Self,
        mpsc::Receiver<Command>,
        mpsc::Receiver<proto_defination::user::UserEntity>,
        mpsc::Receiver<proto_defination::mission::MissionTemplateEntity>,
        mpsc::Receiver<proto_defination::fod_group::FodGroupEntity>,
        mpsc::Receiver<ClearedFodPush>,
        mpsc::Receiver<StorageDirective>,
    ) {
        let (cmd_tx, cmd_rx) = mpsc::channel(100);
        let (user_tx, user_rx) = mpsc::channel(100);
        let (template_tx, template_rx) = mpsc::channel(100);
        let (group_push_tx, group_push_rx) = mpsc::channel(200);
        let (cleared_push_tx, cleared_push_rx) = mpsc::channel(100);
        let (storage_directive_tx, storage_directive_rx) = mpsc::channel(100);
        let client = Self {
            car_endpoint,
            db,
            storage,
            node_id,
            cmd_tx,
            user_tx,
            template_tx,
            group_tx,
            group_push_tx,
            cleared_push_tx,
            storage_directive_tx,
        };
        (
            client,
            cmd_rx,
            user_rx,
            template_rx,
            group_push_rx,
            cleared_push_rx,
            storage_directive_rx,
        )
    }

    pub fn command_sender(&self) -> mpsc::Sender<Command> {
        self.cmd_tx.clone()
    }

    pub fn user_sender(&self) -> mpsc::Sender<proto_defination::user::UserEntity> {
        self.user_tx.clone()
    }

    pub fn template_sender(&self) -> mpsc::Sender<proto_defination::mission::MissionTemplateEntity> {
        self.template_tx.clone()
    }

    pub fn group_push_sender(&self) -> mpsc::Sender<proto_defination::fod_group::FodGroupEntity> {
        self.group_push_tx.clone()
    }

    pub fn cleared_push_sender(&self) -> mpsc::Sender<ClearedFodPush> {
        self.cleared_push_tx.clone()
    }

    pub fn storage_directive_sender(&self) -> mpsc::Sender<StorageDirective> {
        self.storage_directive_tx.clone()
    }

    pub async fn run_replication_loop(
        self: Arc<Self>,
        mut cmd_rx: mpsc::Receiver<Command>,
        mut user_rx: mpsc::Receiver<proto_defination::user::UserEntity>,
        mut template_rx: mpsc::Receiver<proto_defination::mission::MissionTemplateEntity>,
        mut group_push_rx: mpsc::Receiver<proto_defination::fod_group::FodGroupEntity>,
        mut cleared_push_rx: mpsc::Receiver<ClearedFodPush>,
        mut storage_directive_rx: mpsc::Receiver<StorageDirective>,
    ) {
        let mut backoff_secs = 1;

        loop {
            tracing::info!(
                "Connecting to Car primary replication at {}",
                self.car_endpoint
            );

            match ReplicationServiceClient::connect(self.car_endpoint.clone()).await {
                Ok(client) => {
                    let mut client = client
                        .max_decoding_message_size(16 * 1024 * 1024)
                        .max_encoding_message_size(16 * 1024 * 1024);
                    tracing::info!("Replication connection established with Car primary");
                    backoff_secs = 1;

                    let cursor = self
                        .db
                        .get_upstream_cursor("car-primary")
                        .await
                        .unwrap_or(0);

                    let (out_tx, out_rx) = mpsc::channel::<ReplicaMessage>(4096);

                    // Send initial Hello
                    let hello_msg = ReplicaMessage {
                        msg: Some(ReplicaMsg::Hello(Hello {
                            node_id: self.node_id.clone(),
                            role: NodeRole::Atc as i32,
                            protocol_version: 1,
                            cursor,
                        })),
                    };
                    let _ = out_tx.try_send(hello_msg);

                    let in_stream_req = Request::new(ReceiverStream::new(out_rx));

                    match client.session(in_stream_req).await {
                        Ok(resp) => {
                            // Push any offline/dirty groups from ATC to Car after session is open
                            if let Ok(dirty_groups) = self.db.list_dirty_fod_groups(200).await {
                                for dg in dirty_groups {
                                    let _ = out_tx.try_send(ReplicaMessage {
                                        msg: Some(ReplicaMsg::GroupPush(dg.to_proto())),
                                    });
                                }
                            }
                            // Replay any storage directives (cold-stored / dropped / restored) so Car catches up after offline periods
                            if let Ok(storage_missions) = self.db.list_missions_with_non_default_storage().await {
                                for m in storage_missions {
                                    let directive = if m.storage_tier == "COLD_STORED" || m.storage_tier == "CAR_DROPPED" {
                                        "DROP_HOT_DATA"
                                    } else {
                                        "RESTORE_AVAILABLE"
                                    };
                                    let _ = out_tx.try_send(ReplicaMessage {
                                        msg: Some(ReplicaMsg::StorageDirective(StorageDirective {
                                            mission_id: m.id,
                                            directive: directive.to_string(),
                                            storage_tier: m.storage_tier,
                                            storage_epoch: m.storage_epoch,
                                            archive_size_bytes: m.archive_size_bytes,
                                            cold_stored_at_ms: m.cold_stored_at.map(|dt| dt.timestamp_millis()),
                                        })),
                                    });
                                }
                            }
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
                                    push_c = cleared_push_rx.recv() => {
                                        if let Some(cp) = push_c {
                                            let push_msg = ReplicaMessage {
                                                msg: Some(ReplicaMsg::ClearedPush(cp)),
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
                                    t = template_rx.recv() => {
                                        if let Some(tmpl) = t {
                                            let tmpl_msg = ReplicaMessage {
                                                msg: Some(ReplicaMsg::TemplateUpsert(tmpl)),
                                            };
                                            if out_tx.send(tmpl_msg).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                    sd = storage_directive_rx.recv() => {
                                        if let Some(dir) = sd {
                                            let dir_msg = ReplicaMessage {
                                                msg: Some(ReplicaMsg::StorageDirective(dir)),
                                            };
                                            if out_tx.send(dir_msg).await.is_err() {
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

                    if let Ok(Some(active)) = self.db.get_active_mission().await {
                        tracing::warn!("Car is down — terminating active mission {} on ATC replica", active.id);
                        let _ = self.db.terminate_mission(active.id).await;
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        "Could not connect to Car primary ({}): {}. Retrying in {}s...",
                        self.car_endpoint,
                        e,
                        backoff_secs
                    );

                    if let Ok(Some(active)) = self.db.get_active_mission().await {
                        tracing::warn!("Car is down — terminating active mission {} on ATC replica", active.id);
                        let _ = self.db.terminate_mission(active.id).await;
                    }
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
                                if self.db.is_mission_cold_stored(g.mission_id).await.unwrap_or(false) {
                                    continue;
                                }
                                self.ensure_mission_exists(g.mission_id).await?;
                                let _ = self.db.insert_replicated_group_if_absent(&g, false).await;
                                let _ = self.db.merge_group_biggest_fod(g.mission_id, g.group_id, g.biggest_fod.as_deref(), g.biggest_fod_size).await;
                                let incoming = zoid_db::models::versioned_from_proto(&g);
                                let mut updated_group = None;
                                let mut needs_push_back = false;

                                if let Ok(Some((_before, after, dec))) = self.db.mutate_fod_group(g.mission_id, g.group_id, |current| {
                                    let local = current.versioned();
                                    let order = zoid_replication::vv_compare(&incoming.vv, &local.vv);
                                    let dec = zoid_replication::merge_remote(&local, &incoming, &self.node_id);
                                    match dec {
                                        zoid_replication::MergeDecision::KeepLocal => {
                                            // Only push back to Car if our local vector is strictly ahead of Car's
                                            // (or local is already marked dirty). Never push back when vectors are Equal!
                                            let ahead = order == zoid_replication::VvOrder::Less || current.dirty;
                                            let write = if ahead && !current.dirty {
                                                Some(zoid_db::models::GroupWrite {
                                                    state: local.clone(),
                                                    dirty: true,
                                                })
                                            } else {
                                                None
                                            };
                                            (write, (zoid_replication::MergeDecision::KeepLocal, ahead))
                                        }
                                        zoid_replication::MergeDecision::TakeIncoming => {
                                            let write = zoid_db::models::GroupWrite {
                                                state: incoming.clone(),
                                                dirty: false,
                                            };
                                            (Some(write), (zoid_replication::MergeDecision::TakeIncoming, false))
                                        }
                                        zoid_replication::MergeDecision::Merged(merged_state) => {
                                            let merged_clone = merged_state.clone();
                                            let write = zoid_db::models::GroupWrite {
                                                state: merged_state,
                                                dirty: true,
                                            };
                                            (Some(write), (zoid_replication::MergeDecision::Merged(merged_clone), true))
                                        }
                                    }
                                }).await {
                                    match dec {
                                        (zoid_replication::MergeDecision::KeepLocal, ahead) => {
                                            needs_push_back = ahead;
                                        }
                                        (zoid_replication::MergeDecision::TakeIncoming, _) => {
                                            if let Some(a) = after {
                                                let proto = a.to_proto();
                                                let _ = self.group_tx.send(proto);
                                            }
                                        }
                                        (zoid_replication::MergeDecision::Merged(_), _) => {
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
                                if self.db.is_mission_cold_stored(f.mission_id).await.unwrap_or(false) {
                                    continue;
                                }
                                self.ensure_mission_exists(f.mission_id).await?;
                                if !change.frame_jpeg.is_empty() {
                                    if let Err(e) = self.storage.save_frame(&change.frame_jpeg).await {
                                        tracing::warn!("Failed to save replicated FOD frame {}: {}", f.id, e);
                                    }
                                }
                                self.db.upsert_replicated_fod(&f).await?;
                            }
                            change::Entity::Cleared(c) => {
                                if self.db.is_mission_cold_stored(c.mission_id).await.unwrap_or(false) {
                                    continue;
                                }
                                self.ensure_mission_exists(c.mission_id).await?;
                                for img in &change.cleared_images {
                                    if !img.is_empty() {
                                        if let Err(e) = self.storage.save_frame(img).await {
                                            tracing::warn!(
                                                "Failed to save replicated cleared FOD image for group {}: {}",
                                                c.group_id,
                                                e
                                            );
                                        }
                                    }
                                }
                                // Fallback: if any referenced sha256 is still not in local storage, fetch from Car ImageService
                                let missing_shas: Vec<String> = c
                                    .before_image_sha256
                                    .iter()
                                    .chain(c.after_image_sha256.iter())
                                    .filter(|sha| !sha.is_empty() && !self.storage.frame_path(sha).exists())
                                    .cloned()
                                    .collect();
                                if !missing_shas.is_empty() {
                                    if let Ok(mut img_client) =
                                        proto_defination::image::image_service_client::ImageServiceClient::connect(
                                            self.car_endpoint.clone(),
                                        )
                                        .await
                                    {
                                        img_client = img_client
                                            .max_decoding_message_size(32 * 1024 * 1024);
                                        for sha in missing_shas {
                                            if let Ok(resp) = img_client
                                                .download_image(tonic::Request::new(
                                                    proto_defination::image::ImageDownloadRequest {
                                                        sha256: sha.clone(),
                                                        thumbnail: false,
                                                    },
                                                ))
                                                .await
                                            {
                                                let mut stream = resp.into_inner();
                                                let mut buf = Vec::new();
                                                while let Ok(Some(chunk)) = stream.message().await {
                                                    buf.extend_from_slice(&chunk.data);
                                                }
                                                if !buf.is_empty() {
                                                    let _ = self.storage.save_frame(&buf).await;
                                                }
                                            }
                                        }
                                    }
                                }
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
                            change::Entity::MissionTemplate(t) => {
                                self.db.upsert_replicated_mission_template(&t).await?;
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
                let _ = out_tx.try_send(ack_msg);
            }
            Some(PrimaryMsg::GroupAck(ack)) => {
                if ack.outcome != "KEPT_PRIMARY" {
                    tracing::info!(
                        "GroupAck received from Car: mission={}, group={}, outcome={}",
                        ack.mission_id,
                        ack.group_id,
                        ack.outcome
                    );
                } else {
                    tracing::debug!(
                        "GroupAck received from Car: mission={}, group={}, outcome={}",
                        ack.mission_id,
                        ack.group_id,
                        ack.outcome
                    );
                }
                if let Some(merged_g) = ack.merged {
                    let incoming = zoid_db::models::versioned_from_proto(&merged_g);
                    let mut changed = false;
                    let _ = self.db.mutate_fod_group(ack.mission_id, ack.group_id, |current| {
                        let local = current.versioned();
                        changed = local != incoming;
                        let write = if changed || current.dirty {
                            Some(zoid_db::models::GroupWrite {
                                state: incoming.clone(),
                                dirty: false,
                            })
                        } else {
                            None
                        };
                        (write, ())
                    }).await;
                    if changed {
                        let _ = self.group_tx.send(merged_g);
                    }
                } else {
                    let _ = self.db.mutate_fod_group(ack.mission_id, ack.group_id, |current| {
                        let write = if current.dirty {
                            Some(zoid_db::models::GroupWrite {
                                state: current.versioned(),
                                dirty: false,
                            })
                        } else {
                            None
                        };
                        (write, ())
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
