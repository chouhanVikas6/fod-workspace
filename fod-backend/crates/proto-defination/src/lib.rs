pub mod common {
    tonic::include_proto!("zoid.common");
}

pub mod mission_control {
    tonic::include_proto!("zoid.mission_control");
}

pub mod mission {
    tonic::include_proto!("zoid.mission");
}

pub mod fod_group {
    tonic::include_proto!("zoid.fod_group");
}

pub mod fod {
    tonic::include_proto!("zoid.fod");
}

pub mod cleared_fod {
    tonic::include_proto!("zoid.cleared_fod");
}

pub mod bite {
    tonic::include_proto!("zoid.bite");
}

pub mod image {
    tonic::include_proto!("zoid.image");
}

pub mod ingest {
    tonic::include_proto!("zoid.ingest");
}

pub mod replication {
    tonic::include_proto!("zoid.replication");
}

pub mod user {
    tonic::include_proto!("zoid.user");
}
