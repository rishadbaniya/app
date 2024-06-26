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
use crate::db::terms::{get_term, Term, TermInput, TermUpdates};
use crate::db::users::User;
use crate::utils::db::accessors::AccessorContext;
use crate::utils::general::data_anchor::DataAnchorFor1;
use rust_shared::utils::db::uuid::new_uuid_v4_as_b64;

use super::_command::{upsert_db_entry_by_id_for_struct, NoExtras};

wrap_slow_macros! {

#[derive(Default)] pub struct MutationShard_UpdateTerm;
#[Object] impl MutationShard_UpdateTerm {
	async fn update_term(&self, gql_ctx: &async_graphql::Context<'_>, input: UpdateTermInput, only_validate: Option<bool>) -> Result<UpdateTermResult, GQLError> {
		command_boilerplate!(gql_ctx, input, only_validate, update_term);
	}
}

#[derive(InputObject, Serialize, Deserialize)]
pub struct UpdateTermInput {
	pub id: String,
	pub updates: TermUpdates,
}

#[derive(SimpleObject, Debug)]
pub struct UpdateTermResult {
	#[graphql(name = "_useTypenameFieldInstead")] __: String,
}

}

pub async fn update_term(ctx: &AccessorContext<'_>, actor: &User, _is_root: bool, input: UpdateTermInput, _extras: NoExtras) -> Result<UpdateTermResult, Error> {
	let UpdateTermInput { id, updates } = input;

	let old_data = get_term(&ctx, &id).await?;
	assert_user_can_modify(&ctx, &actor, &old_data).await?;
	let new_data = Term {
		accessPolicy: update_field(updates.accessPolicy, old_data.accessPolicy),
		name: update_field(updates.name, old_data.name),
		forms: update_field(updates.forms, old_data.forms),
		disambiguation: update_field_nullable(updates.disambiguation, old_data.disambiguation),
		r#type: update_field(updates.r#type, old_data.r#type),
		definition: update_field(updates.definition, old_data.definition),
		note: update_field_nullable(updates.note, old_data.note),
		attachments: update_field(updates.attachments, old_data.attachments),
		..old_data
	};

	upsert_db_entry_by_id_for_struct(&ctx, "terms".to_owned(), id.to_string(), new_data).await?;

	Ok(UpdateTermResult { __: gql_placeholder() })
}
