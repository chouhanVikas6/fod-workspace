use proto_defination::bite::bite_service_client::BiteServiceClient;
use proto_defination::bite::bite_service_server::BiteService;
use proto_defination::bite::{
    BiteState, BiteStreamSubscription, GetBiteStateRequest, GetHistoricalDataRequest,
    HistoricalBiteResponse, PcHealthMetrics,
};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio_stream::wrappers::WatchStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use zoid_bite::BiteAggregator;

pub struct AtcBiteServiceImpl {
    aggregator: Arc<BiteAggregator>,
}

impl AtcBiteServiceImpl {
    pub fn new(aggregator: Arc<BiteAggregator>) -> Self {
        Self { aggregator }
    }
}

#[tonic::async_trait]
impl BiteService for AtcBiteServiceImpl {
    async fn get_bite_state(
        &self,
        _request: Request<GetBiteStateRequest>,
    ) -> Result<Response<BiteState>, Status> {
        Ok(Response::new(self.aggregator.current_state()))
    }

    async fn get_historical_data(
        &self,
        request: Request<GetHistoricalDataRequest>,
    ) -> Result<Response<HistoricalBiteResponse>, Status> {
        let limit = request.into_inner().limit as usize;
        let history = self.aggregator.get_history(limit).await;
        Ok(Response::new(HistoricalBiteResponse { history }))
    }

    type StreamBiteHealthStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<BiteState, Status>> + Send + 'static>>;

    async fn stream_bite_health(
        &self,
        _request: Request<BiteStreamSubscription>,
    ) -> Result<Response<Self::StreamBiteHealthStream>, Status> {
        let rx = self.aggregator.subscribe();
        let stream = WatchStream::new(rx).map(Ok);
        Ok(Response::new(Box::pin(stream)))
    }
}

async fn read_atc_host_metrics() -> PcHealthMetrics {
    let mut temp_c = 0.0;
    #[cfg(target_os = "linux")]
    {
        if let Ok(mut dir) = tokio::fs::read_dir("/sys/class/thermal").await {
            let mut max_temp = 0.0_f64;
            while let Ok(Some(entry)) = dir.next_entry().await {
                let name = entry.file_name();
                if name.to_string_lossy().starts_with("thermal_zone") {
                    if let Ok(raw) = tokio::fs::read_to_string(entry.path().join("temp")).await {
                        if let Ok(milli) = raw.trim().parse::<f64>() {
                            let c = if milli > 1000.0 { milli / 1000.0 } else { milli };
                            if c > max_temp && c < 150.0 {
                                max_temp = c;
                            }
                        }
                    }
                }
            }
            temp_c = (max_temp * 10.0).round() / 10.0;
        }
    }

    let mut mem_pct = 0.0;
    #[cfg(target_os = "linux")]
    {
        if let Ok(meminfo) = tokio::fs::read_to_string("/proc/meminfo").await {
            let mut total_kb = 0.0_f64;
            let mut avail_kb = 0.0_f64;
            for line in meminfo.lines() {
                if let Some(rest) = line.strip_prefix("MemTotal:") {
                    total_kb = rest.split_whitespace().next().and_then(|v| v.parse().ok()).unwrap_or(0.0);
                } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
                    avail_kb = rest.split_whitespace().next().and_then(|v| v.parse().ok()).unwrap_or(0.0);
                }
            }
            if total_kb > 0.0 {
                mem_pct = (((total_kb - avail_kb) / total_kb) * 1000.0).round() / 10.0;
            }
        }
    }

    let mut disk_pct = 0.0;
    #[cfg(unix)]
    {
        if let Ok(out) = tokio::process::Command::new("df").args(["-P", "/"]).output().await {
            if let Ok(stdout) = String::from_utf8(out.stdout) {
                if let Some(line) = stdout.lines().nth(1) {
                    if let Some(pct_str) = line.split_whitespace().nth(4) {
                        disk_pct = pct_str.trim_end_matches('%').parse::<f64>().unwrap_or(0.0);
                    }
                }
            }
        }
    }

    PcHealthMetrics {
        cpu_usage_percent: 0.0,
        memory_usage_percent: mem_pct,
        disk_usage_percent: disk_pct,
        temperature_c: temp_c,
    }
}

/// Periodically collects ATC host health and pulls Car BITE state so all
/// collectors can query Car & ATC health from ATC as well as Car.
pub fn spawn_health_collector(car_url: String, bite: Arc<BiteAggregator>) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(2));
        loop {
            tick.tick().await;
            let atc_metrics = read_atc_host_metrics().await;
            bite.update_pc_health("atc-server".to_string(), atc_metrics).await;

            if let Ok(mut client) = BiteServiceClient::connect(car_url.clone()).await {
                if let Ok(resp) = client
                    .get_bite_state(Request::new(GetBiteStateRequest {}))
                    .await
                {
                    let car_state = resp.into_inner();
                    bite.update_state(|st| {
                        st.primary_gps = car_state.primary_gps;
                        st.secondary_gps = car_state.secondary_gps;
                        st.cameras = car_state.cameras;
                        st.ping_latency_ms = car_state.ping_latency_ms;
                        st.connected = car_state.connected;
                        for (node, metrics) in car_state.pc_nodes {
                            if node != "atc-server" {
                                st.pc_nodes.insert(node, metrics);
                            }
                        }
                    })
                    .await;
                }
            } else {
                bite.update_state(|st| {
                    st.connected = false;
                })
                .await;
            }
        }
    });
}
