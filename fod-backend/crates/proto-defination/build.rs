fn main() -> Result<(), Box<dyn std::error::Error>> {
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
    ];

    println!("cargo:rerun-if-changed=../../proto");

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional")
        .compile_protos(&protos, &[proto_dir])?;

    Ok(())
}
