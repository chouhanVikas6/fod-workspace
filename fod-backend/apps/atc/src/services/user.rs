use proto_defination::user::user_service_server::UserService;
use proto_defination::user::{
    DeleteUserRequest, DeleteUserResponse, GetUsersRequest, GetUsersResponse, SyncUsersRequest,
    SyncUsersResponse, UpsertUserResponse, UserEntity,
};
use tokio::sync::mpsc;
use tonic::{Request, Response, Status};
use zoid_db::Db;

pub struct AtcUserServiceImpl {
    db: Db,
    user_tx: mpsc::Sender<UserEntity>,
}

impl AtcUserServiceImpl {
    pub fn new(db: Db, user_tx: mpsc::Sender<UserEntity>) -> Self {
        Self { db, user_tx }
    }
}

#[tonic::async_trait]
impl UserService for AtcUserServiceImpl {
    async fn upsert_user(
        &self,
        request: Request<UserEntity>,
    ) -> Result<Response<UpsertUserResponse>, Status> {
        let user = request.into_inner();
        let row = self
            .db
            .upsert_replicated_user(&user)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let proto_user = row.to_proto();
        // Relay upstream to Car primary
        let _ = self.user_tx.send(proto_user.clone()).await;

        Ok(Response::new(UpsertUserResponse {
            success: true,
            user: Some(proto_user),
            error: String::new(),
        }))
    }

    async fn delete_user(
        &self,
        request: Request<DeleteUserRequest>,
    ) -> Result<Response<DeleteUserResponse>, Status> {
        let req = request.into_inner();
        let username = req.username.trim();
        if username.is_empty() {
            return Err(Status::invalid_argument("Username cannot be empty"));
        }

        let _ = self.db.delete_user_by_username(username).await;

        Ok(Response::new(DeleteUserResponse {
            success: true,
            error: String::new(),
        }))
    }

    async fn get_users(
        &self,
        _request: Request<GetUsersRequest>,
    ) -> Result<Response<GetUsersResponse>, Status> {
        let rows = self
            .db
            .get_all_users()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        let users = rows.into_iter().map(|r| r.to_proto()).collect();
        Ok(Response::new(GetUsersResponse { users }))
    }

    async fn sync_users(
        &self,
        request: Request<SyncUsersRequest>,
    ) -> Result<Response<SyncUsersResponse>, Status> {
        let since_ms = request.into_inner().since_ms;
        let since_dt = chrono::DateTime::from_timestamp_millis(since_ms)
            .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
        let rows = self
            .db
            .get_users_since(since_dt)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        let users = rows.into_iter().map(|r| r.to_proto()).collect();
        Ok(Response::new(SyncUsersResponse { users }))
    }
}
