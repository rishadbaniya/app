#![feature(try_blocks)]
//#![feature(type_alias_impl_trait)]

// sync among all rust crates
#![warn(clippy::all, clippy::pedantic, clippy::cargo)]
#![allow(
    unused_imports, // makes refactoring a pain (eg. you comment out a line to test something, and now must scroll-to-top and comment lots of stuff) [more importantly, conflicts with wrap_slow_macros! atm; need to resolve that]
    non_camel_case_types,
    non_snake_case, // makes field-names inconsistent with graphql and such, for db-struct fields
    clippy::module_name_repetitions, // too many false positives
    clippy::items_after_statements, // usefulness of custom line-grouping outweighs that of having all-items-before-statements
    clippy::expect_fun_call, // requires manual integration of error-message into the format-str, which is a pain, for usually negligible perf-gains
    clippy::redundant_closure_for_method_calls, // often means substituting a much longer method-id than the closure code itself, reducing readability
    clippy::similar_names, // too many false positives (eg. "req" and "res")
    clippy::must_use_candidate, // too many false positives
    clippy::implicit_clone, // personally, I like ownedString.to_owned(); it works the same way for &str and ownedString, meaning roughly, "Give me a new owned-version, that I can send in, regardless of the source-type."
    clippy::unused_async, // too many false positives (eg. functions that must be async to be sent as an argument to something else, like a web-server library's API)
    clippy::for_kv_map, // there are often cases where the key/value is not *currently* used, but was/will-be-soon, due to just doing a commenting test or something
    clippy::if_not_else, // there are often reasons a dev might want one of the blocks before the other

    // to avoid false-positives, of certain functions, as well as for [Serialize/Deserialize]_Stub macro-usage (wrt private fields)
    dead_code,
)]
#![feature(stmt_expr_attributes)] // allow attributes on expressions, eg. for disabling rustfmt per-expression

use axum::{
	http::{header::CONTENT_TYPE, Method},
	middleware,
	response::{self, Html, IntoResponse},
	routing::{any_service, get, get_service, post},
	Router,
};
use rust_shared::async_graphql::http::{playground_source, GraphQLPlaygroundConfig};
use rust_shared::axum::http::HeaderName;
use rust_shared::axum::routing::{on_service, MethodFilter};
use rust_shared::axum::Extension;
use rust_shared::bytes::Bytes;
use rust_shared::flume::{unbounded, Receiver, Sender};
use rust_shared::http_body_util::combinators::BoxBody;
use rust_shared::http_body_util::Full;
use rust_shared::hyper::body::Body;
use rust_shared::hyper::{
	header::{self, FORWARDED},
	Request, Response, StatusCode, Uri,
};
use rust_shared::hyper_util::client::legacy::Client;
use rust_shared::hyper_util::rt::TokioExecutor;
use rust_shared::itertools::Itertools;
use rust_shared::links::app_server_to_monitor_backend::LogEntry;
use rust_shared::tokio::net::TcpListener;
use rust_shared::tokio::{
	runtime::Runtime,
	sync::{broadcast, Mutex},
};
use rust_shared::tower_http::cors::AllowOrigin;
use rust_shared::utils::general::k8s_env;
use rust_shared::utils::net::{body_to_bytes, new_hyper_client_http, AxumBody};
use rust_shared::utils::type_aliases::{FReceiver, FSender};
use rust_shared::{axum, futures, tokio, tower, tower_http};
use std::{
	backtrace::Backtrace,
	collections::HashSet,
	convert::Infallible,
	net::{IpAddr, SocketAddr},
	panic,
	str::FromStr,
	sync::Arc,
	time::Duration,
};
use tower::ServiceExt;
use tower_http::services::ServeDir;
use tower_http::{cors::CorsLayer, services::ServeFile};
use tracing::{error, info, Level, Metadata};
use tracing_subscriber::{filter, prelude::__tracing_subscriber_SubscriberExt, util::SubscriberInitExt, Layer};

use crate::links::pod_proxies::{maybe_proxy_to_alertmanager, maybe_proxy_to_prometheus, store_admin_key_cookie};
use crate::{
	links::app_server_link::connect_to_app_server,
	store::storage::{AppState, AppStateArc},
	utils::type_aliases::{ABReceiver, ABSender},
};

