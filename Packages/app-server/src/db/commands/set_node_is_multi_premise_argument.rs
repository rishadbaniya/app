use rust_shared::anyhow::{anyhow, ensure, Error};
use rust_shared::async_graphql::Object;
use rust_shared::async_graphql::{InputObject, SimpleObject, ID};
use rust_shared::db_constants::SYSTEM_USER_ID;
use rust_shared::rust_macros::wrap_slow_macros;
use rust_shared::serde::{Deserialize, Serialize};
use rust_shared::serde_json::{json, Value};
use rust_shared::utils::general_::extensions::ToOwnedV;
use rust_shared::utils::time::time_since_epoch_ms_i64;
use rust_shared::utils::type_aliases::JSONValue;
use rust_shared::{anyhow, async_graphql, serde_json, GQLError};
use tracing::info;

use crate::db::commands::_shared::update_node_rating_summaries::update_node_rating_summaries;
use crate::db::commands::delete_node_rating::{delete_node_rating, DeleteNodeRatingInput};
use crate::db::general::permission_helpers::assert_user_can_modify;
use crate::db::general::sign_in_::jwt_utils::{get_user_info_from_gql_ctx, resolve_jwt_to_user_info};
use crate::db::nodes::get_node;
use crate::db::nodes_::_node::Node;
use crate::db::users::User;
use crate::utils::db::accessors::AccessorContext;
use crate::utils::general::data_anchor::DataAnchorFor1;
use rust_shared::utils::db::uuid::new_uuid_v4_as_b64;

use super::_command::{command_boilerplate, gql_placeholder, update_field_nullable, upsert_db_entry_by_id_for_struct, NoExtras};

wrap_slow_macros! {

#[derive(Default)] pub struct MutationShard_SetNodeIsMultiPremiseArgument;
#[Object] impl MutationShard_SetNodeIsMultiPremiseArgument {
	async fn set_node_is_multi_premise_argument(&self, gql_ctx: &async_graphql::Context<'_>, input: SetNodeIsMultiPremiseArgumentInput, only_validate: Option<bool>) -> Result<SetNodeIsMultiPremiseArgumentResult, GQLError> {
		command_boilerplate!(gql_ctx, input, only_validate, set_node_is_multi_premise_argument);
	}
}

#[derive(InputObject, Serialize, Deserialize)]
pub struct SetNodeIsMultiPremiseArgumentInput {
	pub id: String,
	pub multiPremiseArgument: Option<bool>,
}

#[derive(SimpleObject, Debug)]
pub struct SetNodeIsMultiPremiseArgumentResult {
	#[graphql(name = "_useTypenameFieldInstead")] __: String,
}

}

// todo: eventually remove this command, since unused
pub async fn set_node_is_multi_premise_argument(ctx: &AccessorContext<'_>, actor: &User, _is_root: bool, input: SetNodeIsMultiPremiseArgumentInput, _extras: NoExtras) -> Result<SetNodeIsMultiPremiseArgumentResult, Error> {
	let SetNodeIsMultiPremiseArgumentInput { id, multiPremiseArgument } = input;

	let old_data = get_node(&ctx, &id).await?;
	assert_user_can_modify(&ctx, &actor, &old_data).await?;
	let new_data = Node { multiPremiseArgument, ..old_data };

	upsert_db_entry_by_id_for_struct(&ctx, "nodes".to_owned(), id.to_string(), new_data).await?;

	Ok(SetNodeIsMultiPremiseArgumentResult { __: gql_placeholder() })
}
