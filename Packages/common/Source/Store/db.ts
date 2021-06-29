import {Collection} from "web-vcore/nm/mobx-graphlink.js";
import {AccessPolicy} from "./db/accessPolicies/@AccessPolicy.js";
import {Map_NodeEdit} from "./db/mapNodeEdits/@MapNodeEdit.js";
import {Map} from "./db/maps/@Map.js";
import {Media} from "./db/media/@Media.js";
import {NodeChildLink} from "./db/nodeChildLinks/@NodeChildLink.js";
import {NodeRating} from "./db/nodeRatings/@NodeRating.js";
import {MapNode} from "./db/nodes/@MapNode.js";
import {MapNodeRevision} from "./db/nodes/@MapNodeRevision.js";
import {MapNodeTag} from "./db/nodeTags/@MapNodeTag.js";
import {Share} from "./db/shares/@Share.js";
import {Term} from "./db/terms/@Term.js";
import {User} from "./db/users/@User.js";
import {User_Private} from "./db/users_private/@User_Private.js";
import {VisibilityDirective} from "./db/visibilityDirectives/@VisibilityDirective.js";

// manually import these, since otherwise they're never runtime-imported
//require("./db/users_private/@User_Private.js");
import "./db/users_private/@User_Private.js";

declare module "mobx-graphlink/Dist/UserTypes" {
	interface DBShape extends GraphDBShape {}
}

export class GraphDBShape {
	//general: Collection_Closed<{data: GeneralData}>;
	/*modules: Collection_Closed<{
		// feedback: FeedbackDBShape;
	}>;*/

	accessPolicies: Collection<AccessPolicy>;
	visibilityDirectives: Collection<VisibilityDirective>;
	medias: Collection<Media>;
	maps: Collection<Map>;
	mapNodeEdits: Collection<Map_NodeEdit>;
	nodes: Collection<MapNode>;
	//nodeExtras: Collection<any>;
	nodeRatings: Collection<NodeRating>;
	nodeRevisions: Collection<MapNodeRevision>;
	//nodeStats: Collection<MapNodeStats>;
	//nodeViewers: Collection<ViewerSet>; // removed due to privacy concerns
	//nodePhrasings: Collection<MapNodePhrasing>;
	nodeChildLinks: Collection<NodeChildLink>;
	nodeTags: Collection<MapNodeTag>;
	shares: Collection<Share>;
	terms: Collection<Term>;
	//termNames: Collection<any>;
	/*timelines: Collection<Timeline>;
	timelineSteps: Collection<TimelineStep>;*/
	users: Collection<User>;
	users_private: Collection<User_Private>;
	//userMapInfo: Collection<UserMapInfoSet>; // $userID (key) -> $mapID -> layerStates -> $layerID -> [boolean, for whether enabled]
	//userViewedNodes: Collection<ViewedNodeSet>; // removed due to privacy concerns
}

/* export interface FirebaseDBShape {
	modules: Collection_Closed<{
		// feedback: FeedbackDBShape;
	}>;

	general: Collection_Closed<{data: GeneralData}>;
	images: Collection<Image>;
	layers: Collection<Layer>;
	maps: Collection<Map, {
		nodeEditTimes: Collection<NodeEditTimes>,
	}>;
	nodes: Collection<MapNode, {
		ratings: Collection<RatingsRoot>, // $ratingType -> $userID -> value -> $value
		// extras: Collection<any>,
		revisions: Collection<MapNodeRevision>,
		// stats: Collection<MapNodeStats>,
		// viewers: Collection<ViewerSet>, // removed due to privacy concerns
		phrasings: Collection<MapNodePhrasing>,
	}>;
	terms: Collection<Term, {
		components: Collection<TermComponent>,
		names: Collection<any>,
	}>;
	timelines: Collection<Timeline, {
		steps: Collection<TimelineStep>,
	}>;
	users: Collection<User, {
		extras: Collection<UserExtraInfo>,
		mapInfo: Collection<UserMapInfoSet>, // $mapID -> layerStates -> $layerID -> [boolean, for whether enabled]
		// viewedNodes: Collection<ViewedNodeSet>, // removed due to privacy concerns
	}>;
} */

/*export const GetAuth = StoreAccessor(s=>()=>{
	//return s.firelink.userInfo;
	return fire.userInfo;
}) as ()=>FireUserInfo;
export const GetAuth_Raw = StoreAccessor(s=>()=>{
	//return s.firelink.userInfo_raw;
	return fire.userInfo_raw as any;
});*/