mod gql_;
mod gql {
	pub mod _general;
}
mod pgclient;
mod links {
	pub mod app_server_link;
	pub mod pod_proxies;
}
mod utils {
	//pub mod general;
	pub mod type_aliases;
}
mod store {
	pub mod storage;
}
mod testing {
	pub mod general;
}
/*mod connections {
	pub mod from_app_server;
}*/
mod migrations {
	pub mod v2;
}

pub fn get_cors_layer() -> CorsLayer {
	// ref: https://docs.rs/tower-http/latest/tower_http/cors/index.html
	CorsLayer::new()
		.allow_origin(AllowOrigin::predicate(|_, _| true)) // must use true (ie. have response's "allowed-origin" always equal the request origin) instead of "*", since we have credential-inclusion enabled
		.allow_methods(vec![Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::HEAD, Method::OPTIONS, Method::CONNECT, Method::PATCH, Method::TRACE])
		.allow_headers(vec![
			CONTENT_TYPE, // needed, because the POST requests include a content-type header (which is not on the approved-by-default list)
			HeaderName::from_str("admin-key").unwrap(),
		])
		.allow_credentials(true)
}

#[derive(Clone, Debug)]
pub enum GeneralMessage {
	LogEntryAdded(LogEntry),
	MigrateLogMessageAdded(String),
	TestingLogMessageAdded(String),
}

// for some very-strange reason, using the tokio::broadcast::[Sender/Receiver] to transmit LogEntry's (from app_server_link.rs to _general.rs) silently fails
// it fails for async-flume as well, but switching to sync-flume fixes it -- so we need this second-version of GeneralMessage that uses flume (maybe switch to flume completely later, eg. making a broadcast-like wrapper)
// I suspect the issue has something to do with the "silent dropping of futures" that I had to work-around in handlers.rs...
// ...but wasn't able to discover the "difference" between MigrateLogMessageAdded and LogEntryAdded pathway that would explain it (and thus suggest a proper solution)
/*#[derive(Clone, Debug)]
pub enum GeneralMessage_Flume {
	LogEntryAdded(LogEntry),
}*/

fn set_up_globals() {
	panic::set_hook(Box::new(|info| {
		let stacktrace = Backtrace::force_capture();
		error!("Got panic. @info:{}\n@stackTrace:{}", info, stacktrace);
		std::process::abort();
	}));

	//tracing_subscriber::fmt::init(); // install global collector configured based on RUST_LOG env var
	let printing_layer = tracing_subscriber::fmt::layer().with_filter(filter::filter_fn(move |metadata| should_event_be_printed(metadata)));
	tracing_subscriber::registry().with(printing_layer).init();
}

pub fn does_event_match_conditions(metadata: &Metadata, levels_to_include: &[Level]) -> bool {
	if !levels_to_include.contains(metadata.level()) {
		return false;
	}
	true
}
pub fn should_event_be_printed(metadata: &Metadata) -> bool {
	match metadata.target() {
		a if a.starts_with("monitor_backend") || a.starts_with("rust_shared") => {
			//does_event_match_conditions(metadata, &[Level::ERROR, Level::WARN, Level::INFO])
			does_event_match_conditions(metadata, &[Level::ERROR, Level::WARN, Level::INFO, Level::DEBUG])
			//does_event_match_conditions(metadata, &[Level::ERROR, Level::WARN, Level::INFO, Level::DEBUG, Level::TRACE])
		},
		"async-graphql" => does_event_match_conditions(metadata, &[Level::ERROR, Level::WARN]),
		_ => false,
	}
}

