use rust_shared::anyhow::{anyhow, Error};
use rust_shared::async_graphql::Object;
use rust_shared::async_graphql::{InputObject, SimpleObject, ID};
use rust_shared::db_constants::SYSTEM_USER_ID;
use rust_shared::rust_macros::wrap_slow_macros;
use rust_shared::serde::{Deserialize, Serialize};
use rust_shared::serde_json::{json, Value};
use rust_shared::utils::time::time_since_epoch_ms_i64;
use rust_shared::utils::type_aliases::JSONValue;
use rust_shared::{anyhow, async_graphql, serde_json, GQLError};
use tracing::info;

use crate::db::access_policies::get_access_policy;
use crate::db::commands::_command::{command_boilerplate, delete_db_entry_by_id, gql_placeholder, set_db_entry_by_id, update_field, update_field_nullable};
use crate::db::general::permission_helpers::{assert_user_can_delete, assert_user_can_modify};
use crate::db::general::sign_in_::jwt_utils::{get_user_info_from_gql_ctx, resolve_jwt_to_user_info};
use crate::db::node_phrasings::{get_node_phrasing, NodePhrasing, NodePhrasingInput, NodePhrasingUpdates};
use crate::db::users::User;
use crate::utils::db::accessors::AccessorContext;
use crate::utils::general::data_anchor::DataAnchorFor1;
use rust_shared::utils::db::uuid::new_uuid_v4_as_b64;

use super::_command::{upsert_db_entry_by_id_for_struct, NoExtras};

wrap_slow_macros! {

#[derive(Default)] pub struct MutationShard_UpdateNodePhrasing;
#[Object] impl MutationShard_UpdateNodePhrasing {
	async fn update_node_phrasing(&self, gql_ctx: &async_graphql::Context<'_>, input: UpdateNodePhrasingInput, only_validate: Option<bool>) -> Result<UpdateNodePhrasingResult, GQLError> {
		command_boilerplate!(gql_ctx, input, only_validate, update_node_phrasing);
	}
}

#[derive(InputObject, Serialize, Deserialize)]
pub struct UpdateNodePhrasingInput {
	pub id: String,
	pub updates: NodePhrasingUpdates,
}

#[derive(SimpleObject, Debug)]
pub struct UpdateNodePhrasingResult {
	#[graphql(name = "_useTypenameFieldInstead")] __: String,
}

}

pub async fn update_node_phrasing(ctx: &AccessorContext<'_>, actor: &User, _is_root: bool, input: UpdateNodePhrasingInput, _extras: NoExtras) -> Result<UpdateNodePhrasingResult, Error> {
	let UpdateNodePhrasingInput { id, updates } = input;

	let old_data = get_node_phrasing(&ctx, &id).await?;
	assert_user_can_modify(&ctx, &actor, &old_data).await?;
	let new_data = NodePhrasing {
		r#type: update_field(updates.r#type, old_data.r#type),
		text_base: update_field(updates.text_base, old_data.text_base),
		text_negation: update_field_nullable(updates.text_negation, old_data.text_negation),
		text_question: update_field_nullable(updates.text_question, old_data.text_question),
		text_narrative: update_field_nullable(updates.text_narrative, old_data.text_narrative),
		note: update_field_nullable(updates.note, old_data.note),
		terms: update_field(updates.terms, old_data.terms),
		references: update_field(updates.references, old_data.references),
		..old_data
	};

	upsert_db_entry_by_id_for_struct(&ctx, "nodePhrasings".to_owned(), id.to_string(), new_data).await?;

	Ok(UpdateNodePhrasingResult { __: gql_placeholder() })
}
