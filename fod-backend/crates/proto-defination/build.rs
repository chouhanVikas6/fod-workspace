fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("PROTOC").is_err() {
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let cargo_protoc = std::path::PathBuf::from(&user_profile)
                .join(".cargo")
                .join("bin")
                .join("protoc.exe");
            if cargo_protoc.exists() {
                // SAFETY: build.rs is single-threaded at this point
                unsafe {
                    std::env::set_var("PROTOC", &cargo_protoc);
                }
            }
        }
    }
    if std::env::var("PROTOC").is_err() {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let winget_protoc = std::path::PathBuf::from(&local_app_data)
                .join("Microsoft")
                .join("WinGet")
                .join("Packages")
                .join("Google.Protobuf_Microsoft.Winget.Source_8wekyb3d8bbwe")
                .join("bin")
                .join("protoc.exe");
            if winget_protoc.exists() {
                // SAFETY: build.rs is single-threaded at this point
                unsafe {
                    std::env::set_var("PROTOC", &winget_protoc);
                }
            }
        }
    }

    let proto_dir = "../../proto";
    let protos = [
        format!("{}/common.proto", proto_dir),
        format!("{}/mission_control.proto", proto_dir),
        format!("{}/mission.proto", proto_dir),
        format!("{}/fod_group.proto", proto_dir),
        format!("{}/fod.proto", proto_dir),
        format!("{}/cleared_fod.proto", proto_dir),
        format!("{}/bite.proto", proto_dir),
        format!("{}/image.proto", proto_dir),
        format!("{}/ingest.proto", proto_dir),
        format!("{}/replication.proto", proto_dir),
        format!("{}/user.proto", proto_dir),
    ];

    println!("cargo:rerun-if-changed=../../proto");

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional")
        .compile_protos(&protos, &[proto_dir])?;

    Ok(())
}
