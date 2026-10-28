//! Auth routes — OWNED BY AGENT R3.
//! Port of src/pages/api/auth/** — JWT sign/verify + bcrypt. PARITY: same
//! token claims + secret (see config.rs jwt_secret note) so existing
//! localStorage sessions keep working; same response bodies.
//!
//! Secret parity: Node signs with `AUTH_SECRET_KEY` (login.ts, via
//! clientConfig.ts) and verifies with `SECRET_KEY` (me.ts/register.ts); both
//! resolve to `process.env.JWT_SECRET || 'your-secret-key'`, so a single
//! `state.cfg.jwt_secret` covers sign + verify.
//! Claims parity: `jwt.sign(payload, secret)` (default HS256, no `exp`) where
//! payload = { id, userName, role, firstName, lastName, isActive }. jsonwebtoken
//! adds `iat` to the SIGNED token by default, but the response `user` object is
//! the pre-sign payload WITHOUT `iat`. `me` echoes the DECODED token verbatim
//! (so its `user` DOES include `iat`) — matches Node returning `jwt.verify(...)`.

use std::collections::HashSet;

use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::{Json, Router};
use jsonwebtoken::{
    decode, encode, get_current_timestamp, Algorithm, DecodingKey, EncodingKey, Header, Validation,
};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::error::ApiError;
use crate::models::{Role, User};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", any(login))
        .route("/logout", any(logout))
        .route("/me", any(me))
        .route("/register", any(register))
        .route("/users", any(users_collection))
        .route("/users/update", any(update_user_body))
        .route("/users/delete", any(delete_user_body))
        .route("/users/{id}", any(user_by_id))
}

/// PARITY: `res.setHeader('Allow',[allow]); res.status(405).end(`Method ${m} Not Allowed`)`
/// — plain-text body, single Allow header.
fn method_not_allowed(method: &Method, allow: &str) -> Response {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        [(header::ALLOW, allow)],
        format!("Method {} Not Allowed", method.as_str()),
    )
        .into_response()
}

/// The `payload` object Node builds for the token + response body.
/// NOTE: no password (never leaks), no dates — matches Node exactly.
fn user_payload(u: &User) -> Value {
    json!({
        "id": u.id.clone(),
        "userName": u.username.clone(),
        "role": u.role,
        "firstName": u.first_name.clone(),
        "lastName": u.last_name.clone(),
        "isActive": u.is_active,
    })
}

/// `jwt.sign(payload, secret)` — HS256, no expiry. jsonwebtoken (like the Node
/// lib) stamps `iat`; we add it to the signed claims but NOT to the returned
/// `user` object (parity with Node returning the raw `payload`).
fn sign_token(state: &AppState, payload: &Value) -> Result<String, ApiError> {
    let mut claims = payload.clone();
    if let Value::Object(map) = &mut claims {
        map.insert("iat".to_string(), json!(get_current_timestamp()));
    }
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
    )
    .map_err(ApiError::internal)
}

fn bad_request_missing() -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": "Missing username or password" })),
    )
        .into_response()
}

/// PARITY: Node handlers' own catch → `res.status(500).json({ error: 'Internal
/// server error' })` (no `details`, unlike the generic error.rs envelope).
fn internal_error() -> Response {
    ApiError::msg(500, "Internal server error").into_response()
}

// ---- /api/auth/login (GET; query userName + password) ----------------------
async fn login(
    method: Method,
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        // PARITY: login only handles GET but advertises Allow: POST.
        return method_not_allowed(&method, "POST");
    }
    let user_name = q.get("userName").map(String::as_str).unwrap_or("");
    let password = q.get("password").map(String::as_str).unwrap_or("");
    if user_name.is_empty() || password.is_empty() {
        return bad_request_missing();
    }

    let found = sqlx::query_as::<_, User>(r#"SELECT * FROM "User" WHERE "username" = $1"#)
        .bind(user_name)
        .fetch_optional(&state.db)
        .await;
    let user = match found {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid credentials" })),
            )
                .into_response()
        }
        Err(_) => return internal_error(),
    };

    // bcryptjs $2a$/$2b$ hashes verify with the rust bcrypt crate.
    let is_match = bcrypt::verify(password, &user.password).unwrap_or(false);
    if !is_match {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid credentials" })),
        )
            .into_response();
    }

    let payload = user_payload(&user);
    match sign_token(&state, &payload) {
        Ok(token) => (
            StatusCode::OK,
            Json(json!({ "token": token, "user": payload })),
        )
            .into_response(),
        Err(e) => e.into_response(),
    }
}

// ---- /api/auth/logout (any method) -----------------------------------------
async fn logout() -> Response {
    // PARITY: no method check, no session — always 200 { success: true }.
    (StatusCode::OK, Json(json!({ "success": true }))).into_response()
}

