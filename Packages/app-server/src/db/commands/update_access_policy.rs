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
use crate::db::access_policies_::_access_policy::{AccessPolicy, AccessPolicyUpdates};
use crate::db::access_policies_::_permission_set::APAction;
use crate::db::commands::_command::{command_boilerplate, delete_db_entry_by_id, gql_placeholder, set_db_entry_by_id, update_field, update_field_nullable};
use crate::db::general::permission_helpers::assert_user_can_modify;
use crate::db::general::sign_in_::jwt_utils::{get_user_info_from_gql_ctx, resolve_jwt_to_user_info};
use crate::db::users::User;
use crate::utils::db::accessors::AccessorContext;
use crate::utils::general::data_anchor::DataAnchorFor1;
use rust_shared::utils::db::uuid::new_uuid_v4_as_b64;

use super::_command::{upsert_db_entry_by_id_for_struct, NoExtras};

wrap_slow_macros! {

#[derive(Default)] pub struct MutationShard_UpdateAccessPolicy;
#[Object] impl MutationShard_UpdateAccessPolicy {
	async fn update_access_policy(&self, gql_ctx: &async_graphql::Context<'_>, input: UpdateAccessPolicyInput, only_validate: Option<bool>) -> Result<UpdateAccessPolicyResult, GQLError> {
		command_boilerplate!(gql_ctx, input, only_validate, update_access_policy);
	}
}

#[derive(InputObject, Serialize, Deserialize)]
pub struct UpdateAccessPolicyInput {
	pub id: String,
	pub updates: AccessPolicyUpdates,
}

#[derive(SimpleObject, Debug)]
pub struct UpdateAccessPolicyResult {
	#[graphql(name = "_useTypenameFieldInstead")] __: String,
}

}

pub async fn update_access_policy(ctx: &AccessorContext<'_>, actor: &User, _is_root: bool, input: UpdateAccessPolicyInput, _extras: NoExtras) -> Result<UpdateAccessPolicyResult, Error> {
	let UpdateAccessPolicyInput { id, updates } = input;

	let old_data = get_access_policy(&ctx, &id).await?;
	//assert_user_can_modify_simple(&actor, &old_data.creator)?;
	//assert_user_can_do_x_for_commands(ctx, &actor, APAction::Modify, ActionTarget::for_access_policy(old_data.creator)).await?;
	assert_user_can_modify(&ctx, &actor, &old_data).await?;
	let new_data = AccessPolicy {
		name: update_field(updates.name, old_data.name),
		permissions: update_field(updates.permissions, old_data.permissions),
		permissions_userExtends: update_field(updates.permissions_userExtends, old_data.permissions_userExtends),
		..old_data
	};

	upsert_db_entry_by_id_for_struct(&ctx, "accessPolicies".to_owned(), id.to_string(), new_data).await?;

	Ok(UpdateAccessPolicyResult { __: gql_placeholder() })
}
