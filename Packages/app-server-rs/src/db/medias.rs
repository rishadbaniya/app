use async_graphql::{Context, Object, Schema, Subscription, ID, OutputType, SimpleObject};
use futures_util::{Stream, stream, TryFutureExt};
use serde::Deserialize;
use tokio_postgres::{Client};

use crate::utils::general::{get_first_item_from_stream_in_result_in_future, handle_generic_gql_collection_request, GQLSet, handle_generic_gql_doc_request};

#[derive(SimpleObject, Clone, Deserialize)]
pub struct Media {
    id: ID,
    accessPolicy: String,
	creator: String,
	createdAt: i64,
    name: String,
    r#type: String,
    url: String,
    description: String,
}
impl From<tokio_postgres::row::Row> for Media {
	fn from(row: tokio_postgres::row::Row) -> Self {
		Self {
            id: ID::from(&row.get::<_, String>("id")),
            accessPolicy: row.get("accessPolicy"),
            creator: row.get("creator"),
            createdAt: row.get("createdAt"),
            name: row.get("name"),
            r#type: row.get("type"),
            url: row.get("url"),
            description: row.get("description"),
		}
	}
}

#[derive(Clone)] pub struct GQLSet_Media { nodes: Vec<Media> }
#[Object] impl GQLSet_Media { async fn nodes(&self) -> &Vec<Media> { &self.nodes } }
impl GQLSet<Media> for GQLSet_Media {
    fn from(entries: Vec<Media>) -> GQLSet_Media { Self { nodes: entries } }
    fn nodes(&self) -> &Vec<Media> { &self.nodes }
}

#[derive(Default)]
pub struct SubscriptionShard_Media;
#[Subscription]
impl SubscriptionShard_Media {
    async fn medias<'a>(&self, ctx: &'a Context<'_>, id: Option<String>, filter: Option<serde_json::Value>) -> impl Stream<Item = GQLSet_Media> + 'a {
        handle_generic_gql_collection_request::<Media, GQLSet_Media>(ctx, "medias", filter).await
    }
    async fn media<'a>(&self, ctx: &'a Context<'_>, id: String, filter: Option<serde_json::Value>) -> impl Stream<Item = Option<Media>> + 'a {
        handle_generic_gql_doc_request::<Media>(ctx, "medias", &id).await
    }
}