#[tokio::main]
async fn main() {
	set_up_globals();
	info!("Setup of globals completed."); // have one regular print-line, in case logger has issues

	let app_state = AppStateArc::new(AppState::default());

	let app = Router::new()
		/*.route("/", get(|| async { Html(r#"
			<p>This is the URL for the monitor-backend.</p>
			<p>Navigate to <a href="https://debatemap.app">debatemap.app</a> instead. (or localhost:5100/localhost:5101, if running Debate Map locally)</p>
		"#) }))*/
		//.route("/send-mtx-results", post(send_mtx_results))
		.route("/storeAdminKeyCookie", get(store_admin_key_cookie))
		.route("/proxy/prometheus", get(maybe_proxy_to_prometheus))
		.route("/proxy/prometheus/*path", get(maybe_proxy_to_prometheus))
		.route("/proxy/alertmanager", get(maybe_proxy_to_alertmanager))
		.route("/proxy/alertmanager/*path", get(maybe_proxy_to_alertmanager))
		.fallback(get(handler));

	let (mut msg_sender, msg_receiver): (ABSender<GeneralMessage>, ABReceiver<GeneralMessage>) = async_broadcast::broadcast(10000);
	msg_sender.set_overflow(true);
	tokio::spawn(connect_to_app_server(app_state.clone(), msg_sender.clone()));

	let app = gql_::extend_router(app, msg_sender, msg_receiver, /*msg_sender_test, msg_receiver_test,*/ app_state.clone()).await;

	let client_for_proxying = new_hyper_client_http();
	// cors layer apparently must be added after the stuff it needs to apply to
	let app = app.layer(Extension(app_state)).layer(Extension(client_for_proxying)).layer(get_cors_layer());

	let addr = SocketAddr::from(([0, 0, 0, 0], 5130)); // ip of 0.0.0.0 means it can receive connections from outside this pod (eg. other pods, the load-balancer)
	let listener = TcpListener::bind(&addr).await.unwrap();
	let server_fut = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>());
	info!("Monitor-backend launched. @env:{:?}", k8s_env());
	server_fut.await.unwrap();
}

async fn handler(req: Request<AxumBody>) -> Result<axum::response::Response<AxumBody>, (StatusCode, String)> {
	let uri = req.uri();
	//info!("BaseURI:{}", uri);
	let (scheme, authority, path, _query) = {
		let temp = uri.clone().into_parts();
		let scheme = "https"; //temp.scheme.map_or("".to_owned(), |a| a.to_string());
		let authority = "debatemap.app"; //temp.authority.map_or("".to_owned(), |a| a.to_string());
		let path = temp.path_and_query.clone().map_or("".to_owned(), |a| a.path().to_string());
		let query = temp.path_and_query.map_or("".to_owned(), |a| a.query().unwrap_or("").to_owned());
		(scheme, authority, path, query)
	};

	// try resolving path from "/Dist" folder
	if let Ok(uri_variant) = Uri::from_str(&format!("{scheme}://{authority}/Dist/{path}")) {
		let res = get_static_file(uri_variant.clone()).await?;
		if res.status() != StatusCode::NOT_FOUND {
			return Ok(res);
		}
	}

	// try resolving path from "/Resources" folder
	if let Ok(uri_variant) = Uri::from_str(&format!("{scheme}://{authority}/Resources/{path}")) {
		let res = get_static_file(uri_variant.clone()).await?;
		if res.status() != StatusCode::NOT_FOUND {
			return Ok(res);
		}
	}

	// if all else fails, just resolve to "/Dist/index.html"
	//println!("Test:{}", format!("{scheme}://{authority}/Dist/index.html"));
	if let Ok(uri_variant) = Uri::from_str(&format!("{scheme}://{authority}/Dist/index.html")) {
		let res = get_static_file(uri_variant.clone()).await?;
		//println!("Response for index.html: {:?}", res);
		if res.status() != StatusCode::NOT_FOUND {
			return Ok(res);
		}
	}

	return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Something went wrong; failed to resolve URI to a resource.")));
}

async fn get_static_file(uri: Uri) -> Result<Response<AxumBody>, (StatusCode, String)> {
	//println!("URI:{}", uri);
	let req = Request::builder().uri(uri).body(Full::new(Bytes::new())).unwrap();
	let root_resolve_folder = "../monitor-client";

	// `ServeDir` implements `tower::Service` so we can call it with `tower::ServiceExt::oneshot`
	match ServeDir::new(root_resolve_folder).oneshot(req).await {
		Ok(res) => {
			let (parts, body) = res.into_parts();
			let bytes = body_to_bytes(body).await.unwrap();
			Ok(Response::from_parts(parts, AxumBody::from(bytes)))
		},
		Err(err) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Something went wrong: {}", err))),
	}
}
