use proto_defination::bite::bite_service_server::BiteService;
use proto_defination::bite::{
    BiteState, BiteStreamSubscription, GetBiteStateRequest, GetHistoricalDataRequest,
    HistoricalBiteResponse,
};
use std::pin::Pin;
use std::sync::Arc;
use tokio_stream::wrappers::WatchStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use zoid_bite::BiteAggregator;

pub struct BiteServiceImpl {
    aggregator: Arc<BiteAggregator>,
}

impl BiteServiceImpl {
    pub fn new(aggregator: Arc<BiteAggregator>) -> Self {
        Self { aggregator }
    }
}

#[tonic::async_trait]
impl BiteService for BiteServiceImpl {
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
