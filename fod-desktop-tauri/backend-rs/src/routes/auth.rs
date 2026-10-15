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
use axum::extract::{Query, State};
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
use crate::models::User;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", any(login))
        .route("/logout", any(logout))
        .route("/me", any(me))
        .route("/register", any(register))
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
    let user_name = body.get("userName").and_then(Value::as_str).unwrap_or("");
    let password = body.get("password").and_then(Value::as_str).unwrap_or("");
    // PARITY: `firstName || ''` / `lastName || ''`.
    let first_name = body.get("firstName").and_then(Value::as_str).unwrap_or("");
    let last_name = body.get("lastName").and_then(Value::as_str).unwrap_or("");
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
    // id: Prisma @default(uuid()) is app-side; role GUEST; isActive default true;
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
    .bind(true)
    .bind("GUEST")
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
