import {autorun} from "mobx";
import {store} from "Source/Store";
import {DBPath, GetAsync, GetDoc} from "mobx-firelink";
import {fire} from "@debate-map/server-link/Source/Link";
import {GetUser} from "@debate-map/server-link/Source/Link";
import {GetUser_Private} from "@debate-map/server-link/Source/Link";
import {SetUserData} from "@debate-map/server-link/Source/Link";
import {SetUserData_Private} from "@debate-map/server-link/Source/Link";

let lastUserInfo;
autorun(()=>{
	if (fire.userInfo != lastUserInfo) {
		lastUserInfo = fire.userInfo;
		if (fire.userInfo) {
			RunSignUpInitIfNotYetRun(fire.userInfo.id);
		}
	}
}, {name: "UserSignUpHelper"});

async function RunSignUpInitIfNotYetRun(userID: string) {
	//const user = await GetAsync(()=>GetDoc({undefinedForLoading: true}, a=>a.users.get(userID)));
	const user = await GetAsync(()=>GetUser(userID));
	if (user == null) {
		/*fire.subs.firestoreDB.doc(DBPath({}, `users/${userID}`)).set({
			permissionGroups: {basic: true, verified: true, mod: false, admin: false},
			joinDate: Date.now(),
		}, {merge: true});*/
		await new SetUserData({id: userID, updates: {
			displayName: fire.userInfo_raw.displayName,
			photoURL: fire.userInfo_raw.photoURL,
			// custom
			joinDate: Date.now(),
			permissionGroups: {basic: true, verified: true, mod: false, admin: false},
		}}).Run();
	}
	const user_p = await GetAsync(()=>GetUser_Private(userID));
	if (user_p == null) {
		await new SetUserData_Private({id: userID, updates: {
			email: fire.userInfo_raw.email,
			providerData: fire.userInfo_raw.providerData,
		}}).Run();
	}

	// Raven.setUserContext(action["auth"].Including("uid", "displayName", "email"));
}