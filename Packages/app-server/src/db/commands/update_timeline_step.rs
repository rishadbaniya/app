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
use crate::db::timeline_steps::{get_timeline_step, timeline_step_extras_locked_subfields, TimelineStep, TimelineStepInput, TimelineStepUpdates};
use crate::db::users::User;
use crate::utils::db::accessors::AccessorContext;
use crate::utils::general::data_anchor::DataAnchorFor1;
use rust_shared::utils::db::uuid::new_uuid_v4_as_b64;

use super::_command::{update_field_of_extras, upsert_db_entry_by_id_for_struct, NoExtras};

wrap_slow_macros! {

#[derive(Default)] pub struct MutationShard_UpdateTimelineStep;
#[Object] impl MutationShard_UpdateTimelineStep {
	async fn update_timeline_step(&self, gql_ctx: &async_graphql::Context<'_>, input: UpdateTimelineStepInput, only_validate: Option<bool>) -> Result<UpdateTimelineStepResult, GQLError> {
		command_boilerplate!(gql_ctx, input, only_validate, update_timeline_step);
	}
}

#[derive(InputObject, Serialize, Deserialize)]
pub struct UpdateTimelineStepInput {
	pub id: String,
	pub updates: TimelineStepUpdates,
}

#[derive(SimpleObject, Debug)]
pub struct UpdateTimelineStepResult {
	#[graphql(name = "_useTypenameFieldInstead")] __: String,
}

}

pub async fn update_timeline_step(ctx: &AccessorContext<'_>, actor: &User, _is_root: bool, input: UpdateTimelineStepInput, _extras: NoExtras) -> Result<UpdateTimelineStepResult, Error> {
	let UpdateTimelineStepInput { id, updates } = input;

	let old_data = get_timeline_step(&ctx, &id).await?;
	assert_user_can_modify(&ctx, &actor, &old_data).await?;
	let new_data = TimelineStep {
		orderKey: update_field(updates.orderKey, old_data.orderKey),
		groupID: update_field(updates.groupID, old_data.groupID),
		timeFromStart: update_field_nullable(updates.timeFromStart, old_data.timeFromStart),
		timeFromLastStep: update_field_nullable(updates.timeFromLastStep, old_data.timeFromLastStep),
		timeUntilNextStep: update_field_nullable(updates.timeUntilNextStep, old_data.timeUntilNextStep),
		message: update_field(updates.message, old_data.message),
		extras: update_field_of_extras(updates.extras, old_data.extras, timeline_step_extras_locked_subfields())?,
		..old_data
	};

	upsert_db_entry_by_id_for_struct(&ctx, "timelineSteps".to_owned(), id.to_string(), new_data).await?;

	Ok(UpdateTimelineStepResult { __: gql_placeholder() })
}