// ---- /api/auth/me (any method; Bearer header or ?token=) -------------------
async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    // PARITY: `if (authorization && startsWith('Bearer ')) token = split(' ')[1]
    //          else if (query.token) token = query.token`.
    let mut token: Option<String> = None;
    if let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        && auth.starts_with("Bearer ")
    {
        token = Some(auth.split(' ').nth(1).unwrap_or("").to_string());
    }
    if token.is_none()
        && let Some(t) = q.get("token")
    {
        token = Some(t.clone());
    }
    // `if (!token)` — an empty string is falsy too.
    let token = token.unwrap_or_default();
    if token.is_empty() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "No token provided" })),
        )
            .into_response();
    }

    // Loosest validation: verify HS256 signature only. Node tokens carry no
    // `exp`/`aud`/`nbf`, so requiring them (the jsonwebtoken default) would
    // reject valid sessions.
    let mut validation = Validation::new(Algorithm::HS256);
    validation.required_spec_claims = HashSet::new();
    validation.validate_exp = false;
    validation.validate_nbf = false;
    validation.validate_aud = false;

    match decode::<Value>(
        &token,
        &DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
        &validation,
    ) {
        // Echo decoded claims verbatim (includes `iat`) — parity with
        // `return res.status(200).json({ user })`.
        Ok(data) => (StatusCode::OK, Json(json!({ "user": data.claims }))).into_response(),
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid token" })),
        )
            .into_response(),
    }
}

// ---- /api/auth/register (POST; JSON body) ----------------------------------
async fn register(method: Method, State(state): State<AppState>, body: Bytes) -> Response {
    if method != Method::POST {
        return method_not_allowed(&method, "POST");
    }
    let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let user_name = body
        .get("userName")
        .or_else(|| body.get("username"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let password = body.get("password").and_then(Value::as_str).unwrap_or("");
    // PARITY: `firstName || ''` / `lastName || ''`.
    let first_name = body.get("firstName").and_then(Value::as_str).unwrap_or("");
    let last_name = body.get("lastName").and_then(Value::as_str).unwrap_or("");
    let role_str = body
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("GUEST")
        .to_uppercase();
    let role = match role_str.as_str() {
        "ADMIN" => "ADMIN",
        "COLLECTOR" => "COLLECTOR",
        _ => "GUEST",
    };
    let is_active = body.get("isActive").and_then(Value::as_bool).unwrap_or(true);

    if user_name.is_empty() || password.is_empty() {
        return bad_request_missing();
    }

    // Existence check first (matches Node's findUnique → 409).
    let existing = sqlx::query_scalar::<_, String>(r#"SELECT "id" FROM "User" WHERE "username" = $1"#)
        .bind(user_name)
        .fetch_optional(&state.db)
        .await;
    match existing {
        Ok(Some(_)) => {
            return (
                StatusCode::CONFLICT,
                Json(json!({ "error": "Username already exists" })),
            )
                .into_response()
        }
        Ok(None) => {}
        Err(_) => return internal_error(),
    }

    // PARITY: `bcrypt.hash(password, 10)` — cost 10 (NOT the crate DEFAULT_COST 12).
    let hashed = match bcrypt::hash(password, 10) {
        Ok(h) => h,
        Err(_) => return internal_error(),
    };
    // id: Prisma @default(uuid()) is app-side; role GUEST/specified; isActive default true;
    // createdAt = new Date(); updatedAt (@updatedAt) = now() on create.
    let id = uuid::Uuid::new_v4().to_string();
    let inserted = sqlx::query_as::<_, User>(
        r#"INSERT INTO "User"
             ("id","username","password","firstName","lastName","isActive","role","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7::"Role",now(),now())
           RETURNING *"#,
    )
    .bind(&id)
    .bind(user_name)
    .bind(&hashed)
    .bind(first_name)
    .bind(last_name)
    .bind(is_active)
    .bind(role)
    .fetch_one(&state.db)
    .await;
    let user = match inserted {
        Ok(u) => u,
        Err(_) => return internal_error(),
    };

    let payload = user_payload(&user);
    match sign_token(&state, &payload) {
        Ok(token) => (
            StatusCode::CREATED,
            Json(json!({ "token": token, "user": payload })),
        )
            .into_response(),
        Err(e) => e.into_response(),
    }
}

// ---- /api/auth/users (GET: list, POST: create) -----------------------------
async fn users_collection(
    method: Method,
    State(state): State<AppState>,
    body: Bytes,
) -> Response {
    match method {
        Method::GET => list_users(State(state)).await,
        Method::POST => register(Method::POST, State(state), body).await,
        _ => method_not_allowed(&method, "GET, POST"),
    }
}

async fn list_users(State(state): State<AppState>) -> Response {
    let rows = sqlx::query_as::<_, User>(r#"SELECT * FROM "User" ORDER BY "createdAt" DESC"#)
        .fetch_all(&state.db)
        .await;
    match rows {
        Ok(users) => {
            let list: Vec<Value> = users
                .iter()
                .map(|u| {
                    json!({
                        "id": u.id,
                        "userName": u.username,
                        "username": u.username,
                        "role": u.role,
                        "firstName": u.first_name,
                        "lastName": u.last_name,
                        "isActive": u.is_active,
                        "createdAt": u.created_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                        "updatedAt": u.updated_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "users": list }))).into_response()
        }
        Err(e) => {
            eprintln!("Failed to fetch users: {e}");
            internal_error()
        }
    }
}

// ---- /api/auth/users/update (POST) -----------------------------------------
async fn update_user_body(State(state): State<AppState>, body: Bytes) -> Response {
    let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let id = body.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Missing user id" })),
        )
            .into_response();
    }

    let existing = sqlx::query_as::<_, User>(r#"SELECT * FROM "User" WHERE "id" = $1"#)
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    let user = match existing {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "User not found" })),
            )
                .into_response()
        }
        Err(_) => return internal_error(),
    };

    let first_name = body
        .get("firstName")
        .and_then(Value::as_str)
        .unwrap_or(&user.first_name);
    let last_name = body
        .get("lastName")
        .and_then(Value::as_str)
        .unwrap_or(&user.last_name);
    let is_active = body
        .get("isActive")
        .and_then(Value::as_bool)
        .unwrap_or(user.is_active);
    let role_str = body
        .get("role")
        .and_then(Value::as_str)
        .map(|s| s.to_uppercase());
    let role = match role_str.as_deref() {
        Some("ADMIN") => "ADMIN",
        Some("COLLECTOR") => "COLLECTOR",
        Some("GUEST") => "GUEST",
        _ => match user.role {
            Role::Admin => "ADMIN",
            Role::Collector => "COLLECTOR",
            Role::Guest => "GUEST",
        },
    };

    let password_hash = if let Some(new_pwd) = body
        .get("password")
        .and_then(Value::as_str)
        .filter(|p| !p.is_empty())
    {
        match bcrypt::hash(new_pwd, 10) {
            Ok(h) => h,
            Err(_) => return internal_error(),
        }
    } else {
        user.password.clone()
    };

    let updated = sqlx::query_as::<_, User>(
        r#"UPDATE "User"
           SET "firstName" = $1, "lastName" = $2, "isActive" = $3, "role" = $4::"Role", "password" = $5, "updatedAt" = now()
           WHERE "id" = $6
           RETURNING *"#,
    )
    .bind(first_name)
    .bind(last_name)
    .bind(is_active)
    .bind(role)
    .bind(password_hash)
    .bind(id)
    .fetch_one(&state.db)
    .await;

    match updated {
        Ok(u) => (
            StatusCode::OK,
            Json(json!({ "success": true, "user": user_payload(&u) })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("Failed to update user: {e}");
            internal_error()
        }
    }
}

