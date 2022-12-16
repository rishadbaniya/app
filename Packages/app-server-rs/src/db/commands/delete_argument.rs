use rust_shared::async_graphql::{ID, SimpleObject, InputObject};
use rust_shared::rust_macros::wrap_slow_macros;
use rust_shared::serde_json::{Value, json};
use rust_shared::utils::db_constants::SYSTEM_USER_ID;
use rust_shared::{async_graphql, serde_json, anyhow, GQLError};
use rust_shared::async_graphql::{Object};
use rust_shared::utils::type_aliases::JSONValue;
use rust_shared::anyhow::{anyhow, Error};
use rust_shared::utils::time::{time_since_epoch_ms_i64};
use rust_shared::serde::{Deserialize};
use tracing::info;

use crate::db::access_policies::get_access_policy;
use crate::db::commands::_command::{delete_db_entry_by_id, gql_placeholder, command_boilerplate};
use crate::db::general::permission_helpers::assert_user_can_delete;
use crate::db::general::sign_in::jwt_utils::{resolve_jwt_to_user_info, get_user_info_from_gql_ctx};
use crate::db::users::User;
use crate::utils::db::accessors::AccessorContext;
use rust_shared::utils::db::uuid::new_uuid_v4_as_b64;
use crate::utils::general::data_anchor::{DataAnchorFor1};

use super::_command::{set_db_entry_by_id_for_struct, NoExtras};
use super::_shared::increment_map_edits::increment_map_edits_if_valid;
use super::delete_node::{delete_node, DeleteNodeInput};
use super::unlink_node::{UnlinkNodeInput, unlink_node};

wrap_slow_macros!{

#[derive(Default)] pub struct MutationShard_DeleteArgument;
#[Object] impl MutationShard_DeleteArgument {
	async fn delete_argument(&self, gql_ctx: &async_graphql::Context<'_>, input: DeleteArgumentInput, only_validate: Option<bool>) -> Result<DeleteArgumentResult, GQLError> {
		command_boilerplate!(gql_ctx, input, only_validate, delete_argument);
    }
}

#[derive(InputObject, Deserialize)]
pub struct DeleteArgumentInput {
	pub mapID: Option<String>,
	pub argumentID: String,
	pub claimID: String,
	pub deleteClaim: bool,
}

#[derive(SimpleObject, Debug)]
pub struct DeleteArgumentResult {
	#[graphql(name = "_useTypenameFieldInstead")] __: String,
}

}

pub async fn delete_argument(ctx: &AccessorContext<'_>, user_info: &User, input: DeleteArgumentInput, _extras: NoExtras) -> Result<DeleteArgumentResult, Error> {
	let DeleteArgumentInput { mapID, argumentID, claimID, deleteClaim } = input;
	let result = DeleteArgumentResult { __: gql_placeholder() };
	
	if deleteClaim {
		delete_node(ctx, user_info, DeleteNodeInput { mapID: None, nodeID: claimID }, Default::default()).await?;
	} else {
		unlink_node(ctx, user_info, UnlinkNodeInput { mapID: None, parentID: argumentID.clone(), childID: claimID }, Default::default()).await?;
	}

	//delete_node(ctx, user_info, DeleteNodeInput { mapID: None, nodeID: argumentID }, DeleteNodeExtras { childrenToIgnore: vec![claimID] }).await?;
	delete_node(ctx, user_info, DeleteNodeInput { mapID: None, nodeID: argumentID }, Default::default()).await?;

	increment_map_edits_if_valid(&ctx, mapID).await?;

	Ok(result)
}