// ---- /api/auth/users/delete (POST) -----------------------------------------
async fn delete_user_body(State(state): State<AppState>, body: Bytes) -> Response {
    let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let id = body.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Missing user id" })),
        )
            .into_response();
    }

    let is_target_admin = sqlx::query_scalar::<_, bool>(
        r#"SELECT "role" = 'ADMIN'::"Role" FROM "User" WHERE "id" = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(false);

    if is_target_admin {
        let admin_count: Option<i64> = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM "User" WHERE "role" = 'ADMIN'::"Role""#,
        )
        .fetch_one(&state.db)
        .await
        .unwrap_or(None);

        if admin_count.unwrap_or(0) <= 1 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Cannot delete the only remaining admin" })),
            )
                .into_response();
        }
    }

    let res = sqlx::query(r#"DELETE FROM "User" WHERE "id" = $1"#)
        .bind(id)
        .execute(&state.db)
        .await;

    match res {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("Failed to delete user: {e}");
            internal_error()
        }
    }
}

// ---- /api/auth/users/{id} (GET, PUT, PATCH, DELETE) ------------------------
async fn user_by_id(
    method: Method,
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    match method {
        Method::GET => {
            let found = sqlx::query_as::<_, User>(r#"SELECT * FROM "User" WHERE "id" = $1"#)
                .bind(&id)
                .fetch_optional(&state.db)
                .await;
            match found {
                Ok(Some(u)) => (StatusCode::OK, Json(json!({ "user": user_payload(&u) }))).into_response(),
                Ok(None) => (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "User not found" })),
                )
                    .into_response(),
                Err(_) => internal_error(),
            }
        }
        Method::PUT | Method::PATCH => {
            let mut val: Value = serde_json::from_slice(&body).unwrap_or(json!({}));
            if let Value::Object(ref mut map) = val {
                map.insert("id".to_string(), json!(id));
            }
            let modified = Bytes::from(serde_json::to_vec(&val).unwrap_or_default());
            update_user_body(State(state), modified).await
        }
        Method::DELETE => {
            let val = json!({ "id": id });
            let modified = Bytes::from(serde_json::to_vec(&val).unwrap_or_default());
            delete_user_body(State(state), modified).await
        }
        _ => method_not_allowed(&method, "GET, PUT, PATCH, DELETE"),
    }
}
